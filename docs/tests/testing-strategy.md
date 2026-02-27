# Testing Strategy

## Overview

This document describes the unit testing strategy for the Sentiment Analysis Chat Application. The test suite covers the Node.js backend modules and the Python ML module. End-to-end tests are out of scope for this phase.

---

## Scope

| Module | Language | Test File |
|---|---|---|
| `SessionManager` | Node.js | `backend/app/__tests__/SessionManager.test.js` |
| `Database` | Node.js | `backend/app/__tests__/Database.test.js` |
| `sentimentAnalyzer` | Node.js | `backend/app/__tests__/sentimentAnalyzer.test.js` |
| `sentiment_analysis.py` | Python | `backend/ml/sentiment_analysis/tests/test_sentiment_analysis.py` |

---

## Strategy

### Unit Isolation

Each module is tested in complete isolation from its real external dependencies:

- **SessionManager** — No HTTP server or real browser is involved. A plain stub object `{ cookie: jest.fn() }` replaces the Express response, and `jest.useFakeTimers()` controls `setTimeout` so auto-expiry can be verified instantly without real waiting.
- **Database** — Uses `mongodb-memory-server` to spin up a real but in-process MongoDB instance. This avoids mocking the MongoDB driver (which would hide real query logic), while still keeping tests hermetic and fast with no external server needed.
- **sentimentAnalyzer** — `child_process` is fully mocked with `jest.mock('child_process')`. A fake `EventEmitter`-based process replaces the real Python spawn, letting tests control stdout/stderr output programmatically.
- **sentiment_analysis.py** — `transformers.pipeline` is patched at the module level *before* import so the HuggingFace model (hundreds of MB) is never loaded during tests. The patch is applied once for the whole session using `unittest.mock.patch`.

### Test Isolation Between Cases

- Each Node describe block cleans up its own state (e.g. `afterEach` drops MongoDB collections, `beforeEach` creates a fresh `SessionManager` instance).
- Python test methods reset mock return values and call counts in `setup_method`.
- `jest.clearAllMocks()` runs after each sentimentAnalyzer test.

### Known Bug Documentation

The `deleteSession` tests intentionally document a bug in the source code: `req.session` is deleted *before* the `console.log` that references it, meaning the log always prints `undefined`. The test asserts this behaviour so the bug is visible and tracked.

---

## Running the Tests

### Node.js

```bash
cd backend/app
npm test                  # run all suites
npm run test:coverage     # with coverage report
npm run test:watch        # watch mode
```

### Python

```bash
# From project root
source venv/bin/activate
pip install -r backend/requirements-dev.txt   # first time only

cd backend/ml
pytest -v
```

---

## Node.js Test Cases

### SessionManager

**constructor**
- Starts with an empty `sessions` object.
- Two separate instances do not share session state.

**createSession**
- Returns a 64-character lowercase hex token (32 random bytes).
- Stored session contains `username`, `createdAt`, and `maxAge`.
- Calls `res.cookie` with the cookie name `cpen322-session` and the correct options object.
- `httpOnly` is always `true`.
- `secure` is `false` outside production, `true` when `NODE_ENV === 'production'`.
- Respects a custom `maxAge` argument.
- Auto-deletes the session after `maxAge` milliseconds (verified with fake timers).
- Each call produces a unique token.

**initializeBotSession**
- Returns a 64-character hex token.
- Stores session with `username` set to `"bot"`.
- Sets `isBot: true` on the session object.
- Does **not** schedule an auto-delete timer (bot session persists indefinitely).

**deleteSession**
- Removes `req.username` from the request object.
- Removes the session entry from `this.sessions`.
- **Bug documented:** `req.session` is `undefined` after the call because the implementation deletes it before logging it.

**middleware**
- Calls `next(error)` with a `SessionManager.Error` when the cookie header is absent.
- Calls `next(error)` when `cpen322-session` cookie is not present among other cookies.
- Calls `next(error)` when the token does not match any active session.
- Calls `next()` (no arguments) and sets `req.session` and `req.username` for a valid token.
- Correctly parses a cookie string containing multiple cookies.
- The error passed to `next` is an instance of `SessionManager.Error`.

**getUsername**
- Returns the username for a known token.
- Returns `null` for an unknown token.
- Returns `null` for `undefined` input.

**SessionManager.Error**
- Is an instance of `Error`.
- Is an instance of `SessionManager.Error`.
- Stores the message string.

---

### Database

**constructor**
- `.connected` is a `Promise`.
- The promise resolves to a MongoDB `Db` object that has a `.collection` method.
- The promise rejects when the URI points to an unreachable host.
- Works correctly when called without the `new` keyword (constructor guard).

**getRooms**
- Returns an array containing all inserted rooms.
- Returns an empty array when the collection is empty.
- Each item has `_id` and `name` fields.

**getRoom**
- Returns the correct room document for a valid ObjectId string.
- Returns `null` for an ObjectId that does not exist.
- Does not throw for a non-ObjectId string input.

**addRoom**
- Rejects when `name` is missing.
- Returns the inserted document with an `_id`.
- Sets `image` to `'assets/everyone-icon.png'` when none is provided.
- Preserves a custom `image` value.
- The added room is visible in subsequent `getRooms` calls.

**addConversation**
- Rejects when `room_id` is missing.
- Rejects when `messages` is not an array.
- Rejects when `timestamp` is not a number.
- Returns the inserted document with an `_id`.
- Adds `sentiment: 0` to messages that have no sentiment field.
- Preserves an existing `sentiment` value on messages.

**getLastConversation**
- Returns the most recent conversation whose `timestamp` is strictly before the `before` parameter.
- Returns `null` when the collection is empty.
- Returns `null` when all conversations have timestamps equal to or after `before`.
- Returns a single object, not an array.

**getUser**
- Returns the user document when found by username.
- Returns `null` when the username does not exist.
- Trims leading/trailing whitespace from the username before querying.
- Lowercases the username before querying.

**updateUserProfileByUsername**
- Updates the specified fields on the user document.
- Returns `matchedCount: 1` for an existing username.
- Returns `matchedCount: 0` for a username that does not exist.
- Does not overwrite fields not included in the update.

**getRoomByName**
- Returns the room document when found by name.
- Returns `null` when no room has that name.

**deleteRoom**
- Returns `deletedCount: 1` for an existing room.
- Returns `deletedCount: 0` for a room that does not exist.
- The room is no longer returned by `getRoom` after deletion.

---

### sentimentAnalyzer

**Happy path**
- Resolves with `{ label, score }` parsed from valid JSON on stdout.
- Spawns `python` with the correct script path and the input text as an argument.
- Correctly assembles the result when stdout arrives in multiple chunks.
- Ignores `"Device set to use cpu"` on stderr and still resolves normally.

**Error paths**
- Rejects when stdout contains invalid JSON.
- Rejection message includes `"Failed to parse sentiment result"`.
- Rejects when stderr contains an unexpected error message.
- Rejection message includes `"Error from Python script"`.
- Does **not** reject when the only stderr output is `"Device set to use cpu"`.

**Return shape**
- Result has a `label` property.
- Result has a `score` property.
- `score` is of type `number`.

---

## Python Test Cases

### TestAnalyzeSentiment

- Returns the first element of the list returned by the pipeline.
- Result contains a `label` key.
- Result contains a `score` key.
- Passes the input text directly to the pipeline callable.
- `score` is a `float`.
- Correctly returns a `NEGATIVE` label when the pipeline returns one.
- Correctly returns a `NEUTRAL` label when the pipeline returns one.

### TestMainEntryPoint

- Running the `__main__` block prints valid JSON to stdout.
- The printed JSON contains a `label` field.
- The printed JSON contains a `score` field.
- Uses `sys.argv[1]` as the input text passed to the pipeline.

### TestPipelineInitialization

- `transformers.pipeline` is called with the task string `"sentiment-analysis"`.
- It is called with `model="cardiffnlp/twitter-roberta-base-sentiment"`.
- It is called with `device=-1` (CPU-only inference).

---

## Tools and Libraries

| Tool | Purpose |
|---|---|
| Jest 29 | Node.js test runner and assertion library |
| `mongodb-memory-server` | In-process MongoDB for Database tests |
| `jest.useFakeTimers()` | Control setTimeout in SessionManager tests |
| `jest.mock('child_process')` | Mock process spawning in sentimentAnalyzer tests |
| pytest 8 | Python test runner |
| `unittest.mock.patch` | Patch `transformers.pipeline` before module import |
