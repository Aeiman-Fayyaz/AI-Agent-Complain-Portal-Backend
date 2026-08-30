require('dotenv').config();

const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const messageRoutes = require('./routes/messageRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

// -----------------------------
// Database
// -----------------------------
connectDB();

// -----------------------------
// Middleware
// -----------------------------
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// -----------------------------
// Request Logger
// -----------------------------
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
  next();
});

// -----------------------------
// Routes
// -----------------------------
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/tickets/:id/messages', messageRoutes);
app.use('/api/dashboard', dashboardRoutes);

// -----------------------------
// Health Check
// -----------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    system: 'AI-Powered Customer Support Ticketing API',
    timestamp: new Date().toISOString()
  });
});

// -----------------------------
// Root
// -----------------------------
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Support Ticket Backend API is running'
  });
});

// -----------------------------
// 404
// -----------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found - ${req.originalUrl}`
  });
});

// -----------------------------
// Error Handler
// -----------------------------
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// IMPORTANT:
// Do NOT call app.listen() on Vercel.

<<<<<<< HEAD
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Support Ticket Backend Server running on port ${PORT}`);
    console.log(`📡 Socket.IO Real-time Engine initialized`);
    console.log(`=======================================================`);
  });
}

=======
>>>>>>> 394841def2ba33be6bbf0aa93450eb004340e89d
module.exports = app;
