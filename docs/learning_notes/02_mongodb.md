# MongoDB — The Database Layer

## SQL vs NoSQL — Why MongoDB?

Traditional databases (MySQL, PostgreSQL) are **relational** — data lives in tables with strict schemas (columns defined upfront). Relations between tables use foreign keys.

**MongoDB is a NoSQL document database.** Instead of rows in tables, you store **documents** (basically JSON objects) in **collections**. No fixed schema — each document can have different fields.

When would you pick MongoDB?
- Data is naturally document-shaped (a chat message with nested sentiment data)
- Schema might change a lot during development
- You don't need complex multi-table JOINs
- Horizontal scaling matters (MongoDB shards easily)

When would you stick with SQL?
- Strict data integrity requirements
- Complex relationships between entities
- Transactions across multiple entities (though MongoDB supports this now)

For this chat app, documents like `{ room_id, timestamp, messages: [...] }` map naturally to MongoDB. No need for JOIN-ing a `rooms` table to a `messages` table.

---

## Core Concepts

### Collections = Tables
```
MongoDB             SQL equivalent
----------          --------------
Collection    →     Table
Document      →     Row
Field         →     Column
_id           →     Primary Key
```

This project uses 3 collections:
- `chatrooms` — each room has `{ _id, name, image }`
- `conversations` — `{ _id, room_id, timestamp, messages: [...] }`
- `users` — `{ _id, username, password }`

### Documents = JSON objects
MongoDB stores **BSON** (Binary JSON) internally, but you interact with it as regular JS objects:
```js
{
  _id: ObjectId("64a1b2c3d4e5f6789012345"),
  name: "Minecraft Fans",
  image: "assets/minecraft.jpg"
}
```

### ObjectId
MongoDB auto-generates a unique `_id` for every document. It's a 12-byte value encoded as a hex string. It contains a timestamp, so you can sort by creation time using `_id` alone.

```js
const { ObjectId } = require('mongodb');

// Check if a string is a valid ObjectId before using it
let id = ObjectId.isValid(room_id) ? new ObjectId(room_id) : room_id;
```

Always do this check before querying, because if you pass a random string where MongoDB expects an ObjectId, it'll either throw or silently return nothing.

---

## The Database.js Abstraction

Instead of MongoDB calls scattered everywhere, the project wraps everything in a `Database` class. This is the **data access layer (DAL)** pattern — your routes don't know or care how data is stored, they just call methods.

```js
function Database(mongoUrl, dbName) {
    if (!(this instanceof Database)) return new Database(mongoUrl, dbName);

    this.connected = new Promise((resolve, reject) => {
        const client = new MongoClient(mongoUrl);
        client.connect()
            .then(() => resolve(client.db(dbName)))  // resolves to the db object
            .catch(reject);
    });
}
```

`this.connected` is a **Promise** that resolves to the MongoDB database handle. Every method chains off it:

```js
Database.prototype.getRooms = function() {
    return this.connected.then(db =>
        db.collection('chatrooms').find({}).toArray()
    );
};
```

The pattern: `this.connected.then(db => db.collection('...').someOperation())`.

One nice thing: even if a method is called before the connection fully establishes, the Promise chain will wait. You don't have to manually check "am I connected yet?"

---

## CRUD Operations in This Project

### Create (Insert)

```js
// Insert a new chat room
Database.prototype.addRoom = function(room) {
    if (!room.name) {
        return Promise.reject(new Error("Room name required"));
    }
    room.image = room.image || 'assets/everyone-icon.png'; // default value

    return this.connected.then(db =>
        db.collection('chatrooms')
          .insertOne(room)              // insert the document
          .then(result =>
            db.collection('chatrooms')
              .findOne({ _id: result.insertedId })  // re-fetch to get the full doc
          )
    );
};
```

Why re-fetch after insert? Because `insertOne` only returns metadata (like `insertedId`). To get the full document with all MongoDB-generated fields, you query for it.

### Read (Find)

```js
// Find ALL rooms
db.collection('chatrooms').find({}).toArray()

// Find ONE by _id
db.collection('chatrooms').findOne({ _id: id })

// Find with filter + sort + limit (pagination)
db.collection('conversations')
    .find({ room_id: id, timestamp: { $lt: before } })  // $lt = less than
    .sort({ timestamp: -1 })  // -1 = descending
    .limit(1)
    .toArray()
```

MongoDB query operators:
- `$lt` — less than
- `$gt` — greater than
- `$lte`, `$gte` — less/greater than or equal
- `$in` — value in array
- `$ne` — not equal

### Update

```js
// Update specific fields (doesn't replace the whole document)
db.collection('users').updateOne(
    { username: username },   // filter: find this user
    { $set: updateData }      // $set: only update these fields
)
```

`$set` is critical — without it, you'd **replace** the entire document with just `updateData`, wiping out everything else.

### Delete

```js
db.collection('chatrooms').deleteOne({ _id: id })
// Returns { deletedCount: 1 } on success, { deletedCount: 0 } if not found
```

---

## The Conversation / Message Block Pattern

This is a clever performance optimization. Instead of saving every single message individually (which would be thousands of writes), messages are buffered **in memory** and only saved when a block of 10 is reached:

```js
// In-memory buffer (lost on server restart, but fast)
let messages = {};  // { roomId: [msg1, msg2, ...] }

// When a new message arrives:
messages[roomId].push(messageData);

// When buffer hits 10:
if (messages[roomId].length >= messageBlockSize) {
    await db.addConversation({
        room_id: roomId,
        timestamp: Date.now(),
        messages: messages[roomId]
    });
    messages[roomId] = []; // clear the buffer
}
```

Schema for a conversation document:
```js
{
    _id: ObjectId("..."),
    room_id: ObjectId("..."),
    timestamp: 1700000000000,   // Unix timestamp (ms)
    messages: [
        { username: "alice", text: "hey", sentiment: { label: "POSITIVE", score: 0.9 } },
        { username: "bob", text: "sup", sentiment: { label: "NEUTRAL", score: 0.5 } },
        // ... up to 10
    ]
}
```

Fetching the most recent conversation before a given time (for "load more" / infinite scroll):
```js
Database.prototype.getLastConversation = function(room_id, before = Date.now()) {
    return this.connected.then(db =>
        db.collection('conversations')
            .find({ room_id: id, timestamp: { $lt: before } })
            .sort({ timestamp: -1 })  // newest first
            .limit(1)                 // just the most recent one
            .toArray()
            .then(conversations => conversations[0] || null)
    );
};
```

---

## Users Collection & Username Normalization

```js
Database.prototype.getUser = function(username) {
    return this.connected.then(db =>
        db.collection('users').findOne({
            username: username.trim().toLowerCase()  // normalize before querying
        })
    );
};
```

Always normalize usernames (trim whitespace, lowercase) before storing AND querying. Otherwise "Alice", "alice", " alice " would all be treated as different users.

---

## Docker + MongoDB

In development, MongoDB runs in a Docker container (see `docker/docker-compose.yml`). On first start, it runs the init scripts:

- `initdb.mongo` — creates the database and seed chatrooms
- `initUsers.mongo` — creates test users with hashed passwords

```yaml
volumes:
  - ./initdb.mongo:/docker-entrypoint-initdb.d/initdb.mongo
  - ./initUsers.mongo:/docker-entrypoint-initdb.d/initUsers.mongo
```

Files placed in `/docker-entrypoint-initdb.d/` get run automatically on first container start. This is how the database comes pre-populated.

Connection string:
```
mongodb://iyn_nimda:<password>@172.23.96.1:27017/cpen322-messenger?authSource=admin
```
- `iyn_nimda` = username
- `172.23.96.1` = WSL2 host IP (bridge to Windows Docker)
- `27017` = default MongoDB port
- `cpen322-messenger` = database name
- `authSource=admin` = authenticate against the admin database

---

## In-Memory vs Persistent Storage

A key design choice in this app: **recent messages are in-memory, older ones in MongoDB**.

| | In-Memory (`messages` object) | MongoDB |
|---|---|---|
| Speed | Instant | Network round-trip |
| Persistence | Lost on restart | Permanent |
| What's stored | Last <10 messages per room | Blocks of 10+ |
| Use case | Real-time display | Load history |

Trade-off: you lose the last few messages if the server crashes before a block is saved. For a production system, you'd want Redis or a message queue. For a course project, this is fine.

---

## Prototype-Based OOP in JavaScript

Notice `Database.prototype.getRooms = function() {...}`. This is JavaScript's **prototype-based inheritance** — older pattern before ES6 classes.

It's equivalent to:
```js
class Database {
    getRooms() { ... }
    getRoom() { ... }
}
```

Methods on the prototype are shared across all instances (memory efficient). Each instance has its own `this.connected` property.

The `if (!(this instanceof Database)) return new Database(mongoUrl, dbName)` guard lets you call `Database(url)` without `new` and still get an instance back. Defensive programming for callers who forget `new`.
