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
        stage('Security') {
            steps {
                echo 'Running Trivy security scan...'
                bat 'trivy fs --severity HIGH,CRITICAL --exit-code 1 --no-progress .'
            }
        }
        stage('Deploy') {
            steps {
                echo 'Deploying LibSwap using Docker Compose...'
                bat 'docker compose down'
                bat 'docker compose up -d --build'
                bat 'docker compose ps'
            }
        }
        stage('Release') {
            steps {
                echo 'Promoting tested image to production...'
                bat 'docker tag libswap:latest libswap:release-latest'
                bat 'docker compose -f docker-compose.prod.yml up -d'
                bat 'docker compose -f docker-compose.prod.yml ps'
            }
        }
        stage('Monitoring') {
            steps {
                echo 'Checking production health through Prometheus...'

                bat '''
                    curl.exe -G -s "http://localhost:9090/api/v1/query" --data-urlencode "query=probe_success{job=\\"libswap-production\\"}" > monitoring-result.json
                '''

                bat '''
                    powershell -NoProfile -Command "$json = Get-Content -Raw monitoring-result.json | ConvertFrom-Json; if ($json.status -eq 'success' -and $json.data.result.Count -gt 0 -and $json.data.result[0].value[1] -eq '1') { Write-Host 'Production monitoring check: UP'; exit 0 } else { Write-Host 'Production monitoring check: DOWN'; exit 1 }"
                '''
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