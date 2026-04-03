import sys
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import json
from transformers import pipeline

sentiment_analyzer = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    device=-1
)

def analyze_sentiment(text):
    if text is None:
        return None
    
    results = sentiment_analyzer(text)
    return results[0]

if __name__ == "__main__":
    input_text = sys.argv[1]
    sentiment = analyze_sentiment(input_text)
    print(json.dumps(sentiment))