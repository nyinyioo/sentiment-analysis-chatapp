pipeline {
    agent any

    environment {
        NODE_ENV = 'test'
        CI      = 'true'
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

        stage('Python Setup') {
            steps {
                sh "wsl python3 -m venv ${WSL_REPO}/.venv"
                sh "wsl ${WSL_REPO}/.venv/bin/pip install -r ${WSL_REPO}/backend/requirements-dev.txt"
            }
        }

        stage('Python Test') {
            steps {
                sh """
                wsl bash -c \"
                cd ${WSL_REPO}/backend/ml && \
                PYTHONPATH=${WSL_REPO}/backend/ml/sentiment_analysis \
                ${WSL_REPO}/.venv/bin/pytest sentiment_analysis/tests -v
                \"
                """
            }
        }
    }

    post {
        always {
            // Clean Windows workspace, your WSL venv and repo are separate
            cleanWs()
        }
    }
}