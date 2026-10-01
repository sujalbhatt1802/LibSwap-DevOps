const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'libswap-test-secret';

const app = require('../app');

const Review = require('../models/Review');
const Book = require('../models/Book');
const User = require('../models/User');

jest.setTimeout(120000);

let mongoServer;
let databaseReady = false;

let studentUser;
let otherStudentUser;
let testBook;

let studentToken;
let otherStudentToken;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: {
            launchTimeout: 60000
        }
    });

    await mongoose.connect(
        mongoServer.getUri()
    );

    databaseReady = true;
});

beforeEach(async () => {

    studentUser = await User.create({
        username: 'studentone',
        fullName: 'Student One',
        email: 'student1@test.com',
        passwordHash: 'test-password-hash',
        role: 'student'
    });

    otherStudentUser = await User.create({
        username: 'studenttwo',
        fullName: 'Student Two',
        email: 'student2@test.com',
        passwordHash: 'test-password-hash',
        role: 'student'
    });

    testBook = await Book.create({
        title: 'Review Test Book',
        author: 'Test Author',
        genre: 'Testing',
        available: true
    });

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

    otherStudentToken = jwt.sign(
        {
            userId: otherStudentUser._id.toString(),
            role: 'student'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h'
        }
    );
});

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

afterAll(async () => {

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (mongoServer) {
        await mongoServer.stop();
    }
});

describe('Review Authentication', () => {

    test('rejects review creation without a token', async () => {

        const response = await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .send({
                rating: 5,
                comment: 'Great book'
            })
            .expect(401);

        expect(response.body.message).toBe(
            'Authentication token required'
        );
    });


    test('rejects review creation with an invalid token', async () => {

        const response = await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                'Bearer invalid-token'
            )
            .send({
                rating: 5,
                comment: 'Great book'
            })
            .expect(401);

        expect(response.body.message).toBe(
            'Invalid or expired token'
        );
    });


    test('allows authenticated student to create review', async () => {

        const response = await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                rating: 5,
                comment: 'Great book'
            })
            .expect(201);

        expect(response.body.review.userId)
            .toBe(studentUser._id.toString());

        expect(response.body.review.bookId)
            .toBe(testBook._id.toString());

        expect(response.body.review.rating)
            .toBe(5);

        expect(response.body.review.moderationStatus)
            .toBe('pending');
    });

});

describe('Review Validation', () => {

    test('rejects rating below 1', async () => {

        await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                rating: 0,
                comment: 'Invalid rating'
            })
            .expect(400);
    });


    test('rejects rating above 5', async () => {

        await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                rating: 6,
                comment: 'Invalid rating'
            })
            .expect(400);
    });


    test('rejects non-integer rating', async () => {

        await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                rating: 3.5,
                comment: 'Invalid rating'
            })
            .expect(400);
    });


    test('rejects empty comment', async () => {

        await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                rating: 5,
                comment: ''
            })
            .expect(400);
    });


    test('rejects comment longer than 1000 characters', async () => {

        const longComment = 'a'.repeat(1001);

        await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                rating: 5,
                comment: longComment
            })
            .expect(400);
    });

});

describe('Duplicate Reviews', () => {

    test('prevents the same student reviewing the same book twice', async () => {

        await Review.create({
            userId: studentUser._id,
            bookId: testBook._id,
            rating: 5,
            comment: 'First review',
            moderationStatus: 'pending'
        });

        const response = await request(app)
            .post(
                `/api/books/${testBook._id}/reviews`
            )
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                rating: 4,
                comment: 'Second review'
            })
            .expect(409);

        expect(response.body.message).toBe(
            'You have already reviewed this book'
        );
    });

});

test('user can update their own review', async () => {

    const review = await Review.create({
        userId: studentUser._id,
        bookId: testBook._id,
        rating: 4,
        comment: 'Original review',
        moderationStatus: 'approved'
    });

    const response = await request(app)
        .patch(`/api/reviews/${review._id}`)
        .set(
            'Authorization',
            `Bearer ${studentToken}`
        )
        .send({
            rating: 5,
            comment: 'Updated review'
        })
        .expect(200);

    expect(response.body.review.rating)
        .toBe(5);

    expect(response.body.review.comment)
        .toBe('Updated review');

    expect(response.body.review.moderationStatus)
        .toBe('pending');
});

test('user cannot update another users review', async () => {

    const review = await Review.create({
        userId: studentUser._id,
        bookId: testBook._id,
        rating: 4,
        comment: 'Original review'
    });

    await request(app)
        .patch(`/api/reviews/${review._id}`)
        .set(
            'Authorization',
            `Bearer ${otherStudentToken}`
        )
        .send({
            rating: 1,
            comment: 'Trying to modify someone elses review'
        })
        .expect(404);
});

test('user cannot delete another users review', async () => {

    const review = await Review.create({
        userId: studentUser._id,
        bookId: testBook._id,
        rating: 4,
        comment: 'Original review'
    });

    await request(app)
        .delete(`/api/reviews/${review._id}`)
        .set(
            'Authorization',
            `Bearer ${otherStudentToken}`
        )
        .expect(404);
});

test('user can delete their own review', async () => {

    const review = await Review.create({
        userId: studentUser._id,
        bookId: testBook._id,
        rating: 4,
        comment: 'Delete this review'
    });

    await request(app)
        .delete(`/api/reviews/${review._id}`)
        .set(
            'Authorization',
            `Bearer ${studentToken}`
        )
        .expect(200);

    const deletedReview =
        await Review.findById(review._id);

    expect(deletedReview).toBeNull();
});

describe('Review Visibility', () => {

    test('only approved reviews are returned publicly', async () => {

        await Review.create([
            {
                userId: studentUser._id,
                bookId: testBook._id,
                rating: 5,
                comment: 'Approved review',
                moderationStatus: 'approved'
            },
            {
                userId: otherStudentUser._id,
                bookId: testBook._id,
                rating: 2,
                comment: 'Pending review',
                moderationStatus: 'pending'
            }
        ]);

        const response = await request(app)
            .get(
                `/api/books/${testBook._id}/reviews`
            )
            .expect(200);

        expect(response.body.count)
            .toBe(1);

        expect(
            response.body.reviews[0].comment
        ).toBe('Approved review');
    });

});