const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { sendSupportEmail } = require('../services/email.service');

const router = express.Router();
router.use(verifyToken);

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
router.post('/contact', async (req, res) => {
  try {
    const { subject, message } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'Subject and message are required.' });
    }
    if (message.trim().length < 20) {
      return res.status(400).json({ error: 'Message is too short. Please describe your issue.' });
    }
    if (isRateLimited(req.user.id)) {
      return res.status(429).json({ error: 'Too many requests. Please wait before sending another message.' });
    }

    const sent = await sendSupportEmail({
      fromName:   req.user.name,
      fromEmail:  req.user.email,
      fromTier:   req.user.subscription_tier || 'free',
      fromUserId: req.user.id,
      subject:    subject.trim(),
      message:    message.trim(),
    });

    if (!sent) {
      console.warn('[Support ticket - email not configured]', { from: req.user.email, subject });
      return res.status(503).json({ error: 'Support email is not configured. Please try again later.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Support email error:', err);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;
