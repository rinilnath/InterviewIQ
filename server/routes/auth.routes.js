const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const supabase  = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { sendWelcomeEmail } = require('../services/email.service');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const validateInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many validation attempts. Please try again later.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

async function verifyTurnstile(token, remoteIp) {
  if (!process.env.TURNSTILE_SECRET_KEY) return true; // skip in dev if not configured
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        secret:   process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: remoteIp,
      }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, turnstileToken, website } = req.body;

    // Honeypot: bots fill this field, humans don't see it
    if (website) return res.status(200).json({ message: 'ok' });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (process.env.TURNSTILE_SECRET_KEY) {
      const ok = await verifyTurnstile(turnstileToken, req.ip);
      if (!ok) return res.status(400).json({ error: 'Bot verification failed.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, password_hash, role, is_active')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    setTokenCookie(res, token);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/invite/validate?token=xxx — public, validates an invite token
router.get('/invite/validate', validateInviteLimiter, async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token is required.' });

    const { data: invite, error } = await supabase
      .from('user_invites')
      .select('email, invited_name, used_at, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (error || !invite) return res.status(404).json({ error: 'Invitation not found.' });
    if (invite.used_at)    return res.status(410).json({ error: 'This invitation has already been used.' });
    if (invite.revoked_at) return res.status(410).json({ error: 'This invitation has been revoked.' });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invitation has expired.' });

    return res.json({ email: invite.email, name: invite.invited_name });
  } catch (err) {
    console.error('Validate invite error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/auth/register — complete invite-based registration
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { token, name, password, turnstileToken, website } = req.body;

    // Honeypot
    if (website) return res.status(200).json({ message: 'ok' });

    if (!token || !name || !password) {
      return res.status(400).json({ error: 'Token, name, and password are required.' });
    }
    if (name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be 2–100 characters.' });
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and a digit.' });
    }

    if (process.env.TURNSTILE_SECRET_KEY) {
      const ok = await verifyTurnstile(turnstileToken, req.ip);
      if (!ok) return res.status(400).json({ error: 'Bot verification failed.' });
    }

    const { data: invite, error: inviteErr } = await supabase
      .from('user_invites')
      .select('id, email, used_at, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr || !invite) return res.status(404).json({ error: 'Invitation not found.' });
    if (invite.used_at)    return res.status(410).json({ error: 'This invitation has already been used.' });
    if (invite.revoked_at) return res.status(410).json({ error: 'This invitation has been revoked.' });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invitation has expired.' });

    const email = invite.email; // authoritative — not from request body

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);

    const { error: insertErr } = await supabase
      .from('users')
      .insert({
        name: name.trim(),
        email,
        password_hash: passwordHash,
        role:          'user',
        is_active:     true,
        subscription_tier: 'free',
      });

    if (insertErr) throw insertErr;

    await supabase
      .from('user_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id);

    return res.status(201).json({ message: 'Account created. Please log in.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error during registration.' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post('/logout', verifyToken, (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/change-password
router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from the current one.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, password_hash')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User not found.' });

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(newPassword, 12);
    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', req.user.id);

    if (updateErr) throw updateErr;

    res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// POST /api/auth/deletion-request — authenticated user requests account deletion
router.post('/deletion-request', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;

    // Check if there's already a pending request
    const { data: existing } = await supabase
      .from('account_deletion_requests')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return res.status(409).json({ error: 'You already have a pending deletion request.' });
    }

    const { error } = await supabase
      .from('account_deletion_requests')
      .insert({ user_id: req.user.id, reason: reason?.trim() || null });

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('Deletion request error:', err);
    res.status(500).json({ error: 'Failed to submit deletion request.' });
  }
});

// DELETE /api/auth/deletion-request — cancel the user's own pending request
router.delete('/deletion-request', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('account_deletion_requests')
      .delete()
      .eq('user_id', req.user.id)
      .eq('status', 'pending');

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel deletion request error:', err);
    res.status(500).json({ error: 'Failed to cancel deletion request.' });
  }
});

// GET /api/auth/deletion-request — check current user's pending request
router.get('/deletion-request', verifyToken, async (req, res) => {
  try {
    const { data } = await supabase
      .from('account_deletion_requests')
      .select('id, status, created_at')
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .maybeSingle();

    res.json({ request: data || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check deletion request.' });
  }
});

module.exports = router;
