# Testing — Jest, Pytest, and Why We Test

## Why Test at All?

"I ran it and it works" is not a test. It's a sample size of one, on your machine, right now. Tests let you:

1. **Prove your code does what you think** — formally verify behavior
2. **Catch regressions** — when you change something, tests tell you if you broke something else
3. **Document behavior** — tests are living documentation of how code is supposed to work
4. **Refactor with confidence** — change internals freely as long as tests still pass

---

## Testing Vocabulary

**Unit test** — test one function/class in isolation. Fast, no external dependencies.
**Integration test** — test multiple components working together (e.g., Database class + actual MongoDB).
**End-to-end test** — test the whole app like a user would (click buttons, check UI).

This project focuses on **unit tests** (fast, independent) with one layer of integration (Database tests use an in-memory MongoDB).

**Mock** — a fake replacement for a real dependency. Instead of actually calling the Rasa API, you create a fake function that returns the data you want.

**Stub** — simpler fake that just returns hardcoded data.

**Test coverage** — percentage of your code lines that are executed by at least one test. The project generates coverage reports in `backend/app/coverage/`.

---

## Jest — JavaScript Testing Framework

Jest is the most popular JS testing framework (made by Facebook/Meta). It's opinionated and batteries-included: test runner + assertions + mocking all in one.

### Running Tests

```bash
npm test           # Run all tests
npm run test:watch  # Re-run tests whenever files change
npm run test:coverage  # Run with coverage report
```

### Test Structure

```js
// Groups related tests
describe('Database constructor', () => {

    // Individual test cases
    test('.connected is a Promise', () => {
        expect(db.connected).toBeInstanceOf(Promise);
    });

    test('rejects on bad URI', async () => {
        const badDb = new Database('mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=2000', 'testdb');
        await expect(badDb.connected).rejects.toBeDefined();
    }, 10000); // 10 second timeout
});
```

### Setup and Teardown

```js
// Runs once before ALL tests in this file
beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    db = new Database(mongod.getUri(), 'testdb');
    await db.connected;  // Wait for connection
}, 30000); // 30 second timeout

// Runs once after ALL tests
afterAll(async () => {
    await mongod.stop();
});

// Runs before EACH test in a describe block
beforeEach(async () => {
    const room = await db.addRoom({ name: 'test-room' });
    roomId = room._id;
});

// Runs after EACH test — important for cleanup
afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
    // .catch(() => {}) — silently ignore if collection doesn't exist
});
```

Why clean up after each test? **Test isolation** — tests should not depend on each other. If one test creates data and doesn't clean up, it pollutes the next test.

### Common Jest Assertions (`expect(...)`)

```js
expect(value).toBe(42)              // strict equality (===)
expect(value).toEqual({ key: 'val' }) // deep equality (objects/arrays)
expect(value).toBeDefined()         // not undefined
expect(value).toBeNull()            // is null
expect(value).toBeInstanceOf(Promise) // instanceof check
expect(value).toHaveLength(2)       // array/string length
expect(value).toHaveProperty('_id') // object has this key
expect(fn).toThrow()                // function throws

// Async assertions
await expect(promise).resolves.toBeDefined()  // promise resolves
await expect(promise).rejects.toThrow()       // promise rejects

// String patterns
expect(token).toMatch(/^[0-9a-f]{64}$/)  // regex match
```

---

## MongoDB Memory Server

Instead of needing a real MongoDB instance running for tests, the project uses `mongodb-memory-server`:

```js
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
beforeAll(async () => {
    mongod = await MongoMemoryServer.create(); // Spins up a real MongoDB in memory
    const uri = mongod.getUri();               // e.g., mongodb://127.0.0.1:54321/
    db = new Database(uri, 'testdb');
});
afterAll(async () => {
    await mongod.stop(); // Shuts down the in-memory instance
});
```

This is brilliant — it's a **real MongoDB**, just running in RAM. Your Database code runs exactly as in production, no mocks needed for the DB layer. Fast (no network), isolated (test data doesn't pollute dev DB), no setup required.

---

## Mocking — `fetch` in Sentiment Tests

`sentimentAnalyzer.js` now calls the FastAPI service via `fetch` instead of spawning a subprocess. The test approach is much simpler — just replace the global `fetch` with a Jest mock:

```js
beforeEach(() => {
    global.fetch = jest.fn(); // replace the real fetch with a fake
});

afterEach(() => {
    jest.clearAllMocks(); // reset mock state between tests
});
```

Then control exactly what the fake service returns:

```js
test('resolves with {label, score} from service response', async () => {
    // Arrange: fake the HTTP response
    global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ label: 'POSITIVE', score: 0.99 }),
    });

    // Act
    const result = await analyzeSentiment('hello world');

    // Assert
    expect(result).toEqual({ label: 'POSITIVE', score: 0.99 });
});
```

`mockResolvedValue` makes the mock return a resolved Promise with that value — simulating a successful HTTP response.

### Why This Is Better Than the Old Approach

The old test had to build a fake `EventEmitter` with fake `stdout` and `stderr` streams, then manually emit events in the right sequence. It was 20 lines of setup just to simulate what Python would output.

The new test is 5 lines. `fetch` returns a Promise — easy to mock with `mockResolvedValue`. Testing async behavior is what Jest is built for.

### Testing Error Paths

```js
test('rejects when service returns non-OK status', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(analyzeSentiment('test')).rejects.toThrow('503');
});

test('rejects on network error', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    await expect(analyzeSentiment('test')).rejects.toThrow('Network error');
});
```

Two distinct error scenarios: the service responded but with an error status (503), vs the request never completed at all (network down). Both should cause `analyzeSentiment` to reject.

---

## Fake Timers — Testing SessionManager

The `SessionManager` uses `setTimeout` to auto-delete sessions. Real time is a terrible thing to test against (you'd have to wait 10 minutes). Jest's **fake timers** let you control time:

```js
beforeEach(() => {
    jest.useFakeTimers();  // Replace real timers with fake ones
});
afterEach(() => {
    jest.useRealTimers();  // Restore real timers
});

test('auto-deletes session after maxAge (fake timers)', () => {
    const token = sm.createSession(res, 'alice');
    expect(sm.sessions[token]).toBeDefined();

    jest.advanceTimersByTime(600000);  // Jump forward 10 minutes instantly

    expect(sm.sessions[token]).toBeUndefined();  // Session deleted
});
```

`jest.advanceTimersByTime(ms)` runs any `setTimeout`/`setInterval` callbacks that would have fired in that time period.

---

## Pytest — Python Testing

For the Python ML code, the project uses pytest:

```bash
cd backend/ml
pytest sentiment_analysis/tests -v
```

### Test Structure (pytest)

```python
class TestAnalyzeSentiment:

    def setup_method(self):  # Runs before each test method
        _mock_pipeline_instance.reset_mock()

    def test_returns_first_element_of_pipeline_results(self):
        _mock_pipeline_instance.return_value = [
            {"label": "POSITIVE", "score": 0.9},
            {"label": "NEGATIVE", "score": 0.1},
        ]
        result = sa.analyze_sentiment("hello")
        assert result == {"label": "POSITIVE", "score": 0.9}
```

pytest uses plain `assert` statements — no `.toBe()` or `.expect()`. If the assertion fails, pytest shows you exactly what the actual vs expected values were.

### Patching at Module Level

The transformer model takes ~2 seconds to load. In tests, you patch it **before** the module is even imported:

```python
from unittest.mock import MagicMock, patch

_mock_pipeline_instance = MagicMock()
_mock_pipeline_instance.return_value = [{"label": "POSITIVE", "score": 0.9}]

# Patch before import — the real model never loads
_pipeline_patcher = patch("transformers.pipeline", return_value=_mock_pipeline_instance)
_pipeline_patcher.start()

import sentiment_analysis as sa  # Now safe to import

def teardown_module(module):
    _pipeline_patcher.stop()
```

`MagicMock` is a magic fake object — it records all calls made to it, can be configured to return anything, and automatically handles attribute access.

`patch("transformers.pipeline", ...)` replaces `transformers.pipeline` with the mock for the duration of the patch. After `_pipeline_patcher.stop()`, the real `transformers.pipeline` is restored.

---

## The Jest Config

```js
// jest.config.js
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    collectCoverageFrom: ['*.js', 'routes/*.js', 'middleware/*.js']
};
```

---

## Coverage Reports

```bash
npm run test:coverage
```

Generates HTML coverage report in `backend/app/coverage/lcov-report/index.html`. Open it in a browser to see line-by-line which code was hit by tests and which wasn't.

Coverage metrics:
- **Statements** — individual statements executed
- **Branches** — if/else branches taken
- **Functions** — functions called
- **Lines** — lines executed

High coverage ≠ good tests, but low coverage (< 70%) is a sign you're missing important cases.

---

## What Makes a Good Test?

**AAA Pattern (Arrange, Act, Assert):**
```js
test('returns most recent before timestamp', async () => {
    // Arrange — set up the test data
    const now = 1700000000000;
    await db.addConversation({ room_id: roomId, messages: [], timestamp: now - 2000 });
    await db.addConversation({ room_id: roomId, messages: [], timestamp: now - 1000 });

    // Act — call the code under test
    const convo = await db.getLastConversation(roomId.toString(), now);

    // Assert — verify the result
    expect(convo.timestamp).toBe(now - 1000);
});
```

**Good tests are:**
- **Fast** — no real network calls, no real file I/O (mock them)
- **Independent** — don't depend on other tests running first
- **Deterministic** — same result every time
- **Testing one thing** — one `test()` = one behavior

**The "BUG" test:**
```js
test('BUG: req.session is undefined after call (delete-before-log bug)', () => {
```

This is a known bug documented as a test — the implementation deletes `req.session` before logging it, which is wrong but intentional to capture. Sometimes you write tests for known bugs to prevent accidentally "fixing" them in a way that breaks something else.
