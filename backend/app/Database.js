import { MongoClient, ObjectId } from 'mongodb';

function Database(mongoUrl, dbName) {
    if (!(this instanceof Database)) return new Database(mongoUrl, dbName);

    this.connected = new Promise((resolve, reject) => {
        const client = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });

        client.connect()
            .then(() => {
                console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
                resolve(client.db(dbName));
            })
            .catch((err) => {
                console.error('[MongoClient] Connection failed', err);
                reject(err);
            });
    });

    this.status = () => this.connected.then(
        db => ({ error: null, url: mongoUrl, db: dbName }),
        err => ({ error: err })
    );
}

Database.prototype.getRooms = function() {
    return this.connected.then(db =>
        db.collection('chatrooms').find({}).toArray()
    );
};

Database.prototype.getRoom = async function(room_id) {
    if (typeof room_id !== 'string' && !(room_id instanceof ObjectId)) {
        return Promise.reject(new Error('Invalid room_id: must be a string'));
    }
    let id = ObjectId.isValid(room_id) ? new ObjectId(room_id) : String(room_id);
    return this.connected.then(db => db.collection('chatrooms').findOne({ _id: id }));
};

Database.prototype.addRoom = function(room) {
    if (!room.name) {
        console.error("Error: Room name required");
        return Promise.reject(new Error("Room name required"));
    }
    room.image = room.image || 'assets/everyone-icon.png';
    return this.connected.then(db =>
        db.collection('chatrooms').insertOne(room).then(result => {
            let insertedId = ObjectId.isValid(result.insertedId) ? new ObjectId(result.insertedId) : result.insertedId;
            return db.collection('chatrooms').findOne({ _id: insertedId });
        })
    );
};

Database.prototype.addConversation = function(conversation) {
    if (!conversation.room_id || !Array.isArray(conversation.messages) || typeof conversation.timestamp !== 'number') {
        console.error("Error: Invalid Conversation fields");
        return Promise.reject(new Error("Invalid Conversation fields"));
    }
    // Normalize room_id to ObjectId when possible so queries always match
    if (ObjectId.isValid(conversation.room_id)) {
        conversation.room_id = new ObjectId(conversation.room_id);
    }
    conversation.messages.forEach(msg => {
        msg.sentiment = msg.sentiment || 0;
    });
    return this.connected.then(db =>
        db.collection('conversations').insertOne(conversation).then(result => {
            return db.collection('conversations').findOne({ _id: new ObjectId(result.insertedId) });
        })
    );
};


Database.prototype.getLastConversation = function(room_id, before = Date.now()) {
    let id = ObjectId.isValid(room_id) ? new ObjectId(room_id) : room_id;
    return this.connected.then(db =>
        db.collection('conversations')
            .find({ room_id: id, timestamp: { $lt: before } })
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray()
            .then(conversations => conversations[0] || null)
    );
};

Database.prototype.getUser = function(username) {
    if (typeof username !== 'string') {
        return Promise.reject(new Error('Invalid username: must be a string'));
    }
    console.log("[Database.getUser] Querying for username:", username);
    return this.connected.then(db =>
        db.collection('users').findOne({ username: username.trim().toLowerCase() }).then(user => {
            console.log("[Database.getUser] Query result:", user);
            return user;
        })
    );
};

Database.prototype.getUserCount = function() {
    return this.connected.then(db =>
        db.collection('users').countDocuments()
    );
};

Database.prototype.addUser = function(user) {
    return this.connected.then(db =>
        db.collection('users').insertOne(user)
    );
};

Database.prototype.updateUserProfileByUsername = function(username, updateData) {
    return this.connected.then(db =>
        db.collection('users').updateOne({ username: username }, { $set: updateData })
    );
};

Database.prototype.getRoomByName = function(roomName) {
    return this.connected.then(db =>
        db.collection('chatrooms').findOne({ name: roomName })
    );
};

Database.prototype.deleteRoom = function(roomId) {
    let id = ObjectId.isValid(roomId) ? new ObjectId(roomId) : roomId;
    return this.connected.then(db =>
        db.collection('chatrooms').deleteOne({ _id: id })
    );
};

Database.prototype.deleteDemoRooms = function() {
    return this.connected.then(db =>
        db.collection('chatrooms').deleteMany({ _id: { $regex: /^temp_/ } })
    );
};


// Whisper: a private message between a user and the room assistant
// Stored in the `whispers` collection, keyed by (room_id, username).
function normalizeRoomId(room_id) {
    return ObjectId.isValid(room_id) ? new ObjectId(room_id) : room_id;
}


// Default per-user settings for whisper memory.
// remember: kept until you clear them
// session: deleted when you leave the room
export const DEFAULT_USER_SETTINGS = { whisperMemory: 'session' };
export const WHISPER_MEMORY_MODES = ['remember', 'session'];

Database.prototype.addWhisper = function(whisper) {
    if (!whisper?.room_id || typeof whisper.username !== 'string' ||
        typeof whisper.query !== 'string' || typeof whisper.reply !== 'string') {
        return Promise.reject(new Error('Invalid whisper fields'));
    }
    const doc = {
        room_id: normalizeRoomId(whisper.room_id),
        username: whisper.username,
        ts: typeof whisper.ts === 'number' ? whisper.ts : Date.now(),
        text: typeof whisper.text === 'string' ? whisper.text : whisper.query,
        query: whisper.query,
        reply: whisper.reply,
        shared_at: null,
    };
    return this.connected.then(db =>
        db.collection('whispers').insertOne(doc).then(result =>
            db.collection('whispers').findOne({ _id: result.insertedId })
        )
    );
};

// Get the last `limit` whispers of a user in a room, oldest first.
Database.prototype.getWhispers = function(room_id, username, limit = 50) {
    if (typeof username !== 'string') {
        return Promise.reject(new Error('Invalid username: must be a string'));
    }
    return this.connected.then(db =>
        db.collection('whispers')
            .find({ room_id: normalizeRoomId(room_id), username })
            .sort({ ts: -1 })
            .limit(limit)
            .toArray()
            .then(rows => rows.reverse())
    );
};

// Delete a user's whispers in one room, or everywhere when room_id is omitted.
Database.prototype.deleteWhispers = function(username, room_id) {
    if (typeof username !== 'string') {
        return Promise.reject(new Error('Invalid username: must be a string'));
    }
    const filter = { username };
    if (room_id) filter.room_id = normalizeRoomId(room_id);
    return this.connected.then(db => db.collection('whispers').deleteMany(filter));
};


// Mark a whisper as shared to the group. Only the owner can mark it.
Database.prototype.markWhisperShared = function(id, username) {
    if (!ObjectId.isValid(id) || typeof username !== 'string') {
        return Promise.reject(new Error('Invalid whisper id or username'));
    }
    return this.connected.then(db =>
        db.collection('whispers').updateOne(
            { _id: new ObjectId(id), username },
            { $set: { shared_at: Date.now() } }
        )
    );
};

Database.prototype.getUserSettings = function(username) {
    if (typeof username !== 'string') {
        return Promise.reject(new Error('Invalid username: must be a string'));
    }
    return this.connected.then(db =>
        db.collection('users')
            .findOne({ username: username.trim().toLowerCase() }, { projection: { settings: 1 } })
            .then(user => ({ ...DEFAULT_USER_SETTINGS, ...(user?.settings || {}) }))
    );
};

Database.prototype.updateUserSettings = function(username, settings) {
    if (typeof username !== 'string') {
        return Promise.reject(new Error('Invalid username: must be a string'));
    }
    const $set = {};
    if (settings?.whisperMemory !== undefined) {
        if (!WHISPER_MEMORY_MODES.includes(settings.whisperMemory)) {
            return Promise.reject(new Error('Invalid whisperMemory value'));
        }
        $set['settings.whisperMemory'] = settings.whisperMemory;
    }
    if (Object.keys($set).length === 0) {
        return Promise.reject(new Error('No settings provided'));
    }
    return this.connected.then(db =>
        db.collection('users').updateOne({ username: username.trim().toLowerCase() }, { $set })
    );
};

export default Database;
