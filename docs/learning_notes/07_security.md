# Security — Helmet, CSP, CORS, and Basic Hardening

## Why Security Headers Matter

When your server sends an HTTP response, it can include **headers** that tell the browser how to behave with the content. Without these headers, browsers use very permissive defaults that leave you open to a bunch of attacks.

The `helmet` library sets a bunch of security headers automatically:

```js
app.use(nonceMiddleware);   // generate nonce first
app.use(helmetMiddleware()); // then apply helmet with nonce
```

---

## Content Security Policy (CSP)

**The problem CSP solves: Cross-Site Scripting (XSS)**

XSS is when an attacker gets malicious JavaScript to run on your page. The most common way: if your app displays user input without sanitizing it, an attacker can submit `<script>alert('hacked')</script>` as a chat message, and every user who loads the page runs that script.

CSP is a whitelist: you tell the browser "only execute scripts from these sources, and only if they have this specific attribute."

```js
function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],  // By default, only load from our own domain

        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,  // scripts with nonce allowed
          "https://cdn.jsdelivr.net",                    // CDN scripts allowed
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com"
        ],

        styleSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.nonce}'`,
          "https://fonts.googleapis.com"
        ],

        fontSrc: ["'self'", "https://fonts.gstatic.com"],

        imgSrc: ["'self'", "https://nyibucket.s3.amazonaws.com", "data:"],

        connectSrc: [
          "'self'",
          "ws://localhost:8000",      // WebSocket connection allowed
          "http://localhost:5005",    // Rasa API
          // ...
        ],

        objectSrc: ["'none'"]  // Block <object>, <embed> (often used for Flash attacks)
      }
    }
  });
}
```

If an XSS attack injects `<script src="https://evil.com/steal.js">`, the browser will refuse to load it because `evil.com` isn't in `scriptSrc`. The injected script is blocked before it even runs.

---

## Nonces — Allowing Inline Scripts Safely

The strictest CSP would block ALL inline scripts (`<script>` tags directly in HTML). But sometimes you need inline scripts. The solution: **nonces**.

A **nonce** (number used once) is a random value generated fresh for each request:

```js
function nonceMiddleware(req, res, next) {
    res.locals.nonce = crypto.randomBytes(16).toString('hex');
    next();
}
```

The nonce gets embedded in the CSP header AND in any allowed inline script tags:

```html
<!-- In your EJS template, the nonce is passed in: -->
<script nonce="<%= nonce %>">
    // This inline script is allowed because its nonce matches the CSP header
</script>
```

An attacker injecting `<script>evil()</script>` doesn't know the nonce (it's random, per-request). Their script gets blocked. Your scripts with the correct nonce run fine.

**Why random per-request?** If the nonce was static, an attacker could just read it from the page and include it in their injected script.

---

## CORS — Cross-Origin Resource Sharing

**The problem:** Browsers enforce the **Same-Origin Policy** — JavaScript on `evil.com` can't make requests to `yourbank.com` and read the response. This protects users.

But sometimes you legitimately need cross-origin requests (e.g., your frontend is on `app.com` but your API is on `api.com`).

**CORS** lets the server say "I'll accept requests from these origins":

```js
app.use(cors());  // Allow ALL origins (permissive — fine for dev)

// More restrictive in production:
app.use(cors({
    origin: ['https://yourapp.com'],
    credentials: true  // allow cookies to be sent cross-origin
}));
```

When the browser makes a cross-origin request, the server responds with:
```
Access-Control-Allow-Origin: *
```
or
```
Access-Control-Allow-Origin: https://yourapp.com
```

Without this header, the browser blocks the JavaScript from reading the response (the request still goes through — CORS doesn't prevent the request, it prevents JavaScript from reading the response).

---

## Morgan — HTTP Request Logging

Not a security tool, but important for visibility:

```js
app.use(morgan('dev'));
```

Morgan logs every request:
```
GET /lobby/chat 200 12ms - 1.23kb
POST /lobby/chat 201 45ms - 234b
```

Format: `METHOD /path STATUS TIME - SIZE`

In production you'd use `morgan('combined')` which includes IP, user agent, etc. for security auditing. `'dev'` gives a compact colored output for development.

---

## Helmet's Other Protections

Beyond CSP, Helmet sets several other headers:

**X-Content-Type-Options: nosniff**
Prevents browser MIME-type sniffing. Without it, if you upload a `.jpg` that's actually a `.html` file, the browser might execute it as HTML.

**X-Frame-Options: SAMEORIGIN**
Prevents your page from being embedded in an `<iframe>` on another site. Blocks **clickjacking** attacks where an attacker shows your page transparently overlaid on their page and tricks users into clicking buttons.

**Strict-Transport-Security (HSTS)**
Tells the browser "always use HTTPS for this domain, never HTTP, for the next year." Prevents protocol downgrade attacks.

**X-XSS-Protection**
Old header for IE's built-in XSS filter. Mostly deprecated but Helmet still sets it.

---

## The `express.json({ limit: '10kb' })` Limit

```js
app.use(express.json({ limit: '10kb' }));
```

Without a limit, someone could POST a 1GB JSON body to your server, consuming all RAM. 10kb is more than enough for chat messages. This is a basic **DoS (Denial of Service)** mitigation.

---

## Environment Variables for Secrets

The `.env` file contains:
```
MONGO_URI=mongodb://user:password@host/db
OPENAI_API_KEY=sk-...
```

These should **never** be committed to git. The `.gitignore` file excludes `.env`. The `.env.example` file is committed instead, showing required variable names without real values.

This matters because:
1. Code often ends up in public GitHub repos (accidentally or intentionally)
2. Git history is permanent — even if you delete the file, the secret is visible in old commits
3. Tools like `truffleHog` and `git-secrets` scan for accidentally committed secrets

---

## Password Security Recap

SHA-256 is a **general-purpose** hash — fast by design. The problem for passwords: if someone steals your database, they can try billions of password guesses per second on a GPU.

**bcrypt** deliberately runs slowly (configurable work factor). Even with a GPU, it takes much longer to brute-force. This is intentional — you want password hashing to be slow.

For this project, SHA-256 + salt is used (simpler to understand and implement). In a production app, use `bcrypt`, `scrypt`, or `argon2`.

---

## Security Checklist for This App

| Risk | Mitigation in Place | Production Recommendation |
|------|---------------------|--------------------------|
| XSS | CSP + nonces | Also sanitize displayed user content |
| Clickjacking | X-Frame-Options via Helmet | ✓ |
| MIME sniffing | X-Content-Type-Options | ✓ |
| DoS (large body) | 10kb limit on JSON | ✓ |
| Password theft | SHA-256 + salt | Use bcrypt |
| Secret leakage | .env + .gitignore | ✓ |
| Session hijacking | httpOnly cookies | Also add CSRF protection |
| HTTPS | secure flag in prod | Enforce HTTPS in production |
| Rate limiting | Not implemented | Add rate limiting per IP |
| SQL injection | N/A (using MongoDB) | Use parameterized queries |

---

## Why `crossOriginEmbedderPolicy: false`?

```js
helmet({
    // ...
    crossOriginEmbedderPolicy: false
})
```

COEP requires all resources (images, scripts) to be served with `Cross-Origin-Embedder-Policy: require-corp`. This is strict and breaks third-party resources that don't set this header (like many CDNs). Disabling it is common in projects that embed external resources.
