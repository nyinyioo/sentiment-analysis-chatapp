import SessionManager from '../SessionManager.js';

describe('SessionManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── constructor ──────────────────────────────────────────────────────────────
  describe('constructor', () => {
    test('starts with empty sessions object', () => {
      const sm = new SessionManager();
      expect(sm.sessions).toEqual({});
    });

    test('instances are independent', () => {
      const sm1 = new SessionManager();
      const sm2 = new SessionManager();
      const res = { cookie: jest.fn() };
      sm1.createSession(res, 'alice');
      expect(Object.keys(sm1.sessions)).toHaveLength(1);
      expect(Object.keys(sm2.sessions)).toHaveLength(0);
    });
  });

  // ── createSession ────────────────────────────────────────────────────────────
  describe('createSession', () => {
    let sm;
    let res;

    beforeEach(() => {
      sm = new SessionManager();
      res = { cookie: jest.fn() };
    });

    test('returns a 64-char hex token', () => {
      const token = sm.createSession(res, 'alice');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    test('stores session with username, createdAt, maxAge', () => {
      const before = Date.now();
      const token = sm.createSession(res, 'alice');
      const session = sm.sessions[token];
      expect(session.username).toBe('alice');
      expect(session.createdAt).toBeGreaterThanOrEqual(before);
      expect(session.maxAge).toBe(600000);
    });

    test('calls res.cookie with correct name', () => {
      const token = sm.createSession(res, 'alice');
      expect(res.cookie).toHaveBeenCalledWith(
        'cpen322-session',
        token,
        expect.objectContaining({ maxAge: 600000, httpOnly: true, path: '/' })
      );
    });

    test('httpOnly is true', () => {
      sm.createSession(res, 'alice');
      const opts = res.cookie.mock.calls[0][2];
      expect(opts.httpOnly).toBe(true);
    });

    test('secure is false outside production', () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      sm.createSession(res, 'alice');
      const opts = res.cookie.mock.calls[0][2];
      expect(opts.secure).toBe(false);
      process.env.NODE_ENV = original;
    });

    test('secure is true in production', () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      sm.createSession(res, 'alice');
      const opts = res.cookie.mock.calls[0][2];
      expect(opts.secure).toBe(true);
      process.env.NODE_ENV = original;
    });

    test('uses custom maxAge', () => {
      const token = sm.createSession(res, 'alice', 12345);
      expect(sm.sessions[token].maxAge).toBe(12345);
    });

    test('auto-deletes session after maxAge (fake timers)', () => {
      const token = sm.createSession(res, 'alice');
      expect(sm.sessions[token]).toBeDefined();
      jest.advanceTimersByTime(600000);
      expect(sm.sessions[token]).toBeUndefined();
    });

    test('generates unique tokens per call', () => {
      const t1 = sm.createSession(res, 'alice');
      const t2 = sm.createSession(res, 'bob');
      expect(t1).not.toBe(t2);
    });
  });

  // ── initializeBotSession ─────────────────────────────────────────────────────
  describe('initializeBotSession', () => {
    let sm;

    beforeEach(() => {
      sm = new SessionManager();
    });

    test('returns a 64-char hex token', () => {
      const token = sm.initializeBotSession();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    test('stores session with username "bot"', () => {
      const token = sm.initializeBotSession();
      expect(sm.sessions[token].username).toBe('bot');
    });

    test('sets isBot:true on session', () => {
      const token = sm.initializeBotSession();
      expect(sm.sessions[token].isBot).toBe(true);
    });

    test('does NOT set an auto-delete timer', () => {
      const token = sm.initializeBotSession();
      jest.runAllTimers();
      expect(sm.sessions[token]).toBeDefined();
    });
  });

  // ── deleteSession ────────────────────────────────────────────────────────────
  describe('deleteSession', () => {
    let sm;

    beforeEach(() => {
      sm = new SessionManager();
    });

    test('removes req.username', () => {
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      const req = { session: token, username: 'alice' };
      sm.deleteSession(req);
      expect(req.username).toBeUndefined();
    });

    test('removes session from this.sessions', () => {
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      const req = { session: token, username: 'alice' };
      sm.deleteSession(req);
      expect(sm.sessions[token]).toBeUndefined();
    });

    test('BUG: req.session is undefined after call (delete-before-log bug)', () => {
      // The implementation deletes req.session BEFORE the console.log that
      // references req.session, so after deleteSession req.session is undefined.
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      const req = { session: token, username: 'alice' };
      sm.deleteSession(req);
      expect(req.session).toBeUndefined();
    });
  });

  // ── middleware ───────────────────────────────────────────────────────────────
  describe('middleware', () => {
    let sm;

    beforeEach(() => {
      sm = new SessionManager();
    });

    test('calls next with SessionError when no cookie header', () => {
      const req = { headers: {} };
      const next = jest.fn();
      sm.middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.any(SessionManager.Error));
    });

    test('calls next with SessionError when cpen322-session cookie missing', () => {
      const req = { headers: { cookie: 'other=value' } };
      const next = jest.fn();
      sm.middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.any(SessionManager.Error));
    });

    test('calls next with SessionError for unknown token', () => {
      const req = { headers: { cookie: 'cpen322-session=unknowntoken' } };
      const next = jest.fn();
      sm.middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith(expect.any(SessionManager.Error));
    });

    test('calls next() with no args for valid token', () => {
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      const req = { headers: { cookie: `cpen322-session=${token}` } };
      const next = jest.fn();
      sm.middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('sets req.session for valid token', () => {
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      const req = { headers: { cookie: `cpen322-session=${token}` } };
      sm.middleware(req, {}, jest.fn());
      expect(req.session).toBe(token);
    });

    test('sets req.username for valid token', () => {
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      const req = { headers: { cookie: `cpen322-session=${token}` } };
      sm.middleware(req, {}, jest.fn());
      expect(req.username).toBe('alice');
    });

    test('parses multiple cookies correctly', () => {
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      const req = { headers: { cookie: `foo=bar; cpen322-session=${token}; baz=qux` } };
      const next = jest.fn();
      sm.middleware(req, {}, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.username).toBe('alice');
    });

    test('error passed to next is instanceof SessionManager.Error', () => {
      const req = { headers: {} };
      const next = jest.fn();
      sm.middleware(req, {}, next);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(SessionManager.Error);
    });
  });

  // ── getUsername ──────────────────────────────────────────────────────────────
  describe('getUsername', () => {
    let sm;

    beforeEach(() => {
      sm = new SessionManager();
    });

    test('returns username for valid token', () => {
      const res = { cookie: jest.fn() };
      const token = sm.createSession(res, 'alice');
      expect(sm.getUsername(token)).toBe('alice');
    });

    test('returns null for unknown token', () => {
      expect(sm.getUsername('doesnotexist')).toBeNull();
    });

    test('returns null for undefined', () => {
      expect(sm.getUsername(undefined)).toBeNull();
    });
  });

  // ── SessionManager.Error ─────────────────────────────────────────────────────
  describe('SessionManager.Error', () => {
    test('is instanceof Error', () => {
      const e = new SessionManager.Error('oops');
      expect(e).toBeInstanceOf(Error);
    });

    test('is instanceof SessionManager.Error', () => {
      const e = new SessionManager.Error('oops');
      expect(e).toBeInstanceOf(SessionManager.Error);
    });

    test('stores message', () => {
      const e = new SessionManager.Error('oops');
      expect(e.message).toBe('oops');
    });
  });
});
