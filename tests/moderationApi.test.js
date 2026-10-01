const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Use a test-only JWT secret.
// This is NOT the real secret from .env.
process.env.JWT_SECRET = 'libswap-test-secret';

const app = require('../app');

const Review = require('../models/Review');
const Book = require('../models/Book');
const User = require('../models/User');


// Give Jest enough time for the temporary MongoDB server
jest.setTimeout(120000);

let mongoServer;
let databaseReady = false;

let staffUser;
let studentUser;
let testBook;

let staffToken;
let studentToken;


// Start a temporary MongoDB database before the tests run
beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: {
            launchTimeout: 60000
        }
    });

    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri);

    databaseReady = true;
});


// Create fresh test users and a book before every test
beforeEach(async () => {
    staffUser = await User.create({
        username: 'teststaff',
        fullName: 'Test Staff',
        email: 'staff@test.com',
        passwordHash: 'test-password-hash',
        role: 'staff'
    });

    studentUser = await User.create({
        username: 'teststudent',
        fullName: 'Test Student',
        email: 'student@test.com',
        passwordHash: 'test-password-hash',
        role: 'student'
    });

    testBook = await Book.create({
        title: 'Moderation Test Book',
        author: 'Test Author',
        genre: 'Testing',
        available: true
    });


    // Create a valid staff JWT
    staffToken = jwt.sign(
        {
            userId: staffUser._id.toString(),
            role: 'staff'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h'
        }
    );


    // Create a valid student JWT
    studentToken = jwt.sign(
        {
            userId: studentUser._id.toString(),
            role: 'student'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h'
        }
    );
});


// Remove test data after every test
afterEach(async () => {
    if (
        databaseReady &&
        mongoose.connection.readyState === 1
    ) {
        await Review.deleteMany({});
        await Book.deleteMany({});
        await User.deleteMany({});
    }
});


// Close the temporary database after all tests finish
afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (mongoServer) {
        await mongoServer.stop();
    }
});


describe('Moderation API automated tests', () => {

    test('GET pending reviews rejects a request without a token', async () => {
        const response = await request(app)
            .get('/api/moderation/reviews/pending')
            .expect(401);

        expect(response.body.message).toBe(
            'Authentication token required'
        );
    });


    test('GET pending reviews rejects a student user', async () => {
        const response = await request(app)
            .get('/api/moderation/reviews/pending')
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .expect(403);

        expect(response.body.message).toBe(
            'Staff access required'
        );
    });


    test('GET pending reviews allows staff to view pending content', async () => {
        await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 4,
            comment: 'This review is waiting for moderation.'
        });

        await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 5,
            comment: 'This review has already been approved.',
            moderationStatus: 'approved'
        });

        const response = await request(app)
            .get('/api/moderation/reviews/pending')
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(200);

        expect(response.body.count).toBe(1);

        expect(response.body.reviews).toHaveLength(1);

        expect(
            response.body.reviews[0].moderationStatus
        ).toBe('pending');

        expect(
            response.body.reviews[0].bookId.title
        ).toBe('Moderation Test Book');

        expect(
            response.body.reviews[0].userId.fullName
        ).toBe('Test Student');
    });


    test('PUT approve allows staff to approve a pending review', async () => {
        const review = await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 4,
            comment: 'A valid review.'
        });

        const response = await request(app)
            .put(
                `/api/moderation/reviews/${review._id}/approve`
            )
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(200);

        expect(response.body.message).toBe(
            'Review approved successfully'
        );

        const updatedReview =
            await Review.findById(review._id);

        expect(
            updatedReview.moderationStatus
        ).toBe('approved');

        expect(
            updatedReview.moderatedBy.toString()
        ).toBe(staffUser._id.toString());

        expect(updatedReview.moderatedAt).not.toBeNull();
    });


    test('PUT remove allows staff to remove a pending review', async () => {
        const review = await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 1,
            comment: 'Content requiring removal.'
        });

        const response = await request(app)
            .put(
                `/api/moderation/reviews/${review._id}/remove`
            )
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(200);

        expect(response.body.message).toBe(
            'Review removed successfully'
        );

        const updatedReview =
            await Review.findById(review._id);

        expect(
            updatedReview.moderationStatus
        ).toBe('removed');

        expect(
            updatedReview.moderatedBy.toString()
        ).toBe(staffUser._id.toString());

        expect(updatedReview.moderatedAt).not.toBeNull();
    });


    test('PUT approve rejects a request without a token', async () => {
        const review = await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 3,
            comment: 'Protected review.'
        });

        const response = await request(app)
            .put(
                `/api/moderation/reviews/${review._id}/approve`
            )
            .expect(401);

        expect(response.body.message).toBe(
            'Authentication token required'
        );
    });


    test('PUT remove rejects a student user', async () => {
        const review = await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 2,
            comment: 'Student should not moderate this.'
        });

        const response = await request(app)
            .put(
                `/api/moderation/reviews/${review._id}/remove`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .expect(403);

        expect(response.body.message).toBe(
            'Staff access required'
        );
    });


    test('PUT approve rejects an invalid review ID', async () => {
        const response = await request(app)
            .put(
                '/api/moderation/reviews/not-a-valid-id/approve'
            )
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(400);

        expect(response.body.message).toBe(
            'Invalid review ID'
        );
    });


    test('PUT remove returns 404 for a missing review', async () => {
        const missingReviewId =
            new mongoose.Types.ObjectId();

        const response = await request(app)
            .put(
                `/api/moderation/reviews/${missingReviewId}/remove`
            )
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(404);

        expect(response.body.message).toBe(
            'Review not found'
        );
    });


    test('PUT approve rejects a review that has already been moderated', async () => {
        const review = await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 5,
            comment: 'Already approved review.',
            moderationStatus: 'approved',
            moderatedBy: staffUser._id,
            moderatedAt: new Date()
        });

        const response = await request(app)
            .put(
                `/api/moderation/reviews/${review._id}/approve`
            )
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(409);

        expect(response.body.message).toBe(
            'Review has already been moderated'
        );
    });

});