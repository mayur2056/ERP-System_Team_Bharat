require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security ──────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);

// Auth rate limit (stricter)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, message: 'Too many login attempts' } });
app.use('/api/auth/login', authLimiter);

// ── Serve frontend static files ───────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/users',          require('./routes/users'));
app.use('/api/branches',       require('./routes/branches'));
app.use('/api/products',       require('./routes/products'));
app.use('/api/inventory',      require('./routes/inventory'));
app.use('/api/customers',      require('./routes/customers'));
app.use('/api/vendors',        require('./routes/vendors'));
app.use('/api/orders',         require('./routes/orders'));
app.use('/api/transfers',      require('./routes/transfers'));
app.use('/api/dispatches',     require('./routes/dispatches'));
app.use('/api/invoices',       require('./routes/invoices'));
app.use('/api/purchase-bills', require('./routes/purchaseBills'));
app.use('/api/payments',       require('./routes/payments'));
app.use('/api/expenses',       require('./routes/expenses'));
app.use('/api/ledger',         require('./routes/ledger'));
app.use('/api/notifications',  require('./routes/notifications'));
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/reports',        require('./routes/reports'));

// ── Health check ──────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Shivam ERP API is running', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Centralized error handler ─────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║  🚀 Shivam ERP API Server                   ║
  ║  📡 Port: ${PORT}                              ║
  ║  🌐 URL:  http://localhost:${PORT}              ║
  ║  📂 API:  http://localhost:${PORT}/api/health    ║
  ╚══════════════════════════════════════════════╝
  `);
});

module.exports = app;
