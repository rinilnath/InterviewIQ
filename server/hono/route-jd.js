import { Hono } from 'hono';
import { getSupabase } from './supabase.js';
import { verifyToken } from './auth-middleware.js';

const app = new Hono();
app.use('*', verifyToken);

// GET /api/jd
app.get('/', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('jd_library')
      .select('id, title, role, technologies, content, uploaded_by, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const userIds = [...new Set(data.map((r) => r.uploaded_by).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
      (users || []).forEach((u) => { usersMap[u.id] = u.name; });
    }

    const enriched = data.map((r) => ({ ...r, uploaded_by_name: usersMap[r.uploaded_by] || '—' }));
    return c.json({ jds: enriched });
  } catch (err) {
    console.error('JD library list error:', err);
    return c.json({ error: 'Failed to fetch JD library' }, 500);
  }
});

// POST /api/jd
app.post('/', async (c) => {
  try {
    const { title, role, technologies, content } = await c.req.json();
    const user = c.get('user');

    if (!title?.trim()) return c.json({ error: 'Title is required' }, 400);
    if (!role?.trim()) return c.json({ error: 'Role is required' }, 400);
    if (!content?.trim() || content.trim().length < 50) {
      return c.json({ error: 'JD content must be at least 50 characters' }, 400);
    }

    let techArray = [];
    if (Array.isArray(technologies)) {
      techArray = technologies.map((t) => t.trim()).filter(Boolean);
    } else if (typeof technologies === 'string') {
      techArray = technologies.split(',').map((t) => t.trim()).filter(Boolean);
    }

    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('jd_library')
      .insert({
        title: title.trim(),
        role: role.trim(),
        technologies: techArray,
        content: content.trim(),
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return c.json({ jd: { ...data, uploaded_by_name: user.name } }, 201);
  } catch (err) {
    console.error('JD library create error:', err);
    return c.json({ error: err.message || 'Failed to save JD' }, 500);
  }
});

// DELETE /api/jd/:id
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: jd, error: fetchErr } = await supabase
      .from('jd_library')
      .select('id, uploaded_by')
      .eq('id', id)
      .single();

    if (fetchErr || !jd) return c.json({ error: 'JD not found' }, 404);

    if (user.role !== 'admin' && jd.uploaded_by !== user.id) {
      return c.json({ error: 'You can only delete your own JDs' }, 403);
    }

    const { error } = await supabase.from('jd_library').delete().eq('id', id);
    if (error) throw error;

    return c.json({ message: 'JD deleted' });
  } catch (err) {
    console.error('JD library delete error:', err);
    return c.json({ error: 'Failed to delete JD' }, 500);
  }
});

export default app;
