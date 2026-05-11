const supabase = require('./supabase.service');

const RESEND_API = 'https://api.resend.com/emails';
const FROM       = 'InterviewIQ <onboarding@resend.dev>';

const appUrl = () => (process.env.APP_URL || 'https://interviewiq-n403.onrender.com').replace(/\/$/, '');

// ─── Logging helpers ──────────────────────────────────────────────────────────

async function logEmail({ emailType, recipientEmail, recipientName, subject, userId }) {
  const { data, error } = await supabase
    .from('email_logs')
    .insert({ email_type: emailType, recipient_email: recipientEmail, recipient_name: recipientName, subject, user_id: userId || null, status: 'sent' })
    .select('id')
    .single();
  if (error) console.error('[Email] Failed to write log entry:', error.message);
  return data?.id || null;
}

async function markLogFailed(logId, errorMessage) {
  if (!logId) return;
  await supabase
    .from('email_logs')
    .update({ status: 'failed', error: errorMessage })
    .eq('id', logId);
}

// ─── Resend send helper ───────────────────────────────────────────────────────

async function sendViaResend({ to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const body = { from: FROM, to: [to], subject, html, text };
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch(RESEND_API, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }
}

// ─── HTML shell ───────────────────────────────────────────────────────────────

function emailShell({ preheader = '', body, trackingId }) {
  const pixel = trackingId
    ? `<img src="${appUrl()}/api/email/track/${trackingId}" width="1" height="1" alt="" style="display:none;width:1px;height:1px" />`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td style="padding-bottom:24px;text-align:center">
        <span style="font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.5px">InterviewIQ</span>
      </td></tr>
      <tr><td style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        ${body}
      </td></tr>
      <tr><td style="padding:24px 0;text-align:center">
        <p style="margin:0;font-size:12px;color:#a1a1aa">This email was sent by InterviewIQ. If you didn't expect it, you can ignore it.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
${pixel}
</body></html>`;
}

// ─── Welcome email ────────────────────────────────────────────────────────────

async function sendWelcomeEmail({ name, email, password, userId }) {
  const subject = "You've been granted access to InterviewIQ";
  const logId   = await logEmail({ emailType: 'welcome', recipientEmail: email, recipientName: name, subject, userId });
  const loginUrl = `${appUrl()}/login`;

  const html = emailShell({
    preheader: `You've been granted access to InterviewIQ, ${name}.`,
    trackingId: logId,
    body: `
      <div style="background:#18181b;padding:32px 32px 28px">
        <p style="margin:0 0 6px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px">Welcome to InterviewIQ</p>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;line-height:1.3">Hi ${name}, your account<br>is ready.</h1>
      </div>
      <div style="padding:28px 32px">
        <p style="margin:0 0 20px;font-size:14px;color:#52525b;line-height:1.6">
          An admin has created an InterviewIQ account for you. Use the credentials below to log in.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:10px;overflow:hidden;margin-bottom:24px">
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e4e4e7">
            <p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.8px">Email</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#18181b;font-family:monospace">${email}</p>
          </td></tr>
          <tr><td style="padding:14px 18px">
            <p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.8px">Temporary password</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#18181b;font-family:monospace">${password}</p>
          </td></tr>
        </table>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${loginUrl}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px">
            Log in to InterviewIQ →
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;line-height:1.6">
          Please change your password after your first login.<br>
          <a href="${loginUrl}" style="color:#71717a">${loginUrl}</a>
        </p>
      </div>`,
  });

  try {
    await sendViaResend({
      to:      email,
      subject,
      html,
      text: `Hi ${name},\n\nYour InterviewIQ account is ready.\n\nEmail: ${email}\nTemporary password: ${password}\n\nLog in at: ${loginUrl}\n\nPlease change your password after your first login.`,
    });
    console.info('[Email] Welcome email sent to', email);
  } catch (err) {
    console.error('[Email] Welcome email failed for', email, ':', err.message);
    await markLogFailed(logId, err.message);
  }
}

// ─── Support ticket email ─────────────────────────────────────────────────────

async function sendSupportEmail({ fromName, fromEmail, fromTier, fromUserId, subject, message }) {
  const supportEmail = process.env.SUPPORT_EMAIL;
  const logId        = await logEmail({ emailType: 'support', recipientEmail: supportEmail || 'unconfigured', recipientName: 'Admin', subject, userId: fromUserId });

  if (!supportEmail) {
    const msg = 'SUPPORT_EMAIL not set';
    console.warn('[Email] Support ticket not delivered —', msg, '| From:', fromEmail, '| Subject:', subject);
    await markLogFailed(logId, msg);
    return false;
  }

  const html = emailShell({
    preheader: `Support request from ${fromName}: ${subject}`,
    trackingId: logId,
    body: `
      <div style="background:#18181b;padding:28px 32px">
        <p style="margin:0 0 4px;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:1px">Support Request</p>
        <h1 style="margin:0;font-size:18px;font-weight:700;color:#fff">${subject}</h1>
      </div>
      <div style="padding:24px 32px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
          <tr><td style="color:#71717a;padding:4px 0;width:80px">From</td><td style="color:#18181b;font-weight:500">${fromName}</td></tr>
          <tr><td style="color:#71717a;padding:4px 0">Email</td><td style="color:#18181b">${fromEmail}</td></tr>
          <tr><td style="color:#71717a;padding:4px 0">Plan</td><td style="color:#18181b;text-transform:capitalize">${fromTier}</td></tr>
        </table>
        <div style="background:#f4f4f5;border-radius:8px;padding:16px;font-size:14px;color:#18181b;white-space:pre-wrap;line-height:1.6">${message}</div>
        <p style="margin-top:16px;font-size:12px;color:#a1a1aa">Reply to this email to respond directly to ${fromName}.</p>
      </div>`,
  });

  try {
    await sendViaResend({
      to:      supportEmail,
      subject: `[InterviewIQ Support] ${subject}`,
      html,
      text:    `From: ${fromName} <${fromEmail}>\nPlan: ${fromTier}\n\n${message}`,
      replyTo: `${fromName} <${fromEmail}>`,
    });
    console.info('[Email] Support ticket sent from', fromEmail);
    return true;
  } catch (err) {
    console.error('[Email] Support ticket failed:', err.message);
    await markLogFailed(logId, err.message);
    return false;
  }
}

// ─── Invite email ─────────────────────────────────────────────────────────────

async function sendInviteEmail({ toEmail, toName, fromName, token }) {
  const subject      = "You've been invited to InterviewIQ";
  const logId        = await logEmail({ emailType: 'invite', recipientEmail: toEmail, recipientName: toName || toEmail, subject });
  const registerUrl  = `${appUrl()}/register?token=${token}`;

  const html = emailShell({
    preheader: `${fromName} has invited you to join InterviewIQ.`,
    trackingId: logId,
    body: `
      <div style="background:#18181b;padding:32px 32px 28px">
        <p style="margin:0 0 6px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px">You're invited</p>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;line-height:1.3">Hi ${toName || 'there'},<br>you've been invited!</h1>
      </div>
      <div style="padding:28px 32px">
        <p style="margin:0 0 20px;font-size:14px;color:#52525b;line-height:1.6">
          <strong>${fromName}</strong> has invited you to join InterviewIQ — your team's AI-powered interview management platform.
        </p>
        <p style="margin:0 0 20px;font-size:13px;color:#71717a">
          Click the button below to set up your account. This link expires in <strong>48 hours</strong>.
        </p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${registerUrl}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px">
            Accept Invitation →
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;line-height:1.6">
          If you weren't expecting this invitation, you can safely ignore this email.<br>
          — The InterviewIQ Team
        </p>
      </div>`,
  });

  try {
    await sendViaResend({
      to:      toEmail,
      subject,
      html,
      text: `Hi ${toName || 'there'},\n\n${fromName} has invited you to join InterviewIQ.\n\nClick the link below to set up your account (expires in 48 hours):\n${registerUrl}\n\nIf you weren't expecting this, ignore this email.\n\n— The InterviewIQ Team`,
    });
    console.info('[Email] Invite email sent to', toEmail);
  } catch (err) {
    console.error('[Email] Invite email failed for', toEmail, ':', err.message);
    await markLogFailed(logId, err.message);
  }
}

module.exports = { sendWelcomeEmail, sendSupportEmail, sendInviteEmail };
