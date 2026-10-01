const Book = require('../models/Book');
const { getQueue } = require('./borrowController');
const { createNotification } = require('./notificationController');

// This gets all library books and can also search by title, author or genre
const getBooks = async (req, res) => {
    try {
        // Getting the search word from the URL, for example ?search=harry
        const search = req.query.search;

        // Starting with an empty filter means "show all books"
        let filter = {};

        // If the user typed something in the search box, we create a search filter
        if (search) {
            filter = {
                $or: [
                    // The "i" makes the search ignore capital/lowercase letters
                    { title: { $regex: search, $options: 'i' } },
                    { author: { $regex: search, $options: 'i' } },
                    { genre: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Finding the matching books from MongoDB
        const books = await Book.find(filter);

        // Sending the matching books back to the frontend as JSON
        res.status(200).json(books);

    } catch (error) {
        // If something goes wrong, send an error response instead of crashing
        res.status(500).json({
            message: 'Unable to retrieve books',
            error: error.message
        });
    }
};

// Add a new library book
const createBook = async (req, res) => {
    try {
        const title = req.body.title?.trim();
        const author = req.body.author?.trim();
        const genre = req.body.genre?.trim();

        // Title and author are required
        if (!title || !author) {
            return res.status(400).json({
                message: 'Title and author are required'
            });
        }

        // If availability is provided, it must be true or false
        if (
            req.body.available !== undefined &&
            typeof req.body.available !== 'boolean'
        ) {
            return res.status(400).json({
                message: 'Availability must be true or false'
            });
        }

        const book = new Book({
            title,
            author,
            genre,
            available: req.body.available
        });

        const savedBook = await book.save();

        // Send a real-time event to connected catalogue pages
        const io = req.app.get('io');

        if (io) {
            io.emit('booksChanged', {
                action: 'created',
                book: savedBook
            });
        }

        res.status(201).json({
            message: 'Book added successfully',
            book: savedBook
        });

    } catch (error) {
        res.status(500).json({
            message: 'Unable to add book',
            error: error.message
        });
    }
};

// Update an existing library book
const updateBook = async (req, res) => {
    try {
        const title = req.body.title?.trim();
        const author = req.body.author?.trim();
        const genre = req.body.genre?.trim();

        // Title and author are required
        if (!title || !author) {
            return res.status(400).json({
                message: 'Title and author are required'
            });
        }

        // If availability is provided, it must be true or false
        if (
            req.body.available !== undefined &&
            typeof req.body.available !== 'boolean'
        ) {
            return res.status(400).json({
                message: 'Availability must be true or false'
            });
        }

        const current = await Book.findById(req.params.id).select('+reservationQueue +circulationVersion').lean();
        if (!current) return res.status(404).json({ message: 'Book not found' });
        const filter = { _id: req.params.id,
            circulationVersion: current.circulationVersion === undefined ? { $exists: false } : current.circulationVersion
        };
        const changes = { title, author, genre, available: req.body.available };
        const queue = getQueue(current);
        let notifyUser = null;
        // Making an unavailable book ready honours its queue rather than releasing it to everyone.
        if (req.body.available === true) {
            filter.borrowedBy = null;
            if (queue.length) {
                if (!queue[0].readyAt) {
                    queue[0].readyAt = new Date();
                    notifyUser = queue[0].user;
                }
                changes.available = false;
                changes.reservationQueue = queue;
                changes.reservedBy = queue[0].user;
            }
        }
        const updatedBook = await Book.findOneAndUpdate(
            filter,
            { $set: changes, $inc: { circulationVersion: 1 } },
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        if (!updatedBook) {
            const exists = await Book.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                message: exists ? 'The book changed or is currently borrowed. Refresh before changing availability.' : 'Book not found'
            });
        }

        if (notifyUser) {
            await createNotification({ user: notifyUser, type: 'system', title: 'Your reserved book is available',
                message: `“${updatedBook.title}” is ready for you. Open Your Reservations in the dashboard to borrow it.`,
                relatedId: updatedBook._id });
        }

        // Send a real-time event to connected catalogue pages
        const io = req.app.get('io');

        if (io) {
            io.emit('booksChanged', {
                action: 'updated',
                book: updatedBook
            });
        }

        res.status(200).json({
            message: 'Book updated successfully',
            book: updatedBook
        });

    } catch (error) {
        // Invalid MongoDB ID format
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'Invalid book ID'
            });
        }

        res.status(500).json({
            message: 'Unable to update book',
            error: error.message
        });
    }
};

// Delete an existing library book
const deleteBook = async (req, res) => {
    try {
        // Keep historical loans available to students after they return a book.
        const deletedBook = await Book.findOneAndDelete({
            _id: req.params.id, borrowedBy: null, reservedBy: null,
            'reservationQueue.0': { $exists: false }, 'loanHistory.0': { $exists: false }
        });

        if (!deletedBook) {
            const exists = await Book.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                message: exists ? 'Books with loans, reservations or borrowing history cannot be deleted.' : 'Book not found'
            });
        }

        // Send a real-time event to connected catalogue pages
        const io = req.app.get('io');

        if (io) {
            io.emit('booksChanged', {
                action: 'deleted',
                bookId: deletedBook._id
            });
        }

        res.status(200).json({
            message: 'Book deleted successfully'
        });

    } catch (error) {
        // Invalid MongoDB ID format
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'Invalid book ID'
            });
        }

        res.status(500).json({
            message: 'Unable to delete book',
            error: error.message
        });
    }
};

// Exporting the functions so our route file can use them
module.exports = {
    getBooks,
    createBook,
    updateBook,
    deleteBook
};
