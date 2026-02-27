# Sentiment Analysis & the ML Pipeline

## What Is Sentiment Analysis?

Sentiment analysis is figuring out the **emotional tone** of text. Is this message happy, sad, or neutral?

This is a classic **Natural Language Processing (NLP)** problem. You could do it with simple keyword matching ("if text contains 'love', it's positive"), but that's brittle. Modern approach: train a neural network on millions of labelled examples.

This project uses a pre-trained transformer model from Hugging Face called **cardiffnlp/twitter-roberta-base-sentiment**, which was trained on tweets and classifies text as:
- `LABEL_0` → Negative
- `LABEL_1` → Neutral
- `LABEL_2` → Positive

(Or sometimes returned as `POSITIVE`/`NEUTRAL`/`NEGATIVE` depending on the model config.)

---

## What Is a Transformer? (High Level)

Before transformers (2017), NLP models processed words one at a time (left to right). The problem: by the time you reach word 20, you've "forgotten" what word 1 said.

**Transformers** use **self-attention** — every word looks at every other word simultaneously and decides how much to "pay attention" to each one. This captures long-range dependencies: in "The animal didn't cross the street because it was too tired," a transformer understands "it" refers to "animal" even though they're far apart.

**BERT** (2018, Google) was a huge breakthrough. It pre-trained on massive text corpora, learning general language understanding. You then **fine-tune** it on your specific task.

**RoBERTa** = Robustly Optimized BERT — same architecture, better training methodology (more data, longer training, larger batches). The "twitter" in `cardiffnlp/twitter-roberta-base-sentiment` means it was fine-tuned on Twitter data — which matters because tweets have specific slang, emoji, abbreviations that a model trained on formal text would struggle with.

---

## Hugging Face Transformers Library

Hugging Face is basically GitHub but for ML models. The `transformers` library (Python) lets you download and use any model in their hub with 3 lines:

```python
from transformers import pipeline

# Download model (cached locally after first run)
# This is a high-level API — handles tokenization, inference, decoding
sentiment_analyzer = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    device=-1   # -1 = CPU, 0 = first GPU
)

# Inference
result = sentiment_analyzer("I love this so much!")
# → [{"label": "POSITIVE", "score": 0.9987}]
```

`pipeline()` abstracts away:
1. **Tokenization** — convert text to numbers the model understands (subword tokenization)
2. **Model inference** — forward pass through the neural network
3. **Post-processing** — convert raw logits to probability scores + labels

---

## The Full Python Script

```python
# sentiment_analysis.py
import sys
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # suppress TensorFlow logs
import json
from transformers import pipeline

# Initialize once at module load time (expensive — takes ~2 seconds)
sentiment_analyzer = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    device=-1
)

def analyze_sentiment(text):
    results = sentiment_analyzer(text)
    return results[0]  # pipeline returns a list, we want the first (only) result

if __name__ == "__main__":
    input_text = sys.argv[1]       # text passed as command line argument
    sentiment = analyze_sentiment(input_text)
    print(json.dumps(sentiment))   # output JSON to stdout
```

Input: text as `sys.argv[1]` (command line argument)
Output: JSON to stdout → `{"label": "POSITIVE", "score": 0.9987}`

---

## The FastAPI Sentiment Service (`sentiment_service.py`)

The model needs to run somewhere Python can use it. The approach: a **persistent FastAPI HTTP server** that loads the model once and handles requests until shut down.

```python
# backend/ml/sentiment_service.py
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI()

# Model loads ONCE here when the server starts — NOT on every request
sentiment_analyzer = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    device=-1,
)

class TextInput(BaseModel):
    text: str

@app.post("/analyze")
def analyze(input: TextInput):
    result = sentiment_analyzer(input.text)
    return result[0]

@app.get("/health")
def health():
    return {"status": "ok"}
```

Run it with:
```bash
uvicorn sentiment_service:app --host 0.0.0.0 --port 8001
```

**FastAPI** is a modern Python web framework — fast (it uses async under the hood), automatic OpenAPI docs at `/docs`, and `pydantic` gives you free input validation.

**Pydantic** validates the request body automatically. If someone sends `{ "text": 123 }` (a number instead of a string), FastAPI rejects it with a 422 error before your code even runs.

---

## The Node Bridge (`sentimentAnalyzer.js`)

With the FastAPI service running, Node just makes a regular HTTP call:

```js
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
```

That's it. No subprocess management, no EventEmitter wrangling, no stdout parsing. Just `fetch`. Node's built-in `fetch` (available since Node 18) handles the HTTP round-trip.

`SENTIMENT_SERVICE_URL` is in `.env` so you can point it at a remote server in production without changing code.

---

## Subprocess vs. Persistent Service — Why We Switched

The original approach was spawning a new Python process for every single message:

```
OLD: Message arrives → spawn python → load model (~2s) → inference → kill process
NEW: Message arrives → HTTP POST to localhost:8001 → inference (~0.1s) → response
```

| | Subprocess (old) | FastAPI service (new) |
|---|---|---|
| Model load cost | Every message (~2s) | Once at startup |
| Latency per message | ~2.1s | ~0.1s |
| Complexity | No extra process to manage | Must start and manage the service |
| Testability | Mock `child_process.spawn` with EventEmitters | Mock `fetch` — much simpler |
| Production-ready | No | Yes |

The trade-off: you now have one more process to start (`uvicorn ...`), but `start.sh` handles that automatically. The performance win is enormous.

---

## Performance Profile (After Fix)

Every chat message now triggers:
1. HTTP POST to `localhost:8001/analyze` (~1ms network)
2. Model inference (~100ms on CPU, already loaded)
3. JSON response back

Total: ~100ms vs the original ~2000ms. 20x faster.

For production at scale, you'd also want:
- A **GPU** (inference drops to ~5ms)
- **Multiple workers** (`uvicorn --workers 4`) to handle concurrent requests
- An **async queue** (e.g., Redis + Celery) so slow messages don't back up the WebSocket

---

## Model Output Interpretation

```json
{ "label": "POSITIVE", "score": 0.9987 }
```

- `label` — the predicted class
- `score` — confidence (softmax probability). 0.9987 means the model is 99.87% sure this is positive.

The model outputs 3 scores (one per class) that sum to 1.0 (they're probabilities). The pipeline returns only the top-scoring one.

---

## Requirements

From `backend/requirements.txt`:
```
transformers
torch
fastapi
uvicorn[standard]
```

`torch` = PyTorch, the ML framework that runs the model computations. Transformers runs on top of PyTorch (or TensorFlow).

`fastapi` + `uvicorn` = the web server that wraps the model. `uvicorn[standard]` includes extras like `websockets` and `httptools` for better performance.

Why PyTorch over TensorFlow? PyTorch has become the dominant research framework — more models are released in PyTorch first. For inference-only tasks like this, both would work fine.

---

## `TF_CPP_MIN_LOG_LEVEL = '2'`

TensorFlow (even if not used) sometimes gets imported as a side effect and prints noisy logs. Setting this env var suppresses warnings and info messages. Level 0 = all, 1 = no info, 2 = no info/warnings, 3 = errors only.

---

## What Happens If the Sentiment Service Is Down?

In `ws/handler.js`, the whole `handleMessage` function is wrapped in try/catch. If the FastAPI service is not running or returns an error, `analyzeSentiment()` throws, the catch logs it, and the message doesn't get broadcast.

This is still a rough failure mode (user's message silently disappears). A better approach would be to broadcast with a default sentiment `{ label: "NEUTRAL", score: 0 }` as a fallback and log the failure separately. But for now it's functional and the error is at least logged.

The `/health` endpoint (`GET /analyze/health`) lets you check if the service is up before starting the Node server.

---

## Why Twitter-RoBERTa Specifically?

For a chat app, Twitter data is actually a good match:
- Short messages (like tweets)
- Informal language, slang, abbreviations
- People expressing emotions directly

If you used a model trained on news articles or academic papers, it would handle "omg this is so lit 🔥" poorly. The domain match matters.
