# Project Overview — What Are We Even Building?

## Overview

This is a **real-time chat app** with a built-in AI bot. Every message a user sends gets:

1. Broadcast to everyone in the chat room via WebSockets (instant, no page refresh)
2. Run through a **sentiment analysis ML model** (is this message positive, negative, or neutral?)
3. Sent to a **Rasa chatbot**, which either responds with a scripted reply OR falls through to **GPT-4o-mini** if it doesn't know what to say


- A **Node.js/Express** backend (the web server)
- **MongoDB** (persistent storage for rooms, users, messages)
- **WebSockets** (real-time bidirectional communication)
- **Python + Hugging Face** (ML sentiment analysis)
- **Rasa** (open-source NLU chatbot framework)
- **OpenAI GPT-4o-mini** (LLM fallback for the bot)
- **Docker** (runs MongoDB in a container)
- **Jenkins** (automated testing pipeline)


---

## How the Pieces Fit

```
Browser (Frontend)
   |
   |  HTTP requests (login, get rooms, etc.)
   |  WebSocket connection (real-time chat)
   v
Node.js / Express Server  (server.js — port 3001)
   |
   |-- MongoDB (Docker container, port 27017)
   |      stores: users, chatrooms, conversations
   |
   |-- FastAPI Sentiment Service (localhost:8001)  ← Python, model loads ONCE at startup
   |      POST /analyze  { text: "..." }
   |      returns: { label: "POSITIVE", score: 0.99 }
   |
   |-- Rasa HTTP API (localhost:5005)
         receives: { sender: roomId, message: text }
         returns: [{ text: "bot reply" }]
              |
              |-- If intent matches: scripted response
              |-- If fallback: action_chatgpt -> OpenAI GPT-4o-mini
```

---

## Directory Structure

```
sentiment-analysis-chatapp/
├── backend/
│   ├── app/               # The Node.js Express server
│   │   ├── server.js      # Thin entry point — wires middleware, routes, WS
│   │   ├── Database.js    # MongoDB abstraction layer
│   │   ├── SessionManager.js  # Cookie-based sessions
│   │   ├── sentimentAnalyzer.js  # HTTP call to FastAPI sentiment service
│   │   ├── middleware/
│   │   │   └── security.js  # Helmet + CSP nonce
│   │   ├── routes/
│   │   │   ├── auth.js    # /login, /start, /profile
│   │   │   └── lobby.js   # /lobby/chat/* CRUD routes
│   │   ├── ws/
│   │   │   └── handler.js # WebSocket connection + message handling
│   │   └── utils/
│   │       └── helpers.js # parseCookies, hashPassword, isCorrectPassword
│   ├── ml/
│   │   ├── sentiment_service.py        # FastAPI server — model loads once here
│   │   └── sentiment_analysis/
│   │       └── sentiment_analysis.py  # Original script (used by Python tests)
│   └── rasa/
│       ├── config.yml     # NLU pipeline + policies
│       ├── domain.yml     # Intents, responses, actions
│       ├── data/
│       │   ├── nlu.yml    # Training examples for each intent
│       │   ├── stories.yml  # Multi-turn conversation flows
│       │   └── rules.yml  # Single-turn rules (always do X when Y)
│       └── actions.py     # Custom action: calls OpenAI GPT-4o-mini
├── frontend/
│   ├── views/             # EJS templates rendered server-side
│   │   ├── chatroom.ejs   # Chat room view
│   │   └── chatroom.ejs   # Individual chat room
│   └── client/            # Static files served to browser
│       ├── js/chatroom.js # WebSocket client code
│       └── css/
├── docker/
│   ├── docker-compose.yml # Spins up MongoDB container
│   └── initdb.mongo       # Seeds the database on first run
├── Jenkinsfile            # CI/CD pipeline (auto-runs tests on push)
└── docs/learning_notes/   # You are here
```

---

## Message Lifecycle 

Here's what happens when a user types "I'm having a bad day" and hits Enter:

1. **Browser** — `chatroom.js` calls `socket.send(JSON.stringify({ roomId, text }))`
2. **Server receives WebSocket message** — `handleWebSocketMessage()` fires
3. **Sentiment analysis** — Node POSTs to the FastAPI service at `localhost:8001/analyze`, gets back `{ label: "NEGATIVE", score: 0.87 }` (model was already loaded, so this is fast)
4. **Broadcast** — the message (with sentiment attached) is sent to all clients **in the same room** via `wss.clients.forEach(...)` filtered by `client.roomId`
5. **In-memory buffer** — message is pushed to `messages[roomId]`
6. **Persistence** — if `messages[roomId].length >= 10`, the block gets saved to MongoDB
7. **Rasa** — Node POSTs to `http://localhost:5005/webhooks/rest/webhook` with the message
8. **Rasa classifies intent** — "I'm having a bad day" → `mood_unhappy`
9. **Custom action fires** — `action_chatgpt` calls OpenAI with the text
10. **Bot reply** — the bot's response is broadcast back to all clients

---

## Tradeoffs

**Why WebSockets instead of just polling?**
 WebSockets keep a persistent connection open — the server pushes data the moment it's available with low latency. Using polling (asking the server "anything new?" every second) would be inefficient.

**Why Python for sentiment analysis instead of a JS library?**

Python has the strongest ML ecosystem — the best models (Hugging Face Transformers) are Python-first. The bridge between Node and Python is a persistent **FastAPI microservice**: the transformer model loads once at startup, and every message just makes a fast HTTP call to `localhost:8001/analyze`. Node handles networking + real-time communication. Python handles ML. If the ML service crashes, it doesn’t crash your Node server.

Note: the tradeoff is 2 runtimes to start and manage. For a fully JS stack you could use something like `@xenova/transformers`, but model quality is lower.



**Why Rasa + GPT fallback instead of just GPT directly?**
Rasa handles scripted flows reliably at no cost (no API calls for simple greetings). GPT only gets called when Rasa doesn't understand the input — so it's efficient.

**Why session cookies instead of JWTs?**
We chose session cookies (stateful auth) because it integrates naturally with Node.js + WebSocket architecture. All requests are handled by a centralized backend and Authentication checks are just session lookups, which keeps the logic simple and consistent across HTTP and WebSocket connections.
JWTs, in contrast, are stateless. Once issued, a token remains valid until it expires. This adds complexity for token managemnt.

Note: The tradeoff is that sessions require server-side storage. If we scale horizontally, we need a shared session store like Redis. JWTs reduce this dependency in distributed systems because each service can verify tokens independently.



