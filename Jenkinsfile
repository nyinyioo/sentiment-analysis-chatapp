pipeline {
    agent any

    environment {
        NODE_ENV = 'test'
        CI      = 'true'
    }

    triggers {
        pollSCM('H/5 * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Node Install') {
            steps {
                dir('backend/app') {
                    sh 'npm ci'
                }
            }
        }

        stage('Node Test') {
            steps {
                dir('backend/app') {
                    sh 'npm test -- --forceExit'
                }
            }
        }

        stage('Python Setup') {
            steps {
                sh 'python3 -m venv ${WORKSPACE}/.venv'
                sh '${WORKSPACE}/.venv/bin/pip install -r backend/requirements-dev.txt'
            }
        }

        stage('Python Test') {
            steps {
                sh '''
                    cd backend/ml
                    PYTHONPATH=${WORKSPACE}/backend/ml/sentiment_analysis \
                        ${WORKSPACE}/.venv/bin/pytest sentiment_analysis/tests -v
                '''
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
