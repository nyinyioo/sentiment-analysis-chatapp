// Tests for the HTTP-based sentimentAnalyzer (calls FastAPI service via fetch)
import { jest } from '@jest/globals';
import analyzeSentiment from '../sentimentAnalyzer.js';

beforeEach(() => {
    global.fetch = jest.fn();
});

afterEach(() => {
    jest.clearAllMocks();
});

// happy path
describe('sentimentAnalyzer happy path', () => {
    test('resolves with {label, score} from service response', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'POSITIVE', score: 0.99 }),
        });

        const result = await analyzeSentiment('hello world');
        expect(result).toEqual({ label: 'POSITIVE', score: 0.99 });
    });

    test('POSTs to the /analyze endpoint', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'POSITIVE', score: 0.9 }),
        });

        await analyzeSentiment('test input');

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/analyze'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    test('sends text in the request body', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'NEUTRAL', score: 0.5 }),
        });

        await analyzeSentiment('my message');

        const [, options] = global.fetch.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.text).toBe('my message');
    });

    test('sets Content-Type to application/json', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'NEUTRAL', score: 0.5 }),
        });

        await analyzeSentiment('test');

        const [, options] = global.fetch.mock.calls[0];
        expect(options.headers['Content-Type']).toBe('application/json');
    });

    test('calls fetch exactly once per invocation', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'POSITIVE', score: 0.8 }),
        });

        await analyzeSentiment('once');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

// error path
describe('sentimentAnalyzer error paths', () => {
    test('rejects when service returns a non-OK status', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 503 });

        await expect(analyzeSentiment('test')).rejects.toThrow();
    });

    test('rejection message contains the HTTP status code', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 503 });

        await expect(analyzeSentiment('test')).rejects.toThrow('503');
    });

    test('rejects when fetch itself throws (network error)', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));

        await expect(analyzeSentiment('test')).rejects.toThrow('Network error');
    });
});

// return sentiment
describe('sentimentAnalyzer', () => {
    test('result has label property', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'NEGATIVE', score: 0.8 }),
        });

        const result = await analyzeSentiment('bad day');
        expect(result).toHaveProperty('label');
    });

    test('result has score property', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'NEGATIVE', score: 0.8 }),
        });

        const result = await analyzeSentiment('bad day');
        expect(result).toHaveProperty('score');
    });

    test('score is a number', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'POSITIVE', score: 0.95 }),
        });

        const result = await analyzeSentiment('great');
        expect(typeof result.score).toBe('number');
    });

    test('handles NEGATIVE label', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'NEGATIVE', score: 0.87 }),
        });

        const result = await analyzeSentiment('terrible day');
        expect(result.label).toBe('NEGATIVE');
    });

    test('handles NEUTRAL label', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ label: 'NEUTRAL', score: 0.6 }),
        });

        const result = await analyzeSentiment('okay');
        expect(result.label).toBe('NEUTRAL');
    });
});
