# Learning Notes — Sentiment Analysis Chat App

| File | What's in it |
|------|-------------|
| `00_project_overview.md` | Big picture, architecture diagram, full message lifecycle, design decisions |
| `01_nodejs_express.md` | Node.js event loop, Express routing, middleware, modular routing (factory pattern), async/await |
| `02_mongodb.md` | NoSQL vs SQL, documents, CRUD, ObjectId, Database.js abstraction, conversation block pattern |
| `03_websockets.md` | WS vs HTTP polling, handshake, ws library, room-filtered broadcasting, client-side JS |
| `04_sessions_cookies_auth.md` | Stateless HTTP problem, cookies, session tokens, password hashing with salt, custom error classes |
| `05_sentiment_analysis_ml.md` | NLP basics, transformers, BERT/RoBERTa, Hugging Face pipeline, FastAPI microservice, subprocess vs HTTP |
| `06_rasa_chatbot.md` | NLU, intents, entities, stories, rules, DIET classifier, TEDPolicy, GPT-4o-mini custom action |
| `07_security.md` | CSP, nonces, XSS, CORS, Helmet headers, DoS mitigation, env vars for secrets |
| `08_testing.md` | Jest, pytest, mocking fetch, mongodb-memory-server, fake timers, coverage, AAA pattern |
| `09_docker_devops.md` | VMs vs containers, Dockerfile, docker-compose, env_file (no hardcoded creds), Jenkins CI pipeline |

## Quick Concept Lookup

- **Why does the server need `http.createServer(app)`?** → `03_websockets.md`
- **What is `this.connected`?** → `02_mongodb.md`
- **How does `sessionManager.middleware` work?** → `04_sessions_cookies_auth.md`
- **What is a nonce?** → `07_security.md`
- **Why FastAPI instead of spawning Python per message?** → `05_sentiment_analysis_ml.md`
- **What is `nlu_fallback`?** → `06_rasa_chatbot.md`
- **How does WebSocket room filtering work?** → `03_websockets.md`
- **How does `jest.useFakeTimers()` work?** → `08_testing.md`
- **Why `env_file` in docker-compose?** → `09_docker_devops.md`
- **What is the factory function routing pattern?** → `01_nodejs_express.md`
