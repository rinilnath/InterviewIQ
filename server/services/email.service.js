const nodemailer = require('nodemailer');

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const appUrl = () => process.env.APP_URL || 'https://your-app.onrender.com';

// ─── Shared HTML shell ────────────────────────────────────────────────────────

function emailShell({ preheader = '', body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>InterviewIQ</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

      <!-- Logo bar -->
      <tr><td style="padding-bottom:24px;text-align:center">
        <span style="font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.5px">InterviewIQ</span>
      </td></tr>

      <!-- Card -->
      <tr><td style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        ${body}
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 0;text-align:center">
        <p style="margin:0;font-size:12px;color:#a1a1aa">
          This email was sent by InterviewIQ. If you didn't expect it, you can ignore it safely.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Welcome email ────────────────────────────────────────────────────────────

async function sendWelcomeEmail({ name, email, password }) {
  const transport = createTransport();
  const to = process.env.SUPPORT_EMAIL; // admin's own email for logging; actual recipient is the new user
  if (!transport) {
    console.warn('[Email] SMTP not configured — welcome email not sent to', email);
    return;
  }

  const loginUrl = `${appUrl()}/login`;

  const html = emailShell({
    preheader: `You've been granted access to InterviewIQ, ${name}.`,
    body: `
      <!-- Dark header -->
      <div style="background:#18181b;padding:32px 32px 28px">
        <p style="margin:0 0 6px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px">Welcome to InterviewIQ</p>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;line-height:1.3">
          Hi ${name}, your account<br>is ready.
        </h1>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px">
        <p style="margin:0 0 20px;font-size:14px;color:#52525b;line-height:1.6">
          An admin has created an InterviewIQ account for you.
          Use the credentials below to log in and start generating interview kits.
        </p>

        <!-- Credentials card -->
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f4f4f5;border-radius:10px;overflow:hidden;margin-bottom:24px">
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid #e4e4e7">
              <p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.8px">Email</p>
              <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#18181b;font-family:monospace">${email}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px">
              <p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.8px">Temporary password</p>
              <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#18181b;font-family:monospace">${password}</p>
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:24px">
          <a href="${loginUrl}"
             style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;
                    font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;
                    letter-spacing:.2px">
            Log in to InterviewIQ →
          </a>
        </div>

        <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;line-height:1.6">
          For security, please change your password after your first login.<br>
          <a href="${loginUrl}" style="color:#71717a">${loginUrl}</a>
        </p>
      </div>
    `,
  });

  await transport.sendMail({
    from:    `"InterviewIQ" <${process.env.SMTP_USER}>`,
    to:      email,
    subject: 'You've been granted access to InterviewIQ',
    text: [
      `Hi ${name},`,
      '',
      `An admin has created an InterviewIQ account for you.`,
      '',
      `Email:               ${email}`,
      `Temporary password:  ${password}`,
      '',
      `Log in at: ${loginUrl}`,
      '',
      'Please change your password after your first login.',
    ].join('\n'),
    html,
  });
}

// ─── Support ticket email ─────────────────────────────────────────────────────

async function sendSupportEmail({ fromName, fromEmail, fromTier, fromUserId, subject, message }) {
  const transport = createTransport();
  const supportEmail = process.env.SUPPORT_EMAIL;
  if (!transport || !supportEmail) return false;

  const html = emailShell({
    preheader: `Support request: ${subject}`,
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
          <tr><td style="color:#71717a;padding:4px 0">User ID</td><td style="color:#18181b;font-family:monospace;font-size:11px">${fromUserId}</td></tr>
        </table>
        <div style="background:#f4f4f5;border-radius:8px;padding:16px;font-size:14px;color:#18181b;white-space:pre-wrap;line-height:1.6">${message}</div>
        <p style="margin-top:16px;font-size:12px;color:#a1a1aa">Reply directly to this email to respond to ${fromName}.</p>
      </div>
    `,
  });

  await transport.sendMail({
    from:    `"InterviewIQ" <${process.env.SMTP_USER}>`,
    to:      supportEmail,
    replyTo: `"${fromName}" <${fromEmail}>`,
    subject: `[InterviewIQ Support] ${subject}`,
    text:    `From: ${fromName} <${fromEmail}>\nPlan: ${fromTier}\n\n${message}`,
    html,
  });

  return true;
}

module.exports = { sendWelcomeEmail, sendSupportEmail };
