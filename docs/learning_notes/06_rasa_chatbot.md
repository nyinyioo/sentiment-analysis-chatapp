# Rasa Chatbot — NLU, Intents, and the Bot Pipeline

## What Is Rasa?

Rasa is an **open-source conversational AI framework**. It lets you build a chatbot that:
1. Understands what users are saying (NLU — Natural Language Understanding)
2. Decides what to do (dialogue management)
3. Responds appropriately

The alternative to building your own NLU would be using a cloud service (Dialogflow, Amazon Lex). Rasa runs locally — no API keys, no data leaving your machine (except when it falls back to GPT).

In this project, Rasa runs as a separate server on `localhost:5005`. The Node.js backend POSTs messages to it and receives bot replies.

---

## Core Concepts

### Intent

An **intent** is the user's **purpose** behind a message. What are they trying to do/say?

Examples from this project:
```yaml
# nlu.yml
- intent: greet
  examples: |
    - hi
    - hey
    - hello
    - good morning

- intent: mood_unhappy
  examples: |
    - I'm feeling sad
    - I'm not doing well today.
    - Things are tough right now
```

Rasa's NLU model learns from these examples. When it sees "hey there", it maps it to `greet`. When it sees "I feel terrible", it maps it to `mood_unhappy`.

You never hardcode exact strings — the model generalizes from examples.

### Entity

Entities are **specific pieces of info** extracted from messages. Example: in "Book a flight to New York on Friday", the intent is `book_flight`, and the entities are `destination: New York` and `date: Friday`.

This project doesn't use entities much (it's a simple chatbot), but they're a key concept for more complex bots.

### Response

Pre-written bot replies. Defined in `domain.yml`:

```yaml
responses:
  utter_regreeting:
    - text: "Hello, How are you doing today?"

  utter_goodbye:
    - text: "Bye, Have a great day!"

  utter_happy:
    - text: "That's great to hear!"
    - text: "Great! Let me know if there's anything else I can do for you."
    # Multiple options = bot randomly picks one (adds variety)
```

### Action

An **action** is what the bot does in response to an intent. Simple responses use `utter_*` actions (just send a text response). Complex actions are custom Python code.

---

## The Rasa Files

### `domain.yml` — The Bot's "Knowledge"

Defines everything the bot knows and can do:
- `intents` — list of all intent names
- `responses` — all pre-written responses
- `actions` — custom actions the bot can execute
- `session_config` — how long conversation context is kept

```yaml
intents:
  - greet
  - goodbye
  - mood_unhappy
  # ...

actions:
  - action_chatgpt  # custom Python action

session_config:
  session_expiration_time: 60  # minutes
  carry_over_slots_to_new_session: true
```

### `data/nlu.yml` — Training Data for Intent Classification

These are the examples the ML model learns from. More examples = better accuracy. Each intent needs at least a few varied examples to generalize well.

```yaml
nlu:
- intent: greet
  examples: |
    - hi
    - hey
    - hello
    - good morning
    - good evening
```

### `data/stories.yml` — Multi-Turn Conversation Flows

A **story** is an example conversation showing the bot what should happen given a sequence of intents:

```yaml
stories:
- story: mood unhappy path
  steps:
  - intent: mood_unhappy
  - action: action_chatgpt   # When user says they're unhappy, call GPT
```

Stories train the **dialogue management** model — the part that decides what to do next in a conversation.

### `data/rules.yml` — Hard Rules (Always Do X When Y)

Rules are simpler than stories — they always apply regardless of conversation history:

```yaml
rules:
- rule: respond to goodbye
  steps:
  - intent: goodbye
  - action: utter_goodbye   # ALWAYS say goodbye when user says goodbye

- rule: chatgpt fallback
  steps:
  - intent: nlu_fallback    # When NLU confidence is below threshold
  - action: action_chatgpt  # Fall back to GPT
```

Rules vs Stories: use rules for simple, always-true patterns. Use stories for conversational flows that depend on context.

---

## `config.yml` — The NLU Pipeline

```yaml
pipeline:
- name: WhitespaceTokenizer      # Split "hello world" → ["hello", "world"]
- name: RegexFeaturizer          # Pattern-based features
- name: LexicalSyntacticFeaturizer  # POS tags, prefixes, suffixes
- name: CountVectorsFeaturizer   # Bag-of-words features
- name: DIETClassifier           # The main ML classifier
  epochs: 100
- name: EntitySynonymMapper      # Normalize synonymous entities
- name: ResponseSelector         # For FAQ-style responses
  epochs: 100
- name: FallbackClassifier       # Handles low-confidence predictions
  threshold: 0.8                 # Below 0.8 confidence = nlu_fallback intent
  ambiguity_threshold: 0.1
```

The pipeline is like an assembly line for processing messages:

1. **Tokenizer** — breaks text into tokens (words/subwords)
2. **Featurizers** — convert tokens into numeric vectors (features the classifier can use)
3. **DIETClassifier** (Dual Intent and Entity Transformer) — classifies intent AND extracts entities simultaneously using a transformer architecture
4. **FallbackClassifier** — if the best intent has < 80% confidence, fires `nlu_fallback`

```yaml
policies:
- name: MemoizationPolicy  # Exact story memorization — if we've seen this exact conv before
- name: RulePolicy         # Enforce rules.yml
- name: TEDPolicy          # Transformer Embedding Dialogue — learns from stories
  max_history: 5           # Consider last 5 conversation turns
  epochs: 100
```

**TEDPolicy** is the core dialogue model. It's a transformer that learns from stories to predict what action to take next, given conversation history.

---

## `actions.py` — The GPT-4o-mini Fallback

This is where it gets cool. When Rasa doesn't understand something (or when the story says to call GPT), it triggers the custom `action_chatgpt`:

```python
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class ActionChatGPT(Action):

    def name(self):
        return "action_chatgpt"  # Must match domain.yml

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: dict):

        # Get the user's last message
        user_message = tracker.latest_message.get("text")

        # Call OpenAI
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": user_message}
            ]
        )

        # Extract the reply
        bot_reply = completion.choices[0].message.content

        # Send it back through Rasa's dispatcher
        dispatcher.utter_message(text=bot_reply)
        return []
```

**`Tracker`** — keeps track of conversation history, current state, last message
**`CollectingDispatcher`** — how the action sends messages back to the user
**`return []`** — return list of events (slot changes, etc.). Empty here.

This runs as a **custom action server** on port 5055. Rasa's main server calls it via HTTP when the action is triggered.

---

## How Rasa Integrates with Node.js

Node sends a message to Rasa:
```js
const rasaResponse = await fetch("http://localhost:5005/webhooks/rest/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        sender: messageData.roomId,  // used as conversation ID
        message: messageData.text
    })
});

const rasaMessages = await rasaResponse.json();
// → [{ "text": "Hello, How are you doing today?" }]
```

Rasa's REST webhook:
- Input: `{ sender, message }` — who's sending and what they said
- Output: array of bot replies `[{ "text": "..." }]`

The `sender` field is the conversation ID. Rasa uses it to maintain conversation context per user (so it remembers what was said earlier in the conversation).

---

## The Fallback Chain

This project has a two-level fallback:

1. **Rasa handles it**: Intent recognized, confidence ≥ 0.8 → scripted response
2. **Rasa fallback → GPT**: Intent confidence < 0.8 → `nlu_fallback` → `action_chatgpt`

So simple messages like "hi" or "bye" are handled locally (fast, free). Anything more complex or out of scope goes to GPT (slower, costs money per call).

---

## Training Rasa

Before you can run Rasa, you have to train it:

```bash
cd backend/rasa
rasa train
# Produces: models/20251215-193830-cream-contrast.tar.gz
```

Training:
1. Trains the NLU pipeline (DIETClassifier) on `nlu.yml` examples
2. Trains the dialogue model (TEDPolicy) on `stories.yml`
3. Packages everything into a `.tar.gz` model file

The models are stored in `backend/rasa/models/`. When Rasa starts, it loads the latest model.

---

## Running Rasa

Two processes need to run:

```bash
# Terminal 1: Main Rasa server (NLU + dialogue)
rasa run --enable-api --cors "*"

# Terminal 2: Custom action server (for action_chatgpt)
rasa run actions
```

The main server runs on `localhost:5005`. The action server runs on `localhost:5055`. They communicate internally when a custom action is triggered.

---

## Rasa vs. Just Using ChatGPT Directly

| | Rasa + GPT fallback | GPT only |
|---|---|---|
| Cost | Cheap (most replies are free) | Every message costs money |
| Speed | Fast for known intents | Depends on API latency |
| Control | Scripted responses are 100% predictable | GPT can say unexpected things |
| Maintenance | Must maintain training data | Just update the system prompt |
| Complexity | Two services to run | One API call |

The hybrid approach is clever: use the deterministic, free path when you can, escalate to the powerful (but expensive) LLM when needed.
