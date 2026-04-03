import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';

import Database from './Database.js';
import SessionManager from './SessionManager.js';
import analyzeSentiment from './sentimentAnalyzer.js';
import { nonceMiddleware, helmetMiddleware } from './middleware/security.js';
import { parseCookies, hashPassword, isCorrectPassword } from './utils/helpers.js';
import authRoutes from './routes/auth.js';
import lobbyRoutes from './routes/lobby.js';
import wsHandler from './ws/handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const port = process.env.NODE_PORT || 3001;

// Path to the React production build
const REACT_DIST_PATH = path.join(__dirname, '../../frontend-react/dist');

// DB + session
const db = new Database(process.env.MONGO_URI);
const sessionManager = new SessionManager();

// In-memory message buffer: { roomId: [msg, msg, ...] }
const messages = {};
const MESSAGE_BLOCK_SIZE = 10;

// Middleware 
app.use(express.json({ limit: '10kb' }));
app.use(cors());
app.use(morgan('dev'));
app.use(nonceMiddleware);
app.use(helmetMiddleware());
// Serve React build static assets (JS, CSS, images)
app.use(express.static(REACT_DIST_PATH));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()}  ${req.ip} : ${req.method} ${req.path}`);
    next();
});

// Routes 
app.use('/', authRoutes(db, sessionManager, hashPassword, isCorrectPassword, wss, messages));
app.use('/lobby', lobbyRoutes(db, messages, sessionManager, parseCookies));


// any non-API route serves index.html 
app.get('*', (req, res) => {
    res.sendFile(path.join(REACT_DIST_PATH, 'index.html'));
});


// Message buffer init
// Populate buffers for existing rooms on startup
db.getRooms()
    .then(rooms => {
        rooms.forEach(room => {
            messages[room._id.toString()] = [];
        });
        console.log(`[DB] Initialized message buffers for ${rooms.length} rooms`);
    })
    .catch(err => console.error('[DB] Failed to initialize message buffers:', err));



// WebSocket 
wsHandler(wss, db, messages, MESSAGE_BLOCK_SIZE, sessionManager, analyzeSentiment, parseCookies);


// Error handler
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
