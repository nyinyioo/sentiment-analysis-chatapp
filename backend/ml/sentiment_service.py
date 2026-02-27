"""
Persistent sentiment analysis microservice.
Fix: replaces the subprocess-per-message approach.
The transformer model loads once at startup and stays in memory. 
All requests are served in <100ms instead of a 2+ second cold-start 
on every single chat message.

Run with:
    uvicorn sentiment_service:app --host 0.0.0.0 --port 8001
"""

import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI(title="Sentiment Analysis Service")

# Model loads ONCE here — not on every request
print("[Sentiment] Loading model...")
sentiment_analyzer = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    device=-1,  # -1 = CPU; change to 0 for first GPU
)
print("[Sentiment] Model ready.")


class TextInput(BaseModel):
    text: str


@app.post("/analyze")
def analyze(input: TextInput):
    if not input.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")
    result = sentiment_analyzer(input.text)
    return result[0]


@app.get("/health")
def health():
    return {"status": "ok"}
