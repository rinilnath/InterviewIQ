const express = require('express');
const supabase = require('../services/supabase.service');

const router = express.Router();

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// GET /api/email/track/:id — no auth, called by email client when email is opened
router.get('/track/:id', async (req, res) => {
  // Serve the pixel immediately — never block on DB
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.end(PIXEL);

  // Mark as read in background (fire-and-forget)
  const { id } = req.params;
  if (/^[0-9a-f-]{36}$/.test(id)) {
    supabase
      .from('email_logs')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null)   // only set once — first open wins
      .then(({ error }) => {
        if (error) console.error('[Email] Track pixel DB update failed:', error.message);
      });
  }
});

// GET /api/email/logs — admin only, fetched by frontend
const { verifyToken }  = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');

router.get('/logs', verifyToken, requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '100'), 200);
    const offset = parseInt(req.query.offset || '0');

    const { data, error, count } = await supabase
      .from('email_logs')
      .select('id, email_type, recipient_email, recipient_name, subject, status, error, read_at, created_at, user_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ logs: data, total: count });
  } catch (err) {
    console.error('[Email] Get logs error:', err);
    res.status(500).json({ error: 'Failed to fetch email logs' });
  }
});

module.exports = router;
