const express = require('express');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const MAX_USERS = 50;

module.exports = function(db, sessionManager, hashPassword, isCorrectPassword, wss, messages) {
    const router = express.Router();

    router.get('/login', (req, res) => {
        res.render('login');
    });

    router.get('/login/app', (req, res) => {
        res.render('login-app');
    });

    router.post('/login', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        try {
            const user = await db.getUser(username);
            if (!user) {
                // User doesn't exist — create and log in (if under cap)
                const count = await db.getUserCount();
                if (count >= MAX_USERS) {
                    return res.status(400).json({ error: `User limit of ${MAX_USERS} reached. An admin must remove users first.` });
                }
                await db.addUser({ username: username.trim().toLowerCase(), password: await hashPassword(password) });
                sessionManager.createSession(res, username.trim().toLowerCase());
                return res.json({ ok: true });
            }
            if (!await isCorrectPassword(password, user.password)) {
                return res.status(401).json({ error: 'Incorrect password' });
            }
            sessionManager.createSession(res, user.username);
            res.json({ ok: true });
        } catch (err) {
            console.error('[POST /login]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.post('/signup', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        try {
            const existing = await db.getUser(username);
            if (existing) {
                return res.status(409).json({ error: 'Username already taken' });
            }
            const count = await db.getUserCount();
            if (count >= MAX_USERS) {
                return res.status(400).json({ error: `User limit of ${MAX_USERS} reached. An admin must remove users first.` });
            }
            await db.addUser({ username: username.trim().toLowerCase(), password: await hashPassword(password) });
            sessionManager.createSession(res, username.trim().toLowerCase());
            res.json({ ok: true });
        } catch (err) {
            console.error('[POST /signup]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.get('/app', sessionManager.middleware, (req, res) => {
        if (req.username && req.username.startsWith('guest_')) {
            return res.redirect('/login');
        }
        res.render('lobby');
    });

    router.get('/logout', (req, res) => {
        sessionManager.deleteSession(req);
        res.clearCookie('cpen322-session');
        res.redirect('/login');
    });

    router.get('/start', async (req, res) => {
        try {
            const anonymousUsername = `guest_${crypto.randomBytes(4).toString('hex')}`;
            sessionManager.createSession(res, anonymousUsername);

            const roomId = `temp_${crypto.randomBytes(4).toString('hex')}`;
            const tempRoom = {
                _id: roomId,
                name: `Room for ${anonymousUsername}`,
                image: 'client/assets/profile-icon.png',
            };
            messages[roomId] = [];
            await db.addRoom(tempRoom);

            sessionManager.initializeBotSession();

            const botGreeting = {
                roomId,
                text: `Hi ${anonymousUsername}! I'm your chat assistant. Say anything to get started!`,
                username: 'bot',
                isBot: true,
                sentiment: { label: 'POSITIVE', score: 0 },
            };
            messages[roomId].push(botGreeting);

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
                    client.send(JSON.stringify(botGreeting));
                }
            });

            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                res.json(tempRoom);
            } else {
                res.render('chatroom', { room: tempRoom, isDemo: true });
            }
        } catch (error) {
            console.error(`[ERROR] Error creating temporary room: ${error.message}`);
            res.status(500).send('Internal Server Error');
        }
    });

    router.get('/profile', sessionManager.middleware, (req, res) => {
        res.json({ username: req.username });
    });

    router.put('/profile', sessionManager.middleware, async (req, res) => {
        const { password, username: newUsername } = req.body;
        const currentUsername = req.username;
        if (!currentUsername) {
            return res.status(403).json({ message: 'Unauthorized!' });
        }
        try {
            let updateData;
            if (newUsername) {
                updateData = { username: newUsername.trim().toLowerCase() };
            } else if (password) {
                updateData = { password: await hashPassword(password) };
            } else {
                return res.status(400).json({ message: 'No update provided.' });
            }
            const updateStatus = await db.updateUserProfileByUsername(currentUsername, updateData);
            if (updateStatus.matchedCount === 0) {
                return res.status(404).json({ message: 'User not found.' });
            }
            sessionManager.deleteSession(req);
            res.clearCookie('cpen322-session');
            res.status(200).json({ message: 'Updated. Please log in again.' });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
};
