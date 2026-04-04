# Sentiment Analysis Chat App

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/45622aa010ee42d8875024d5f189e4cc)](https://app.codacy.com/gh/nyinyioo/sentiment-analysis-chatapp/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy Badge](https://app.codacy.com/project/badge/Coverage/45622aa010ee42d8875024d5f189e4cc)](https://app.codacy.com/gh/nyinyioo/sentiment-analysis-chatapp/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)


### Overview
- A real-time chat app with Rasa chatbot (NLU training is still a work in progress) and a GPT-4o-mini fallback.
- Stack: MongoDB, Express, React, Node.js, Python (FastAPI + Hugging Face)


### Set-Up Instructions
  
```bash
git clone <repo-url>
cd sentiment-analysis-chatapp
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
cd backend/app
npm install
cd ../../frontend-react
npm install
cd ..
./scripts/start.sh
```
  

### Testing

Unit tests are implemented for each module
- **Backend**: Node.js (Jest) and Python ML module (pytest)  
- **Frontend**: React (Vitest)

Run tests using the following commands:

```bash
# Node.js tests
cd backend/app && npm test

# Python tests
source venv/bin/activate && cd backend/ml && pytest -v

# React tests
cd frontend-react/ && npm test
```