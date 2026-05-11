/**
 * Cloudflare Workers entry point — InterviewIQ API
 * All routes fully migrated from Express to Hono.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import authRoutes     from './hono/route-auth.js';
import invitesRoutes  from './hono/route-invites.js';
import jdRoutes       from './hono/route-jd.js';
import paymentRoutes  from './hono/route-payment.js';
import supportRoutes  from './hono/route-support.js';
import adminRoutes    from './hono/route-admin.js';
import interviewRoutes, { recoverStuckGenerations } from './hono/route-interview.js';
import emailRoutes    from './hono/route-email.js';
import documentRoutes from './hono/route-documents.js';

const app = new Hono();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: (origin, c) => c.env.CLIENT_URL || '*',
  credentials: true,
}));

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', runtime: 'cloudflare-worker', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.route('/api/auth',      authRoutes);
app.route('/api/invites',   invitesRoutes);
app.route('/api/jd',        jdRoutes);
app.route('/api/payment',   paymentRoutes);
app.route('/api/support',   supportRoutes);
app.route('/api/admin',     adminRoutes);
app.route('/api/interview', interviewRoutes);
app.route('/api/email',     emailRoutes);
app.route('/api/documents', documentRoutes);

// ─── Startup recovery ─────────────────────────────────────────────────────────
// Runs once when the worker isolate is first initialized.
// Marks any kits that were in 'generating' state (from a crashed previous run) as failed.
// Note: CF Cron Triggers should be used for periodic watchdog — add to wrangler.toml.
let recoveryRun = false;

export default {
  async fetch(request, env, ctx) {
    if (!recoveryRun) {
      recoveryRun = true;
      ctx.waitUntil(
        recoverStuckGenerations(env).catch((err) =>
          console.error('[startup] Recovery error:', err.message)
        )
      );
    }
    return app.fetch(request, env, ctx);
  },
};
