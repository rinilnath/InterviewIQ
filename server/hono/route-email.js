import { Hono } from 'hono';
import { getSupabase } from './supabase.js';
import { verifyToken } from './auth-middleware.js';
import { requireAdmin } from './role-middleware.js';

const app = new Hono();

// 1×1 transparent GIF as Uint8Array
const PIXEL = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
);

// GET /api/email/track/:id — no auth; called by email client on open
app.get('/track/:id', async (c) => {
  const id = c.req.param('id');

  // Respond immediately with the pixel
  const response = new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
    },
  });

  // Mark as read in background after response is sent
  if (/^[0-9a-f-]{36}$/.test(id)) {
    c.executionCtx.waitUntil(
      getSupabase(c.env)
        .from('email_logs')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null)
        .then(({ error }) => {
          if (error) console.error('[Email] Track pixel DB update failed:', error.message);
        }),
    );
  }

  return response;
});

// GET /api/email/logs — admin only
app.get('/logs', verifyToken, requireAdmin, async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '100'), 200);
    const offset = parseInt(c.req.query('offset') || '0');

    const supabase = getSupabase(c.env);
    const { data, error, count } = await supabase
      .from('email_logs')
      .select('id, email_type, recipient_email, recipient_name, subject, status, error, read_at, created_at, user_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return c.json({ logs: data, total: count });
  } catch (err) {
    console.error('[Email] Get logs error:', err);
    return c.json({ error: 'Failed to fetch email logs' }, 500);
  }
});

export default app;
