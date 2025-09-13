# AI Tutor Server

A standalone Node.js/Express server for the AI Tutor platform with Socket.io real-time chat and Gemini AI integration.

## 🚀 Features

- **Real-time Chat**: Socket.io powered chat with AI tutor
- **JWT Authentication**: Secure user authentication
- **Gemini AI Integration**: Intelligent tutoring responses
- **PostgreSQL Database**: Persistent data storage
- **CORS Support**: Ready for frontend integration

## 📦 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd ai-tutor-server
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your actual values
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `GEMINI_API_KEY`: Google Gemini AI API key
- `NEXT_PUBLIC_APP_URL`: Your frontend URL (for CORS)

### 3. Database Setup

Create PostgreSQL database and run these SQL scripts:
1. Create tables using the schema from your main project
2. Ensure `chat_messages` table exists with proper structure

### 4. Run Server

```bash
# Development
npm run dev

# Production
npm start
```

## 🚢 Railway Deployment

### 1. Create Railway Project

1. Go to [Railway.app](https://railway.app)
2. Create new project from GitHub repo
3. Connect this repository

### 2. Set Environment Variables

In Railway dashboard, add these variables:
```
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_jwt_secret_key
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_APP_URL=https://your-vercel-app.vercel.app
NODE_ENV=production
```

### 3. Deploy

Railway will automatically deploy using the `railway.json` configuration.

## 🔗 Frontend Integration

Update your Next.js app's environment variables:

```bash
# In your Vercel deployment
NEXT_PUBLIC_SOCKET_URL=https://your-railway-app.railway.app
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Health Check
- `GET /` - Server status

### Socket.io Events
- `chat_message` - Send/receive chat messages
- `get_chat_history` - Retrieve chat history
- `typing` - Typing indicators
- `ai_typing` - AI typing status
- `ai_message_chunk` - Streaming AI responses

## 🏗️ Project Structure

```
ai-tutor-server/
├── server.js              # Main server file
├── middleware/
│   └── auth.js            # JWT authentication middleware
├── routes/
│   └── chat.js            # Socket.io chat handlers
├── package.json           # Dependencies and scripts
├── railway.json           # Railway deployment config
├── Procfile              # Process file for deployment
├── .env.example          # Environment variables template
└── README.md             # This file
```

## 🔧 Development

### Local Testing

```bash
# Start server
npm run dev

# Test health endpoint
curl http://localhost:3001

# Test with frontend
# Make sure your Next.js app points to http://localhost:3001
```

### Database Schema

Ensure your PostgreSQL database has these tables:
- `users` - User accounts
- `goals` - Learning goals
- `milestones` - Goal milestones
- `chat_messages` - Chat history

## 🐛 Troubleshooting

### Common Issues

1. **Module Import Errors**
   - Ensure `"type": "module"` is in package.json
   - Use ES6 import/export syntax

2. **Database Connection**
   - Check DATABASE_URL format
   - Ensure SSL settings for production

3. **CORS Issues**
   - Verify NEXT_PUBLIC_APP_URL matches your frontend
   - Check Railway deployment URL

4. **Authentication Errors**
   - Ensure JWT_SECRET is set and matches frontend
   - Check token format in requests

## 📝 License

MIT License - see LICENSE file for details
