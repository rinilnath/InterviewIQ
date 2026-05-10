const express    = require('express');
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');
const supabase   = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { sendInviteEmail } = require('../services/email.service');

const router = express.Router();

const sendInviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invites sent. Please try again later.' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inviteStatus(invite) {
  if (invite.used_at)    return 'used';
  if (invite.revoked_at) return 'revoked';
  if (new Date(invite.expires_at) < new Date()) return 'expired';
  return 'pending';
}

// ─── POST /api/auth/invite — send invite (any authenticated user) ──────────

router.post('/', verifyToken, sendInviteLimiter, async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Email must not already exist in users
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({ error: 'This person already has an account.' });
    }

    // No active pending invite for this email
    const { data: existingInvite } = await supabase
      .from('user_invites')
      .select('id')
      .eq('email', normalizedEmail)
      .is('used_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      return res.status(409).json({ error: 'An invite for this email is already pending.' });
    }

    // Regular users: max 10 pending invites
    if (req.user.role !== 'admin') {
      const { count } = await supabase
        .from('user_invites')
        .select('id', { count: 'exact', head: true })
        .eq('invited_by', req.user.id)
        .is('used_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString());

      if (count >= 10) {
        return res.status(429).json({
          error: 'You have 10 pending invites. Wait for some to be accepted or expired before sending more.',
        });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');

    const { error } = await supabase
      .from('user_invites')
      .insert({
        email: normalizedEmail,
        invited_name: name?.trim() || null,
        token,
        invited_by: req.user.id,
      });

    if (error) throw error;

    await sendInviteEmail({
      toEmail: normalizedEmail,
      toName:  name?.trim() || null,
      fromName: req.user.name,
      token,
    });

    return res.json({ message: 'Invite sent.' });
  } catch (err) {
    console.error('Send invite error:', err);
    return res.status(500).json({ error: 'Failed to send invite.' });
  }
});

// ─── GET /api/invites — list all org-wide invites ─────────────────────────

router.get('/', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_invites')
      .select('id, email, invited_name, invited_by, expires_at, used_at, revoked_at, created_at, users!user_invites_invited_by_fkey(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const invites = (data || []).map((inv) => ({
      id:              inv.id,
      email:           inv.email,
      invited_name:    inv.invited_name,
      invited_by:      inv.invited_by,
      invited_by_name: inv.users?.name || null,
      expires_at:      inv.expires_at,
      used_at:         inv.used_at,
      revoked_at:      inv.revoked_at,
      created_at:      inv.created_at,
      status:          inviteStatus(inv),
    }));

    return res.json({ invites });
  } catch (err) {
    console.error('List invites error:', err);
    return res.status(500).json({ error: 'Failed to fetch invites.' });
  }
});

// ─── DELETE /api/invites/:id — revoke invite ──────────────────────────────

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { data: invite, error: fetchErr } = await supabase
      .from('user_invites')
      .select('id, invited_by, used_at, revoked_at')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !invite) return res.status(404).json({ error: 'Invite not found.' });
    if (invite.used_at)    return res.status(409).json({ error: 'Cannot revoke a used invite.' });
    if (invite.revoked_at) return res.status(409).json({ error: 'Invite is already revoked.' });

    if (req.user.role !== 'admin' && invite.invited_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only revoke invites you sent.' });
    }

    const { error } = await supabase
      .from('user_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;

    return res.json({ ok: true });
  } catch (err) {
    console.error('Revoke invite error:', err);
    return res.status(500).json({ error: 'Failed to revoke invite.' });
  }
});

// ─── POST /api/invites/:id/resend — resend invite ─────────────────────────

router.post('/:id/resend', verifyToken, async (req, res) => {
  try {
    const { data: invite, error: fetchErr } = await supabase
      .from('user_invites')
      .select('id, email, invited_name, invited_by, used_at, revoked_at')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !invite) return res.status(404).json({ error: 'Invite not found.' });
    if (invite.used_at)    return res.status(409).json({ error: 'Cannot resend a used invite.' });
    if (invite.revoked_at) return res.status(409).json({ error: 'Cannot resend a revoked invite.' });

    if (req.user.role !== 'admin' && invite.invited_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only resend invites you sent.' });
    }

    const newToken  = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('user_invites')
      .update({ token: newToken, expires_at: expiresAt })
      .eq('id', req.params.id);

    if (error) throw error;

    await sendInviteEmail({
      toEmail:  invite.email,
      toName:   invite.invited_name,
      fromName: req.user.name,
      token:    newToken,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Resend invite error:', err);
    return res.status(500).json({ error: 'Failed to resend invite.' });
  }
});

module.exports = router;
