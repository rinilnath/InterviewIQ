const express = require('express');
const rateLimit = require('express-rate-limit');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { generateInterviewKit } = require('../services/claude.service');
const { TIER_CONFIG, getEffectiveTier, getMonthlyLimit } = require('../config/tiers');

const router = express.Router();

const TRASH_TTL_DAYS = 30; // items in trash permanently deleted after this many days

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many kits generated. Please wait before generating more.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(verifyToken);

// ─── Background generation job ────────────────────────────────────────────
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function categorizeError(err) {
  const msg = err.message || '';
  if (err.status === 529 || msg.includes('overloaded')) {
    return 'Claude AI is currently overloaded. Please retry in a few minutes.';
  }
  if (err.status === 401 || err.status === 403 || msg.includes('authentication') || msg.includes('API key')) {
    return 'AI service authentication error. Please contact support.';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
    return 'Generation timed out after 5 minutes. Please retry — Claude may be under heavy load.';
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('network')) {
    return 'Network error connecting to AI service. Check your connection and retry.';
  }
  if (msg.includes('supabase') || msg.includes('database') || msg.includes('PostgreSQL')) {
    return 'Database error while saving results. Please retry — your data is safe.';
  }
  if (msg.includes('JSON') || msg.includes('parse')) {
    return 'AI returned an unexpected response format. Please retry — this is usually transient.';
  }
  return err.message || 'Generation failed. Please retry.';
}

async function runGenerationJob(kitId, params) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(Object.assign(new Error('timed out'), { message: 'timeout' })),
      GENERATION_TIMEOUT_MS,
    );
  });
  try {
    const startedAt = Date.now();
    const kitOutput = await Promise.race([generateInterviewKit(params), timeout]);
    clearTimeout(timeoutId);
    const generationSeconds = Math.round((Date.now() - startedAt) / 1000);

    // Check if user cancelled the job while Claude was running
    const { data: current } = await supabase
      .from('interview_kits')
      .select('status')
      .eq('id', kitId)
      .single();
    if (current?.status === 'cancelled') {
      console.log(`[job] Kit ${kitId} was cancelled — discarding completed output`);
      return;
    }

    const { error } = await supabase
      .from('interview_kits')
      .update({
        status: 'completed',
        kit_title: kitOutput.kit_title,
        output_json: kitOutput,
        generation_seconds: generationSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', kitId);
    if (error) throw error;
    console.log(`[job] Kit ${kitId} completed: ${kitOutput.kit_title}`);
  } catch (err) {
    clearTimeout(timeoutId);
    // Don't overwrite a user-initiated cancellation with a failure status
    let currentStatus = null;
    try {
      const { data } = await supabase
        .from('interview_kits')
        .select('status')
        .eq('id', kitId)
        .single();
      currentStatus = data?.status;
    } catch (_) {}
    if (currentStatus === 'cancelled') return;

    const userMessage = categorizeError(err);
    console.error(`[job] Kit ${kitId} failed:`, err.message);
    try {
      await supabase
        .from('interview_kits')
        .update({ status: 'failed', error_message: userMessage, updated_at: new Date().toISOString() })
        .eq('id', kitId);
    } catch (e) {
      console.error('[job] Could not write failure status:', e.message);
    }
  }
}

const STUCK_KIT_MESSAGE = 'Generation interrupted — server was restarted. Please retry.';
const STUCK_WATCHDOG_MINUTES = 10; // kits still 'generating' after this long are considered stuck

// ─── Startup recovery: mark any stuck 'generating' kits as failed ──────────
// On startup there are no active generation jobs, so every 'generating' kit is stuck.
async function recoverStuckGenerations() {
  const { data, error } = await supabase
    .from('interview_kits')
    .update({
      status: 'failed',
      error_message: STUCK_KIT_MESSAGE,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'generating')
    .is('deleted_at', null)
    .select('id');
  if (error) {
    console.error('[startup] Could not recover stuck generations:', error.message);
  } else if (data?.length > 0) {
    console.log(`[startup] Marked ${data.length} stuck kit(s) as failed.`);
  }
}

// ─── Watchdog: catch kits that get stuck while server is running ──────────
// Runs every 5 minutes. Only touches kits older than STUCK_WATCHDOG_MINUTES to
// avoid interfering with kits that are actively generating (max runtime = 5 min).
async function watchdogStuckGenerations() {
  const cutoff = new Date(Date.now() - STUCK_WATCHDOG_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('interview_kits')
    .update({
      status: 'failed',
      error_message: STUCK_KIT_MESSAGE,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'generating')
    .lt('created_at', cutoff)
    .is('deleted_at', null)
    .select('id');
  if (error) {
    console.error('[watchdog] Could not recover stuck generations:', error.message);
  } else if (data?.length > 0) {
    console.log(`[watchdog] Marked ${data.length} stuck kit(s) as failed.`);
  }
}

// ─── Trash cleanup helper ─────────────────────────────────────────────────
// Permanently deletes kits that have been in trash for more than TRASH_TTL_DAYS.
async function cleanupExpiredTrash() {
  const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('interview_kits')
    .delete()
    .lt('deleted_at', cutoff)
    .not('deleted_at', 'is', null);
  if (error) console.error('[trash] Cleanup error:', error.message);
}

// Run cleanup once at startup, then every 24 h
cleanupExpiredTrash();
setInterval(cleanupExpiredTrash, 24 * 60 * 60 * 1000);

// Recover stuck kits on startup (no active jobs exist yet)
recoverStuckGenerations();
// Then keep catching any kits that get stuck while the server is running
setInterval(watchdogStuckGenerations, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────
// ROUTES — ordered so named paths (/history, /trash/*) come before /:id
// ─────────────────────────────────────────────────────────────────────────

// ─── Quota helpers ────────────────────────────────────────────────────────
async function getMonthlyUsage(userId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { count, error } = await supabase
    .from('interview_kits')
    .select('id', { count: 'exact', head: true })
    .eq('generated_by', userId)
    .gte('created_at', startOfMonth)
    .lt('created_at', nextMonth)
    .in('status', ['generating', 'completed']); // cancelled/failed don't consume quota
  if (error) throw error;
  return count || 0;
}

// GET /api/interview/quota — current user's monthly usage
router.get('/quota', async (req, res) => {
  try {
    const tier = getEffectiveTier(req.user);
    const limit = getMonthlyLimit(req.user);
    const used = req.user.role === 'admin' ? await getMonthlyUsage(req.user.id) : await getMonthlyUsage(req.user.id);
    const now = new Date();
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const tierLabel = req.user.role === 'admin' ? 'Admin' : (TIER_CONFIG[tier]?.label ?? 'Free');

    res.json({
      tier: tierLabel,
      tierKey: tier,
      used,
      limit: limit === Infinity ? null : limit,
      remaining: limit === Infinity ? null : Math.max(0, limit - used),
      percentUsed: limit === Infinity ? 0 : Math.min(100, Math.round((used / limit) * 100)),
      resetsAt,
      isUnlimited: limit === Infinity,
      expiresAt: req.user.subscription_expires_at || null,
    });
  } catch (err) {
    console.error('Quota error:', err);
    res.status(500).json({ error: 'Failed to fetch quota' });
  }
});

// POST /api/interview/generate
router.post('/generate', generateLimiter, async (req, res) => {
  try {
    const { jdText, seniorityLevel, techStack, customExpectations, useKnowledgeBase, kbPercentage = 25, previousKitId } = req.body;

    if (!jdText || !seniorityLevel || !techStack) {
      return res.status(400).json({ error: 'JD text, seniority level, and tech stack are required' });
    }
    if (!Array.isArray(techStack) || techStack.length === 0) {
      return res.status(400).json({ error: 'Tech stack must be a non-empty array' });
    }

    // ── Quota enforcement ───────────────────────────────────────────────────
    const monthlyLimit = getMonthlyLimit(req.user);
    if (monthlyLimit !== Infinity) {
      const used = await getMonthlyUsage(req.user.id);
      if (used >= monthlyLimit) {
        const tier = getEffectiveTier(req.user);
        const now = new Date();
        const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        return res.status(429).json({
          error: `Monthly limit reached — you have used all ${monthlyLimit} kit${monthlyLimit !== 1 ? 's' : ''} on the ${TIER_CONFIG[tier]?.label ?? 'Free'} plan.`,
          hint: `Your quota resets on ${resetsAt}. Ask your admin to upgrade your subscription for more.`,
          used,
          limit: monthlyLimit,
          tier,
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    let knowledgeBaseDocs = [];
    if (useKnowledgeBase) {
      const { data: docs, error } = await supabase
        .from('documents')
        .select('id, label, document_type, extracted_text')
        .order('created_at', { ascending: false });
      if (!error && docs) {
        knowledgeBaseDocs = docs.filter((d) => d.extracted_text?.trim().length > 0);
      }
    }

    let previousQuestions = [];
    let isRegenerate = false;
    if (previousKitId) {
      isRegenerate = true;
      const { data: prevKit } = await supabase
        .from('interview_kits')
        .select('output_json')
        .eq('id', previousKitId)
        .single();
      if (prevKit?.output_json?.sections) {
        previousQuestions = prevKit.output_json.sections
          .flatMap((s) => s.questions || [])
          .map((q) => q.question)
          .filter(Boolean);
      }
    }

    const { data: newKit, error: insertError } = await supabase
      .from('interview_kits')
      .insert({
        generated_by: req.user.id,
        jd_text: jdText,
        seniority_level: seniorityLevel,
        tech_stack: techStack,
        custom_expectations: customExpectations || null,
        kit_title: `Generating — ${seniorityLevel}`,
        output_json: null,
        status: 'generating',
        is_completed: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({ kit: newKit });

    runGenerationJob(newKit.id, {
      jdText, seniorityLevel, techStack, customExpectations,
      knowledgeBaseDocs, isRegenerate, previousQuestions,
      kbPercentage: useKnowledgeBase ? Math.min(100, Math.max(25, parseInt(kbPercentage) || 25)) : 0,
    }).catch((err) => console.error('[job] Unhandled generation error for kit', newKit.id, err.message));
  } catch (err) {
    console.error('Generate interview error:', err);
    res.status(500).json({ error: err.message || 'Failed to start kit generation' });
  }
});

// GET /api/interview/history
router.get('/history', async (req, res) => {
  try {
    const { search, seniority, status, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('interview_kits')
      .select(
        'id, kit_title, seniority_level, tech_stack, is_completed, status, error_message, created_at, generated_by',
        { count: 'exact' },
      )
      .is('deleted_at', null); // active kits only

    if (req.user.role !== 'admin') query = query.eq('generated_by', req.user.id);
    if (search) query = query.ilike('kit_title', `%${search}%`);
    if (seniority) query = query.eq('seniority_level', seniority);
    if (status === 'completed') query = query.eq('is_completed', true);
    else if (status === 'in_progress') query = query.eq('is_completed', false);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.order('created_at', { ascending: false }).range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ kits: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Failed to fetch interview history' });
  }
});

// GET /api/interview/trash — list trashed kits; also runs lazy expiry cleanup
router.get('/trash', async (req, res) => {
  try {
    // Lazy cleanup: expire items older than TRASH_TTL_DAYS for this user's trash
    await cleanupExpiredTrash();

    let query = supabase
      .from('interview_kits')
      .select('id, kit_title, seniority_level, tech_stack, deleted_at, created_at, generated_by')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (req.user.role !== 'admin') query = query.eq('generated_by', req.user.id);

    const { data, error } = await query;
    if (error) throw error;

    // Attach days_remaining to each item for display
    const now = Date.now();
    const kits = (data || []).map((k) => {
      const deletedMs = new Date(k.deleted_at).getTime();
      const expiresMs = deletedMs + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;
      const daysRemaining = Math.max(0, Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000)));
      return { ...k, days_remaining: daysRemaining, expires_at: new Date(expiresMs).toISOString() };
    });

    res.json({ kits });
  } catch (err) {
    console.error('Get trash error:', err);
    res.status(500).json({ error: 'Failed to fetch trash' });
  }
});

// GET /api/interview/trash/summary — lightweight check for expiry banner
router.get('/trash/summary', async (req, res) => {
  try {
    let query = supabase
      .from('interview_kits')
      .select('id, deleted_at')
      .not('deleted_at', 'is', null);

    if (req.user.role !== 'admin') query = query.eq('generated_by', req.user.id);

    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    const ttlMs = TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;
    const warnMs = 24 * 60 * 60 * 1000; // warn 24 h before expiry

    const total = (data || []).length;
    const expiringSoon = (data || []).filter((k) => {
      const age = now - new Date(k.deleted_at).getTime();
      return age >= ttlMs - warnMs; // expires within 24 h
    }).length;

    res.json({ total, expiringSoon });
  } catch (err) {
    console.error('Trash summary error:', err);
    res.status(500).json({ error: 'Failed to fetch trash summary' });
  }
});

// POST /api/interview/trash/:id/restore
router.post('/trash/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Kit not found in trash' });
    if (!existing.deleted_at) return res.status(400).json({ error: 'Kit is not in trash' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('interview_kits')
      .update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ kit: data });
  } catch (err) {
    console.error('Restore kit error:', err);
    res.status(500).json({ error: 'Failed to restore kit' });
  }
});

// DELETE /api/interview/trash/empty — permanently delete all trashed kits for user
router.delete('/trash/empty', async (req, res) => {
  try {
    let query = supabase
      .from('interview_kits')
      .delete()
      .not('deleted_at', 'is', null);

    if (req.user.role !== 'admin') query = query.eq('generated_by', req.user.id);

    const { error } = await query;
    if (error) throw error;

    res.json({ message: 'Trash emptied successfully' });
  } catch (err) {
    console.error('Empty trash error:', err);
    res.status(500).json({ error: 'Failed to empty trash' });
  }
});

// DELETE /api/interview/trash/:id — permanently delete a single trashed kit
router.delete('/trash/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Kit not found' });
    if (!existing.deleted_at) return res.status(400).json({ error: 'Kit is not in trash — use DELETE /:id to soft-delete first' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error } = await supabase.from('interview_kits').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'Permanently deleted' });
  } catch (err) {
    console.error('Permanent delete error:', err);
    res.status(500).json({ error: 'Failed to permanently delete kit' });
  }
});

// POST /api/interview/:id/share — toggle is_shared on a completed kit
router.post('/:id/share', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, is_shared, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Interview kit not found' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existing.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed kits can be shared.' });
    }
    if (existing.deleted_at) {
      return res.status(400).json({ error: 'Kit is in trash — restore it before sharing.' });
    }

    const { data, error } = await supabase
      .from('interview_kits')
      .update({ is_shared: !existing.is_shared, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ kit: data });
  } catch (err) {
    console.error('Toggle share error:', err);
    res.status(500).json({ error: 'Failed to update sharing status' });
  }
});

// DELETE /api/interview/all — soft-delete all active kits for the current user
router.delete('/all', async (req, res) => {
  try {
    let query = supabase
      .from('interview_kits')
      .update({ deleted_at: new Date().toISOString(), deleted_by: req.user.id, updated_at: new Date().toISOString() })
      .is('deleted_at', null);

    if (req.user.role !== 'admin') query = query.eq('generated_by', req.user.id);

    const { error } = await query;
    if (error) throw error;

    res.json({ message: 'All kits moved to trash' });
  } catch (err) {
    console.error('Delete all error:', err);
    res.status(500).json({ error: 'Failed to delete all kits' });
  }
});

// GET /api/interview/shared — all shared completed kits across all users
router.get('/shared', async (req, res) => {
  try {
    const { search, seniority, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('interview_kits')
      .select(
        'id, kit_title, seniority_level, tech_stack, is_completed, created_at, generation_seconds, generated_by',
        { count: 'exact' },
      )
      .eq('is_shared', true)
      .eq('status', 'completed')
      .is('deleted_at', null);

    if (search) query = query.ilike('kit_title', `%${search}%`);
    if (seniority) query = query.eq('seniority_level', seniority);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.order('created_at', { ascending: false }).range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ kits: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Get shared kits error:', err);
    res.status(500).json({ error: 'Failed to fetch shared kits' });
  }
});

// GET /api/interview/stats — accurate counts for dashboard
router.get('/stats', async (req, res) => {
  try {
    let baseQuery = supabase
      .from('interview_kits')
      .select('is_completed', { count: 'exact' })
      .is('deleted_at', null);
    if (req.user.role !== 'admin') baseQuery = baseQuery.eq('generated_by', req.user.id);

    const { data, count: total, error } = await baseQuery;
    if (error) throw error;

    const completed = (data || []).filter((k) => k.is_completed).length;
    const inProgress = (data || []).filter((k) => !k.is_completed).length;

    res.json({ total: total || 0, completed, inProgress });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/interview/results — all candidate evaluations with kit info
router.get('/results', async (req, res) => {
  try {
    const includeRemoved = req.query.include_removed === 'true';
    let evalsQuery = supabase
      .from('candidate_evaluations')
      .select('id, kit_id, candidate_name, candidate_role, candidate_experience_years, overall_score, result_status, interview_stage, removed_at, interviewed_by, created_at')
      .order('created_at', { ascending: false });
    if (!includeRemoved) evalsQuery = evalsQuery.is('removed_at', null);
    const { data: evals, error } = await evalsQuery;

    if (error) throw error;

    // Enrich with kit info
    const kitIds = [...new Set((evals || []).map((e) => e.kit_id).filter(Boolean))];
    let kitsMap = {};
    if (kitIds.length > 0) {
      const { data: kits } = await supabase
        .from('interview_kits')
        .select('id, kit_title, seniority_level, is_completed')
        .in('id', kitIds);
      (kits || []).forEach((k) => { kitsMap[k.id] = k; });
    }

    // Enrich with interviewer names
    const userIds = [...new Set((evals || []).map((e) => e.interviewed_by).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
      (users || []).forEach((u) => { usersMap[u.id] = u.name; });
    }

    const results = (evals || []).map((e) => {
      const kit = kitsMap[e.kit_id] || {};
      return {
        id: e.id,
        kit_id: e.kit_id,
        kit_title: kit.kit_title || '—',
        seniority_level: kit.seniority_level || '—',
        candidate_name: e.candidate_name,
        candidate_role: e.candidate_role,
        candidate_experience_years: e.candidate_experience_years,
        overall_score: e.overall_score,
        result_status: e.result_status,
        interviewed_by: usersMap[e.interviewed_by] || '—',
        interview_date: e.created_at,
        removed_at: e.removed_at || null,
        is_completed: kit.is_completed || false,
      };
    });

    res.json({ results });
  } catch (err) {
    console.error('Results error:', err);
    res.status(500).json({ error: 'Failed to fetch interview results' });
  }
});

// ─── Candidate Evaluations ────────────────────────────────────────────────────

// GET /api/interview/:id/evaluations — list all evaluations for a kit
router.get('/:id/evaluations', async (req, res) => {
  try {
    const { id: kitId } = req.params;
    const includeRemoved = req.query.include_removed === 'true';

    const { data: kit, error: kitErr } = await supabase
      .from('interview_kits')
      .select('id, generated_by, is_shared')
      .eq('id', kitId)
      .single();

    if (kitErr || !kit) return res.status(404).json({ error: 'Kit not found' });
    if (req.user.role !== 'admin' && kit.generated_by !== req.user.id && !kit.is_shared) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let query = supabase
      .from('candidate_evaluations')
      .select('id, kit_id, candidate_name, candidate_role, candidate_experience_years, scores_json, overall_score, result_status, interview_stage, removed_at, interviewed_by, created_at')
      .eq('kit_id', kitId)
      .order('created_at', { ascending: true });

    if (!includeRemoved) query = query.is('removed_at', null);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ evaluations: data });
  } catch (err) {
    console.error('List evaluations error:', err);
    res.status(500).json({ error: 'Failed to fetch evaluations' });
  }
});

// POST /api/interview/:id/evaluations — create a new candidate evaluation
router.post('/:id/evaluations', async (req, res) => {
  try {
    const { id: kitId } = req.params;
    const { candidateName, candidateRole, candidateExperienceYears } = req.body;

    if (!candidateName?.trim()) return res.status(400).json({ error: 'Candidate name is required' });

    const { data: kit, error: kitErr } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, is_shared')
      .eq('id', kitId)
      .single();

    if (kitErr || !kit) return res.status(404).json({ error: 'Kit not found' });
    if (kit.status !== 'completed') return res.status(400).json({ error: 'Kit must be completed before adding candidates' });
    if (req.user.role !== 'admin' && kit.generated_by !== req.user.id && !kit.is_shared) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .insert({
        kit_id: kitId,
        candidate_name: candidateName.trim(),
        candidate_role: candidateRole?.trim() || null,
        candidate_experience_years: candidateExperienceYears != null ? parseInt(candidateExperienceYears, 10) : null,
        scores_json: {},
        result_status: 'in_progress',
        interview_stage: 'scheduled',
        interviewed_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ evaluation: data });
  } catch (err) {
    console.error('Create evaluation error:', err);
    res.status(500).json({ error: err.message || 'Failed to create evaluation' });
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/scores — save scores for a candidate
router.patch('/:id/evaluations/:evalId/scores', async (req, res) => {
  try {
    const { id: kitId, evalId } = req.params;
    const { scores_json } = req.body;

    if (typeof scores_json !== 'object' || scores_json === null) {
      return res.status(400).json({ error: 'scores_json must be an object' });
    }

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return res.status(404).json({ error: 'Evaluation not found' });
    if (req.user.role !== 'admin' && ev.interviewed_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Compute overall score from scores_json
    const scored = Object.values(scores_json).filter((v) => v?.score != null);
    const overallScore = scored.length > 0
      ? parseFloat((scored.reduce((sum, v) => sum + Number(v.score), 0) / scored.length).toFixed(1))
      : null;

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ scores_json, overall_score: overallScore, updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    res.json({ evaluation: data });
  } catch (err) {
    console.error('Save evaluation scores error:', err);
    res.status(500).json({ error: 'Failed to save scores' });
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/status — update pipeline status
router.patch('/:id/evaluations/:evalId/status', async (req, res) => {
  try {
    const { evalId } = req.params;
    const { resultStatus } = req.body;
    const valid = ['in_progress', 'selected', 'rejected', 'on_hold'];
    if (!valid.includes(resultStatus)) {
      return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
    }
    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ result_status: resultStatus, updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();
    if (error) throw error;
    res.json({ evaluation: data });
  } catch (err) {
    console.error('Evaluation status update error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /api/interview/:id/evaluations/bulk-remove — soft-delete multiple evaluations
router.post('/:id/evaluations/bulk-remove', async (req, res) => {
  try {
    const { id: kitId } = req.params;
    const { evalIds } = req.body;

    if (!Array.isArray(evalIds) || evalIds.length === 0) {
      return res.status(400).json({ error: 'evalIds must be a non-empty array' });
    }

    const { data: kit, error: kitErr } = await supabase
      .from('interview_kits')
      .select('id, generated_by, is_shared')
      .eq('id', kitId)
      .single();

    if (kitErr || !kit) return res.status(404).json({ error: 'Kit not found' });
    if (req.user.role !== 'admin' && kit.generated_by !== req.user.id && !kit.is_shared) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error } = await supabase
      .from('candidate_evaluations')
      .update({ removed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('kit_id', kitId)
      .in('id', evalIds)
      .is('removed_at', null);

    if (error) throw error;
    res.json({ message: `${evalIds.length} candidate(s) removed` });
  } catch (err) {
    console.error('Bulk remove evaluations error:', err);
    res.status(500).json({ error: 'Failed to remove candidates' });
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/stage — update interview stage
router.patch('/:id/evaluations/:evalId/stage', async (req, res) => {
  try {
    const { id: kitId, evalId } = req.params;
    const { interviewStage } = req.body;
    const valid = ['scheduled', 'in_progress', 'completed'];
    if (!valid.includes(interviewStage)) {
      return res.status(400).json({ error: `Stage must be one of: ${valid.join(', ')}` });
    }

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return res.status(404).json({ error: 'Evaluation not found' });
    if (req.user.role !== 'admin' && ev.interviewed_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ interview_stage: interviewStage, updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    res.json({ evaluation: data });
  } catch (err) {
    console.error('Evaluation stage update error:', err);
    res.status(500).json({ error: 'Failed to update stage' });
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/remove — soft-delete a candidate evaluation
router.patch('/:id/evaluations/:evalId/remove', async (req, res) => {
  try {
    const { id: kitId, evalId } = req.params;

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return res.status(404).json({ error: 'Evaluation not found' });
    if (req.user.role !== 'admin' && ev.interviewed_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ removed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    res.json({ evaluation: data });
  } catch (err) {
    console.error('Remove evaluation error:', err);
    res.status(500).json({ error: 'Failed to remove candidate' });
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/restore — restore a soft-deleted evaluation
router.patch('/:id/evaluations/:evalId/restore', async (req, res) => {
  try {
    const { id: kitId, evalId } = req.params;

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return res.status(404).json({ error: 'Evaluation not found' });
    if (req.user.role !== 'admin' && ev.interviewed_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ removed_at: null, updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    res.json({ evaluation: data });
  } catch (err) {
    console.error('Restore evaluation error:', err);
    res.status(500).json({ error: 'Failed to restore candidate' });
  }
});

// PATCH /api/interview/:id/evaluations/:evalId — edit candidate metadata
// Name is locked once any score has been saved; role and experience are always editable.
router.patch('/:id/evaluations/:evalId', async (req, res) => {
  try {
    const { id: kitId, evalId } = req.params;
    const { candidateName, candidateRole, candidateExperienceYears } = req.body;

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by, scores_json')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return res.status(404).json({ error: 'Evaluation not found' });
    if (req.user.role !== 'admin' && ev.interviewed_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const hasScores = Object.keys(ev.scores_json || {}).length > 0;
    const updates = { updated_at: new Date().toISOString() };

    if (candidateName !== undefined) {
      if (hasScores) return res.status(409).json({ error: 'Cannot change candidate name once scoring has started' });
      if (!candidateName.trim()) return res.status(400).json({ error: 'Candidate name cannot be empty' });
      updates.candidate_name = candidateName.trim();
    }
    if (candidateRole !== undefined) updates.candidate_role = candidateRole?.trim() || null;
    if (candidateExperienceYears !== undefined) {
      updates.candidate_experience_years = candidateExperienceYears != null ? parseInt(candidateExperienceYears, 10) : null;
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update(updates)
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    res.json({ evaluation: data });
  } catch (err) {
    console.error('Update evaluation metadata error:', err);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// GET /api/interview/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('interview_kits')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Interview kit not found' });
    if (req.user.role !== 'admin' && data.generated_by !== req.user.id && !data.is_shared) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ kit: data });
  } catch (err) {
    console.error('Get kit error:', err);
    res.status(500).json({ error: 'Failed to fetch interview kit' });
  }
});

// PATCH /api/interview/:id/scores
router.patch('/:id/scores', async (req, res) => {
  try {
    const { id } = req.params;
    const { output_json, scores_json, is_completed } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, deleted_at, is_shared')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Interview kit not found' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id && !existing.is_shared) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existing.status === 'generating') {
      return res.status(409).json({ error: 'Kit is still generating — please wait.' });
    }
    if (existing.deleted_at) {
      return res.status(410).json({ error: 'Kit is in trash — restore it before editing.' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (output_json !== undefined) updates.output_json = output_json;
    if (scores_json !== undefined) updates.scores_json = scores_json;
    if (is_completed !== undefined) updates.is_completed = is_completed;

    const { data, error } = await supabase
      .from('interview_kits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ kit: data });
  } catch (err) {
    console.error('Update scores error:', err);
    res.status(500).json({ error: 'Failed to update scores' });
  }
});

// POST /api/interview/:id/cancel — user-initiated stop of an in-progress generation
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Interview kit not found' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existing.status !== 'generating') {
      return res.status(400).json({ error: `Kit is not generating (current: ${existing.status})` });
    }

    const { data: updatedKit, error: updateError } = await supabase
      .from('interview_kits')
      .update({
        status: 'cancelled',
        error_message: 'Generation was stopped by you.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`[job] Kit ${id} cancelled by user ${req.user.id}`);
    res.json({ kit: updatedKit });
  } catch (err) {
    console.error('Cancel generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to cancel generation' });
  }
});

// POST /api/interview/:id/retry — re-run generation for a failed kit
router.post('/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, jd_text, seniority_level, tech_stack, custom_expectations, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Interview kit not found' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existing.status !== 'failed' && existing.status !== 'cancelled') {
      return res.status(400).json({ error: `Kit cannot be retried (current status: ${existing.status})` });
    }
    if (existing.deleted_at) {
      return res.status(400).json({ error: 'Kit is in trash — restore it before retrying.' });
    }

    const { data: updatedKit, error: updateError } = await supabase
      .from('interview_kits')
      .update({
        status: 'generating',
        error_message: null,
        output_json: null,
        kit_title: `Generating — ${existing.seniority_level}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ kit: updatedKit });

    runGenerationJob(id, {
      jdText: existing.jd_text,
      seniorityLevel: existing.seniority_level,
      techStack: existing.tech_stack,
      customExpectations: existing.custom_expectations,
      knowledgeBaseDocs: [],
      isRegenerate: false,
      previousQuestions: [],
    });
  } catch (err) {
    console.error('Retry generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to retry generation' });
  }
});

// DELETE /api/interview/:id — soft delete (moves to trash)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Interview kit not found' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error } = await supabase
      .from('interview_kits')
      .update({ deleted_at: new Date().toISOString(), deleted_by: req.user.id, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Kit moved to trash', trashTtlDays: TRASH_TTL_DAYS });
  } catch (err) {
    console.error('Delete kit error:', err);
    res.status(500).json({ error: 'Failed to delete kit' });
  }
});

module.exports = router;
