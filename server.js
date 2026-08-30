require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const socketHandler = require("./sockets/socketHandler");

const authRoutes = require("./routes/authRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const messageRoutes = require("./routes/messageRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();

// =====================================================
// Configuration
// =====================================================

const PORT = process.env.PORT || 5500;

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// =====================================================
// HTTP Server
// =====================================================

const server = http.createServer(app);

// =====================================================
// Socket.IO
// =====================================================

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  },
});

app.set("io", io);

// Initialize socket handlers
socketHandler(io);

// =====================================================
// Database
// =====================================================

connectDB();

// =====================================================
// Middleware
// =====================================================

app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// =====================================================
// Request Logger
// =====================================================

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
  next();
});

// =====================================================
// Routes
// =====================================================

app.use("/api/auth", authRoutes);

app.use("/api/tickets", ticketRoutes);

app.use("/api/tickets/:id/messages", messageRoutes);

app.use("/api/dashboard", dashboardRoutes);

// =====================================================
// Health Check
// =====================================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    system: "AI-Powered Customer Support Ticketing API",
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// Root Route
// =====================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Support Ticket Backend API is running",
  });
});

// =====================================================
// 404 Handler
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found - ${req.originalUrl}`,
  });
});

// =====================================================
// Global Error Handler
// =====================================================

app.use((err, req, res, next) => {
  console.error("[Unhandled Server Error]", err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// =====================================================
// Local Server
// =====================================================

if (require.main === module) {
  server.listen(PORT, () => {
    console.log("=======================================================");
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
    console.log("📡 Socket.IO initialized");
    console.log("=======================================================");
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${PORT} is already in use. Stop the existing process or use another PORT.`
      );
      process.exit(1);
    }

    console.error("❌ Server Error:", error);
    process.exit(1);
  });
}

// =====================================================
// Export
// =====================================================

module.exports = app;