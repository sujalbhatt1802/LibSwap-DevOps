const express = require('express');
const router = express.Router();

const {
    getBooks,
    createBook,
    updateBook,
    deleteBook
} = require('../controllers/bookController');

const { borrowBook, returnBook, getCirculation } = require('../controllers/borrowController');
const { reserveBook } = require('../controllers/reserveController');

const authMiddleware = require('../middleware/authMiddleware');
const staffOnly = require('../middleware/staffOnly');

// Anyone can browse or search the library catalogue
router.get('/', getBooks);
router.get('/circulation', authMiddleware, getCirculation);
router.post('/return/:bookId', authMiddleware, returnBook);

// Only authenticated staff can add library books
router.post(
    '/',
    authMiddleware,
    staffOnly,
    createBook
);

// Only authenticated staff can update library books
router.put(
    '/:id',
    authMiddleware,
    staffOnly,
    updateBook
);

// Only authenticated staff can delete library books
router.delete(
    '/:id',
    authMiddleware,
    staffOnly,
    deleteBook
);

/* -------------------------------------------
   ⭐ STUDENT ACTIONS (Borrow + Reserve)
-------------------------------------------- */

// Borrow a book
router.post(
    '/borrow/:bookId',
    authMiddleware,
    borrowBook
);

// Reserve a book
router.post(
    '/reserve/:bookId',
    authMiddleware,
    reserveBook
);

module.exports = router;
