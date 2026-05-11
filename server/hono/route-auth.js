import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getSupabase } from './supabase.js';
import { verifyToken } from './auth-middleware.js';

const app = new Hono();

// Simple in-memory rate limiters (per-isolate; use CF WAF for global limiting)
const loginHits = new Map();
const validateHits = new Map();
const registerHits = new Map();

function rateLimited(map, key, max, windowMs) {
  const now = Date.now();
  const hits = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return true;
  map.set(key, [...hits, now]);
  return false;
}

async function verifyTurnstile(token, remoteIp, env) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// POST /api/auth/login
app.post('/login', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  if (rateLimited(loginHits, ip, 5, 15 * 60 * 1000)) {
    return c.json({ error: 'Too many login attempts. Please try again after 15 minutes.' }, 429);
  }

  try {
    const { email, password, turnstileToken, website } = await c.req.json();

    if (website) return c.json({ message: 'ok' });
    if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

    if (c.env.TURNSTILE_SECRET_KEY) {
      const ok = await verifyTurnstile(turnstileToken, ip, c.env);
      if (!ok) return c.json({ error: 'Bot verification failed.' }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, password_hash, role, is_active')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) return c.json({ error: 'Invalid email or password' }, 401);
    if (!user.is_active) return c.json({ error: 'Account is inactive. Contact your administrator.' }, 403);

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return c.json({ error: 'Invalid email or password' }, 401);

    const token = jwt.sign({ userId: user.id }, c.env.JWT_SECRET, {
      expiresIn: c.env.JWT_EXPIRES_IN || '8h',
    });

    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 8 * 60 * 60,
    });

    return c.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: 'Server error' }, 500);
  }
});

// GET /api/auth/invite/validate?token=xxx
app.get('/invite/validate', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  if (rateLimited(validateHits, ip, 10, 15 * 60 * 1000)) {
    return c.json({ error: 'Too many validation attempts. Please try again later.' }, 429);
  }

  try {
    const token = c.req.query('token');
    if (!token) return c.json({ error: 'Token is required.' }, 400);

    const supabase = getSupabase(c.env);
    const { data: invite, error } = await supabase
      .from('user_invites')
      .select('email, invited_name, used_at, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (error || !invite) return c.json({ error: 'Invitation not found.' }, 404);
    if (invite.used_at) return c.json({ error: 'This invitation has already been used.' }, 410);
    if (invite.revoked_at) return c.json({ error: 'This invitation has been revoked.' }, 410);
    if (new Date(invite.expires_at) < new Date()) return c.json({ error: 'This invitation has expired.' }, 410);

    return c.json({ email: invite.email, name: invite.invited_name });
  } catch (err) {
    console.error('Validate invite error:', err);
    return c.json({ error: 'Server error.' }, 500);
  }
});

// POST /api/auth/register
app.post('/register', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  if (rateLimited(registerHits, ip, 5, 60 * 60 * 1000)) {
    return c.json({ error: 'Too many registration attempts. Please try again later.' }, 429);
  }

  try {
    const { token, name, password, turnstileToken, website } = await c.req.json();

    if (website) return c.json({ message: 'ok' });

    if (!token || !name || !password) {
      return c.json({ error: 'Token, name, and password are required.' }, 400);
    }
    if (name.trim().length < 2 || name.trim().length > 100) {
      return c.json({ error: 'Name must be 2–100 characters.' }, 400);
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return c.json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and a digit.' }, 400);
    }

    if (c.env.TURNSTILE_SECRET_KEY) {
      const ok = await verifyTurnstile(turnstileToken, ip, c.env);
      if (!ok) return c.json({ error: 'Bot verification failed.' }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data: invite, error: inviteErr } = await supabase
      .from('user_invites')
      .select('id, email, used_at, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr || !invite) return c.json({ error: 'Invitation not found.' }, 404);
    if (invite.used_at) return c.json({ error: 'This invitation has already been used.' }, 410);
    if (invite.revoked_at) return c.json({ error: 'This invitation has been revoked.' }, 410);
    if (new Date(invite.expires_at) < new Date()) return c.json({ error: 'This invitation has expired.' }, 410);

    const email = invite.email;

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) return c.json({ error: 'An account with this email already exists.' }, 409);

    const passwordHash = await bcrypt.hash(password, 12);

    const { error: insertErr } = await supabase
      .from('users')
      .insert({
        name: name.trim(),
        email,
        password_hash: passwordHash,
        role: 'user',
        is_active: true,
        subscription_tier: 'free',
      });

    if (insertErr) throw insertErr;

    await supabase
      .from('user_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id);

    return c.json({ message: 'Account created. Please log in.' }, 201);
  } catch (err) {
    console.error('Register error:', err);
    return c.json({ error: 'Server error during registration.' }, 500);
  }
});

// GET /api/auth/me
app.get('/me', verifyToken, (c) => {
  return c.json({ user: c.get('user') });
});

// POST /api/auth/logout
app.post('/logout', verifyToken, (c) => {
  deleteCookie(c, 'token');
  return c.json({ message: 'Logged out successfully' });
});

// POST /api/auth/change-password
app.post('/change-password', verifyToken, async (c) => {
  try {
    const { currentPassword, newPassword } = await c.req.json();
    const user = c.get('user');

    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Current and new password are required.' }, 400);
    }
    if (newPassword.length < 8) {
      return c.json({ error: 'New password must be at least 8 characters.' }, 400);
    }
    if (currentPassword === newPassword) {
      return c.json({ error: 'New password must be different from the current one.' }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data: dbUser, error } = await supabase
      .from('users')
      .select('id, password_hash')
      .eq('id', user.id)
      .single();

    if (error || !dbUser) return c.json({ error: 'User not found.' }, 404);

    const isValid = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!isValid) return c.json({ error: 'Current password is incorrect.' }, 401);

    const newHash = await bcrypt.hash(newPassword, 12);
    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', user.id);

    if (updateErr) throw updateErr;

    return c.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    return c.json({ error: 'Failed to change password.' }, 500);
  }
});

// POST /api/auth/deletion-request
app.post('/deletion-request', verifyToken, async (c) => {
  try {
    const { reason } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: existing } = await supabase
      .from('account_deletion_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return c.json({ error: 'You already have a pending deletion request.' }, 409);
    }

    const { error } = await supabase
      .from('account_deletion_requests')
      .insert({ user_id: user.id, reason: reason?.trim() || null });

    if (error) throw error;

    return c.json({ ok: true });
  } catch (err) {
    console.error('Deletion request error:', err);
    return c.json({ error: 'Failed to submit deletion request.' }, 500);
  }
});

// DELETE /api/auth/deletion-request
app.delete('/deletion-request', verifyToken, async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { error } = await supabase
      .from('account_deletion_requests')
      .delete()
      .eq('user_id', user.id)
      .eq('status', 'pending');

    if (error) throw error;
    return c.json({ ok: true });
  } catch (err) {
    console.error('Cancel deletion request error:', err);
    return c.json({ error: 'Failed to cancel deletion request.' }, 500);
  }
});

// GET /api/auth/deletion-request
app.get('/deletion-request', verifyToken, async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data } = await supabase
      .from('account_deletion_requests')
      .select('id, status, created_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    return c.json({ request: data || null });
  } catch (err) {
    return c.json({ error: 'Failed to check deletion request.' }, 500);
  }
});

export default app;
