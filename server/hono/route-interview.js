import { Hono } from 'hono';
import { getSupabase } from './supabase.js';
import { generateInterviewKit } from './claude.js';
import { TIER_CONFIG, getEffectiveTier, getMonthlyLimit } from './tiers.js';
import { verifyToken } from './auth-middleware.js';

const app = new Hono();
app.use('*', verifyToken);

const TRASH_TTL_DAYS = 30;
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

// Simple in-memory rate limiter: 20 generations per hour per user
const generateHits = new Map();
function isGenerateRateLimited(userId) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const hits = (generateHits.get(userId) || []).filter((t) => now - t < windowMs);
  if (hits.length >= 20) return true;
  generateHits.set(userId, [...hits, now]);
  return false;
}

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

async function runGenerationJob(env, kitId, params) {
  const supabase = getSupabase(env);
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(Object.assign(new Error('timed out'), { message: 'timeout' })),
      GENERATION_TIMEOUT_MS,
    );
  });
  try {
    const startedAt = Date.now();
    const kitOutput = await Promise.race([generateInterviewKit(env, params), timeout]);
    clearTimeout(timeoutId);
    const generationSeconds = Math.round((Date.now() - startedAt) / 1000);

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
const STUCK_WATCHDOG_MINUTES = 10;

// Mark any stuck 'generating' kits as failed — called on worker startup
export async function recoverStuckGenerations(env) {
  const supabase = getSupabase(env);
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

async function watchdogStuckGenerations(env) {
  const supabase = getSupabase(env);
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

async function cleanupExpiredTrash(env) {
  const supabase = getSupabase(env);
  const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('interview_kits')
    .delete()
    .lt('deleted_at', cutoff)
    .not('deleted_at', 'is', null);
  if (error) console.error('[trash] Cleanup error:', error.message);
}

async function getMonthlyUsage(env, userId) {
  const supabase = getSupabase(env);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { count, error } = await supabase
    .from('interview_kits')
    .select('id', { count: 'exact', head: true })
    .eq('generated_by', userId)
    .gte('created_at', startOfMonth)
    .lt('created_at', nextMonth)
    .in('status', ['generating', 'completed']);
  if (error) throw error;
  return count || 0;
}

// GET /api/interview/quota
app.get('/quota', async (c) => {
  try {
    const user = c.get('user');
    const tier = getEffectiveTier(user);
    const limit = getMonthlyLimit(user);
    const used = await getMonthlyUsage(c.env, user.id);
    const now = new Date();
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const tierLabel = user.role === 'admin' ? 'Admin' : (TIER_CONFIG[tier]?.label ?? 'Free');

    return c.json({
      tier: tierLabel,
      tierKey: tier,
      used,
      limit: limit === Infinity ? null : limit,
      remaining: limit === Infinity ? null : Math.max(0, limit - used),
      percentUsed: limit === Infinity ? 0 : Math.min(100, Math.round((used / limit) * 100)),
      resetsAt,
      isUnlimited: limit === Infinity,
      expiresAt: user.subscription_expires_at || null,
    });
  } catch (err) {
    console.error('Quota error:', err);
    return c.json({ error: 'Failed to fetch quota' }, 500);
  }
});

// POST /api/interview/generate
app.post('/generate', async (c) => {
  const user = c.get('user');
  if (isGenerateRateLimited(user.id)) {
    return c.json({ error: 'Too many kits generated. Please wait before generating more.' }, 429);
  }

  try {
    const { jdText, seniorityLevel, techStack, customExpectations, useKnowledgeBase, kbPercentage = 25, previousKitId } = await c.req.json();

    if (!jdText || !seniorityLevel || !techStack) {
      return c.json({ error: 'JD text, seniority level, and tech stack are required' }, 400);
    }
    if (!Array.isArray(techStack) || techStack.length === 0) {
      return c.json({ error: 'Tech stack must be a non-empty array' }, 400);
    }

    const monthlyLimit = getMonthlyLimit(user);
    if (monthlyLimit !== Infinity) {
      const used = await getMonthlyUsage(c.env, user.id);
      if (used >= monthlyLimit) {
        const tier = getEffectiveTier(user);
        const now = new Date();
        const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        return c.json({
          error: `Monthly limit reached — you have used all ${monthlyLimit} kit${monthlyLimit !== 1 ? 's' : ''} on the ${TIER_CONFIG[tier]?.label ?? 'Free'} plan.`,
          hint: `Your quota resets on ${resetsAt}. Ask your admin to upgrade your subscription for more.`,
          used,
          limit: monthlyLimit,
          tier,
        }, 429);
      }
    }

    const supabase = getSupabase(c.env);
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
        generated_by: user.id,
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

    const jobParams = {
      jdText, seniorityLevel, techStack, customExpectations,
      knowledgeBaseDocs, isRegenerate, previousQuestions,
      kbPercentage: useKnowledgeBase ? Math.min(100, Math.max(25, parseInt(kbPercentage) || 25)) : 0,
    };

    // Register background job — keeps running after response is sent
    c.executionCtx.waitUntil(
      runGenerationJob(c.env, newKit.id, jobParams).catch((err) =>
        console.error('[job] Unhandled generation error for kit', newKit.id, err.message)
      )
    );

    return c.json({ kit: newKit }, 201);
  } catch (err) {
    console.error('Generate interview error:', err);
    return c.json({ error: err.message || 'Failed to start kit generation' }, 500);
  }
});

// GET /api/interview/history
app.get('/history', async (c) => {
  try {
    const { search, seniority, status, page = '1', limit: limitStr = '20' } = c.req.query();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    let query = supabase
      .from('interview_kits')
      .select(
        'id, kit_title, seniority_level, tech_stack, is_completed, status, error_message, created_at, generated_by',
        { count: 'exact' },
      )
      .is('deleted_at', null);

    if (user.role !== 'admin') query = query.eq('generated_by', user.id);
    if (search) query = query.ilike('kit_title', `%${search}%`);
    if (seniority) query = query.eq('seniority_level', seniority);
    if (status === 'completed') query = query.eq('is_completed', true);
    else if (status === 'in_progress') query = query.eq('is_completed', false);

    const offset = (parseInt(page) - 1) * parseInt(limitStr);
    query = query.order('created_at', { ascending: false }).range(offset, offset + parseInt(limitStr) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return c.json({ kits: data, total: count, page: parseInt(page), limit: parseInt(limitStr) });
  } catch (err) {
    console.error('Get history error:', err);
    return c.json({ error: 'Failed to fetch interview history' }, 500);
  }
});

// GET /api/interview/trash
app.get('/trash', async (c) => {
  try {
    await cleanupExpiredTrash(c.env);

    const user = c.get('user');
    const supabase = getSupabase(c.env);

    let query = supabase
      .from('interview_kits')
      .select('id, kit_title, seniority_level, tech_stack, deleted_at, created_at, generated_by')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (user.role !== 'admin') query = query.eq('generated_by', user.id);

    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    const kits = (data || []).map((k) => {
      const deletedMs = new Date(k.deleted_at).getTime();
      const expiresMs = deletedMs + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;
      const daysRemaining = Math.max(0, Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000)));
      return { ...k, days_remaining: daysRemaining, expires_at: new Date(expiresMs).toISOString() };
    });

    return c.json({ kits });
  } catch (err) {
    console.error('Get trash error:', err);
    return c.json({ error: 'Failed to fetch trash' }, 500);
  }
});

// GET /api/interview/trash/summary
app.get('/trash/summary', async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    let query = supabase
      .from('interview_kits')
      .select('id, deleted_at')
      .not('deleted_at', 'is', null);

    if (user.role !== 'admin') query = query.eq('generated_by', user.id);

    const { data, error } = await query;
    if (error) throw error;

    const now = Date.now();
    const ttlMs = TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;
    const warnMs = 24 * 60 * 60 * 1000;

    const total = (data || []).length;
    const expiringSoon = (data || []).filter((k) => {
      const age = now - new Date(k.deleted_at).getTime();
      return age >= ttlMs - warnMs;
    }).length;

    return c.json({ total, expiringSoon });
  } catch (err) {
    console.error('Trash summary error:', err);
    return c.json({ error: 'Failed to fetch trash summary' }, 500);
  }
});

// POST /api/interview/trash/:id/restore
app.post('/trash/:id/restore', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return c.json({ error: 'Kit not found in trash' }, 404);
    if (!existing.deleted_at) return c.json({ error: 'Kit is not in trash' }, 400);
    if (user.role !== 'admin' && existing.generated_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const { data, error } = await supabase
      .from('interview_kits')
      .update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return c.json({ kit: data });
  } catch (err) {
    console.error('Restore kit error:', err);
    return c.json({ error: 'Failed to restore kit' }, 500);
  }
});

// DELETE /api/interview/trash/empty
app.delete('/trash/empty', async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    let query = supabase
      .from('interview_kits')
      .delete()
      .not('deleted_at', 'is', null);

    if (user.role !== 'admin') query = query.eq('generated_by', user.id);

    const { error } = await query;
    if (error) throw error;

    return c.json({ message: 'Trash emptied successfully' });
  } catch (err) {
    console.error('Empty trash error:', err);
    return c.json({ error: 'Failed to empty trash' }, 500);
  }
});

// DELETE /api/interview/trash/:id
app.delete('/trash/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return c.json({ error: 'Kit not found' }, 404);
    if (!existing.deleted_at) return c.json({ error: 'Kit is not in trash — use DELETE /:id to soft-delete first' }, 400);
    if (user.role !== 'admin' && existing.generated_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const { error } = await supabase.from('interview_kits').delete().eq('id', id);
    if (error) throw error;

    return c.json({ message: 'Permanently deleted' });
  } catch (err) {
    console.error('Permanent delete error:', err);
    return c.json({ error: 'Failed to permanently delete kit' }, 500);
  }
});

// GET /api/interview/shared
app.get('/shared', async (c) => {
  try {
    const { search, seniority, page = '1', limit: limitStr = '20' } = c.req.query();
    const supabase = getSupabase(c.env);

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

    const offset = (parseInt(page) - 1) * parseInt(limitStr);
    query = query.order('created_at', { ascending: false }).range(offset, offset + parseInt(limitStr) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return c.json({ kits: data, total: count, page: parseInt(page), limit: parseInt(limitStr) });
  } catch (err) {
    console.error('Get shared kits error:', err);
    return c.json({ error: 'Failed to fetch shared kits' }, 500);
  }
});

// GET /api/interview/stats
app.get('/stats', async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    let baseQuery = supabase
      .from('interview_kits')
      .select('is_completed', { count: 'exact' })
      .is('deleted_at', null);
    if (user.role !== 'admin') baseQuery = baseQuery.eq('generated_by', user.id);

    const { data, count: total, error } = await baseQuery;
    if (error) throw error;

    const completed = (data || []).filter((k) => k.is_completed).length;
    const inProgress = (data || []).filter((k) => !k.is_completed).length;

    return c.json({ total: total || 0, completed, inProgress });
  } catch (err) {
    console.error('Stats error:', err);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// GET /api/interview/results
app.get('/results', async (c) => {
  try {
    const includeRemoved = c.req.query('include_removed') === 'true';
    const supabase = getSupabase(c.env);

    let evalsQuery = supabase
      .from('candidate_evaluations')
      .select('id, kit_id, candidate_name, candidate_role, candidate_experience_years, overall_score, result_status, interview_stage, removed_at, interviewed_by, created_at')
      .order('created_at', { ascending: false });
    if (!includeRemoved) evalsQuery = evalsQuery.is('removed_at', null);
    const { data: evals, error } = await evalsQuery;

    if (error) throw error;

    const kitIds = [...new Set((evals || []).map((e) => e.kit_id).filter(Boolean))];
    let kitsMap = {};
    if (kitIds.length > 0) {
      const { data: kits } = await supabase
        .from('interview_kits')
        .select('id, kit_title, seniority_level, is_completed')
        .in('id', kitIds);
      (kits || []).forEach((k) => { kitsMap[k.id] = k; });
    }

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

    return c.json({ results });
  } catch (err) {
    console.error('Results error:', err);
    return c.json({ error: 'Failed to fetch interview results' }, 500);
  }
});

// ─── Candidate Evaluations ────────────────────────────────────────────────────

// GET /api/interview/:id/evaluations
app.get('/:id/evaluations', async (c) => {
  try {
    const kitId = c.req.param('id');
    const includeRemoved = c.req.query('include_removed') === 'true';
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: kit, error: kitErr } = await supabase
      .from('interview_kits')
      .select('id, generated_by, is_shared')
      .eq('id', kitId)
      .single();

    if (kitErr || !kit) return c.json({ error: 'Kit not found' }, 404);
    if (user.role !== 'admin' && kit.generated_by !== user.id && !kit.is_shared) {
      return c.json({ error: 'Access denied' }, 403);
    }

    let query = supabase
      .from('candidate_evaluations')
      .select('id, kit_id, candidate_name, candidate_role, candidate_experience_years, scores_json, overall_score, result_status, interview_stage, removed_at, interviewed_by, created_at')
      .eq('kit_id', kitId)
      .order('created_at', { ascending: true });

    if (!includeRemoved) query = query.is('removed_at', null);

    const { data, error } = await query;
    if (error) throw error;
    return c.json({ evaluations: data });
  } catch (err) {
    console.error('List evaluations error:', err);
    return c.json({ error: 'Failed to fetch evaluations' }, 500);
  }
});

// POST /api/interview/:id/evaluations
app.post('/:id/evaluations', async (c) => {
  try {
    const kitId = c.req.param('id');
    const { candidateName, candidateRole, candidateExperienceYears } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    if (!candidateName?.trim()) return c.json({ error: 'Candidate name is required' }, 400);

    const { data: kit, error: kitErr } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, is_shared')
      .eq('id', kitId)
      .single();

    if (kitErr || !kit) return c.json({ error: 'Kit not found' }, 404);
    if (kit.status !== 'completed') return c.json({ error: 'Kit must be completed before adding candidates' }, 400);
    if (user.role !== 'admin' && kit.generated_by !== user.id && !kit.is_shared) {
      return c.json({ error: 'Access denied' }, 403);
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
        interviewed_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return c.json({ evaluation: data }, 201);
  } catch (err) {
    console.error('Create evaluation error:', err);
    return c.json({ error: err.message || 'Failed to create evaluation' }, 500);
  }
});

// POST /api/interview/:id/evaluations/bulk-remove
app.post('/:id/evaluations/bulk-remove', async (c) => {
  try {
    const kitId = c.req.param('id');
    const { evalIds } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    if (!Array.isArray(evalIds) || evalIds.length === 0) {
      return c.json({ error: 'evalIds must be a non-empty array' }, 400);
    }

    const { data: kit, error: kitErr } = await supabase
      .from('interview_kits')
      .select('id, generated_by, is_shared')
      .eq('id', kitId)
      .single();

    if (kitErr || !kit) return c.json({ error: 'Kit not found' }, 404);
    if (user.role !== 'admin' && kit.generated_by !== user.id && !kit.is_shared) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const { error } = await supabase
      .from('candidate_evaluations')
      .update({ removed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('kit_id', kitId)
      .in('id', evalIds)
      .is('removed_at', null);

    if (error) throw error;
    return c.json({ message: `${evalIds.length} candidate(s) removed` });
  } catch (err) {
    console.error('Bulk remove evaluations error:', err);
    return c.json({ error: 'Failed to remove candidates' }, 500);
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/scores
app.patch('/:id/evaluations/:evalId/scores', async (c) => {
  try {
    const { id: kitId, evalId } = c.req.param();
    const { scores_json } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    if (typeof scores_json !== 'object' || scores_json === null) {
      return c.json({ error: 'scores_json must be an object' }, 400);
    }

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return c.json({ error: 'Evaluation not found' }, 404);
    if (user.role !== 'admin' && ev.interviewed_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

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
    return c.json({ evaluation: data });
  } catch (err) {
    console.error('Save evaluation scores error:', err);
    return c.json({ error: 'Failed to save scores' }, 500);
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/status
app.patch('/:id/evaluations/:evalId/status', async (c) => {
  try {
    const evalId = c.req.param('evalId');
    const { resultStatus } = await c.req.json();
    const valid = ['in_progress', 'selected', 'rejected', 'on_hold'];
    if (!valid.includes(resultStatus)) {
      return c.json({ error: `Status must be one of: ${valid.join(', ')}` }, 400);
    }
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ result_status: resultStatus, updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();
    if (error) throw error;
    return c.json({ evaluation: data });
  } catch (err) {
    console.error('Evaluation status update error:', err);
    return c.json({ error: 'Failed to update status' }, 500);
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/stage
app.patch('/:id/evaluations/:evalId/stage', async (c) => {
  try {
    const { id: kitId, evalId } = c.req.param();
    const { interviewStage } = await c.req.json();
    const valid = ['scheduled', 'in_progress', 'completed'];
    if (!valid.includes(interviewStage)) {
      return c.json({ error: `Stage must be one of: ${valid.join(', ')}` }, 400);
    }

    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return c.json({ error: 'Evaluation not found' }, 404);
    if (user.role !== 'admin' && ev.interviewed_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ interview_stage: interviewStage, updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    return c.json({ evaluation: data });
  } catch (err) {
    console.error('Evaluation stage update error:', err);
    return c.json({ error: 'Failed to update stage' }, 500);
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/remove
app.patch('/:id/evaluations/:evalId/remove', async (c) => {
  try {
    const { id: kitId, evalId } = c.req.param();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return c.json({ error: 'Evaluation not found' }, 404);
    if (user.role !== 'admin' && ev.interviewed_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ removed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    return c.json({ evaluation: data });
  } catch (err) {
    console.error('Remove evaluation error:', err);
    return c.json({ error: 'Failed to remove candidate' }, 500);
  }
});

// PATCH /api/interview/:id/evaluations/:evalId/restore
app.patch('/:id/evaluations/:evalId/restore', async (c) => {
  try {
    const { id: kitId, evalId } = c.req.param();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return c.json({ error: 'Evaluation not found' }, 404);
    if (user.role !== 'admin' && ev.interviewed_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const { data, error } = await supabase
      .from('candidate_evaluations')
      .update({ removed_at: null, updated_at: new Date().toISOString() })
      .eq('id', evalId)
      .select()
      .single();

    if (error) throw error;
    return c.json({ evaluation: data });
  } catch (err) {
    console.error('Restore evaluation error:', err);
    return c.json({ error: 'Failed to restore candidate' }, 500);
  }
});

// PATCH /api/interview/:id/evaluations/:evalId — edit candidate metadata
app.patch('/:id/evaluations/:evalId', async (c) => {
  try {
    const { id: kitId, evalId } = c.req.param();
    const { candidateName, candidateRole, candidateExperienceYears } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: ev, error: evErr } = await supabase
      .from('candidate_evaluations')
      .select('id, kit_id, interviewed_by, scores_json')
      .eq('id', evalId)
      .eq('kit_id', kitId)
      .single();

    if (evErr || !ev) return c.json({ error: 'Evaluation not found' }, 404);
    if (user.role !== 'admin' && ev.interviewed_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const hasScores = Object.keys(ev.scores_json || {}).length > 0;
    const updates = { updated_at: new Date().toISOString() };

    if (candidateName !== undefined) {
      if (hasScores) return c.json({ error: 'Cannot change candidate name once scoring has started' }, 409);
      if (!candidateName.trim()) return c.json({ error: 'Candidate name cannot be empty' }, 400);
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
    return c.json({ evaluation: data });
  } catch (err) {
    console.error('Update evaluation metadata error:', err);
    return c.json({ error: 'Failed to update candidate' }, 500);
  }
});

// GET /api/interview/:id
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data, error } = await supabase
      .from('interview_kits')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return c.json({ error: 'Interview kit not found' }, 404);
    if (user.role !== 'admin' && data.generated_by !== user.id && !data.is_shared) {
      return c.json({ error: 'Access denied' }, 403);
    }

    return c.json({ kit: data });
  } catch (err) {
    console.error('Get kit error:', err);
    return c.json({ error: 'Failed to fetch interview kit' }, 500);
  }
});

// PATCH /api/interview/:id/scores
app.patch('/:id/scores', async (c) => {
  try {
    const id = c.req.param('id');
    const { output_json, scores_json, is_completed } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, deleted_at, is_shared')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return c.json({ error: 'Interview kit not found' }, 404);
    if (user.role !== 'admin' && existing.generated_by !== user.id && !existing.is_shared) {
      return c.json({ error: 'Access denied' }, 403);
    }
    if (existing.status === 'generating') {
      return c.json({ error: 'Kit is still generating — please wait.' }, 409);
    }
    if (existing.deleted_at) {
      return c.json({ error: 'Kit is in trash — restore it before editing.' }, 410);
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
    return c.json({ kit: data });
  } catch (err) {
    console.error('Update scores error:', err);
    return c.json({ error: 'Failed to update scores' }, 500);
  }
});

// POST /api/interview/:id/share
app.post('/:id/share', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, is_shared, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return c.json({ error: 'Interview kit not found' }, 404);
    if (user.role !== 'admin' && existing.generated_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
    if (existing.status !== 'completed') {
      return c.json({ error: 'Only completed kits can be shared.' }, 400);
    }
    if (existing.deleted_at) {
      return c.json({ error: 'Kit is in trash — restore it before sharing.' }, 400);
    }

    const { data, error } = await supabase
      .from('interview_kits')
      .update({ is_shared: !existing.is_shared, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return c.json({ kit: data });
  } catch (err) {
    console.error('Toggle share error:', err);
    return c.json({ error: 'Failed to update sharing status' }, 500);
  }
});

// POST /api/interview/:id/cancel
app.post('/:id/cancel', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return c.json({ error: 'Interview kit not found' }, 404);
    if (user.role !== 'admin' && existing.generated_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
    if (existing.status !== 'generating') {
      return c.json({ error: `Kit is not generating (current: ${existing.status})` }, 400);
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

    console.log(`[job] Kit ${id} cancelled by user ${user.id}`);
    return c.json({ kit: updatedKit });
  } catch (err) {
    console.error('Cancel generation error:', err);
    return c.json({ error: err.message || 'Failed to cancel generation' }, 500);
  }
});

// POST /api/interview/:id/retry
app.post('/:id/retry', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by, status, jd_text, seniority_level, tech_stack, custom_expectations, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return c.json({ error: 'Interview kit not found' }, 404);
    if (user.role !== 'admin' && existing.generated_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
    if (existing.status !== 'failed' && existing.status !== 'cancelled') {
      return c.json({ error: `Kit cannot be retried (current status: ${existing.status})` }, 400);
    }
    if (existing.deleted_at) {
      return c.json({ error: 'Kit is in trash — restore it before retrying.' }, 400);
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

    c.executionCtx.waitUntil(
      runGenerationJob(c.env, id, {
        jdText: existing.jd_text,
        seniorityLevel: existing.seniority_level,
        techStack: existing.tech_stack,
        customExpectations: existing.custom_expectations,
        knowledgeBaseDocs: [],
        isRegenerate: false,
        previousQuestions: [],
      }).catch((err) =>
        console.error('[job] Retry generation error for kit', id, err.message)
      )
    );

    return c.json({ kit: updatedKit });
  } catch (err) {
    console.error('Retry generation error:', err);
    return c.json({ error: err.message || 'Failed to retry generation' }, 500);
  }
});

// DELETE /api/interview/all
app.delete('/all', async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    let query = supabase
      .from('interview_kits')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, updated_at: new Date().toISOString() })
      .is('deleted_at', null);

    if (user.role !== 'admin') query = query.eq('generated_by', user.id);

    const { error } = await query;
    if (error) throw error;

    return c.json({ message: 'All kits moved to trash' });
  } catch (err) {
    console.error('Delete all error:', err);
    return c.json({ error: 'Failed to delete all kits' }, 500);
  }
});

// DELETE /api/interview/:id — soft delete
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return c.json({ error: 'Interview kit not found' }, 404);
    if (user.role !== 'admin' && existing.generated_by !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const { error } = await supabase
      .from('interview_kits')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return c.json({ message: 'Kit moved to trash', trashTtlDays: TRASH_TTL_DAYS });
  } catch (err) {
    console.error('Delete kit error:', err);
    return c.json({ error: 'Failed to delete kit' }, 500);
  }
});

export default app;
