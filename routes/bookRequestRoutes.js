const express = require('express');
const {
  requestBook,
  getMyBookRequests,
  getAllBookRequests,
  updateBookRequestStatus
} = require('../controllers/bookRequestController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All book request routes require a logged-in user
router.post('/', authMiddleware, requestBook);
router.get('/me', authMiddleware, getMyBookRequests);
router.get('/', authMiddleware, getAllBookRequests);
router.patch('/:id/status', authMiddleware, updateBookRequestStatus);

module.exports = router;
