import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import dotenv from "dotenv";
import authPkg from "./middleware/auth.js";
const { socketAuthMiddleware, httpAuthMiddleware, generateToken } = authPkg;
import chatPkg from "./routes/chat.js";
const { setupChatHandlers } = chatPkg;

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});
const port = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: [process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"],
    credentials: true,
  })
);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error("Error acquiring client", err.stack);
  } else {
    console.log("Database connected successfully");
    release();
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "AI Tutor Backend Server with Socket.io",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await pool.query(
      "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name",
      [email, hashedPassword, name || null]
    );

    const user = newUser.rows[0];
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Socket.io connection handling with authentication
io.use(socketAuthMiddleware);

// Set up organized chat handlers
setupChatHandlers(io, pool);

server.listen(port, () => {
  console.log(`🚀 AI Tutor Server running on port ${port}`);
  console.log(`📡 Socket.io ready for connections`);
  console.log(
    `🗄️  Database: ${process.env.DATABASE_URL ? "Connected" : "Not configured"}`
  );
});
