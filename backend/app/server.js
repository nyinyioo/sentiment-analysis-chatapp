require('dotenv').config();
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const crypto = require('crypto');
const cors = require('cors');
const WebSocket = require('ws');
const app = express();
const host = 'localhost';
const port = 3000;



const Database = require('./Database');
const SessionManager = require('./SessionManager');
const analyzeSentiment = require('./sentimentAnalyzer');
const { nonceMiddleware, helmetMiddleware } = require('./middleware/security');

// Paths
const FRONTEND_PATH = path.join(__dirname, '../../frontend');
const CLIENT_PATH = path.join(FRONTEND_PATH, 'client');
const VIEWS_PATH = path.join(FRONTEND_PATH, 'views');
const loginAssetsPath = path.join(CLIENT_PATH, 'login_assets');
const clientApp = CLIENT_PATH;
const wss = new WebSocket.Server({ port: 8000 });

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(cors());
app.use(morgan('dev'));
app.use(nonceMiddleware);
app.use(helmetMiddleware());

// Static + views
app.use(express.static(CLIENT_PATH));
app.set('views', VIEWS_PATH);
app.set('view engine', 'ejs');
app.use(express.json());


const indexRoutes = require('./routes/index');
app.use('/', indexRoutes);

app.use('/chatapp', require('./routes/index'));

app.use((req, res, next) => {
    console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
    next();
});

//CHATAPP FUNCTIONALITY
// Initialize messages and block size
let messages = {}; 
const messageBlockSize = 10;
const mongoUri = process.env.MONGO_URI || 'mongodb://iyn_nimda:*****@172.23.96.1:27017/cpen322-messenger?authSource=admin';
const db = new Database(mongoUri);
console.log('[MongoDB] Connecting to host:', new URL(process.env.MONGO_URI).hostname);
const sessionManager = new SessionManager();



app.get('/login', (req, res) => {
    res.sendFile(path.join(loginAssetsPath, 'login.html'));
}); 
app.get('/start', async (req, res) => {
    try {
        console.log(`[DEBUG] /start route accessed`);

        const anonymousUsername = `guest_${crypto.randomBytes(4).toString("hex")}`;
        sessionManager.createSession(res, anonymousUsername);
        console.log(`[DEBUG] Anonymous session created for username: ${anonymousUsername}`);

        const roomId = `temp_${crypto.randomBytes(4).toString("hex")}`;
        const tempRoom = {
            _id: roomId,
            name: `Room for ${anonymousUsername}`,
            image: "client/assets/profile-icon.png",
        };
        messages[roomId] = [];
        await db.addRoom(tempRoom);
        console.log(`[DEBUG] Temporary room created with ID: ${roomId}`);

        const botToken = sessionManager.initializeBotSession();
        const botSession = sessionManager.sessions[botToken];
        console.log(`[DEBUG] Bot session initialized:`, botSession);


        if (req.headers.accept && req.headers.accept.includes("application/json")) {
            console.log(`[DEBUG] JSON response requested`);
            res.json(tempRoom);
        } else {
            console.log(`[DEBUG] Rendering chatroom.ejs`);
            res.render('chatroom', { room: tempRoom });
        }

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(botGreeting));
            }
        });

    } catch (error) {
        console.error(`[ERROR] Error creating temporary room: ${error.message}`);
        res.status(500).send("Internal Server Error");
    }
});
// Route: Render an existing chatroom
app.get('/lobby/chat/:room_id', async (req, res) => {
    try {
        const roomId = req.params.room_id;
        const room = await db.getRoom(roomId);

        if (!room) {
            return res.status(404).send("Room not found");
        }

        res.render('chatroom', { room: { _id: roomId, name: 'Chat Room' } });
    } catch (error) {
        console.error("Error fetching room:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.get('/chat/:room_id/messages', sessionManager.middleware);
app.get('/chat/:room_id', sessionManager.middleware);
app.get('/chat', sessionManager.middleware);

app.get('/profile', sessionManager.middleware, (req, res) => {
    res.json({ username: req.username });
});

// Update user profile
app.put('/profile', sessionManager.middleware, async (req, res) => {
    const { password } = req.body;
    const usernameFromSession = req.username;
    if (!usernameFromSession) {
        return res.status(403).json({ message: "Unauthorized!" });
    }
    const hashedPassword = hashPassword(password);
    const updateData = { password: hashedPassword };
    try {
        const updateStatus = await db.updateUserProfileByUsername(usernameFromSession, updateData);
        if (updateStatus.matchedCount === 0) {
            return res.status(404).json({ message: "No user found with the provided username." });
        }
        sessionManager.deleteSession(req);
        res.clearCookie('cpen322-session');
        res.status(200).json({ message: 'Password updated successfully. Please log in again.' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

db.getRooms()
    .then(rooms => {
        rooms.forEach(room => {
            messages[room._id.toString()] = [];
        });

        app.get('/lobby/chat', async (req, res) => {
            try {
                const chatrooms = await db.getRooms();
                const chatroomsWithMessages = chatrooms.map(room => ({
                    ...room,
                    messages: messages[room._id.toString()] || [],
                }));
                res.json(chatroomsWithMessages);
            } catch (error) {
                console.error('Error fetching chatrooms:', error);
                res.status(500).send('Internal Server Error');
            }
        });

        app.get('/lobby/chat/:room_id', async (req, res) => {
            const roomId = req.params.room_id;
            try {
                const room = await db.getRoom(roomId);
                if (room) {
                    res.render('chatroom', { room }); 
                } else {
                    res.status(404).send(`Room ${roomId} was not found`);
                }
            } catch (error) {
                console.error(`Error fetching room ${roomId}:`, error);
                res.status(500).send('Internal Server Error');
            }
        });

        app.get('/lobby/chat/:room_id/messages', async (req, res) => {
            const roomId = req.params.room_id;
            const before = req.query.before ? parseInt(req.query.before, 10) : Date.now();
            try {
                const conversation = await db.getLastConversation(roomId, before);
                if (conversation) {
                    res.json(conversation);
                } else {
                    res.status(404).send('Conversation not found');
                }
            } catch (error) {
                console.error(`Error fetching messages for room ${roomId}:`, error);
                res.status(500).send('Internal Server Error');
            }
        });

        app.post('/lobby/chat', async (req, res) => {
            const { name, image } = req.body;
            if (!name) {
                return res.status(400).send({ error: 'Room name is required' });
            }
            try {
                const addedRoom = await db.addRoom({ name, image });
                messages[addedRoom._id.toString()] = [];
                res.status(200).json(addedRoom);
            } catch (error) {
                console.error('Error adding room:', error);
                res.status(500).send('Internal Server Error');
            }
        });
        app.listen(port, () => {
            console.log(`${new Date()} App Started. Listening on ${host}:${port}, serving ${clientApp}`);
        });
    })
    .catch(err => {
        console.error('Failed to initialize messages:', err);
    });

    app.delete('/lobby/chat/:room_id', async (req, res) => {
        const roomId = req.params.room_id;
        try {
            console.log(`[DEBUG] Attempting to delete room with ID: ${roomId}`);
    
            const room = await db.getRoom(roomId);
            if (!room) {
                console.warn(`[WARNING] Room ${roomId} not found.`);
                return res.status(404).send({ error: `Room ${roomId} not found.` });
            }

            const deleteResult = await db.deleteRoom(roomId);
            if (deleteResult.deletedCount > 0) {
                console.log(`[DEBUG] Room ${roomId} deleted successfully.`);
                
                delete messages[roomId];
                return res.status(200).send({ message: `Room ${roomId} deleted successfully.` });
            } else {
                console.warn(`[WARNING] Room ${roomId} could not be deleted.`);
                return res.status(500).send({ error: `Failed to delete room ${roomId}.` });
            }
        } catch (error) {
            console.error(`[ERROR] Failed to delete room ${roomId}: ${error.message}`);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
    });

// WebSocket handling
wss.on('connection', function connection(ws, req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies['cpen322-session'];

    if (!sessionToken || !sessionManager.sessions[sessionToken]) {
        ws.close(1008, "Session invalid");
        return;
    }

    ws.session = sessionToken;
    ws.username = sessionManager.sessions[sessionToken].username;

    console.log(`[DEBUG] WebSocket connection established. Username: ${ws.username}`);

    ws.on('message', function incoming(message, isBinary) {
        handleWebSocketMessage(ws, message, isBinary);
    });
});

async function handleWebSocketMessage(ws, message, isBinary) {
    try {
        const messageData = JSON.parse(message);
        if (!messageData.text || !messageData.roomId) return;

        // Analyze sentiment
        const sentiment = await analyzeSentiment(messageData.text);
        messageData.sentiment = { label: sentiment.label, score: sentiment.score };
        messageData.type = messageData.isBot ? "bot" : "user";

        const jsonMessage = JSON.stringify(messageData);

        // Broadcast user message to all clients in the room
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonMessage);
            }
        });

        // Save user message in memory
        if (!messages[messageData.roomId]) {
            messages[messageData.roomId] = [];
        }
        messages[messageData.roomId].push(messageData);

        // Persist messages in the database if block size is reached
        if (messages[messageData.roomId].length >= messageBlockSize) {
            const conversation = {
                room_id: messageData.roomId,
                timestamp: Date.now(),
                messages: messages[messageData.roomId]
            };
            await db.addConversation(conversation);
            messages[messageData.roomId] = [];
        }

        // Send message to Rasa for bot response
        const rasaResponse = await fetch(
            "http://localhost:5005/webhooks/rest/webhook",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                sender: messageData.roomId,
                message: messageData.text
                })
            }
            );

        const rasaMessages = await rasaResponse.json();

        // Process Rasa's response
        rasaMessages.forEach((msg) => {
            const botMessage = {
                roomId: messageData.roomId,
                text: msg.text,
                username: "Nav-Mini",
                isBot: true,
                sentiment: { label: "neutral", score: 0 } // Default sentiment for bot messages
            };

            const jsonBotMessage = JSON.stringify(botMessage);

            // Broadcast bot message to all clients in the room
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(jsonBotMessage);
                }
            });

            // Save bot message in memory
            messages[messageData.roomId].push(botMessage);
        });

    } catch (error) {
        console.error("Error handling WebSocket message:", error);
    }
}

app.use(function (err, req, res, next) {
    console.error(`Error occurred: ${err.message}`);
    console.error(err.stack);
    if (err instanceof SessionManager.Error) {
        const acceptHeader = req.headers.accept;
        if (acceptHeader && acceptHeader.includes('application/json')) {
            res.status(401).json({ error: err.message });
        } else {
            res.redirect('/login');
        }
    } else {
        res.status(500).send('Internal Server Error');
    }
});

function parseCookies(cookieHeader) {
    if (!cookieHeader) {
        return {};
    }
    return cookieHeader.split(';').reduce((cookies, item) => {
        const parts = item.split('=').map(part => part.trim());
        cookies[parts[0]] = parts[1];
        return cookies;
    }, {});
}

function isCorrectPassword(plaintextPassword, storedSaltedHash) {
    const salt = storedSaltedHash.substring(0, 20);
    const storedBase64Hash = storedSaltedHash.substring(20);
    const storedHash = Buffer.from(storedBase64Hash, 'base64').toString('hex');
    const hashToCheck = crypto.createHash('sha256').update(plaintextPassword + salt).digest('hex');
    return hashToCheck === storedHash;
}

function hashPassword(plaintextPassword) {
    const salt = crypto.randomBytes(10).toString('hex');
    const saltedPassword = plaintextPassword + salt;
    const hash = crypto.createHash('sha256').update(saltedPassword).digest('base64');
    return salt + hash;
}
