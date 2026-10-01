pipeline {
    agent any

    stages {

        stage('Build') {
            steps {
                echo '=== Building LibSwap ==='

                bat 'node --version'
                bat 'npm --version'

                echo 'Installing dependencies...'
                bat 'npm ci'

                echo 'Building Docker image...'
                bat 'docker build -t libswap:%BUILD_NUMBER% .'

                echo 'Creating Docker artifact...'
                bat 'docker save -o libswap-%BUILD_NUMBER%.tar libswap:%BUILD_NUMBER%'
            }
        }

        stage('Test') {
            steps {
                echo '=== Running LibSwap Tests ==='

                bat 'npm test -- --runInBand'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'libswap-*.tar',
                             allowEmptyArchive: true
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