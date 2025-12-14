const { MongoClient, ObjectId } = require('mongodb'); 

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
    let id = ObjectId.isValid(room_id) ? new ObjectId(room_id) : room_id;
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
            return db.collection('chatrooms').findOne({ _id: result.insertedId });
        })
    );
};

Database.prototype.addConversation = function(conversation) {
    if (!conversation.room_id || !Array.isArray(conversation.messages) || typeof conversation.timestamp !== 'number') {
        console.error("Error: Invalid Conversation fields");
        return Promise.reject(new Error("Invalid Conversation fields"));
    }
    conversation.messages.forEach(msg => {
        msg.sentiment = msg.sentiment || 0; 
    });
    return this.connected.then(db =>
        db.collection('conversations').insertOne(conversation).then(result => {
            return db.collection('conversations').findOne({ _id: result.insertedId });
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
    console.log("[Database.getUser] Querying for username:", username);
    return this.connected.then(db =>
        db.collection('users').findOne({ username: username.trim().toLowerCase() }).then(user => {
            console.log("[Database.getUser] Query result:", user);
            return user; 
        })
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
module.exports = Database;
