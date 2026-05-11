import { Hono } from 'hono';
import { getSupabase } from './supabase.js';
import { sendInviteEmail } from './email.js';
import { verifyToken } from './auth-middleware.js';

const app = new Hono();

// Simple in-memory rate limiter: 20 invites per hour per IP
const inviteHits = new Map();
function isInviteRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const hits = (inviteHits.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= 20) return true;
  inviteHits.set(ip, [...hits, now]);
  return false;
}

function inviteStatus(invite) {
  if (invite.used_at) return 'used';
  if (invite.revoked_at) return 'revoked';
  if (new Date(invite.expires_at) < new Date()) return 'expired';
  return 'pending';
}

// POST /api/invites
app.post('/', verifyToken, async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  if (isInviteRateLimited(ip)) {
    return c.json({ error: 'Too many invites sent. Please try again later.' }, 429);
  }

  try {
    const { email, name } = await c.req.json();
    const user = c.get('user');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: 'A valid email address is required.' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = getSupabase(c.env);

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return c.json({ error: 'This person already has an account.' }, 409);
    }

    const { data: existingInvite } = await supabase
      .from('user_invites')
      .select('id')
      .eq('email', normalizedEmail)
      .is('used_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      return c.json({ error: 'An invite for this email is already pending.' }, 409);
    }

    if (user.role !== 'admin') {
      const { count } = await supabase
        .from('user_invites')
        .select('id', { count: 'exact', head: true })
        .eq('invited_by', user.id)
        .is('used_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString());

      if (count >= 10) {
        return c.json({
          error: 'You have 10 pending invites. Wait for some to be accepted or expired before sending more.',
        }, 429);
      }
    }

    // crypto is available via nodejs_compat
    const { randomBytes } = await import('node:crypto');
    const token = randomBytes(32).toString('hex');

    const { error } = await supabase
      .from('user_invites')
      .insert({
        email: normalizedEmail,
        invited_name: name?.trim() || null,
        token,
        invited_by: user.id,
      });

    if (error) throw error;

    await sendInviteEmail(c.env, {
      toEmail: normalizedEmail,
      toName: name?.trim() || null,
      fromName: user.name,
      token,
    });

    return c.json({ message: 'Invite sent.' });
  } catch (err) {
    console.error('Send invite error:', err);
    return c.json({ error: 'Failed to send invite.' }, 500);
  }
});

// GET /api/invites
app.get('/', verifyToken, async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('user_invites')
      .select('id, email, invited_name, invited_by, expires_at, used_at, revoked_at, created_at, users!user_invites_invited_by_fkey(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const invites = (data || []).map((inv) => ({
      id: inv.id,
      email: inv.email,
      invited_name: inv.invited_name,
      invited_by: inv.invited_by,
      invited_by_name: inv.users?.name || null,
      expires_at: inv.expires_at,
      used_at: inv.used_at,
      revoked_at: inv.revoked_at,
      created_at: inv.created_at,
      status: inviteStatus(inv),
    }));

    return c.json({ invites });
  } catch (err) {
    console.error('List invites error:', err);
    return c.json({ error: 'Failed to fetch invites.' }, 500);
  }
});

// DELETE /api/invites/:id
app.delete('/:id', verifyToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: invite, error: fetchErr } = await supabase
      .from('user_invites')
      .select('id, invited_by, used_at, revoked_at')
      .eq('id', id)
      .single();

    if (fetchErr || !invite) return c.json({ error: 'Invite not found.' }, 404);
    if (invite.used_at) return c.json({ error: 'Cannot revoke a used invite.' }, 409);
    if (invite.revoked_at) return c.json({ error: 'Invite is already revoked.' }, 409);

    if (user.role !== 'admin' && invite.invited_by !== user.id) {
      return c.json({ error: 'You can only revoke invites you sent.' }, 403);
    }

    const { error } = await supabase
      .from('user_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return c.json({ ok: true });
  } catch (err) {
    console.error('Revoke invite error:', err);
    return c.json({ error: 'Failed to revoke invite.' }, 500);
  }
});

// POST /api/invites/:id/resend
app.post('/:id/resend', verifyToken, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: invite, error: fetchErr } = await supabase
      .from('user_invites')
      .select('id, email, invited_name, invited_by, used_at, revoked_at')
      .eq('id', id)
      .single();

    if (fetchErr || !invite) return c.json({ error: 'Invite not found.' }, 404);
    if (invite.used_at) return c.json({ error: 'Cannot resend a used invite.' }, 409);
    if (invite.revoked_at) return c.json({ error: 'Cannot resend a revoked invite.' }, 409);

    if (user.role !== 'admin' && invite.invited_by !== user.id) {
      return c.json({ error: 'You can only resend invites you sent.' }, 403);
    }

    const { randomBytes } = await import('node:crypto');
    const newToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('user_invites')
      .update({ token: newToken, expires_at: expiresAt })
      .eq('id', id);

    if (error) throw error;

    await sendInviteEmail(c.env, {
      toEmail: invite.email,
      toName: invite.invited_name,
      fromName: user.name,
      token: newToken,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error('Resend invite error:', err);
    return c.json({ error: 'Failed to resend invite.' }, 500);
  }
});

export default app;
