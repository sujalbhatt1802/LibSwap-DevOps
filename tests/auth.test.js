const request = require('supertest');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test_secret_key';
process.env.JWT_EXPIRES_IN = '1d';

jest.mock('../models/User');

const User = require('../models/User');
const app = require('../app');

describe('Authentication API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/register', () => {

        test('should register a new user successfully', async () => {
            User.findOne.mockResolvedValue(null);

            User.create.mockResolvedValue({
                _id: 'user123',
                username: 'teststudent',
                fullName: 'Test Student',
                email: 'test@student.com',
                role: 'student'
            });

            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'teststudent',
                    fullName: 'Test Student',
                    email: 'test@student.com',
                    password: 'password123'
                });

            expect(response.status).toBe(201);
            expect(response.body.message)
                .toBe('User registered successfully');

            expect(response.body.user.username)
                .toBe('teststudent');

            expect(User.findOne).toHaveBeenCalled();
            expect(User.create).toHaveBeenCalled();

            const createData = User.create.mock.calls[0][0];

            expect(createData.email)
                .toBe('test@student.com');

            expect(createData.role)
                .toBe('student');

            expect(createData.passwordHash)
                .not.toBe('password123');

            expect(
                await bcrypt.compare(
                    'password123',
                    createData.passwordHash
                )
            ).toBe(true);
        });


        test('should reject registration when required fields are missing', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'teststudent'
                });

            expect(response.status).toBe(400);

            expect(response.body.message)
                .toBe(
                    'Username, full name, email and password are required'
                );

            expect(User.findOne).not.toHaveBeenCalled();
        });


        test('should reject a password shorter than 6 characters', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'teststudent',
                    fullName: 'Test Student',
                    email: 'test@student.com',
                    password: '123'
                });

            expect(response.status).toBe(400);

            expect(response.body.message)
                .toBe(
                    'Password must be at least 6 characters long'
                );

            expect(User.findOne).not.toHaveBeenCalled();
        });


        test('should reject duplicate username or email', async () => {
            User.findOne.mockResolvedValue({
                username: 'existinguser',
                email: 'existing@student.com'
            });

            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'existinguser',
                    fullName: 'Existing User',
                    email: 'existing@student.com',
                    password: 'password123'
                });

            expect(response.status).toBe(409);

            expect(response.body.message)
                .toBe('Username or email already exists');

            expect(User.create).not.toHaveBeenCalled();
        });
    });


    describe('POST /api/auth/login', () => {

        test('should login successfully and return a JWT', async () => {
            const passwordHash = await bcrypt.hash(
                'password123',
                12
            );

            User.findOne.mockReturnValue({
                select: jest.fn().mockResolvedValue({
                    _id: 'user123',
                    username: 'teststudent',
                    fullName: 'Test Student',
                    email: 'test@student.com',
                    passwordHash,
                    role: 'student'
                })
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@student.com',
                    password: 'password123'
                });

            expect(response.status).toBe(200);

            expect(response.body.message)
                .toBe('Login successful');

            expect(response.body.token)
                .toBeDefined();

            expect(response.body.user.email)
                .toBe('test@student.com');
        });


        test('should reject invalid login credentials', async () => {
            User.findOne.mockReturnValue({
                select: jest.fn().mockResolvedValue(null)
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'wrong@student.com',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);

            expect(response.body.message)
                .toBe('Invalid email or password');
        });


        test('should reject login when fields are missing', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@student.com'
                });

            expect(response.status).toBe(400);

            expect(response.body.message)
                .toBe('Email and password are required');
        });
    });
});
