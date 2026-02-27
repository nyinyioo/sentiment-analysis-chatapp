// Fix: replaced subprocess-per-message with a call to the persistent
// FastAPI sentiment service (backend/ml/sentiment_service.py).


const SENTIMENT_URL = process.env.SENTIMENT_SERVICE_URL || 'http://localhost:8001/analyze';

async function analyzeSentiment(text) {
    const response = await fetch(SENTIMENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        throw new Error(`Sentiment service responded with ${response.status}`);
    }

    return response.json();
}

module.exports = analyzeSentiment;
