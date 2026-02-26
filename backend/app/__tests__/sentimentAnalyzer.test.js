'use strict';

const { EventEmitter } = require('events');

jest.mock('child_process');

const { spawn } = require('child_process');

// Helper: build a fake child process with controllable stdout/stderr/exit
function makeFakeProcess() {
  const fakeProc = new EventEmitter();
  fakeProc.stdout = new EventEmitter();
  fakeProc.stderr = new EventEmitter();
  return fakeProc;
}

// Re-require to pick up the mock
let analyzeSentiment;
beforeAll(() => {
  analyzeSentiment = require('../sentimentAnalyzer');
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── happy path ───────────────────────────────────────────────────────────────
describe('sentimentAnalyzer happy path', () => {
  test('resolves with {label, score} from valid JSON stdout', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('hello world');

    fakeProc.stdout.emit('data', Buffer.from('{"label":"POSITIVE","score":0.99}'));
    fakeProc.stdout.emit('end');

    const result = await promise;
    expect(result).toEqual({ label: 'POSITIVE', score: 0.99 });
  });

  test('spawns python with correct script path and text arg', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('test input');
    fakeProc.stdout.emit('data', Buffer.from('{"label":"POSITIVE","score":0.9}'));
    fakeProc.stdout.emit('end');
    await promise;

    expect(spawn).toHaveBeenCalledWith(
      'python',
      expect.arrayContaining([
        expect.stringContaining('sentiment_analysis.py'),
        'test input',
      ])
    );
  });

  test('handles chunked stdout (multiple data events)', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('chunked');

    fakeProc.stdout.emit('data', Buffer.from('{"label":"NEG'));
    fakeProc.stdout.emit('data', Buffer.from('ATIVE","score":0.1}'));
    fakeProc.stdout.emit('end');

    const result = await promise;
    expect(result).toEqual({ label: 'NEGATIVE', score: 0.1 });
  });

  test('ignores "Device set to use cpu" stderr and still resolves', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('test');

    fakeProc.stderr.emit('data', Buffer.from('Device set to use cpu'));
    fakeProc.stdout.emit('data', Buffer.from('{"label":"POSITIVE","score":0.8}'));
    fakeProc.stdout.emit('end');

    await expect(promise).resolves.toMatchObject({ label: 'POSITIVE' });
  });
});

// ── error paths ───────────────────────────────────────────────────────────────
describe('sentimentAnalyzer error paths', () => {
  test('rejects on invalid JSON stdout', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('bad json test');

    fakeProc.stdout.emit('data', Buffer.from('not valid json'));
    fakeProc.stdout.emit('end');

    await expect(promise).rejects.toThrow();
  });

  test('rejection message contains "Failed to parse sentiment result"', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('bad json test');

    fakeProc.stdout.emit('data', Buffer.from('not valid json'));
    fakeProc.stdout.emit('end');

    await expect(promise).rejects.toThrow('Failed to parse sentiment result');
  });

  test('rejects on unexpected stderr message', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('error test');

    fakeProc.stderr.emit('data', Buffer.from('Something went wrong'));

    await expect(promise).rejects.toThrow();
  });

  test('rejection message contains "Error from Python script"', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('error test');

    fakeProc.stderr.emit('data', Buffer.from('Something went wrong'));

    await expect(promise).rejects.toThrow('Error from Python script');
  });

  test('does NOT reject on "Device set to use cpu" stderr', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('test');

    // Emit the ignored stderr first, then valid stdout
    fakeProc.stderr.emit('data', Buffer.from('Device set to use cpu'));
    fakeProc.stdout.emit('data', Buffer.from('{"label":"NEUTRAL","score":0.5}'));
    fakeProc.stdout.emit('end');

    await expect(promise).resolves.toBeDefined();
  });
});

// ── return shape ─────────────────────────────────────────────────────────────
describe('sentimentAnalyzer return shape', () => {
  test('result has label', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('shape test');
    fakeProc.stdout.emit('data', Buffer.from('{"label":"POSITIVE","score":0.95}'));
    fakeProc.stdout.emit('end');

    const result = await promise;
    expect(result).toHaveProperty('label');
  });

  test('result has score', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('shape test');
    fakeProc.stdout.emit('data', Buffer.from('{"label":"POSITIVE","score":0.95}'));
    fakeProc.stdout.emit('end');

    const result = await promise;
    expect(result).toHaveProperty('score');
  });

  test('score is a number', async () => {
    const fakeProc = makeFakeProcess();
    spawn.mockReturnValue(fakeProc);

    const promise = analyzeSentiment('shape test');
    fakeProc.stdout.emit('data', Buffer.from('{"label":"POSITIVE","score":0.95}'));
    fakeProc.stdout.emit('end');

    const result = await promise;
    expect(typeof result.score).toBe('number');
  });
});
