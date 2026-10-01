const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key';
process.env.JWT_EXPIRES_IN = '1d';

const app = require('../app');

describe('JWT Authentication Middleware', () => {

    test('should reject request without authentication token', async () => {
        const response = await request(app)
            .get('/api/auth/me');

        expect(response.status).toBe(401);

        expect(response.body.message)
            .toBe('Authentication token required');
    });


    test('should reject an invalid JWT token', async () => {
        const response = await request(app)
            .get('/api/auth/me')
            .set(
                'Authorization',
                'Bearer invalid-token'
            );

        expect(response.status).toBe(401);

        expect(response.body.message)
            .toBe('Invalid or expired token');
    });


    test('should allow a valid JWT token', async () => {
        const token = jwt.sign(
            {
                userId: 'test-user-123',
                role: 'student'
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '1d'
            }
        );

        const response = await request(app)
            .get('/api/auth/me')
            .set(
                'Authorization',
                `Bearer ${token}`
            );

        expect(response.status).toBe(200);

        expect(response.body.message)
            .toBe('Authenticated successfully');

        expect(response.body.user.userId)
            .toBe('test-user-123');

        expect(response.body.user.role)
            .toBe('student');
    });
});
