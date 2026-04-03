const express = require('express');
const rateLimit = require('express-rate-limit');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { generateInterviewKit } = require('../services/claude.service');

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
async function runGenerationJob(kitId, params) {
  try {
    const startedAt = Date.now();
    const kitOutput = await generateInterviewKit(params);
    const generationSeconds = Math.round((Date.now() - startedAt) / 1000);
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
    console.error(`[job] Kit ${kitId} failed:`, err.message);
    await supabase
      .from('interview_kits')
      .update({ status: 'failed', error_message: err.message || 'Generation failed', updated_at: new Date().toISOString() })
      .eq('id', kitId)
      .catch((e) => console.error('[job] Could not write failure status:', e.message));
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

// ─────────────────────────────────────────────────────────────────────────
// ROUTES — ordered so named paths (/history, /trash/*) come before /:id
// ─────────────────────────────────────────────────────────────────────────

// POST /api/interview/generate
router.post('/generate', generateLimiter, async (req, res) => {
  try {
    const { jdText, seniorityLevel, techStack, customExpectations, useKnowledgeBase, previousKitId } = req.body;

    if (!jdText || !seniorityLevel || !techStack) {
      return res.status(400).json({ error: 'JD text, seniority level, and tech stack are required' });
    }
    if (!Array.isArray(techStack) || techStack.length === 0) {
      return res.status(400).json({ error: 'Tech stack must be a non-empty array' });
    }

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
    });
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
    if (req.user.role !== 'admin' && data.generated_by !== req.user.id) {
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
      .select('id, generated_by, status, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Interview kit not found' });
    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
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
