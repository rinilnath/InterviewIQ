const express = require('express');
const nodemailer = require('nodemailer');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(verifyToken);

// Simple in-memory rate limit: 3 tickets per user per hour
const recentSubmissions = new Map();
function isRateLimited(userId) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const hits = (recentSubmissions.get(userId) || []).filter((t) => now - t < windowMs);
  if (hits.length >= 3) return true;
  recentSubmissions.set(userId, [...hits, now]);
  return false;
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
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

    const transport = createTransport();
    const supportEmail = process.env.SUPPORT_EMAIL;

    if (!transport || !supportEmail) {
      // Log it server-side even if email isn't configured
      console.warn('[Support ticket]', {
        from: req.user.email,
        name: req.user.name,
        subject,
        message,
      });
      return res.status(503).json({ error: 'Support email is not configured. Please try again later.' });
    }

    await transport.sendMail({
      from:     `"InterviewIQ" <${process.env.SMTP_USER}>`,
      to:       supportEmail,
      replyTo:  `"${req.user.name}" <${req.user.email}>`,
      subject:  `[InterviewIQ Support] ${subject.trim()}`,
      text: [
        `From:    ${req.user.name} <${req.user.email}>`,
        `Plan:    ${req.user.subscription_tier || 'free'}`,
        `User ID: ${req.user.id}`,
        '',
        '─────────────────────────────',
        message.trim(),
        '─────────────────────────────',
        '',
        'Reply directly to this email to respond to the user.',
      ].join('\n'),
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:auto">
          <div style="background:#18181b;padding:20px 24px;border-radius:12px 12px 0 0">
            <p style="color:#a1a1aa;font-size:11px;letter-spacing:1px;margin:0 0 4px;text-transform:uppercase">InterviewIQ · Support Request</p>
            <h2 style="color:#fff;margin:0;font-size:18px">${subject.trim()}</h2>
          </div>
          <div style="border:1px solid #e4e4e7;border-top:0;padding:20px 24px;border-radius:0 0 12px 12px">
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
              <tr><td style="color:#71717a;padding:4px 0;width:72px">From</td><td style="color:#09090b;font-weight:500">${req.user.name}</td></tr>
              <tr><td style="color:#71717a;padding:4px 0">Email</td><td style="color:#09090b">${req.user.email}</td></tr>
              <tr><td style="color:#71717a;padding:4px 0">Plan</td><td style="color:#09090b;text-transform:capitalize">${req.user.subscription_tier || 'free'}</td></tr>
            </table>
            <div style="background:#f4f4f5;border-radius:8px;padding:16px;font-size:14px;color:#18181b;white-space:pre-wrap;line-height:1.6">${message.trim()}</div>
            <p style="margin-top:16px;font-size:12px;color:#a1a1aa">Reply directly to this email — it goes straight to ${req.user.name}.</p>
          </div>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Support email error:', err);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;
