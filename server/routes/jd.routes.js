const express = require('express');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(verifyToken);

// GET /api/jd — list all JDs with uploader name
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('jd_library')
      .select('id, title, role, technologies, content, uploaded_by, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with uploader names via separate query (avoids PostgREST FK cache issues)
    const userIds = [...new Set(data.map((r) => r.uploaded_by).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
      (users || []).forEach((u) => { usersMap[u.id] = u.name; });
    }

    const enriched = data.map((r) => ({ ...r, uploaded_by_name: usersMap[r.uploaded_by] || '—' }));
    res.json({ jds: enriched });
  } catch (err) {
    console.error('JD library list error:', err);
    res.status(500).json({ error: 'Failed to fetch JD library' });
  }
});

// POST /api/jd — add a JD (any authenticated user)
router.post('/', async (req, res) => {
  try {
    const { title, role, technologies, content } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!role?.trim())  return res.status(400).json({ error: 'Role is required' });
    if (!content?.trim() || content.trim().length < 50)
      return res.status(400).json({ error: 'JD content must be at least 50 characters' });

    // technologies: accept array or comma-separated string, dedupe and trim
    let techArray = [];
    if (Array.isArray(technologies)) {
      techArray = technologies.map((t) => t.trim()).filter(Boolean);
    } else if (typeof technologies === 'string') {
      techArray = technologies.split(',').map((t) => t.trim()).filter(Boolean);
    }

    const { data, error } = await supabase
      .from('jd_library')
      .insert({
        title: title.trim(),
        role: role.trim(),
        technologies: techArray,
        content: content.trim(),
        uploaded_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ jd: { ...data, uploaded_by_name: req.user.name } });
  } catch (err) {
    console.error('JD library create error:', err);
    res.status(500).json({ error: err.message || 'Failed to save JD' });
  }
});

// DELETE /api/jd/:id — uploader or admin only
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: jd, error: fetchErr } = await supabase
      .from('jd_library')
      .select('id, uploaded_by')
      .eq('id', id)
      .single();

    if (fetchErr || !jd) return res.status(404).json({ error: 'JD not found' });

    if (req.user.role !== 'admin' && jd.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own JDs' });
    }

    const { error } = await supabase.from('jd_library').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'JD deleted' });
  } catch (err) {
    console.error('JD library delete error:', err);
    res.status(500).json({ error: 'Failed to delete JD' });
  }
});

module.exports = router;
