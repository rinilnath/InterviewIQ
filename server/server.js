require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const documentRoutes = require('./routes/documents.routes');
const interviewRoutes = require('./routes/interview.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentRoutes = require('./routes/payment.routes');
const supportRoutes = require('./routes/support.routes');
const emailRoutes   = require('./routes/email.routes');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Trust the first proxy hop (required on Render/Heroku/etc for rate-limiting and IP detection)
if (isProd) app.set('trust proxy', 1);

// Compression + security middleware
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false, // handled by frontend
}));
app.use(cors({
  origin: isProd ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/email',  emailRoutes);

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
