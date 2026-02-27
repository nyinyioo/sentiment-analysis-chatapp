pipeline {
    agent any

    environment {
        NODE_ENV = 'test'
        CI       = 'true'
        WSL_REPO = '/home/nyiman123/sentiment-analysis-chatapp'
    }

    triggers {
        pollSCM('H/5 * * * *')
    }

    stages {

        stage('Checkout') {
            steps {
                // Jenkins will still checkout repo in Windows workspace
                checkout scm
            }
        }

        stage('Node Install') {
            steps {
                sh "wsl npm ci --prefix ${WSL_REPO}/backend/app"
            }
        }

        stage('Node Test') {
            steps {
                sh "wsl npm test --prefix ${WSL_REPO}/backend/app -- --forceExit"
            }
        }

        stage('Python Setup & Test') {
            steps {
                // Setup Python venv in WSL
                sh "wsl python3 -m venv ${WSL_REPO}/backend/.venv"
                sh "wsl ${WSL_REPO}/backend/.venv/bin/pip install --upgrade pip"
                sh "wsl ${WSL_REPO}/backend/.venv/bin/pip install -r ${WSL_REPO}/backend/requirements-dev.txt"

                // Run pytest with correct PYTHONPATH
                sh "wsl PYTHONPATH=${WSL_REPO}/backend/ml/sentiment_analysis ${WSL_REPO}/backend/.venv/bin/pytest ${WSL_REPO}/backend/ml/sentiment_analysis/tests -v --disable-warnings"
            }
        }
    }

    post {
        always {
            // Clean Windows workspace (does not touch WSL venv)
            cleanWs()
        }
    }
}