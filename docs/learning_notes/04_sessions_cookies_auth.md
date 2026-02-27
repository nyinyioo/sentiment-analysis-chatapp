# Sessions, Cookies & Authentication

## The Fundamental Problem: HTTP Is Stateless

HTTP was designed to be stateless — each request is independent. The server has no memory of you. If you load a page, then load another page, the server treats these as two completely separate requests from a complete stranger.

So how does the server know you're still logged in on the second request? Two main approaches:

1. **Session tokens (cookies)** — server stores your session, gives you a token, you send that token with every request
2. **JWT (JSON Web Tokens)** — server gives you a self-contained signed token with your identity baked in; no server storage needed

This project uses **session tokens stored in cookies**. Let's break that down.

---

## Cookies — The Delivery Mechanism

A **cookie** is just a small piece of data the server tells the browser to store and automatically send back with every request.

Server sets a cookie:
```js
res.cookie("cpen322-session", token, {
    maxAge: 600000,       // expires after 10 minutes (in milliseconds)
    httpOnly: true,       // JS in the browser CAN'T read this cookie (XSS protection)
    secure: process.env.NODE_ENV === 'production',  // only send over HTTPS in prod
    path: '/'             // valid for all paths
});
```

Browser automatically sends back:
```
Cookie: cpen322-session=a3f8c2d1e4b7...
```

On every subsequent request, that cookie header is there. The server just has to read it.

---

## SessionManager — How Sessions Work Here

From `SessionManager.js`:

```js
function SessionManager() {
    const CookieMaxAgeMs = 600000;  // 10 minutes
    this.sessions = {};  // { token: { username, createdAt, maxAge } }
```

`this.sessions` is an **in-memory dictionary**. Keys are random tokens, values are session objects. It lives in RAM — wiped on server restart. (For production you'd use Redis or a database.)

### Creating a Session

```js
this.createSession = function(response, username, maxAge = CookieMaxAgeMs) {
    // 1. Generate a cryptographically random token
    const token = crypto.randomBytes(32).toString('hex');
    // 32 bytes * 2 (hex chars per byte) = 64 char string

    // 2. Store session data server-side
    const session = { username, createdAt: Date.now(), maxAge };
    this.sessions[token] = session;

    // 3. Send token to browser as a cookie
    response.cookie("cpen322-session", token, { maxAge, httpOnly: true, ... });

    // 4. Auto-delete after expiry
    setTimeout(() => {
        delete this.sessions[token];
    }, maxAge);

    return token;
};
```

The token is just a random identifier. It doesn't contain any user info — it's just a key that maps to user info stored on the server. This is why session-based auth is **stateful** (server must store sessions).

### Why `crypto.randomBytes` and Not `Math.random()`?

`Math.random()` is not cryptographically secure — patterns can be predicted. `crypto.randomBytes()` uses the OS's secure random number generator. If an attacker could predict your session token, they could impersonate any user.

32 bytes = `2^256` possibilities. Even if someone tries a billion tokens per second, they'd need longer than the age of the universe to guess one. Good enough.

---

## Session Middleware

Every protected route runs through this middleware first:

```js
this.middleware = (req, res, next) => {
    // 1. Get the cookie header
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
        return next(new SessionError("Cookie header not found"));
    }

    // 2. Parse cookies manually (no library)
    // "cpen322-session=abc123; other=value" → [{name, value}, ...]
    const cookies = cookieHeader.split(';').map(cookie => {
        const parts = cookie.split('=');
        return { name: parts[0].trim(), value: parts[1]?.trim() };
    });

    // 3. Find the session cookie
    const sessionCookie = cookies.find(c => c.name === "cpen322-session");
    if (!sessionCookie) {
        return next(new SessionError("Session cookie not found"));
    }

    // 4. Look up the session
    const session = this.sessions[sessionCookie.value];
    if (!session) {
        next(new SessionError("Session not found"));
        return;
    }

    // 5. Attach username to request (now available in the route handler)
    req.session = sessionCookie.value;
    req.username = session.username;

    next();  // continue to the actual route handler
};
```

Use it on routes that require authentication:
```js
app.get('/profile', sessionManager.middleware, (req, res) => {
    res.json({ username: req.username });  // req.username set by middleware
});
```

---

## Password Hashing — Never Store Plaintext

If your database gets hacked and passwords are stored as plaintext, every user's account everywhere is compromised (people reuse passwords).

**Hash functions** are one-way — easy to compute forward, impossible to reverse. `sha256("password123")` always gives the same output, but you can't go from the hash back to "password123".

But wait — if everyone who uses "password123" has the same hash, attackers can use **rainbow tables** (precomputed hash → password lookup tables). Enter **salting**.

### Salt + Hash

```js
function hashPassword(plaintextPassword) {
    // 1. Generate a random 10-byte hex string (20 chars) as the salt
    const salt = crypto.randomBytes(10).toString('hex');

    // 2. Combine salt + password
    const saltedPassword = plaintextPassword + salt;

    // 3. Hash the combination
    const hash = crypto.createHash('sha256').update(saltedPassword).digest('base64');

    // 4. Store salt + hash together (first 20 chars = salt, rest = hash)
    return salt + hash;
}
```

### Verifying a Password

```js
function isCorrectPassword(plaintextPassword, storedSaltedHash) {
    // 1. Extract salt from stored value (first 20 chars)
    const salt = storedSaltedHash.substring(0, 20);
    const storedBase64Hash = storedSaltedHash.substring(20);

    // 2. Decode stored hash from base64 to hex
    const storedHash = Buffer.from(storedBase64Hash, 'base64').toString('hex');

    // 3. Re-hash the provided password with the same salt
    const hashToCheck = crypto.createHash('sha256')
                               .update(plaintextPassword + salt)
                               .digest('hex');

    // 4. Compare (must use same encoding — both hex here)
    return hashToCheck === storedHash;
}
```

The salt is different for every user, so even if two users have the same password, their stored hashes look completely different. Rainbow tables become useless.

**Note:** For production, prefer `bcrypt` or `argon2` over SHA-256 + manual salt. These are specifically designed for password hashing (deliberately slow, making brute-force attacks harder). But SHA-256 + salt is fine for learning.

---

## The Bot Session

The bot also gets a session — interesting design choice:

```js
this.initializeBotSession = function() {
    const botToken = crypto.randomBytes(32).toString('hex');
    const botSession = { username: "bot", createdAt: Date.now(), isBot: true };
    this.sessions[botToken] = botSession;
    return botToken;
};
```

Key difference from user sessions: **no auto-delete timer**. The bot's session never expires. This makes sense — the bot is always "logged in."

---

## Session Errors — Custom Error Classes

```js
class SessionError extends Error {}
// ...
SessionManager.Error = SessionError;
```

Creating a custom error class lets you check **what kind of error** occurred:

```js
// In the error handler:
if (err instanceof SessionManager.Error) {
    // It's an auth error — redirect to login
    res.redirect('/login');
} else {
    // It's some other crash
    res.status(500).send('Internal Server Error');
}
```

`instanceof` only works if you have a reference to the constructor. Attaching it as `SessionManager.Error` means callers can do `new SessionManager.Error("msg")` and check `err instanceof SessionManager.Error` without importing the class separately.

---

## Anonymous Users — Guest Sessions

When someone visits `/start` without logging in:

```js
app.get('/start', async (req, res) => {
    // Create a guest username like "guest_a3f8c2d1"
    const anonymousUsername = `guest_${crypto.randomBytes(4).toString("hex")}`;
    sessionManager.createSession(res, anonymousUsername);

    // Create a temporary room just for them
    const roomId = `temp_${crypto.randomBytes(4).toString("hex")}`;
    await db.addRoom({ _id: roomId, name: `Room for ${anonymousUsername}`, ... });
});
```

This lets users try the app without registering. Their room is ephemeral — if the server restarts, the session is gone.

---

## Security Considerations

**httpOnly cookies**: Setting `httpOnly: true` means the cookie cannot be read by JavaScript running in the page (`document.cookie` won't show it). This prevents XSS attacks from stealing session tokens.

**secure flag**: `secure: true` means the cookie is only sent over HTTPS. In development this is `false` because localhost doesn't have HTTPS.

**Session fixation**: An attacker tries to set your session cookie to a token they know, then waits for you to authenticate. Mitigation: always generate a new token on login, never reuse tokens.

**CSRF (Cross-Site Request Forgery)**: A malicious website tricks your browser into making requests to your site (your cookies are automatically sent). For this project's use case this isn't mitigated, but in production you'd add CSRF tokens.

---

## Summary: What Happens on Login → Browse → Logout

1. **Login**: User POSTs username + password. Server verifies hash. `createSession(res, username)` — new random token stored server-side, set as cookie in response.
2. **Every request**: Browser automatically sends cookie. Middleware reads it, looks up session, attaches `req.username`. Route handler runs.
3. **Session expiry**: After 10 minutes, the `setTimeout` fires and deletes the session. Next request fails middleware, user gets redirected to `/login`.
4. **Password change**: `deleteSession(req)` removes session. Cookie is cleared with `res.clearCookie('cpen322-session')`. User must log in again with new password.
