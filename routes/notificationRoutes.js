const express = require('express');
const {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All notification routes require a logged-in user
router.get('/', authMiddleware, getMyNotifications);
router.get('/unread-count', authMiddleware, getUnreadCount);
router.patch('/mark-all-read', authMiddleware, markAllAsRead);
router.patch('/:id/read', authMiddleware, markAsRead);

module.exports = router;
