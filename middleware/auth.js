import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

/**
 * WebSocket authentication middleware for Socket.io
 * Validates JWT tokens from client connections
 */
export const socketAuthMiddleware = (socket, next) => {
  try {
    // Extract token from handshake auth or query parameters
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    console.log("Socket auth: Token received:", !!token);
    console.log(
      "Socket auth: Token preview:",
      token ? `${token.substring(0, 30)}...` : "null"
    );
    console.log("Socket auth: JWT_SECRET set:", !!JWT_SECRET);

    if (!token) {
      const error = new Error("Authentication token required");
      error.data = { type: "AUTH_ERROR", message: "No token provided" };
      return next(error);
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace("Bearer ", "");
    console.log(
      "Socket auth: Clean token preview:",
      `${cleanToken.substring(0, 30)}...`
    );

    // Verify JWT token
    const decoded = jwt.verify(cleanToken, JWT_SECRET);
    console.log("Socket auth: Token decoded successfully:", {
      userId: decoded.userId,
      email: decoded.email,
    });

    // Attach user info to socket for use in handlers
    socket.userId = decoded.userId;
    socket.userEmail = decoded.email;
    socket.user = decoded;

    console.log(
      `Socket authenticated for user: ${decoded.email} (ID: ${decoded.userId})`
    );
    next();
  } catch (error) {
    console.error("Socket authentication failed:", error.message);

    let authError;
    if (error.name === "JsonWebTokenError") {
      authError = new Error("Invalid authentication token");
      authError.data = { type: "AUTH_ERROR", message: "Invalid token" };
    } else if (error.name === "TokenExpiredError") {
      authError = new Error("Authentication token expired");
      authError.data = { type: "AUTH_ERROR", message: "Token expired" };
    } else {
      authError = new Error("Authentication failed");
      authError.data = { type: "AUTH_ERROR", message: "Authentication failed" };
    }

    next(authError);
  }
};

/**
 * Middleware to extract and validate JWT from HTTP requests
 * Can be used for Express routes if needed
 */
export const httpAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication token required",
        type: "AUTH_ERROR",
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.user = decoded;

    next();
  } catch (error) {
    console.error("HTTP authentication failed:", error.message);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid authentication token",
        type: "AUTH_ERROR",
      });
    } else if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Authentication token expired",
        type: "AUTH_ERROR",
      });
    }

    return res.status(401).json({
      error: "Authentication failed",
      type: "AUTH_ERROR",
    });
  }
};

/**
 * Utility function to generate JWT tokens
 * Used by authentication endpoints
 */
export const generateToken = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    // Add other user fields as needed
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "24h",
    issuer: "ai-tutor-app",
  });
};

/**
 * Utility function to verify JWT tokens
 * Can be used standalone for token validation
 */
export const verifyToken = (token) => {
  try {
    const cleanToken = token.replace("Bearer ", "");
    return jwt.verify(cleanToken, JWT_SECRET);
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

const authMiddleware = {
  socketAuthMiddleware,
  httpAuthMiddleware,
  generateToken,
  verifyToken,
};

export default authMiddleware;
