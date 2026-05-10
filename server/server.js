require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const cookieParser = require('cookie-parser');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const slowDown     = require('express-slow-down');
const hpp          = require('hpp');
const path         = require('path');

const authRoutes     = require('./routes/auth.routes');
const documentRoutes = require('./routes/documents.routes');
const interviewRoutes = require('./routes/interview.routes');
const adminRoutes    = require('./routes/admin.routes');
const paymentRoutes  = require('./routes/payment.routes');
const supportRoutes  = require('./routes/support.routes');
const emailRoutes    = require('./routes/email.routes');
const jdRoutes       = require('./routes/jd.routes');
const invitesRoutes  = require('./routes/invites.routes');
const { ipGuard }    = require('./middleware/ipGuard.middleware');

const app    = express();
const isProd = process.env.NODE_ENV === 'production';

// Must be first — trust Render's load balancer so req.ip reflects real client IP
app.set('trust proxy', 1);

// IP auto-blocking (tracks 4xx error bursts per IP)
app.use(ipGuard);

// Global rate limiter: 200 req / IP / 15 min
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  skip: (req) => req.ip === '127.0.0.1',
}));

// Progressive slow-down after 50 req / IP / 15 min
app.use(slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: (used) => (used - 50) * 100,
  maxDelayMs: 5000,
}));

// HTTP Parameter Pollution prevention
app.use(hpp());

// Compression + security headers
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "https://challenges.cloudflare.com"],
      frameSrc:    ["https://challenges.cloudflare.com"],
      imgSrc:      ["'self'", "data:"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      connectSrc:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for Turnstile iframe
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard:     { action: 'deny' },
  noSniff:        true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cors({
  origin: isProd ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
// Explicit body size limits to prevent payload flooding
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));
app.use(cookieParser());

// API Routes
app.use('/api/auth',      authRoutes);
app.use('/api/invites',   invitesRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/payment',   paymentRoutes);
app.use('/api/support',   supportRoutes);
app.use('/api/email',     emailRoutes);
app.use('/api/jd',        jdRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React build in production; 404 handler in development
if (isProd) {
  const clientDist = path.join(__dirname, '../client/dist');
  const indexHtml  = path.join(clientDist, 'index.html'); // cached — not recomputed per request
  app.use(express.static(clientDist, {
    maxAge: '1y',        // immutable hashed assets (JS/CSS chunks)
    etag: true,
  }));
  app.get('*', (req, res) => res.sendFile(indexHtml));
} else {
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`InterviewIQ server running on port ${PORT} [${isProd ? 'production' : 'development'}]`);
});
server.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
