const WebSocket = require('ws');

const RASA_WEBHOOK = process.env.RASA_WEBHOOK_URL || 'http://localhost:5005/webhooks/rest/webhook';

module.exports = function(wss, db, messages, messageBlockSize, sessionManager, analyzeSentiment, parseCookies) {

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

    async function handleMessage(ws, message) {
        try {
            const messageData = JSON.parse(message);
            if (!messageData.text || !messageData.roomId) return;

            ws.roomId = messageData.roomId;

            // Analyze sentiment via the persistent FastAPI service
            const sentiment = await analyzeSentiment(messageData.text);
            messageData.sentiment = { label: sentiment.label, score: sentiment.score };
            messageData.type = messageData.isBot ? 'bot' : 'user';

            const jsonMessage = JSON.stringify(messageData);

            // broadcast only to clients in the same room
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client.roomId === messageData.roomId) {
                    client.send(jsonMessage);
                }
            });

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

            // Forward to Rasa for bot response
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
                    username: 'bot',
                    isBot: true,
                    sentiment: { label: 'neutral', score: 0 },
                };
                const jsonBotMessage = JSON.stringify(botMessage);

                // bot reply only goes to the same room
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && client.roomId === messageData.roomId) {
                        client.send(jsonBotMessage);
                    }
                });

                messages[messageData.roomId].push(botMessage);
            });

        } catch (error) {
            console.error('[WS] Error handling message:', error);
        }
    }
};
