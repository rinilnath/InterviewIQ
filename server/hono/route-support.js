import { Hono } from 'hono';
import { sendSupportEmail } from './email.js';
import { verifyToken } from './auth-middleware.js';

const app = new Hono();
app.use('*', verifyToken);

// Simple in-memory rate limit: 3 tickets per user per hour
const recentSubmissions = new Map();
function isRateLimited(userId) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const hits = (recentSubmissions.get(userId) || []).filter((t) => now - t < windowMs);
  if (hits.length >= 3) return true;
  recentSubmissions.set(userId, [...hits, now]);
  return false;
}

// POST /api/support/contact
app.post('/contact', async (c) => {
  try {
    const { subject, message } = await c.req.json();
    const user = c.get('user');

    if (!subject?.trim() || !message?.trim()) {
      return c.json({ error: 'Subject and message are required.' }, 400);
    }
    if (message.trim().length < 20) {
      return c.json({ error: 'Message is too short. Please describe your issue.' }, 400);
    }
    if (isRateLimited(user.id)) {
      return c.json({ error: 'Too many requests. Please wait before sending another message.' }, 429);
    }

    const sent = await sendSupportEmail(c.env, {
      fromName: user.name,
      fromEmail: user.email,
      fromTier: user.subscription_tier || 'free',
      fromUserId: user.id,
      subject: subject.trim(),
      message: message.trim(),
    });

    if (!sent) {
      console.warn('[Support ticket - email not configured]', { from: user.email, subject });
      return c.json({ error: 'Support email is not configured. Please try again later.' }, 503);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error('Support email error:', err);
    return c.json({ error: 'Failed to send message. Please try again.' }, 500);
  }
});

export default app;
