import WebSocket from 'ws';
import { parseWakeWord, BOT_NAME } from '../bot/wakeword.js';
import { askAssistant as defaultAskAssistant, buildRoomContext } from '../bot/assistant.js';
import { createRateLimiter } from '../bot/rateLimiter.js';

const RASA_WEBHOOK = process.env.RASA_WEBHOOK_URL || 'http://localhost:5005/webhooks/rest/webhook';

// demo - Rasa only replies in temp_ demo rooms by default
// all   – Rasa replies in every room
// never – Rasa is not called at all
const RASA_REPLY_MODE = process.env.RASA_REPLY_MODE || 'demo';

// max assistant whispers per room per minute
const WHISPER_LIMIT = Number(process.env.ASSISTANT_RATE_LIMIT || 6);

// how many of the asker's earlier whispers to give the assistant as memory
const PRIOR_WHISPERS = 10;

// In 'session' memory mode a user's whispers are deleted when they leave the room.
// A reload also closes the socket, so deletion waits this long and is
// cancelled if the same user rejoins the same room in time.
const SESSION_GRACE_MS = Number(process.env.WHISPER_SESSION_GRACE_MS || 30_000);

export default function(wss, db, messages, messageBlockSize, sessionManager, analyzeSentiment, parseCookies, askAssistant = defaultAskAssistant) {

    const whisperLimiter = createRateLimiter(WHISPER_LIMIT, 60_000);

    // pending "clear whispers on leave" timers, keyed by `${username}:${roomId}`
    const pendingClears = new Map();

    function cancelPendingClear(username, roomId) {
        const key = `${username}:${roomId}`;
        const timer = pendingClears.get(key);
        if (timer) {
            clearTimeout(timer);
            pendingClears.delete(key);
        }
    }

    // called when a socket in a real room closes: clear session-mode whispers after the grace period. 
    async function scheduleSessionClear(username, roomId) {
        if (!roomId || roomId.startsWith('temp_')) return;
        const settings = await db.getUserSettings(username).catch(() => null);
        if (!settings || settings.whisperMemory !== 'session') return;

        const key = `${username}:${roomId}`;
        cancelPendingClear(username, roomId);
        pendingClears.set(key, setTimeout(async () => {
            pendingClears.delete(key);
            // still gone? (another socket of the same user may have rejoined)
            const stillHere = [...wss.clients].some(c => c.username === username && c.roomId === roomId);
            if (stillHere) return;
            try {
                await db.deleteWhispers(username, roomId);
                console.log(`[WS] Cleared session whispers for ${username} in ${roomId}`);
            } catch (err) {
                console.error('[WS] Failed to clear session whispers:', err);
            }
        }, SESSION_GRACE_MS));
    }

    wss.on('connection', function connection(ws, req) {
        const cookies = parseCookies(req.headers.cookie);
        const sessionToken = cookies['cpen322-session'];

        if (!sessionToken || !sessionManager.sessions[sessionToken]) {
            console.warn('[WS] Invalid or missing session. Closing connection.');
            ws.close(1008, 'Session invalid');
            return;
        }

        ws.session = sessionToken;
        ws.username = sessionManager.sessions[sessionToken].username;
        console.log(`[WS] Connected: ${ws.username}`);

        ws.on('message', function incoming(message) {
            handleMessage(ws, message);
        });

        ws.on('close', async () => {
            console.log(`[WS] Disconnected: ${ws.username}`);
            // leaving the room ends a session-mode whisper history (after a grace period)
            scheduleSessionClear(ws.username, ws.roomId);
            // Flush buffered messages to DB when a user leaves (skip temp/demo rooms)
            if (ws.roomId && !ws.roomId.startsWith('temp_') && messages[ws.roomId]?.length > 0) {
                try {
                    await db.addConversation({
                        room_id: ws.roomId,
                        timestamp: Date.now(),
                        messages: messages[ws.roomId],
                    });
                    messages[ws.roomId] = [];
                } catch (err) {
                    console.error('[WS] Failed to flush messages on disconnect:', err);
                }
            }
        });
    });

    // Send a JSON payload to every open client in a room. 
    function broadcast(roomId, payload) {
        const json = JSON.stringify(payload);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
                client.send(json);
            }
        });
    }

    // Send a JSON payload to one client only. 
    function whisper(ws, payload) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }

    async function handleMessage(ws, message) {
        try {
            const messageData = JSON.parse(message);
            if (!messageData.roomId) return;

            // client announces its room on connect so it receives broadcasts
            // before typing, and so a reload cancels a pending session clear
            if (messageData.type === 'join') {
                ws.roomId = messageData.roomId;
                cancelPendingClear(ws.username, ws.roomId);
                return;
            }

            if (!messageData.text) return;
            ws.roomId = messageData.roomId;
            cancelPendingClear(ws.username, ws.roomId);

            // "hey chat, ..." → private assistant exchange, never broadcast or stored
            const wake = parseWakeWord(messageData.text);
            if (wake.addressed) {
                await handleWhisper(ws, messageData, wake.query);
                return;
            }

            // Analyze sentiment via the persistent FastAPI service
            const sentiment = await analyzeSentiment(messageData.text);
            messageData.sentiment = { label: sentiment.label, score: sentiment.score };
            messageData.type = messageData.isBot ? 'bot' : 'user';
            messageData.username = messageData.username || ws.username;
            messageData.ts = Date.now(); // lets clients interleave whispers by time

            // broadcast only to clients in the same room
            broadcast(messageData.roomId, messageData);

            // Buffer in memory
            if (!messages[messageData.roomId]) {
                messages[messageData.roomId] = [];
            }
            messages[messageData.roomId].push(messageData);

            // Persist when block is full (skip for demo temp rooms)
            if (messages[messageData.roomId].length >= messageBlockSize) {
                if (!messageData.roomId.startsWith('temp_')) {
                    await db.addConversation({
                        room_id: messageData.roomId,
                        timestamp: Date.now(),
                        messages: messages[messageData.roomId],
                    });
                }
                messages[messageData.roomId] = [];
            }

            // Forward to Rasa for a bot response, depending on mode
            const isDemoRoom = messageData.roomId.startsWith('temp_');
            const useRasa = RASA_REPLY_MODE === 'all' || (RASA_REPLY_MODE === 'demo' && isDemoRoom);
            if (useRasa) {
                await forwardToRasa(messageData);
            }

        } catch (error) {
            console.error('[WS] Error handling message:', error);
        }
    }

    // Private assistant exchange. Only the asking socket receives anything;
    // nothing is pushed to the room buffer or the database.
    async function handleWhisper(ws, messageData, query) {
        const roomId = messageData.roomId;
        const ts = Date.now();
        const base = { type: 'whisper', roomId, username: BOT_NAME, isBot: true, private: true, query, ts };

        if (!whisperLimiter.allow(roomId)) {
            whisper(ws, {
                ...base,
                error: true,
                text: `Give me a sec, this room is asking a lot. Try again in ${whisperLimiter.retryAfter(roomId)}s.`,
            });
            return;
        }

        // let the asker show a "thinking" state
        whisper(ws, { ...base, pending: true, text: '' });

        try {
            let history = [];
            let roomName;
            let priorWhispers = [];
            // demo rooms never persist anything. Real rooms save in both modes;
            // 'session' mode deletes on leave, 'remember' keeps until cleared.
            let memory = 'none';

            if (!roomId.startsWith('temp_')) {
                const [conversation, room, settings, prior] = await Promise.all([
                    db.getLastConversation(roomId).catch(() => null),
                    db.getRoom(roomId).catch(() => null),
                    db.getUserSettings(ws.username).catch(() => ({ whisperMemory: 'session' })),
                    db.getWhispers(roomId, ws.username, PRIOR_WHISPERS).catch(() => []),
                ]);
                history = conversation?.messages || [];
                roomName = room?.name;
                memory = settings.whisperMemory;
                priorWhispers = prior.map(w => ({ query: w.query, reply: w.reply }));
            }
            const remember = memory !== 'none';
            const context = buildRoomContext(history, messages[roomId] || []);

            const text = await askAssistant({ query, askedBy: ws.username, roomName, context, priorWhispers });

            let saved = null;
            if (remember) {
                saved = await db.addWhisper({
                    room_id: roomId, username: ws.username, ts,
                    text: messageData.text, query, reply: text,
                }).catch(err => { console.error('[WS] Failed to save whisper:', err.message); return null; });
            }

            whisper(ws, {
                ...base,
                text,
                id: saved ? String(saved._id) : null,
                saved: Boolean(saved),
                memory,
            });
        } catch (err) {
            console.error('[WS] Assistant error:', err.message);
            whisper(ws, { ...base, error: true, text: "Sorry, I couldn't answer that right now." });
        }
    }

    async function forwardToRasa(messageData) {
        const rasaResponse = await fetch(RASA_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: messageData.roomId, message: messageData.text }),
        });
        const rasaMessages = await rasaResponse.json();

        rasaMessages.forEach(msg => {
            const botMessage = {
                roomId: messageData.roomId,
                text: msg.text,
                username: BOT_NAME,
                isBot: true,
                sentiment: { label: 'neutral', score: 0 },
            };
            broadcast(messageData.roomId, botMessage);
            if (!messages[messageData.roomId]) messages[messageData.roomId] = [];
            messages[messageData.roomId].push(botMessage);
        });
    }
}
