const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Use a test-only JWT secret.
process.env.JWT_SECRET = 'libswap-test-secret';

const app = require('../app');
const Book = require('../models/Book');
const SwapRequest = require('../models/SwapRequest');

// Give Jest enough time for the temporary MongoDB server
jest.setTimeout(120000);

let mongoServer;
let databaseReady = false;

let studentToken;
let studentUserId;
let hackerToken;
let hackerUserId;

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

    // Create a valid student ID and matching JWT
    studentUserId = new mongoose.Types.ObjectId().toString();
    studentToken = jwt.sign(
        {
            userId: studentUserId,
            role: 'student'
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    // Create a secondary user to test permissions and hacking attempts
    hackerUserId = new mongoose.Types.ObjectId().toString();
    hackerToken = jwt.sign(
        {
            userId: hackerUserId,
            role: 'student'
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
});

// Remove test data after every test
afterEach(async () => {
    if (databaseReady && mongoose.connection.readyState === 1) {
        await Book.deleteMany({});
        await SwapRequest.deleteMany({});
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

describe('Dashboard My Books API automated tests', () => {

    // ---------------------------------------------------------
    // POST (ADD BOOK) TESTS
    // ---------------------------------------------------------

    test('POST /dashboard/my-books/:userId successfully adds a book', async () => {
        const response = await request(app)
            .post(`/dashboard/my-books/${studentUserId}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                title: 'The Hobbit',
                author: 'J.R.R. Tolkien',
                genre: 'Fantasy'
            })
            .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.title).toBe('The Hobbit');

        const savedBook = await Book.findOne({ title: 'The Hobbit' });
        expect(savedBook).not.toBeNull();
        expect(savedBook.ownerId.toString()).toBe(studentUserId);
    });

    test('POST /dashboard/my-books/:userId rejects inputs that are only whitespace', async () => {
        const response = await request(app)
            .post(`/dashboard/my-books/${studentUserId}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                title: '   ',
                author: '   '
            })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/cannot be empty or just spaces/i);
    });

    test('POST /dashboard/my-books/:userId rejects inputs exceeding maximum length', async () => {
        const longTitle = 'a'.repeat(101);
        const response = await request(app)
            .post(`/dashboard/my-books/${studentUserId}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                title: longTitle,
                author: 'Valid Author'
            })
            .expect(400);

        expect(response.body.message).toMatch(/exceeds maximum allowed length/i);
    });

    test('POST /dashboard/my-books/:userId rejects exact duplicate books from the same user', async () => {
        await Book.create({
            title: 'Dune',
            author: 'Frank Herbert',
            ownerId: studentUserId
        });

        const response = await request(app)
            .post(`/dashboard/my-books/${studentUserId}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                title: 'Dune',
                author: 'Frank Herbert'
            })
            .expect(400);

        expect(response.body.message).toMatch(/already added this book/i);
    });

    // ---------------------------------------------------------
    // DELETE (REMOVE BOOK) TESTS
    // ---------------------------------------------------------

    test('DELETE /dashboard/my-books/:userId/:bookId allows user to delete their own book', async () => {
        const book = await Book.create({
            title: '1984',
            author: 'George Orwell',
            ownerId: studentUserId,
            available: true
        });

        const response = await request(app)
            .delete(`/dashboard/my-books/${studentUserId}/${book._id}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Book deleted successfully.');

        const deletedBook = await Book.findById(book._id);
        expect(deletedBook).toBeNull();
    });

    test('DELETE /dashboard/my-books/:userId/:bookId returns 404 if trying to delete someone else\'s book', async () => {
        const book = await Book.create({
            title: 'Fahrenheit 451',
            author: 'Ray Bradbury',
            ownerId: studentUserId
        });

        const response = await request(app)
            .delete(`/dashboard/my-books/${hackerUserId}/${book._id}`)
            .set('Authorization', `Bearer ${hackerToken}`)
            .expect(404);

        expect(response.body.message).toMatch(/not found or permission denied/i);

        const safeBook = await Book.findById(book._id);
        expect(safeBook).not.toBeNull();
    });

    test('DELETE /dashboard/my-books/:userId/:bookId prevents deletion if the book is currently borrowed', async () => {
        const book = await Book.create({
            title: 'Brave New World',
            author: 'Aldous Huxley',
            ownerId: studentUserId,
            borrowedBy: new mongoose.Types.ObjectId()
        });

        const response = await request(app)
            .delete(`/dashboard/my-books/${studentUserId}/${book._id}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .expect(400);

        expect(response.body.message).toMatch(/currently borrowed or reserved/i);

        const blockedBook = await Book.findById(book._id);
        expect(blockedBook).not.toBeNull();
    });

    test('DELETE /dashboard/my-books/:userId/:bookId blocks hacker using victim URL with hacker token', async () => {
        const book = await Book.create({
            title: 'Catch-22',
            author: 'Joseph Heller',
            ownerId: studentUserId
        });

        const response = await request(app)
            .delete(`/dashboard/my-books/${studentUserId}/${book._id}`)
            .set('Authorization', `Bearer ${hackerToken}`)
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/unauthorized/i);

        const safeBook = await Book.findById(book._id);
        expect(safeBook).not.toBeNull();
    });

    test('DELETE /dashboard/my-books/:userId/:bookId prevents deleting a book acquired through a swap', async () => {
        const hackerBook = await Book.create({
            title: 'Hacker Book',
            author: 'Author A',
            ownerId: studentUserId, // Student holds it now after swap
            available: true
        });

        const studentBook = await Book.create({
            title: 'Student Book',
            author: 'Author B',
            ownerId: hackerUserId, // Hacker holds it now after swap
            available: true
        });

        // Valid SwapRequest record where Hacker was original owner of hackerBook
        await SwapRequest.create({
            requestedBookId: hackerBook._id,
            offeredBookId: studentBook._id,
            ownerId: hackerUserId, // Original owner of requested book
            requesterId: studentUserId, // Offerer of studentBook
            status: 'accepted',
            createdAt: new Date('2026-01-01')
        });

        const response = await request(app)
            .delete(`/dashboard/my-books/${studentUserId}/${hackerBook._id}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/cannot delete a book you acquired through a swap/i);

        const exists = await Book.findById(hackerBook._id);
        expect(exists).not.toBeNull();
    });

    test('DELETE /dashboard/my-books/:userId/:bookId allows original uploader to delete book if swapped back', async () => {
        const studentBook = await Book.create({
            title: 'Student Book',
            author: 'Author B',
            ownerId: studentUserId, // Returned back to student
            available: true
        });

        const hackerBook = await Book.create({
            title: 'Hacker Book',
            author: 'Author A',
            ownerId: hackerUserId,
            available: true
        });

        // Swap 1: Student offered studentBook to Hacker
        await SwapRequest.create({
            requestedBookId: hackerBook._id,
            offeredBookId: studentBook._id,
            ownerId: hackerUserId,
            requesterId: studentUserId, // Original uploader of offeredBook (studentBook)
            status: 'accepted',
            createdAt: new Date('2026-01-01')
        });

        // Swap 2: Traded back
        await SwapRequest.create({
            requestedBookId: studentBook._id,
            offeredBookId: hackerBook._id,
            ownerId: hackerUserId,
            requesterId: studentUserId,
            status: 'accepted',
            createdAt: new Date('2026-02-01')
        });

        const response = await request(app)
            .delete(`/dashboard/my-books/${studentUserId}/${studentBook._id}`)
            .set('Authorization', `Bearer ${studentToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Book deleted successfully.');
    });
});