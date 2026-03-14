# Sentiment Analysis Chat App

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/45622aa010ee42d8875024d5f189e4cc)](https://app.codacy.com/gh/nyinyioo/sentiment-analysis-chatapp/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy Badge](https://app.codacy.com/project/badge/Coverage/45622aa010ee42d8875024d5f189e4cc)](https://app.codacy.com/gh/nyinyioo/sentiment-analysis-chatapp/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)


### Overview
- A real-time chat application with Rasa chatbot (NLU training is still a work in progress) and a GPT-4o-mini fallback.
- Stack: MongoDB, Express, EJS, Node.js, Python (FastAPI + Hugging Face)


### Set-Up Instructions
  
```bash
git clone <repo-url>
cd sentiment-analysis-chatapp
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
cd backend/app
npm install
cd ../..
./scripts/start.sh
```
  

### Testing

- Unit tests cover the Node.js backend (Jest) and Python ML module (pytest). 

- The sentiment analyzer mocks `child_process` and the Python tests mocks `transformers.pipeline` during tests.

- Each module is tested in isolation. 


```bash
# Node.js tests
cd backend/app && npm test

# Python tests
source venv/bin/activate && cd backend/ml && pytest -v
```