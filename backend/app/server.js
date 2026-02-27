require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const WebSocket = require('ws');

const Database = require('./Database');
const SessionManager = require('./SessionManager');
const analyzeSentiment = require('./sentimentAnalyzer');
const { nonceMiddleware, helmetMiddleware } = require('./middleware/security');
const { parseCookies, hashPassword, isCorrectPassword } = require('./utils/helpers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const port = process.env.NODE_PORT || 3001;

// Paths
const FRONTEND_PATH = path.join(__dirname, '../../frontend');
const CLIENT_PATH = path.join(FRONTEND_PATH, 'client');
const VIEWS_PATH = path.join(FRONTEND_PATH, 'views');

// DB + session
const db = new Database(process.env.MONGO_URI);
const sessionManager = new SessionManager();

// In-memory message buffer: { roomId: [msg, msg, ...] }
const messages = {};
const MESSAGE_BLOCK_SIZE = 10;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(cors());
app.use(morgan('dev'));
app.use(nonceMiddleware);
app.use(helmetMiddleware());
app.use(express.static(CLIENT_PATH));

app.set('views', VIEWS_PATH);
app.set('view engine', 'ejs');

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()}  ${req.ip} : ${req.method} ${req.path}`);
    next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/login'));
app.use('/', require('./routes/auth')(db, sessionManager, hashPassword, isCorrectPassword, wss, messages));
app.use('/lobby', require('./routes/lobby')(db, messages, sessionManager, parseCookies));

// ── Message buffer init ───────────────────────────────────────────────────────
// Populate buffers for existing rooms on startup
db.getRooms()
    .then(rooms => {
        rooms.forEach(room => {
            messages[room._id.toString()] = [];
        });
        console.log(`[DB] Initialized message buffers for ${rooms.length} rooms`);
    })
    .catch(err => console.error('[DB] Failed to initialize message buffers:', err));

// ── WebSocket ─────────────────────────────────────────────────────────────────
// Fix:  ws/handler.js — no duplicate here
require('./ws/handler')(wss, db, messages, MESSAGE_BLOCK_SIZE, sessionManager, analyzeSentiment, parseCookies);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(function(err, req, res, next) {
    console.error(`Error occurred: ${err.message}`);
    if (err instanceof SessionManager.Error) {
        if (req.headers.accept?.includes('application/json')) {
            res.status(401).json({ error: err.message });
        } else {
            res.redirect('/login');
        }
    } else {
        res.status(500).send('Internal Server Error');
    }
});

server.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
