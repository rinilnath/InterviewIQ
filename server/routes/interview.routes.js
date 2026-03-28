const express = require('express');
const rateLimit = require('express-rate-limit');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { generateInterviewKit } = require('../services/claude.service');

const router = express.Router();

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many kits generated. Please wait before generating more.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(verifyToken);

// POST /api/interview/generate
router.post('/generate', generateLimiter, async (req, res) => {
  try {
    const { jdText, seniorityLevel, techStack, customExpectations, useKnowledgeBase } = req.body;

    if (!jdText || !seniorityLevel || !techStack) {
      return res.status(400).json({ error: 'JD text, seniority level, and tech stack are required' });
    }

    if (!Array.isArray(techStack) || techStack.length === 0) {
      return res.status(400).json({ error: 'Tech stack must be a non-empty array' });
    }

    // Fetch knowledge base documents if requested
    let knowledgeBaseDocs = [];
    if (useKnowledgeBase) {
      const { data: docs, error } = await supabase
        .from('documents')
        .select('id, label, document_type, extracted_text')
        .order('created_at', { ascending: false });

      if (!error && docs) {
        knowledgeBaseDocs = docs.filter((d) => d.extracted_text && d.extracted_text.trim().length > 0);
      }
    }

    // Generate kit via Claude
    const kitOutput = await generateInterviewKit({
      jdText,
      seniorityLevel,
      techStack,
      customExpectations,
      knowledgeBaseDocs,
    });

    // Save to database
    const { data, error } = await supabase
      .from('interview_kits')
      .insert({
        generated_by: req.user.id,
        jd_text: jdText,
        seniority_level: seniorityLevel,
        tech_stack: techStack,
        custom_expectations: customExpectations || null,
        kit_title: kitOutput.kit_title,
        output_json: kitOutput,
        scores_json: null,
        is_completed: false,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ kit: data });
  } catch (err) {
    console.error('Generate interview error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate interview kit' });
  }
});

// GET /api/interview/history
router.get('/history', async (req, res) => {
  try {
    const { search, seniority, status, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('interview_kits')
      .select('id, kit_title, seniority_level, tech_stack, is_completed, created_at, generated_by', { count: 'exact' });

    // Non-admin users see only their own
    if (req.user.role !== 'admin') {
      query = query.eq('generated_by', req.user.id);
    }

    if (search) {
      query = query.ilike('kit_title', `%${search}%`);
    }

    if (seniority) {
      query = query.eq('seniority_level', seniority);
    }

    if (status === 'completed') {
      query = query.eq('is_completed', true);
    } else if (status === 'in_progress') {
      query = query.eq('is_completed', false);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ kits: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Failed to fetch interview history' });
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

    if (error || !data) {
      return res.status(404).json({ error: 'Interview kit not found' });
    }

    // Check ownership (admin can see all)
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

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Interview kit not found' });
    }

    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
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

// DELETE /api/interview/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('interview_kits')
      .select('id, generated_by')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Interview kit not found' });
    }

    if (req.user.role !== 'admin' && existing.generated_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error } = await supabase
      .from('interview_kits')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Interview kit deleted successfully' });
  } catch (err) {
    console.error('Delete kit error:', err);
    res.status(500).json({ error: 'Failed to delete interview kit' });
  }
});

module.exports = router;
