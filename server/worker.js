/**
 * Cloudflare Workers entry point — InterviewIQ API
 *
 * Migration status: SCAFFOLDING ONLY
 * The backend currently runs on Render (Express). This file is the
 * target entry point for the eventual full CF Workers migration.
 *
 * Migration blockers (packages that must be replaced before routes
 * can move here):
 *   - express         → Hono (already imported below)
 *   - nodemailer      → Resend API or Cloudflare Email Workers
 *   - multer          → native FormData / multipart parsing
 *   - pdf-parse       → pdf.js-extract or Cloudflare-compatible parser
 *   - mammoth         → alternative or omit in edge runtime
 *   - compression     → remove (CF handles Brotli/gzip natively)
 *   - express-rate-limit / express-slow-down → Hono rate-limiter or CF Rules
 *   - hpp             → remove (handled by Hono's query parsing)
 *
 * Safe to use in Workers (no changes needed):
 *   - @supabase/supabase-js  (fetch-based)
 *   - @anthropic-ai/sdk      (fetch-based)
 *   - bcryptjs               (pure JS)
 *   - jsonwebtoken           (pure JS)
 *   - hono                   (this file)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: (origin, c) => {
    // In production, restrict to the CF Pages domain
    const allowed = c.env.CLIENT_URL || '*';
    return allowed;
  },
  credentials: true,
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', runtime: 'cloudflare-worker', timestamp: new Date().toISOString() });
});

// ─── Placeholder: all other routes ───────────────────────────────────────────
// Each Express route in server/routes/ must be ported to Hono before
// removing the Render deployment. Routes to migrate (in order of
// complexity — easiest first):
//   /api/auth       → auth.routes.js  (no file I/O, bcrypt + jwt)
//   /api/invites    → invites.routes.js (Supabase only)
//   /api/jd         → jd.routes.js
//   /api/payment    → payment.routes.js
//   /api/support    → support.routes.js (needs email replacement)
//   /api/admin      → admin.routes.js
//   /api/interview  → interview.routes.js (Anthropic SDK)
//   /api/email      → email.routes.js
//   /api/documents  → documents.routes.js (needs multer + pdf-parse replacement)
app.all('/api/*', (c) => {
  return c.json({
    error: 'This route has not been migrated to Cloudflare Workers yet.',
    hint:  'The backend is still running on Render. Set VITE_API_BASE_URL to the Render URL.',
  }, 501);
});

export default app;
