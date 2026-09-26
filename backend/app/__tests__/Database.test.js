import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import Database from '../Database.js';

let mongod;
let db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  db = new Database(uri, 'testdb');
  await db.connected;
}, 30000);

afterAll(async () => {
  await mongod.stop();
}, 30000);

// constructor
describe('Database constructor', () => {
  test('.connected is a Promise', () => {
    expect(db.connected).toBeInstanceOf(Promise);
  });

  test('.connected resolves to an object with .collection', async () => {
    const conn = await db.connected;
    expect(typeof conn.collection).toBe('function');
  });

  test('rejects on bad URI', async () => {
    // Use 127.0.0.1:1 (closed port) with a short serverSelectionTimeoutMS so the
    // promise rejects quickly without waiting for a full network timeout.
    const badDb = new Database(
      'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=2000',
      'testdb'
    );
    await expect(badDb.connected).rejects.toBeDefined();
  }, 10000);

  test('works without new keyword', async () => {
    const uri = mongod.getUri();
    const instance = Database(uri, 'testdb');
    await expect(instance.connected).resolves.toBeDefined();
  });
});

// getRooms
describe('Database.getRooms', () => {
  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
  });

  test('returns array of all rooms', async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').insertMany([
      { name: 'room1', image: 'img1.png' },
      { name: 'room2', image: 'img2.png' },
    ]);
    const rooms = await db.getRooms();
    expect(rooms).toHaveLength(2);
  });

  test('returns empty array when no rooms', async () => {
    const rooms = await db.getRooms();
    expect(rooms).toEqual([]);
  });

  test('items have _id and name', async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').insertOne({ name: 'testroom' });
    const rooms = await db.getRooms();
    expect(rooms[0]).toHaveProperty('_id');
    expect(rooms[0]).toHaveProperty('name', 'testroom');
  });
});

// getRoom
describe('Database.getRoom', () => {
  let roomId;

  beforeEach(async () => {
    const room = await db.addRoom({ name: 'alpha' });
    roomId = room._id.toString();
  });

  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
  });

  test('returns room for valid ObjectId string', async () => {
    const room = await db.getRoom(roomId);
    expect(room).not.toBeNull();
    expect(room.name).toBe('alpha');
  });

  test('returns null for unknown id', async () => {
    const result = await db.getRoom(new ObjectId().toString());
    expect(result).toBeNull();
  });

  test('does not throw for non-ObjectId string', async () => {
    await expect(db.getRoom('not-an-objectid')).resolves.toBeDefined();
  });
});

// addRoom
describe('Database.addRoom', () => {
  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
  });

  test('rejects with no name', async () => {
    await expect(db.addRoom({})).rejects.toThrow();
  });

  test('returns doc with _id', async () => {
    const room = await db.addRoom({ name: 'beta' });
    expect(room._id).toBeDefined();
  });

  test('sets default image when none provided', async () => {
    const room = await db.addRoom({ name: 'beta' });
    expect(room.image).toBe('assets/everyone-icon.png');
  });

  test('preserves provided image', async () => {
    const room = await db.addRoom({ name: 'beta', image: 'custom.png' });
    expect(room.image).toBe('custom.png');
  });

  test('room appears in getRooms after add', async () => {
    await db.addRoom({ name: 'gamma' });
    const rooms = await db.getRooms();
    expect(rooms.some(r => r.name === 'gamma')).toBe(true);
  });
});

// addConversation
describe('Database.addConversation', () => {
  let roomId;

  beforeEach(async () => {
    const room = await db.addRoom({ name: 'convo-room' });
    roomId = room._id;
  });

  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
    await conn.collection('conversations').drop().catch(() => {});
  });

  test('rejects with missing room_id', async () => {
    await expect(
      db.addConversation({ messages: [], timestamp: Date.now() })
    ).rejects.toThrow();
  });

  test('rejects with non-array messages', async () => {
    await expect(
      db.addConversation({ room_id: roomId, messages: 'bad', timestamp: Date.now() })
    ).rejects.toThrow();
  });

  test('rejects with non-number timestamp', async () => {
    await expect(
      db.addConversation({ room_id: roomId, messages: [], timestamp: 'bad' })
    ).rejects.toThrow();
  });

  test('returns inserted doc', async () => {
    const convo = await db.addConversation({
      room_id: roomId,
      messages: [],
      timestamp: Date.now(),
    });
    expect(convo._id).toBeDefined();
  });

  test('adds sentiment:0 to messages without it', async () => {
    const convo = await db.addConversation({
      room_id: roomId,
      messages: [{ text: 'hello' }],
      timestamp: Date.now(),
    });
    expect(convo.messages[0].sentiment).toBe(0);
  });

  test('preserves existing sentiment on messages', async () => {
    const convo = await db.addConversation({
      room_id: roomId,
      messages: [{ text: 'hello', sentiment: 0.9 }],
      timestamp: Date.now(),
    });
    expect(convo.messages[0].sentiment).toBe(0.9);
  });
});

// getLastConversation
describe('Database.getLastConversation', () => {
  let roomId;
  const now = Date.now();
  beforeEach(async () => {
    const room = await db.addRoom({ name: 'last-convo-room' });
    roomId = room._id;
    await db.addConversation({ room_id: roomId, messages: [], timestamp: now - 2000 });
    await db.addConversation({ room_id: roomId, messages: [], timestamp: now - 1000 });
  });

  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
    await conn.collection('conversations').drop().catch(() => {});
  });

  test('returns most recent before timestamp', async () => {
    const convo = await db.getLastConversation(roomId.toString(), now);
    expect(convo).not.toBeNull();
    expect(convo.timestamp).toBe(now - 1000);
  });

  test('returns null when none', async () => {
    const conn = await db.connected;
    await conn.collection('conversations').drop().catch(() => {});
    const convo = await db.getLastConversation(roomId.toString(), now);
    expect(convo).toBeNull();
  });

  test('returns null when all timestamps are after before param', async () => {
    const convo = await db.getLastConversation(roomId.toString(), now - 3000);
    expect(convo).toBeNull();
  });

  test('returns only one result', async () => {
    const convo = await db.getLastConversation(roomId.toString(), now);
    expect(convo).not.toBeNull();
    // It's a single object (not an array)
    expect(Array.isArray(convo)).toBe(false);
  });
});

// getUser
describe('Database.getUser', () => {
  beforeEach(async () => {
    const conn = await db.connected;
    await conn.collection('users').insertOne({ username: 'alice', password: 'hash' });
  });

  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('users').drop().catch(() => {});
  });

  test('found by username', async () => {
    const user = await db.getUser('alice');
    expect(user).not.toBeNull();
    expect(user.username).toBe('alice');
  });

  test('returns null when not found', async () => {
    const user = await db.getUser('nobody');
    expect(user).toBeNull();
  });

  test('trims whitespace', async () => {
    const user = await db.getUser('  alice  ');
    expect(user).not.toBeNull();
  });

  test('lowercases username', async () => {
    const user = await db.getUser('ALICE');
    expect(user).not.toBeNull();
  });
});

// updateUserProfileByUsername
describe('Database.updateUserProfileByUsername', () => {
  beforeEach(async () => {
    const conn = await db.connected;
    await conn.collection('users').insertOne({ username: 'bob', age: 30 });
  });

  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('users').drop().catch(() => {});
  });

  test('updates fields', async () => {
    await db.updateUserProfileByUsername('bob', { age: 31 });
    const conn = await db.connected;
    const user = await conn.collection('users').findOne({ username: 'bob' });
    expect(user.age).toBe(31);
  });

  test('matchedCount is 1 for existing user', async () => {
    const result = await db.updateUserProfileByUsername('bob', { age: 31 });
    expect(result.matchedCount).toBe(1);
  });

  test('matchedCount is 0 for missing user', async () => {
    const result = await db.updateUserProfileByUsername('nobody', { age: 31 });
    expect(result.matchedCount).toBe(0);
  });

  test('does not overwrite other fields', async () => {
    await db.updateUserProfileByUsername('bob', { age: 31 });
    const conn = await db.connected;
    const user = await conn.collection('users').findOne({ username: 'bob' });
    expect(user.username).toBe('bob');
  });
});

// getRoomByName 
describe('Database.getRoomByName', () => {
  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
  });

  test('returns matching room', async () => {
    await db.addRoom({ name: 'delta' });
    const room = await db.getRoomByName('delta');
    expect(room).not.toBeNull();
    expect(room.name).toBe('delta');
  });

  test('returns null when not found', async () => {
    const room = await db.getRoomByName('nope');
    expect(room).toBeNull();
  });
});

// deleteRoom
describe('Database.deleteRoom', () => {
  afterEach(async () => {
    const conn = await db.connected;
    await conn.collection('chatrooms').drop().catch(() => {});
  });

  test('deletedCount is 1 for existing room', async () => {
    const room = await db.addRoom({ name: 'epsilon' });
    const result = await db.deleteRoom(room._id.toString());
    expect(result.deletedCount).toBe(1);
  });

  test('deletedCount is 0 for missing room', async () => {
    const result = await db.deleteRoom(new ObjectId().toString());
    expect(result.deletedCount).toBe(0);
  });

  test('room gone from getRoom after delete', async () => {
    const room = await db.addRoom({ name: 'zeta' });
    await db.deleteRoom(room._id.toString());
    const fetched = await db.getRoom(room._id.toString());
    expect(fetched).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Whispers + user settings
// ---------------------------------------------------------------------------
describe('whispers', () => {
  const roomA = new ObjectId();
  const roomB = new ObjectId();

  beforeEach(async () => {
    const conn = await db.connected;
    await conn.collection('whispers').deleteMany({});
  });

  test('addWhisper stores the doc and returns it with defaults', async () => {
    const w = await db.addWhisper({ room_id: String(roomA), username: 'nyi', query: 'vibe?', reply: 'chill', text: 'hey chat, vibe?' });
    expect(w._id).toBeInstanceOf(ObjectId);
    expect(w.room_id).toEqual(roomA);          // normalised to ObjectId
    expect(w.username).toBe('nyi');
    expect(w.query).toBe('vibe?');
    expect(w.reply).toBe('chill');
    expect(w.text).toBe('hey chat, vibe?');
    expect(w.shared_at).toBeNull();
    expect(typeof w.ts).toBe('number');
  });

  test('addWhisper rejects invalid input', async () => {
    await expect(db.addWhisper({ room_id: String(roomA), username: 'nyi', query: 'q' })).rejects.toThrow(/Invalid whisper/);
    await expect(db.addWhisper({ username: 'nyi', query: 'q', reply: 'r' })).rejects.toThrow(/Invalid whisper/);
  });

  test('getWhispers is scoped to user + room, oldest first, last N', async () => {
    for (let i = 0; i < 5; i++) {
      await db.addWhisper({ room_id: roomA, username: 'nyi', query: `q${i}`, reply: `r${i}`, ts: 1000 + i });
    }
    await db.addWhisper({ room_id: roomA, username: 'sam', query: 'secret', reply: 'x', ts: 1002 });
    await db.addWhisper({ room_id: roomB, username: 'nyi', query: 'other room', reply: 'x', ts: 1003 });

    const all = await db.getWhispers(String(roomA), 'nyi');
    expect(all.map(w => w.query)).toEqual(['q0', 'q1', 'q2', 'q3', 'q4']);

    const last2 = await db.getWhispers(String(roomA), 'nyi', 2);
    expect(last2.map(w => w.query)).toEqual(['q3', 'q4']);

    expect(await db.getWhispers(String(roomA), 'nobody')).toEqual([]);
  });

  test('deleteWhispers by room or everywhere, only for that user', async () => {
    await db.addWhisper({ room_id: roomA, username: 'nyi', query: 'a', reply: 'x' });
    await db.addWhisper({ room_id: roomB, username: 'nyi', query: 'b', reply: 'x' });
    await db.addWhisper({ room_id: roomA, username: 'sam', query: 'c', reply: 'x' });

    expect((await db.deleteWhispers('nyi', String(roomA))).deletedCount).toBe(1);
    expect((await db.getWhispers(roomB, 'nyi')).length).toBe(1);
    expect((await db.deleteWhispers('nyi')).deletedCount).toBe(1);
    expect((await db.getWhispers(roomA, 'sam')).length).toBe(1);
  });

  test('markWhisperShared only works for the owner', async () => {
    const w = await db.addWhisper({ room_id: roomA, username: 'nyi', query: 'a', reply: 'x' });
    expect((await db.markWhisperShared(String(w._id), 'sam')).matchedCount).toBe(0);
    expect((await db.markWhisperShared(String(w._id), 'nyi')).matchedCount).toBe(1);
    const [after] = await db.getWhispers(roomA, 'nyi');
    expect(typeof after.shared_at).toBe('number');
    await expect(db.markWhisperShared('not-an-id', 'nyi')).rejects.toThrow(/Invalid/);
  });
});

describe('user settings', () => {
  beforeEach(async () => {
    const conn = await db.connected;
    await conn.collection('users').deleteMany({ username: { $in: ['settings-user'] } });
    await conn.collection('users').insertOne({ username: 'settings-user', password: 'hash' });
  });

  test('defaults to session when the user has no settings', async () => {
    expect(await db.getUserSettings('settings-user')).toEqual({ whisperMemory: 'session' });
    expect(await db.getUserSettings('ghost')).toEqual({ whisperMemory: 'session' });
  });

  test('updateUserSettings persists whisperMemory and is case-insensitive on username', async () => {
    await db.updateUserSettings('Settings-User', { whisperMemory: 'remember' });
    expect(await db.getUserSettings('settings-user')).toEqual({ whisperMemory: 'remember' });
    await db.updateUserSettings('settings-user', { whisperMemory: 'session' });
    expect(await db.getUserSettings('settings-user')).toEqual({ whisperMemory: 'session' });
  });

  test('rejects invalid modes and empty updates', async () => {
    await expect(db.updateUserSettings('settings-user', { whisperMemory: 'forever' })).rejects.toThrow(/Invalid whisperMemory/);
    await expect(db.updateUserSettings('settings-user', { whisperMemory: 'incognito' })).rejects.toThrow(/Invalid whisperMemory/);
    await expect(db.updateUserSettings('settings-user', {})).rejects.toThrow(/No settings/);
    await expect(db.getUserSettings(42)).rejects.toThrow(/Invalid username/);
  });
});
