const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Use a test-only JWT secret.
// This is NOT the real secret from .env.
process.env.JWT_SECRET = 'libswap-test-secret';

const app = require('../app');
const Book = require('../models/Book');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Give Jest enough time for the temporary MongoDB server
jest.setTimeout(120000);

let mongoServer;
let databaseReady = false;

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

    // Create a fake staff JWT for protected API testing
    staffToken = jwt.sign(
        {
            userId: new mongoose.Types.ObjectId().toString(),
            role: 'staff'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h'
        }
    );

    // Create a fake student JWT
    studentToken = jwt.sign(
        {
            userId: new mongoose.Types.ObjectId().toString(),
            role: 'student'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h'
        }
    );
});

// Remove test books after every test
afterEach(async () => {
    if (
        databaseReady &&
        mongoose.connection.readyState === 1
    ) {
        await Book.deleteMany({});
        await User.deleteMany({});
        await Notification.deleteMany({});
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

describe('Circulation history and reservations', () => {
    async function student(name) {
        const user = await User.create({ username: name, fullName: name, email: `${name}@example.test`, passwordHash: 'test-only' });
        return { id: String(user._id), token: jwt.sign({ userId: String(user._id), role: 'student' }, process.env.JWT_SECRET) };
    }
    const act = (book, action, user) => request(app).post(`/api/books/${action}/${book._id}`)
        .set('Authorization', `Bearer ${user.token}`);
    const state = user => request(app).get('/api/books/circulation').set('Authorization', `Bearer ${user.token}`);

    test('records due dates and private history, honours the queue and notifies only its head', async () => {
        const [alice, bob, charlie] = await Promise.all(['alice', 'bob', 'charlie'].map(student));
        const book = await Book.create({ title: 'Queue Book', author: 'Author' });
        const io = { emit: jest.fn() };
        app.set('io', io);
        await act(book, 'reserve', alice).expect(409);
        const borrowed = await act(book, 'borrow', alice).expect(200);
        expect(new Date(borrowed.body.data.dueAt) - new Date(borrowed.body.data.borrowedAt)).toBe(14 * 86400000);
        await act(book, 'reserve', alice).expect(409);
        await act(book, 'reserve', bob).expect(200);
        await act(book, 'reserve', bob).expect(409);
        await act(book, 'reserve', charlie).expect(200);
        expect((await state(charlie)).body.data[0]).toMatchObject({ reservationPosition: 2, reservationCount: 2, reservationStatus: 'waiting' });
        expect((await state(bob)).body.history).toEqual([]);
        const publicBook = (await request(app).get('/api/books')).body[0];
        expect(publicBook.loanHistory).toBeUndefined();
        expect(publicBook.reservationQueue).toBeUndefined();
        await act(book, 'return', bob).expect(409);
        await act(book, 'return', alice).expect(200);
        await act(book, 'return', alice).expect(409);
        expect((await state(alice)).body.history[0]).toMatchObject({ status: 'returned', returnedAt: expect.any(String) });
        expect((await state(bob)).body.data[0]).toMatchObject({ available: false, canBorrow: true, reservationStatus: 'ready' });
        const notice = await request(app).get('/api/notifications').set('Authorization', `Bearer ${bob.token}`).expect(200);
        expect(notice.body.notifications).toHaveLength(1);
        expect(notice.body.notifications[0].title).toBe('Your reserved book is available');
        expect(await Notification.countDocuments({ user: charlie.id })).toBe(0);
        await act(book, 'borrow', charlie).expect(409);
        await act(book, 'borrow', alice).expect(409);
        await act(book, 'borrow', bob).expect(200);
        await act(book, 'return', bob).expect(200);
        expect(await Notification.countDocuments({ user: charlie.id })).toBe(1);
        await act(book, 'borrow', charlie).expect(200);
        await act(book, 'return', charlie).expect(200);
        expect((await Book.findById(book._id)).available).toBe(true);
        expect(io.emit).toHaveBeenCalledWith('booksChanged', { action: 'return', bookId: book._id });
        expect(io.emit.mock.calls.every(([, payload]) => !payload.book && !payload.user)).toBe(true);
        app.set('io', undefined);
    });

    test('prevents simultaneous double loans and duplicate reservations', async () => {
        const [alice, bob, charlie] = await Promise.all(['alice', 'bob', 'charlie'].map(student));
        const book = await Book.create({ title: 'Concurrent Book', author: 'Author' });
        const loans = await Promise.all([act(book, 'borrow', alice), act(book, 'borrow', bob)]);
        expect(loans.map(r => r.status).sort()).toEqual([200, 409]);
        const reservations = await Promise.all([act(book, 'reserve', charlie), act(book, 'reserve', charlie)]);
        expect(reservations.map(r => r.status).sort()).toEqual([200, 409]);
        const stored = await Book.findById(book._id).select('+loanHistory +reservationQueue');
        expect(stored.loanHistory).toHaveLength(1);
        expect(stored.reservationQueue).toHaveLength(1);
        const owner = loans[0].status === 200 ? alice : bob;
        const returns = await Promise.all([act(book, 'return', owner), act(book, 'return', owner)]);
        expect(returns.map(r => r.status).sort()).toEqual([200, 409]);
        expect(await Notification.countDocuments({ user: charlie.id })).toBe(1);
    });

    test('supports older records without dates or queues and keeps their existing reservation first', async () => {
        const [alice, bob] = await Promise.all(['alice', 'bob'].map(student));
        const inserted = await Book.collection.insertOne({ title: 'Old Loan', author: 'Author', available: false,
            borrowedBy: new mongoose.Types.ObjectId(alice.id), reservedBy: new mongoose.Types.ObjectId(bob.id) });
        const book = { _id: inserted.insertedId };
        await act(book, 'return', alice).expect(200);
        const history = (await state(alice)).body.history;
        expect(history[0]).toMatchObject({ borrowedAt: null, dueAt: null, status: 'returned' });
        expect((await state(bob)).body.data[0]).toMatchObject({ reservationPosition: 1, reservationStatus: 'ready' });
        await act(book, 'borrow', bob).expect(200);
    });

    test('shows overdue status and protects active loans and their history from staff edits/deletion', async () => {
        const alice = await student('alice');
        const book = await Book.create({ title: 'Overdue', author: 'Author' });
        await act(book, 'borrow', alice).expect(200);
        const past = new Date(Date.now() - 86400000);
        await Book.updateOne({ _id: book._id }, { $set: { dueAt: past, 'loanHistory.0.dueAt': past } });
        const snapshot = (await state(alice)).body;
        expect(snapshot.data[0].loanStatus).toBe('overdue');
        expect(snapshot.history[0].status).toBe('overdue');
        await request(app).put(`/api/books/${book._id}`).set('Authorization', `Bearer ${staffToken}`)
            .send({ title: book.title, author: book.author, available: true }).expect(409);
        await request(app).delete(`/api/books/${book._id}`).set('Authorization', `Bearer ${staffToken}`).expect(409);
        await act(book, 'return', alice).expect(200);
        await request(app).delete(`/api/books/${book._id}`).set('Authorization', `Bearer ${staffToken}`).expect(409);
    });

    test('staff making an unavailable book ready notifies its first reservation without opening it to others', async () => {
        const alice = await student('alice');
        const book = await Book.create({ title: 'Unavailable', author: 'Author', available: false });
        await act(book, 'reserve', alice).expect(200);
        expect((await state(alice)).body.data[0].reservationStatus).toBe('waiting');
        await act(book, 'borrow', alice).expect(409);
        const edit = () => request(app).put(`/api/books/${book._id}`).set('Authorization', `Bearer ${staffToken}`)
            .send({ title: book.title, author: book.author, available: true });
        await edit().expect(200);
        await edit().expect(200);
        expect((await state(alice)).body.data[0]).toMatchObject({ available: false, canBorrow: true, reservationStatus: 'ready' });
        expect(await Notification.countDocuments({ user: alice.id })).toBe(1);
    });

    test('rejects unauthenticated, invalid and personal-book actions; dashboard reveals only own position', async () => {
        const [alice, bob] = await Promise.all(['alice', 'bob'].map(student));
        const book = await Book.create({ title: 'Private', author: 'Author', ownerId: alice.id });
        await act(book, 'borrow', bob).expect(404);
        await act(book, 'reserve', bob).expect(404);
        await request(app).get('/api/books/circulation').expect(401);
        await request(app).post('/api/books/borrow/invalid').set('Authorization', `Bearer ${alice.token}`).expect(400);
        await act({ _id: new mongoose.Types.ObjectId() }, 'borrow', alice).expect(404);
        const libraryBook = await Book.create({ title: 'Library', author: 'Author' });
        await act(libraryBook, 'borrow', alice).expect(200);
        await act(libraryBook, 'reserve', bob).expect(200);
        const dashboard = await request(app).get(`/dashboard/reservations/${bob.id}`).set('Authorization', `Bearer ${bob.token}`).expect(200);
        expect(dashboard.body.data[0].reservationPosition).toBe(1);
        expect(dashboard.body.data[0].reservationQueue).toBeUndefined();
        await request(app).get(`/dashboard/borrowed/${alice.id}`).set('Authorization', `Bearer ${bob.token}`).expect(403);
    });
});

describe('Book API automated tests', () => {

    test('GET /api/books returns all books', async () => {
        await Book.create([
            {
                title: 'Book One',
                author: 'Author One',
                genre: 'Fantasy',
                available: true
            },
            {
                title: 'Book Two',
                author: 'Author Two',
                genre: 'Programming',
                available: false
            }
        ]);

        const response = await request(app)
            .get('/api/books')
            .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toHaveLength(2);
    });

    test('GET /api/books searches by title case-insensitively', async () => {
        await Book.create([
            {
                title: 'Harry Potter',
                author: 'J.K. Rowling',
                genre: 'Fantasy'
            },
            {
                title: 'Clean Code',
                author: 'Robert Martin',
                genre: 'Programming'
            }
        ]);

        const response = await request(app)
            .get('/api/books?search=harry')
            .expect(200);

        expect(response.body).toHaveLength(1);
        expect(response.body[0].title).toBe(
            'Harry Potter'
        );
    });

    test('GET /api/books can search by author', async () => {
        await Book.create([
            {
                title: 'A Game of Thrones',
                author: 'George R. R. Martin',
                genre: 'Fantasy'
            },
            {
                title: 'The Hobbit',
                author: 'J.R.R. Tolkien',
                genre: 'Fantasy'
            }
        ]);

        const response = await request(app)
            .get('/api/books?search=martin')
            .expect(200);

        expect(response.body).toHaveLength(1);

        expect(response.body[0].author).toBe(
            'George R. R. Martin'
        );
    });


    // POST authorization and validation tests

    test('POST /api/books rejects a request without a token', async () => {
        const response = await request(app)
            .post('/api/books')
            .send({
                title: 'Unauthorized Book',
                author: 'Test Author',
                genre: 'Testing',
                available: true
            })
            .expect(401);

        expect(response.body.message).toBe(
            'Authentication token required'
        );
    });

    test('POST /api/books rejects a student user', async () => {
        const response = await request(app)
            .post('/api/books')
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                title: 'Student Book',
                author: 'Test Author',
                genre: 'Testing',
                available: true
            })
            .expect(403);

        expect(response.body.message).toBe(
            'Staff access required'
        );
    });

    test('POST /api/books allows staff to create a valid book', async () => {
        const newBook = {
            title: 'Automated Test Book',
            author: 'Test Author',
            genre: 'Testing',
            available: true
        };

        const response = await request(app)
            .post('/api/books')
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .send(newBook)
            .expect(201);

        expect(response.body.message).toBe(
            'Book added successfully'
        );

        expect(response.body.book.title).toBe(
            'Automated Test Book'
        );

        const savedBook = await Book.findOne({
            title: 'Automated Test Book'
        });

        expect(savedBook).not.toBeNull();
        expect(savedBook.author).toBe(
            'Test Author'
        );
    });

    test('POST /api/books rejects a book without a title', async () => {
        const response = await request(app)
            .post('/api/books')
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .send({
                author: 'Test Author',
                genre: 'Testing',
                available: true
            })
            .expect(400);

        expect(response.body.message).toBe(
            'Title and author are required'
        );
    });

    test('POST /api/books rejects invalid availability', async () => {
        const response = await request(app)
            .post('/api/books')
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .send({
                title: 'Invalid Availability Book',
                author: 'Test Author',
                genre: 'Testing',
                available: 'yes'
            })
            .expect(400);

        expect(response.body.message).toBe(
            'Availability must be true or false'
        );
    });

   
    // PUT authorization and update tests
  
    test('PUT /api/books/:id rejects a request without a token', async () => {
        const book = await Book.create({
            title: 'Protected Book',
            author: 'Test Author',
            genre: 'Testing'
        });

        const response = await request(app)
            .put(`/api/books/${book._id}`)
            .send({
                title: 'Changed Book',
                author: 'Test Author',
                genre: 'Testing',
                available: true
            })
            .expect(401);

        expect(response.body.message).toBe(
            'Authentication token required'
        );
    });

    test('PUT /api/books/:id rejects a student user', async () => {
        const book = await Book.create({
            title: 'Protected Book',
            author: 'Test Author',
            genre: 'Testing'
        });

        const response = await request(app)
            .put(`/api/books/${book._id}`)
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .send({
                title: 'Changed Book',
                author: 'Test Author',
                genre: 'Testing',
                available: true
            })
            .expect(403);

        expect(response.body.message).toBe(
            'Staff access required'
        );
    });

    test('PUT /api/books/:id allows staff to update an existing book', async () => {
        const book = await Book.create({
            title: 'Original Title',
            author: 'Original Author',
            genre: 'Fantasy',
            available: true
        });

        const response = await request(app)
            .put(`/api/books/${book._id}`)
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .send({
                title: 'Updated Title',
                author: 'Updated Author',
                genre: 'Programming',
                available: false
            })
            .expect(200);

        expect(response.body.message).toBe(
            'Book updated successfully'
        );

        expect(response.body.book.title).toBe(
            'Updated Title'
        );

        expect(response.body.book.available).toBe(false);

        const updatedBook =
            await Book.findById(book._id);

        expect(updatedBook.title).toBe(
            'Updated Title'
        );

        expect(updatedBook.available).toBe(false);
    });

    test('PUT /api/books/:id returns 404 for a missing book', async () => {
        const missingBookId =
            new mongoose.Types.ObjectId();

        const response = await request(app)
            .put(`/api/books/${missingBookId}`)
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .send({
                title: 'Missing Book',
                author: 'Test Author',
                genre: 'Testing',
                available: true
            })
            .expect(404);

        expect(response.body.message).toBe(
            'Book not found'
        );
    });

    test('PUT /api/books/:id rejects an invalid book ID', async () => {
        const response = await request(app)
            .put('/api/books/not-a-valid-id')
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .send({
                title: 'Test Book',
                author: 'Test Author',
                genre: 'Testing',
                available: true
            })
            .expect(400);

        expect(response.body.message).toBe(
            'Invalid book ID'
        );
    });

    
    // DELETE authorization and deletion tests
   
    test('DELETE /api/books/:id rejects a request without a token', async () => {
        const book = await Book.create({
            title: 'Protected Delete Book',
            author: 'Test Author',
            genre: 'Testing'
        });

        const response = await request(app)
            .delete(`/api/books/${book._id}`)
            .expect(401);

        expect(response.body.message).toBe(
            'Authentication token required'
        );
    });

    test('DELETE /api/books/:id rejects a student user', async () => {
        const book = await Book.create({
            title: 'Protected Delete Book',
            author: 'Test Author',
            genre: 'Testing'
        });

        const response = await request(app)
            .delete(`/api/books/${book._id}`)
            .set(
                'Authorization',
                `Bearer ${studentToken}`
            )
            .expect(403);

        expect(response.body.message).toBe(
            'Staff access required'
        );
    });

    test('DELETE /api/books/:id allows staff to delete an existing book', async () => {
        const book = await Book.create({
            title: 'Book To Delete',
            author: 'Test Author',
            genre: 'Testing',
            available: true
        });

        const response = await request(app)
            .delete(`/api/books/${book._id}`)
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(200);

        expect(response.body.message).toBe(
            'Book deleted successfully'
        );

        const deletedBook =
            await Book.findById(book._id);

        expect(deletedBook).toBeNull();
    });

    test('DELETE /api/books/:id returns 404 for a missing book', async () => {
        const missingBookId =
            new mongoose.Types.ObjectId();

        const response = await request(app)
            .delete(`/api/books/${missingBookId}`)
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(404);

        expect(response.body.message).toBe(
            'Book not found'
        );
    });

    test('DELETE /api/books/:id rejects an invalid book ID', async () => {
        const response = await request(app)
            .delete('/api/books/not-a-valid-id')
            .set(
                'Authorization',
                `Bearer ${staffToken}`
            )
            .expect(400);

        expect(response.body.message).toBe(
            'Invalid book ID'
        );
    });

});
