const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

// use a test-only JWT secret
process.env.JWT_SECRET = 'libswap-test-secret';

const app = require('../app'); 
const User = require('../models/User'); 
const Book = require('../models/Book');
const SwapRequest = require('../models/SwapRequest');

jest.setTimeout(120000);

let mongoServer;
let databaseReady = false;

// distinct users to test swapping
let userAToken;
let userAId;
let userBToken;
let userBId;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { launchTimeout: 60000 }
    });

    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    databaseReady = true;

    // create real users with unique usernames and emails to satisfy MongoDB unique indexes
    const userADoc = new User({ 
        username: 'studentA', 
        email: 'testa@example.com', 
        role: 'student' 
    });
    await userADoc.save({ validateBeforeSave: false }); 
    userAId = userADoc._id.toString();

    const userBDoc = new User({ 
        username: 'studentB', 
        email: 'testb@example.com', 
        role: 'student' 
    });
    await userBDoc.save({ validateBeforeSave: false });
    userBId = userBDoc._id.toString();

    // sign the JWTs including both 'id' and 'userId' 
    userAToken = jwt.sign(
        { id: userAId, userId: userAId, role: 'student' }, 
        process.env.JWT_SECRET, 
        { expiresIn: '1h' }
    );
    
    userBToken = jwt.sign(
        { id: userBId, userId: userBId, role: 'student' }, 
        process.env.JWT_SECRET, 
        { expiresIn: '1h' }
    );
});

afterEach(async () => {
    if (databaseReady && mongoose.connection.readyState === 1) {
        await Book.deleteMany({});
        await SwapRequest.deleteMany({});
    }
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await User.deleteMany({}); 
        await mongoose.disconnect();
    }
    if (mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
        // seed database with two books before each test
        bookA = await Book.create({
            title: 'User A Book',
            author: 'Author A',
            ownerId: userAId,
            available: true
        });

        bookB = await Book.create({
            title: 'User B Book',
            author: 'Author B',
            ownerId: userBId,
            available: true
        });
    });

describe('Swap API automated tests', () => {

    beforeEach(async () => {
        // seed database with two books before each test
        bookA = await Book.create({
            title: 'User A Book',
            author: 'Author A',
            ownerId: userAId,
            available: true
        });

        bookB = await Book.create({
            title: 'User B Book',
            author: 'Author B',
            ownerId: userBId,
            available: true
        });
    });

    /* -------------------------------------------
       POST /swap/send
    -------------------------------------------- */
    test('POST /swap/send successfully creates a swap request', async () => {
        const response = await request(app)
            .post('/swap/send')
            .set('Authorization', `Bearer ${userAToken}`)
            .send({
                requestedBookId: bookB._id,
                offeredBookId: bookA._id,
                ownerId: userBId
            })
            .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Swap request sent');
        expect(response.body.data.status).toBe('pending');
        expect(response.body.data.requesterId).toBe(userAId);
    });

    test('POST /swap/send prevents offering a book you do not own', async () => {
        const response = await request(app)
            .post('/swap/send')
            .set('Authorization', `Bearer ${userAToken}`)
            .send({
                requestedBookId: bookB._id,
                offeredBookId: bookB._id, // user A is trying to offer user B's book
                ownerId: userBId
            })
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/own/i); 
    });

    /* -------------------------------------------
       POST /swap/accept/:id
    -------------------------------------------- */
    test('POST /swap/accept/:id successfully accepts swap and changes book ownership', async () => {
        const swap = await SwapRequest.create({
            requesterId: userAId,
            requestedBookId: bookB._id,
            offeredBookId: bookA._id,
            ownerId: userBId,
            status: 'pending'
        });

        const response = await request(app)
            .post(`/swap/accept/${swap._id}`)
            .set('Authorization', `Bearer ${userBToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        
        const updatedBookA = await Book.findById(bookA._id);
        const updatedBookB = await Book.findById(bookB._id);

        expect(updatedBookA.ownerId.toString()).toBe(userBId); // user B now owns book A
        expect(updatedBookB.ownerId.toString()).toBe(userAId); // user A now owns book B

        const updatedSwap = await SwapRequest.findById(swap._id);
        expect(updatedSwap.status).toBe('accepted');
    });

    test('POST /swap/accept/:id prevents non-owners from accepting', async () => {
        const swap = await SwapRequest.create({
            requesterId: userAId,
            requestedBookId: bookB._id,
            offeredBookId: bookA._id,
            ownerId: userBId,
            status: 'pending'
        });

        const response = await request(app)
            .post(`/swap/accept/${swap._id}`)
            .set('Authorization', `Bearer ${userAToken}`)
            .expect(403);
            
        expect(response.body.success).toBe(false);
    });

    /* -------------------------------------------
       POST /swap/reject/:id
    -------------------------------------------- */
    test('POST /swap/reject/:id allows owner to reject', async () => {
        const swap = await SwapRequest.create({
            requesterId: userAId,
            requestedBookId: bookB._id,
            offeredBookId: bookA._id,
            ownerId: userBId,
            status: 'pending'
        });

        const response = await request(app)
            .post(`/swap/reject/${swap._id}`)
            .set('Authorization', `Bearer ${userBToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);

        const updatedSwap = await SwapRequest.findById(swap._id);
        expect(updatedSwap.status).toBe('rejected');
    });

    /* -------------------------------------------
       POST /swap/cancel/:id
    -------------------------------------------- */
    test('POST /swap/cancel/:id allows requester to cancel', async () => {
        const swap = await SwapRequest.create({
            requesterId: userAId,
            requestedBookId: bookB._id,
            offeredBookId: bookA._id,
            ownerId: userBId,
            status: 'pending'
        });

        const response = await request(app)
            .post(`/swap/cancel/${swap._id}`)
            .set('Authorization', `Bearer ${userAToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);

        const updatedSwap = await SwapRequest.findById(swap._id);
        expect(updatedSwap.status).toBe('cancelled');
    });

    /* -------------------------------------------
       GET /swap/all
    -------------------------------------------- */
    test('GET /swap/all returns sent and received swaps for the user', async () => {
        await SwapRequest.create({
            requesterId: userAId,
            requestedBookId: bookB._id,
            offeredBookId: bookA._id,
            ownerId: userBId,
            status: 'pending'
        });

        const responseA = await request(app)
            .get('/swap/all')
            .set('Authorization', `Bearer ${userAToken}`)
            .expect(200);

        expect(responseA.body.success).toBe(true);
        expect(responseA.body.data.sent).toHaveLength(1);
        expect(responseA.body.data.received).toHaveLength(0);

        const responseB = await request(app)
            .get('/swap/all')
            .set('Authorization', `Bearer ${userBToken}`)
            .expect(200);

        expect(responseB.body.success).toBe(true);
        expect(responseB.body.data.sent).toHaveLength(0);
        expect(responseB.body.data.received).toHaveLength(1);
    });
});

/* -------------------------------------------
                EDGE CASES
-------------------------------------------- */
describe('Edge Cases', () => {

    test('POST /swap/send prevents offering a book currently in another pending swap', async () => {
        // create a pending swap first
        await SwapRequest.create({
            requesterId: userAId,
            requestedBookId: bookB._id,
            offeredBookId: bookA._id,
            ownerId: userBId,
            status: 'pending'
        });

        // tries to offer the exact same bookA in a NEW swap request
        const response = await request(app)
            .post('/swap/send')
            .set('Authorization', `Bearer ${userAToken}`)
            .send({
                requestedBookId: bookB._id,
                offeredBookId: bookA._id,
                ownerId: userBId
            })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/already offered/i);
    });

    test('POST /swap/send prevents swapping borrowed or reserved books', async () => {
        // modify bookA to be borrowed
        bookA.borrowedBy = new mongoose.Types.ObjectId();
        await bookA.save();

        const response = await request(app)
            .post('/swap/send')
            .set('Authorization', `Bearer ${userAToken}`)
            .send({
                requestedBookId: bookB._id,
                offeredBookId: bookA._id,
                ownerId: userBId
            })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/borrowed or reserved/i);
    });

    test('POST /swap/accept/:id automatically rejects other pending swaps involving the same books', async () => {
        // need a 3rd user and 3rd book to test this
        const userCDoc = new User({ username: 'studentC', email: 'testc@example.com', role: 'student' });
        await userCDoc.save({ validateBeforeSave: false });
        const userCId = userCDoc._id.toString();

        const bookC = await Book.create({
            title: 'User C Book', author: 'Author C', ownerId: userCId, available: true
        });

        // swap 1: user A wants book B (offers Book A)
        const swap1 = await SwapRequest.create({
            requesterId: userAId, requestedBookId: bookB._id, offeredBookId: bookA._id, ownerId: userBId, status: 'pending'
        });

        // swap 2: user C wants book B (offers Book C)
        const swap2 = await SwapRequest.create({
            requesterId: userCId, requestedBookId: bookB._id, offeredBookId: bookC._id, ownerId: userBId, status: 'pending'
        });

        // user B accepts swap 1
        await request(app)
            .post(`/swap/accept/${swap1._id}`)
            .set('Authorization', `Bearer ${userBToken}`)
            .expect(200);

        // verify swap 2 was automatically rejected
        const updatedSwap2 = await SwapRequest.findById(swap2._id);
        expect(updatedSwap2.status).toBe('rejected');
    });

    test('Cannot process a swap that is not pending', async () => {
        const swap = await SwapRequest.create({
            requesterId: userAId,
            requestedBookId: bookB._id,
            offeredBookId: bookA._id,
            ownerId: userBId,
            status: 'cancelled' // already cancelled
        });

        const response = await request(app)
            .post(`/swap/accept/${swap._id}`)
            .set('Authorization', `Bearer ${userBToken}`)
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/already processed/i);
    });
});