import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// System prompt for AI tutor
const systemPrompt = `You are an AI tutor helping a student achieve their learning goals. Your role:
- Provide encouraging, supportive guidance
- Ask clarifying questions to understand their needs
- Offer specific, actionable advice
- Break down complex concepts into manageable steps
- Celebrate progress and help overcome obstacles
- Keep responses conversational and engaging

Guidelines:
- Be encouraging but realistic
- Provide specific examples when helpful
- Ask follow-up questions to gauge understanding
- Suggest practical exercises or next steps
- Keep responses focused and concise (2-3 paragraphs max)`;

/**
 * Set up real-time chat handlers for Socket.io
 * @param {Object} io - Socket.io server instance
 * @param {Object} pool - Database connection pool
 */
export const setupChatHandlers = (io, pool) => {
  io.on("connection", (socket) => {
    console.log(`User ${socket.userEmail} connected to chat`);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Handle chat messages
    socket.on("chat_message", async (data) => {
      try {
        const { message, goalId } = data;

        if (!message || message.trim() === "") {
          socket.emit("error", { message: "Message cannot be empty" });
          return;
        }

        // Save user message to database
        const chatMessage = await pool.query(
          `INSERT INTO chat_messages (user_id, goal_id, message, sender, timestamp) 
           VALUES ($1, $2, $3, $4, NOW()) 
           RETURNING *`,
          [socket.userId, goalId || null, message, "user"]
        );

        // Emit user message back to confirm receipt
        socket.emit("chat_message", {
          id: chatMessage.rows[0].id,
          message: message,
          sender: "user",
          timestamp: chatMessage.rows[0].timestamp,
        });

        // Generate AI response after a brief delay
        setTimeout(async () => {
          await generateAIResponse(socket, pool, message, goalId);
        }, 1000);

      } catch (error) {
        console.error("Chat message error:", error);
        socket.emit("error", { message: "Failed to process message" });
      }
    });

    // Handle typing indicators
    socket.on("typing", (data) => {
      socket.to(`user_${socket.userId}`).emit("user_typing", {
        userId: socket.userId,
        isTyping: data.isTyping,
      });
    });

    // Handle chat history requests
    socket.on("get_chat_history", async (data) => {
      try {
        const { goalId, limit = 50, offset = 0 } = data;
        
        let query = `
          SELECT id, message, sender, timestamp, goal_id 
          FROM chat_messages 
          WHERE user_id = $1
        `;
        let params = [socket.userId];

        if (goalId) {
          query += ` AND goal_id = $2`;
          params.push(goalId);
        }

        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        
        socket.emit("chat_history", {
          messages: result.rows.reverse(), // Reverse to show oldest first
          hasMore: result.rows.length === limit
        });

      } catch (error) {
        console.error("Chat history error:", error);
        socket.emit("error", { message: "Failed to load chat history" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`User ${socket.userEmail} disconnected from chat`);
    });
  });
};

/**
 * Generate AI response using Gemini API with streaming
 * @param {Object} socket - Socket.io socket instance
 * @param {Object} pool - Database connection pool
 * @param {string} userMessage - User's message
 * @param {number|null} goalId - Associated goal ID
 */
async function generateAIResponse(socket, pool, userMessage, goalId) {
  try {
    // Get recent chat history for context
    const chatHistory = await pool.query(
      `SELECT message, sender FROM chat_messages 
       WHERE user_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 10`,
      [socket.userId]
    );

    const recentMessages = chatHistory.rows.map((row) => ({
      role: row.sender === "user" ? "user" : "assistant",
      content: row.message,
    }));

    // Get comprehensive user learning context
    let personalizedContext = "";
    
    if (goalId) {
      // Get specific goal details with milestones
      const goalResult = await pool.query(
        `SELECT g.title, g.description, g.status, g.difficulty_level, g.estimated_duration_weeks,
                array_agg(
                  json_build_object(
                    'title', m.title,
                    'completed', m.completed,
                    'due_date', m.due_date,
                    'milestone_order', m.milestone_order
                  ) ORDER BY m.milestone_order
                ) as milestones
         FROM goals g
         LEFT JOIN milestones m ON g.id = m.goal_id
         WHERE g.id = $1 AND g.user_id = $2
         GROUP BY g.id`,
        [goalId, socket.userId]
      );
      
      if (goalResult.rows.length > 0) {
        const goal = goalResult.rows[0];
        const completedMilestones = goal.milestones.filter(m => m && m.completed).length;
        const totalMilestones = goal.milestones.filter(m => m).length;
        const nextMilestone = goal.milestones.find(m => m && !m.completed);
        
        personalizedContext = `\n\nCurrent Learning Context:
- Goal: ${goal.title} (${goal.difficulty_level} level)
- Description: ${goal.description}
- Status: ${goal.status}
- Progress: ${completedMilestones}/${totalMilestones} milestones completed
- Estimated Duration: ${goal.estimated_duration_weeks} weeks`;

        if (nextMilestone) {
          personalizedContext += `
- Next Milestone: ${nextMilestone.title}`;
          if (nextMilestone.due_date) {
            personalizedContext += ` (Due: ${new Date(nextMilestone.due_date).toLocaleDateString()})`;
          }
        }
      }
    } else {
      // Get user's overall learning profile for general chat
      const userStatsResult = await pool.query(
        `SELECT 
          COUNT(DISTINCT g.id) as total_goals,
          COUNT(DISTINCT CASE WHEN g.status = 'active' THEN g.id END) as active_goals,
          COUNT(DISTINCT CASE WHEN g.status = 'completed' THEN g.id END) as completed_goals,
          COUNT(DISTINCT m.id) as total_milestones,
          COUNT(DISTINCT CASE WHEN m.completed = true THEN m.id END) as completed_milestones,
          COUNT(DISTINCT cm.id) as total_chat_messages
         FROM goals g
         LEFT JOIN milestones m ON g.id = m.goal_id
         LEFT JOIN chat_messages cm ON cm.user_id = g.user_id
         WHERE g.user_id = $1`,
        [socket.userId]
      );

      if (userStatsResult.rows.length > 0) {
        const stats = userStatsResult.rows[0];
        personalizedContext = `\n\nUser Learning Profile:
- Total Goals: ${stats.total_goals} (${stats.active_goals} active, ${stats.completed_goals} completed)
- Milestone Progress: ${stats.completed_milestones}/${stats.total_milestones} completed
- Chat History: ${stats.total_chat_messages} messages exchanged`;

        // Get recent active goals for context
        const recentGoalsResult = await pool.query(
          `SELECT title, status, difficulty_level 
           FROM goals 
           WHERE user_id = $1 AND status IN ('active', 'paused')
           ORDER BY updated_at DESC 
           LIMIT 3`,
          [socket.userId]
        );

        if (recentGoalsResult.rows.length > 0) {
          personalizedContext += `\n- Recent Active Goals: `;
          personalizedContext += recentGoalsResult.rows
            .map(g => `${g.title} (${g.status})`)
            .join(', ');
        }
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Build conversation context for Gemini
    const conversationHistory = recentMessages
      .slice(-10)
      .map(
        (msg) =>
          `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
      )
      .join("\n");

    const fullPrompt = `${systemPrompt}${personalizedContext}

Previous conversation:
${conversationHistory}

User: ${userMessage}`;

    // Start streaming response
    socket.emit("ai_typing", true);
    let fullResponse = "";

    // Generate streaming response with Gemini
    const result = await model.generateContentStream(fullPrompt);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullResponse += chunkText;
        // Emit partial response to client for real-time display
        socket.emit("ai_message_chunk", {
          content: chunkText,
          isComplete: false,
        });
      }
    }

    // Mark streaming as complete
    socket.emit("ai_typing", false);

    // Save the complete AI response to database
    const aiMessageResult = await pool.query(
      "INSERT INTO chat_messages (user_id, goal_id, sender, message, timestamp) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [socket.userId, goalId || null, "ai", fullResponse]
    );

    // Emit the complete message
    socket.emit("chat_message", {
      id: aiMessageResult.rows[0].id,
      sender: "ai",
      message: fullResponse,
      timestamp: aiMessageResult.rows[0].timestamp,
    });

  } catch (error) {
    console.error("AI response generation error:", error);

    // Fallback response
    const fallbackResponse =
      "I'm here to help you with your learning goals! What would you like to work on today?";

    try {
      const aiMessage = await pool.query(
        `INSERT INTO chat_messages (user_id, goal_id, message, sender, timestamp) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING *`,
        [socket.userId, goalId || null, fallbackResponse, "ai"]
      );

      socket.emit("ai_typing", false);
      socket.emit("chat_message", {
        id: aiMessage.rows[0].id,
        message: fallbackResponse,
        sender: "ai",
        timestamp: aiMessage.rows[0].timestamp,
      });
    } catch (dbError) {
      console.error("Database error in fallback:", dbError);
      socket.emit("error", { message: "Failed to generate response" });
    }
  }
}

/**
 * Get chat statistics for a user
 * @param {Object} pool - Database connection pool
 * @param {number} userId - User ID
 * @returns {Object} Chat statistics
 */
export async function getChatStats(pool, userId) {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE sender = 'user') as user_messages,
        COUNT(*) FILTER (WHERE sender = 'ai') as ai_messages,
        COUNT(DISTINCT goal_id) as goals_discussed,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message
       FROM chat_messages 
       WHERE user_id = $1`,
      [userId]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error getting chat stats:", error);
    throw error;
  }
}

const chatRoutes = {
  setupChatHandlers,
  getChatStats
};

export default chatRoutes;
