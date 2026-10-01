pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Build Docker Image') {
            steps {
                echo 'Building Docker image...'
                bat 'docker build -t libswap:latest .'
            }
        }

        stage('Test') {
            steps {
                bat 'npm test -- --runInBand'
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    bat "\"${tool 'SonarScanner'}\\bin\\sonar-scanner.bat\" -Dsonar.projectKey=libSwap -Dsonar.sources=. -Dsonar.host.url=http://localhost:9000"
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'libswap-*.tar', allowEmptyArchive: true
        }

        success {
            echo '=== LibSwap Build and Test Successful ==='
        }

        failure {
            echo '=== LibSwap Pipeline Failed ==='
            echo 'Check the failed stage and console output.'
        }
    }
}