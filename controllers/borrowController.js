const mongoose = require('mongoose');
const Book = require('../models/Book');
const User = require('../models/User');
const { createNotification } = require('./notificationController');

const LOAN_DAYS = 14;
const privateFields = '+loanHistory +reservationQueue +circulationVersion';
const sameUser = (left, right) => Boolean(left && right) && String(left) === String(right);

// Older records have only reservedBy; preserve their place at the front.
const getQueue = book => {
  const queue = [...(book.reservationQueue || [])];
  if (book.reservedBy && !queue.some(entry => sameUser(entry.user, book.reservedBy))) {
    queue.unshift({ user: book.reservedBy, reservedAt: null, readyAt: book.borrowedBy ? null : (book.updatedAt || new Date(0)) });
  }
  return queue;
};

const circulationView = (book, userId) => {
  const queue = getQueue(book);
  const position = queue.findIndex(entry => sameUser(entry.user, userId));
  const borrowedByMe = sameUser(book.borrowedBy, userId);
  const ready = position === 0 && !book.borrowedBy && Boolean(queue[0].readyAt);
  return {
    _id: book._id, title: book.title, author: book.author, genre: book.genre,
    available: book.available && !book.borrowedBy && !queue.length,
    borrowedByMe,
    borrowedAt: borrowedByMe ? book.borrowedAt : null,
    dueAt: borrowedByMe ? book.dueAt : null,
    loanStatus: borrowedByMe ? (book.dueAt && new Date(book.dueAt) < new Date() ? 'overdue' : 'borrowed') : null,
    reservationStatus: position < 0 ? null : ready ? 'ready' : 'waiting',
    reservationPosition: position < 0 ? null : position + 1,
    reservationCount: queue.length,
    reservedAt: position < 0 ? null : queue[position].reservedAt,
    canBorrow: !book.ownerId && !book.borrowedBy && (queue.length ? ready : book.available),
    canReserve: !book.ownerId && !borrowedByMe && position < 0 && (!book.available || Boolean(book.borrowedBy) || queue.length > 0)
  };
};

const getCirculation = async (req, res) => {
  try {
    const books = await Book.find({ ownerId: null }).select(privateFields).sort({ title: 1, _id: 1 }).lean();
    const history = books.flatMap(book => (book.loanHistory || [])
      .filter(loan => sameUser(loan.user, req.user.userId))
      .map(loan => ({
        _id: loan._id, bookId: book._id, title: book.title, author: book.author,
        borrowedAt: loan.borrowedAt, dueAt: loan.dueAt, returnedAt: loan.returnedAt,
        status: loan.returnedAt ? 'returned' : loan.dueAt && new Date(loan.dueAt) < new Date() ? 'overdue' : 'borrowed'
      })))
      .sort((a, b) => new Date(b.borrowedAt || 0) - new Date(a.borrowedAt || 0));
    return res.json({ success: true, data: books.map(book => circulationView(book, req.user.userId)), history, loanDays: LOAN_DAYS });
  } catch (error) {
    console.error('Circulation lookup failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load your borrowing information.' });
  }
};

// A version check makes the loan, history and queue update atomic even on standalone MongoDB.
// A request based on a stale snapshot must refresh instead of overwriting another student's action.
const changeCirculation = action => async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!mongoose.isObjectIdOrHexString(userId) || !await User.exists({ _id: userId })) {
      return res.status(401).json({ success: false, message: 'Please sign in with an existing account.' });
    }
    if (!mongoose.isObjectIdOrHexString(req.params.bookId)) {
      return res.status(400).json({ success: false, message: 'Invalid book ID.' });
    }
    const book = await Book.findOne({ _id: req.params.bookId, ownerId: null }).select(privateFields).lean();
    if (!book) return res.status(404).json({ success: false, message: 'Library book not found.' });
    const view = circulationView(book, userId);
    const queue = getQueue(book);
    const history = [...(book.loanHistory || [])];
    const now = new Date();
    const changes = {};

    if (action === 'borrow') {
      if (!view.canBorrow) return res.status(409).json({ success: false, message: 'This book is unavailable or held for the first reservation.' });
      changes.borrowedBy = userId;
      changes.borrowedAt = now;
      changes.dueAt = new Date(now.getTime() + LOAN_DAYS * 24 * 60 * 60 * 1000);
      if (queue.length) queue.shift();
      history.push({ user: userId, borrowedAt: now, dueAt: changes.dueAt, returnedAt: null });
      changes.available = false;
    } else if (action === 'return') {
      if (!view.borrowedByMe) return res.status(409).json({ success: false, message: 'You can only return a book you are borrowing.' });
      const loan = history.findLast(entry => sameUser(entry.user, userId) && !entry.returnedAt);
      if (loan) loan.returnedAt = now;
      else history.push({ user: userId, borrowedAt: book.borrowedAt || null, dueAt: book.dueAt || null, returnedAt: now });
      changes.borrowedBy = null;
      changes.borrowedAt = null;
      changes.dueAt = null;
      changes.available = queue.length === 0;
      if (queue.length) queue[0].readyAt = now;
    } else {
      if (!view.canReserve) return res.status(409).json({ success: false, message: 'Reserve an unavailable book once; you cannot reserve your own loan.' });
      queue.push({ user: userId, reservedAt: now });
      changes.available = false;
    }

    changes.reservationQueue = queue;
    changes.reservedBy = queue[0]?.user || null;
    if (action !== 'reserve') changes.loanHistory = history;
    const updated = await Book.findOneAndUpdate({
      _id: book._id, ownerId: null,
      borrowedBy: book.borrowedBy || null, reservedBy: book.reservedBy || null,
      available: book.available,
      circulationVersion: book.circulationVersion === undefined ? { $exists: false } : book.circulationVersion
    }, { $set: changes, $inc: { circulationVersion: 1 } }, { returnDocument: 'after', runValidators: true })
      .select(privateFields).lean();
    if (!updated) return res.status(409).json({ success: false, message: 'The book changed. Refresh and try again.' });

    if (action === 'return' && queue.length) {
      await createNotification({
        user: queue[0].user, type: 'system', title: 'Your reserved book is available',
        message: `“${book.title}” is ready for you. Open Your Reservations in the dashboard to borrow it.`,
        relatedId: book._id
      });
    }
    // Broadcast availability only; history and queue identities are private.
    req.app.get('io')?.emit('booksChanged', { action, bookId: book._id });
    const messages = { borrow: 'Book borrowed successfully.', return: 'Book returned successfully.', reserve: 'Reservation added to the queue.' };
    return res.json({ success: true, message: messages[action], data: circulationView(updated, userId) });
  } catch (error) {
    console.error('Circulation update failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to update the book. Please try again.' });
  }
};

module.exports = {
  getQueue, circulationView, getCirculation, changeCirculation,
  borrowBook: changeCirculation('borrow'), returnBook: changeCirculation('return')
};
