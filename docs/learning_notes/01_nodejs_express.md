# Node.js & Express — The Backend Fundamentals

## What Even Is A Node.js?

JavaScript was built to run in a browser. Node.js took that same engine (V8, from Chrome) and said "what if we ran JS on a server?" So Node is just **JavaScript that runs on your machine**, not in a browser.

The huge thing about Node is it's **non-blocking / event-driven**. Normal servers (like old PHP) spin up a new thread for every request. Threads are expensive. Node instead uses a **single thread with an event loop** — when it's waiting for a database, it doesn't sit there doing nothing, it handles other requests and comes back when the DB responds.

---

## What Is Express?

Node can handle HTTP requests natively, but the raw API is painful to use. Express is a minimal framework that makes it way easier:

- Define **routes** (what URL triggers what code)
- Use **middleware** (functions that run on every request, or certain requests)
- Send **responses** easily (JSON, HTML, files)

```js
// Without Express (Node only) — painful
http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200);
    res.end('Hello');
  }
});

// With Express — clean
app.get('/', (req, res) => res.send('Hello'));
```

---

## How This Project Uses Express

From `server.js`:
```js
const express = require('express');
const app = express();
const server = http.createServer(app); // Wrap Express in a Node HTTP server
                                       // (needed for WebSocket to share the same port)
```

Why wrap it in `http.createServer`? Because the `ws` library attaches to the raw HTTP server, not Express directly. Both Express (HTTP) and WebSocket share port 3001 this way.

---

## Modular Routing — The Factory Function Pattern

When `server.js` was a 400-line god file, everything was crammed into one place. The refactored version splits routes into dedicated modules. Since each module needs access to shared dependencies (the database, session manager, etc.), a **factory function** pattern is used:

```js
// routes/lobby.js — exported as a function, not a router directly
module.exports = function(db, messages) {
    const router = express.Router();

    router.get('/chat', async (req, res) => {
        const rooms = await db.getRooms();
        res.json(rooms);
    });

    router.post('/chat', async (req, res) => { ... });

    return router; // caller mounts this
};
```

In `server.js`:
```js
// Pass dependencies in, get a configured router back
app.use('/lobby', require('./routes/lobby')(db, messages));
app.use('/',      require('./routes/auth')(db, sessionManager, hashPassword, ...));
```

This is **dependency injection** — modules don't import globals, they receive what they need as arguments. This makes them:
- Easier to test (pass in a mock db)
- Easier to reason about (no hidden global state)
- Reusable in different contexts

The same pattern is used for the WebSocket handler in `ws/handler.js`.

---

## The Middleware Stack

Middleware is just a function that runs between a request coming in and a response going out. They all have the signature `(req, res, next)` — call `next()` to pass to the next middleware, or send a response to end the chain.

```js
// Every request goes through these in order:
app.use(express.json({ limit: '10kb' }));   // Parse JSON bodies (cap at 10kb to prevent DoS)
app.use(cors());                             // Allow cross-origin requests
app.use(morgan('dev'));                      // Log every request to console
app.use(nonceMiddleware);                   // Generate a CSP nonce for each request
app.use(helmetMiddleware());                // Set security headers
```

Think of middleware as an assembly line. Each station (middleware) processes the request and either passes it along or rejects it.

**Order matters.** If you put `cors()` after your routes, it won't apply to those routes.

---

## Routing

Routes define what happens when someone hits a specific URL with a specific HTTP method.

```js
// HTTP Methods map to CRUD operations
app.get('/lobby/chat', ...)          // READ — fetch all chatrooms
app.get('/lobby/chat/:room_id', ...) // READ — fetch one chatroom
app.post('/lobby/chat', ...)         // CREATE — add a room
app.delete('/lobby/chat/:room_id', ...) // DELETE — remove a room
app.put('/profile', ...)             // UPDATE — change password
```

### Route Parameters

`:room_id` in the path is a **route parameter** — a dynamic segment you can grab with `req.params`:

```js
app.get('/lobby/chat/:room_id', async (req, res) => {
    const roomId = req.params.room_id; // grabbed from the URL
    const room = await db.getRoom(roomId);
    // ...
});
```

### Query Strings

The `?before=1234567890` part of a URL is a **query string** — grabbed with `req.query`:

```js
app.get('/lobby/chat/:room_id/messages', async (req, res) => {
    const before = req.query.before ? parseInt(req.query.before, 10) : Date.now();
    // used for pagination — "give me messages before this timestamp"
});
```

---

## Request & Response Objects

`req` = the incoming request. Has:
- `req.params` — URL route params (`:id`)
- `req.query` — query string (`?foo=bar`)
- `req.body` — parsed request body (from `express.json()`)
- `req.headers` — HTTP headers (cookies live here)
- `req.username` — custom property added by session middleware

`res` = the outgoing response. Has:
- `res.json(data)` — send JSON, sets Content-Type automatically
- `res.send(text)` — send text/HTML
- `res.render('chatroom', { room })` — render an EJS template
- `res.status(404).send('Not found')` — set status code + body
- `res.redirect('/login')` — tell browser to go somewhere else
- `res.cookie(name, value, options)` — set a cookie

---

## EJS Templating

This project uses **EJS (Embedded JavaScript)** to render HTML on the server. EJS templates live in `frontend/views/`.

```js
app.set('view engine', 'ejs');
app.set('views', VIEWS_PATH);

// Renders chatroom.ejs with { room } available as a template variable
res.render('chatroom', { room });
```

In the template:
```html
<!-- chatroom.ejs -->
<input type="hidden" id="room-id" value="<%= room._id %>">
<h1><%= room.name %></h1>
```

`<%= ... %>` outputs escaped HTML. `<%- ... %>` outputs raw (unescaped) HTML.

Server-side rendering (SSR) vs. client-side rendering (CSR): Here the initial page is rendered on the server (SSR), but then real-time updates happen client-side via WebSockets.

---

## Static Files

```js
app.use(express.static(CLIENT_PATH));
```

This tells Express: "for any request, check if a matching file exists in `frontend/client/` and serve it." This is how `chatroom.js`, CSS files, and images get to the browser without explicit routes for each file.

---

## Error Handling Middleware

Regular middleware has 3 params `(req, res, next)`. Error handling middleware has 4 `(err, req, res, next)`:

```js
app.use(function (err, req, res, next) {
    if (err instanceof SessionManager.Error) {
        // Session errors: redirect to login or return 401
        if (req.headers.accept?.includes('application/json')) {
            res.status(401).json({ error: err.message });
        } else {
            res.redirect('/login');
        }
    } else {
        res.status(500).send('Internal Server Error');
    }
});
```

When `next(error)` is called anywhere, Express skips all normal middleware and jumps straight to this error handler.

---

## Async/Await in Routes

Most routes hit the database, which is async. Use `async/await` and wrap in try/catch:

```js
app.get('/lobby/chat', async (req, res) => {
    try {
        const chatrooms = await db.getRooms();
        res.json(chatrooms);
    } catch (error) {
        console.error('Error fetching chatrooms:', error);
        res.status(500).send('Internal Server Error');
    }
});
```

If you forget the `try/catch` in an async route, an unhandled promise rejection will crash Node (in older versions) or just hang the request.

---

## HTTP Status Codes

| Code | Meaning | When Used Here |
|------|---------|----------------|
| 200 | OK | Success (GET, POST success) |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | No valid session |
| 403 | Forbidden | You're logged in but not allowed |
| 404 | Not Found | Room/resource doesn't exist |
| 500 | Internal Server Error | Something crashed on the server |

---

## The `dotenv` Library

Secrets like database passwords shouldn't be hardcoded. They go in `.env`:

```
MONGO_URI=mongodb://user:pass@localhost:27017/mydb
OPENAI_API_KEY=sk-...
```

```js
require('dotenv').config(); // loads .env into process.env
const mongoUri = process.env.MONGO_URI;
```

The `.env` file is in `.gitignore` so it never gets pushed to GitHub. The `.env.example` file shows what variables are needed without exposing actual values.

---

## Promises & the Event Loop (First Principles)

JavaScript is single-threaded, but it can do async work via the **event loop**:

1. You call `db.getRooms()` — this starts a network request to MongoDB
2. Instead of freezing, Node registers a callback and moves on
3. When MongoDB responds, that callback goes into the **task queue**
4. The event loop picks it up when the call stack is empty

`Promise` is the modern way to handle async:
```js
// Old way (callback hell)
db.getRooms(function(err, rooms) {
    if (err) { ... }
    rooms.forEach(function(room) { ... });
});

// New way (Promise chain)
db.getRooms()
  .then(rooms => rooms.forEach(...))
  .catch(err => console.error(err));

// Even cleaner (async/await — syntactic sugar over Promises)
const rooms = await db.getRooms();
```

Under the hood, `await` is just `.then()` with nicer syntax. Both compile to the same thing.
