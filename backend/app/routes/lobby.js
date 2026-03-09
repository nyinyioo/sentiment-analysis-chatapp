import express from 'express';

const MAX_ROOMS = 20;

export default function(db, messages, sessionManager, parseCookies) {
    const router = express.Router();

    // Require a real (non-guest) authenticated user
    function requireAppUser(req, res, next) {
        sessionManager.middleware(req, res, (err) => {
            if (err) {
                return req.headers.accept?.includes('application/json')
                    ? res.status(401).json({ error: 'Unauthorized' })
                    : res.redirect('/login');
            }
            if (req.username.startsWith('guest_')) {
                return req.headers.accept?.includes('application/json')
                    ? res.status(403).json({ error: 'Access denied for demo users' })
                    : res.redirect('/login');
            }
            next();
        });
    }

    // List rooms — app users only; temp_ rooms excluded
    router.get('/chat', requireAppUser, async (req, res) => {
        try {
            const chatrooms = await db.getRooms();
            const chatroomsWithMessages = chatrooms
                .filter(room => !String(room._id).startsWith('temp_'))
                .map(room => ({
                    ...room,
                    messages: messages[room._id.toString()] || [],
                }));
            res.json(chatroomsWithMessages);
        } catch (error) {
            console.error('Error fetching chatrooms:', error);
            res.status(500).send('Internal Server Error');
        }
    });

    // Render chatroom — guests may only enter their own temp_ rooms
    router.get('/chat/:room_id', async (req, res) => {
        const roomId = req.params.room_id;
        const isTemp = roomId.startsWith('temp_');

        if (!isTemp) {
            // Real rooms: must be an authenticated non-guest user
            const cookieHeader = req.headers.cookie;
            const token = cookieHeader ? parseCookies(cookieHeader)['cpen322-session'] : null;
            const session = token ? sessionManager.sessions[token] : null;
            if (!session || session.username.startsWith('guest_')) {
                return res.redirect('/login');
            }
        }

        try {
            const room = await db.getRoom(roomId);
            if (room) {
                res.render('chatroom', { room, isDemo: isTemp });
            } else {
                res.status(404).send(`Room ${roomId} was not found`);
            }
        } catch (error) {
            console.error(`Error fetching room ${roomId}:`, error);
            res.status(500).send('Internal Server Error');
        }
    });

    // Load previous messages — app users only
    router.get('/chat/:room_id/messages', requireAppUser, async (req, res) => {
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

    // Create room — app users only
    router.post('/chat', requireAppUser, async (req, res) => {
        const { name, image } = req.body;
        if (!name) {
            return res.status(400).send({ error: 'Room name is required' });
        }
        try {
            const allRooms = await db.getRooms();
            const persistentRooms = allRooms.filter(r => !String(r._id).startsWith('temp_'));
            if (persistentRooms.length >= MAX_ROOMS) {
                return res.status(400).json({ error: `Room limit of ${MAX_ROOMS} reached. Delete a room first.` });
            }
            const addedRoom = await db.addRoom({ name, image });
            messages[addedRoom._id.toString()] = [];
            res.status(200).json(addedRoom);
        } catch (error) {
            console.error('Error adding room:', error);
            res.status(500).send('Internal Server Error');
        }
    });

    // Demo exit: delete all temp_ rooms and invalidate the guest session
    router.delete('/chat/demo-cleanup', async (req, res) => {
        const cookieHeader = req.headers.cookie;
        if (cookieHeader) {
            const token = parseCookies(cookieHeader)['cpen322-session'];
            if (token && sessionManager.sessions[token]) {
                delete sessionManager.sessions[token];
            }
        }
        try {
            const result = await db.deleteDemoRooms();
            Object.keys(messages).forEach(k => { if (k.startsWith('temp_')) delete messages[k]; });
            res.status(200).json({ deleted: result.deletedCount });
        } catch (err) {
            console.error('[ERROR] Failed to clean up demo rooms:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Delete room — app users only
    router.delete('/chat/:room_id', requireAppUser, async (req, res) => {
        const roomId = req.params.room_id;
        try {
            const room = await db.getRoom(roomId);
            if (!room) {
                return res.status(404).send({ error: `Room ${roomId} not found.` });
            }
            const deleteResult = await db.deleteRoom(roomId);
            if (deleteResult.deletedCount > 0) {
                delete messages[roomId];
                return res.status(200).send({ message: `Room ${roomId} deleted successfully.` });
            } else {
                return res.status(500).send({ error: `Failed to delete room ${roomId}.` });
            }
        } catch (error) {
            console.error(`[ERROR] Failed to delete room ${roomId}: ${error.message}`);
            return res.status(500).send({ error: 'Internal Server Error' });
        }
    });

    return router;
}
