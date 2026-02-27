# WebSockets — Real-Time Communication

## The Problem with Regular HTTP

With regular HTTP, communication is **request-response**:
1. Client asks the server something
2. Server responds
3. Connection closes

That's great for fetching a web page. But for a chat app? If you want to see new messages, you'd have to keep asking "any new messages?" every second — this is called **polling**, and it's wasteful.

**Long polling** improves this slightly — the client asks, the server holds the connection open until there's something to say, then responds and the client immediately asks again. Better, but still inefficient.

**WebSockets** solve this properly: establish a persistent, **bidirectional** connection. The server can push data to the client anytime without the client asking. Perfect for chat.

```
HTTP:    Client → Server (request)
         Client ← Server (response)
         [connection closed]

WS:      Client ↔ Server (open connection)
         Server → Client (push any time)
         Client → Server (push any time)
         [connection stays open]
```

---

## How WebSocket Connections Start (The Handshake)

WebSocket connections start as an HTTP request, then **upgrade** to the WebSocket protocol:

```
1. Client sends HTTP GET with headers:
   Upgrade: websocket
   Connection: Upgrade
   Sec-WebSocket-Key: <base64 key>

2. Server responds with:
   HTTP/1.1 101 Switching Protocols
   Upgrade: websocket
   Sec-WebSocket-Accept: <derived key>

3. From here on, the connection is a WebSocket — no more HTTP
```

This is why the project needs `http.createServer(app)` before attaching WebSockets — the upgrade from HTTP to WS needs to happen on the raw HTTP server, not Express.

---

## Server-Side WebSockets (`ws` library)

```js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server }); // attach to the HTTP server

wss.on('connection', function connection(ws, req) {
    // ws = this specific client's connection
    // req = the original HTTP upgrade request (has cookies!)

    ws.on('message', function incoming(message) {
        // message is a Buffer — JSON.parse it
        const data = JSON.parse(message);
        console.log(data);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});
```

`wss` = WebSocket **Server** (manages all connections)
`ws` = one specific WebSocket **connection** (one client)

---

## Session Validation in WebSocket Connections

HTTP routes are protected by `sessionManager.middleware`. But WebSocket connections don't go through Express middleware automatically — you have to manually validate the session in the `connection` handler:

```js
wss.on('connection', function connection(ws, req) {
    // The initial HTTP upgrade request still has cookies
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies['cpen322-session'];

    if (!sessionToken || !sessionManager.sessions[sessionToken]) {
        ws.close(1008, "Session invalid");  // 1008 = Policy Violation close code
        return;
    }

    // Attach username to the ws object for later use
    ws.username = sessionManager.sessions[sessionToken].username;
});
```

When you close with code `1008`, the client knows it was rejected for a policy reason (not a network error).

---

## Broadcasting — Room Filtering

`wss.clients` is a `Set` of ALL currently connected WebSocket clients across all rooms. Without filtering, every message would go to every user regardless of which room they're in — obviously wrong for a multi-room chat app.

The fix: track which room each client is in using a property on the `ws` object, then filter when broadcasting:

```js
// When a message arrives, record which room this client is in
ws.roomId = messageData.roomId;

// Broadcast ONLY to clients in the same room
wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.roomId === messageData.roomId) {
        client.send(JSON.stringify(messageData));
    }
});
```

You always check `readyState === WebSocket.OPEN` because some clients might be in the middle of connecting or disconnecting. Adding `client.roomId === messageData.roomId` means only the relevant room gets the message.

Since the frontend sends `roomId` in every message, the first message from a client sets `ws.roomId`. From that point on, all broadcasts are correctly scoped to that room.

WebSocket ready states:
- `0` = CONNECTING
- `1` = OPEN (the one you want)
- `2` = CLOSING
- `3` = CLOSED

---

## The Message Handler (`ws/handler.js`)

The core logic now lives in its own file, not mixed into `server.js`. It receives all its dependencies (db, messages buffer, session manager, etc.) via the factory function pattern:

```js
// ws/handler.js
module.exports = function(wss, db, messages, messageBlockSize, sessionManager, analyzeSentiment, parseCookies) {

    wss.on('connection', function(ws, req) {
        // Validate session on connect
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies['cpen322-session'];
        if (!token || !sessionManager.sessions[token]) {
            ws.close(1008, 'Session invalid');
            return;
        }
        ws.username = sessionManager.sessions[token].username;

        ws.on('message', (message) => handleMessage(ws, message));
    });

    async function handleMessage(ws, message) {
        const messageData = JSON.parse(message);
        if (!messageData.text || !messageData.roomId) return;

        // 1. Track which room this client is in (enables room filtering)
        ws.roomId = messageData.roomId;

        // 2. Analyze sentiment — HTTP call to FastAPI service (fast, model already loaded)
        const sentiment = await analyzeSentiment(messageData.text);
        messageData.sentiment = { label: sentiment.label, score: sentiment.score };

        // 3. Broadcast ONLY to clients in the same room
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.roomId === messageData.roomId) {
                client.send(JSON.stringify(messageData));
            }
        });

        // 4. Buffer in memory, persist when block is full
        messages[messageData.roomId].push(messageData);
        if (messages[messageData.roomId].length >= messageBlockSize) {
            await db.addConversation({ room_id: messageData.roomId, timestamp: Date.now(), messages: messages[messageData.roomId] });
            messages[messageData.roomId] = [];
        }

        // 5. Forward to Rasa, broadcast bot reply to same room
        const rasaResponse = await fetch('http://localhost:5005/webhooks/rest/webhook', {
            method: 'POST',
            body: JSON.stringify({ sender: messageData.roomId, message: messageData.text })
        });
        const rasaMessages = await rasaResponse.json();
        rasaMessages.forEach(msg => {
            const botMessage = { roomId: messageData.roomId, text: msg.text, username: 'bot', isBot: true };
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client.roomId === messageData.roomId) {
                    client.send(JSON.stringify(botMessage));
                }
            });
        });
    }
};
```

Key improvements over the original: single `wss.on('connection')` handler, room-filtered broadcasts, all logic isolated in one file with injected dependencies.

---

## Client-Side WebSockets

In `frontend/client/js/chatroom.js`:

```js
const socket = new WebSocket("ws://localhost:8000");

socket.onopen = () => {
    console.log("Connected to chatroom");
};

socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // Append to the DOM
    const elem = document.createElement("div");
    elem.textContent = `${message.username}: ${message.text}`;
    document.getElementById("message-list").appendChild(elem);
};

socket.onerror = (error) => {
    console.error("WebSocket error:", error);
};

// Sending a message
document.getElementById("send-message").addEventListener("click", () => {
    const text = document.getElementById("message-input").value.trim();
    if (text) {
        socket.send(JSON.stringify({ roomId, text }));
        document.getElementById("message-input").value = "";
    }
});
```

Both sending and receiving are simple: `socket.send(string)` and `socket.onmessage = handler`.

The browser has a built-in `WebSocket` class — no library needed client-side.

---

## Why WebSocket Messages Are Strings (Not Objects)

The WebSocket protocol sends raw bytes (or text). It doesn't understand JavaScript objects. So you have to serialize:

```js
// Sending: object → string
socket.send(JSON.stringify({ roomId: "abc", text: "hello" }));

// Receiving: string → object
const data = JSON.parse(event.data);
```

This is why every message handler does `JSON.parse()` on incoming data.

---

## Connection Management — What Can Go Wrong

**Client disconnects without telling you** — network drops, browser tab closes. The server won't know immediately. This is why you check `readyState === WebSocket.OPEN` before sending.

**Server sends to a closing client** — `ws.send()` will throw if the connection is gone. Always check `readyState` first, or wrap in try/catch.

**Room filtering is implemented** — `ws.roomId` is set on the first message from each client, and all broadcasts check `client.roomId === messageData.roomId`. Each WebSocket connection is scoped to one room.

---

## WebSocket vs. Socket.io

Socket.io is a popular library that wraps WebSockets and adds:
- Automatic reconnection
- Room/namespace support
- Fallback to polling for old browsers

This project uses the raw `ws` library — simpler, less magic, good for learning what's actually happening. Socket.io abstracts away the details that are useful to understand.

---

## The "ws://localhost:8000" Thing

Notice the client connects to port 8000, but the server runs on 3001. This is likely a proxy (like ngrok or a dev tunnel) forwarding port 8000 → 3001. In production you'd want a single consistent URL. The `ngrok_ws.log` file in the root confirms ngrok is being used to expose the app.
