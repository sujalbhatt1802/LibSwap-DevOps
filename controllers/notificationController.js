const Notification = require('../models/Notification');

// Internal helper (not a route handler) used by other controllers to
// raise a notification whenever something notification-worthy happens,
// e.g. a book request changing status, or (in future) a book swap
// activity. Kept here so every part of the app creates notifications
// the same way.
const createNotification = async ({ user, type, title, message, relatedId }) => {
  try {
    return await Notification.create({
      user,
      type: type || 'system',
      title,
      message,
      relatedId
    });
  } catch (error) {
    // A failed notification shouldn't ever break the action that
    // triggered it (e.g. approving a book request should still
    // succeed even if the notification write fails), so we just log it.
    console.error('Failed to create notification:', error);
    return null;
  }
};

// Get the logged-in user's notifications, newest first.
// Supports ?unread=true to only return unread notifications.
const getMyNotifications = async (req, res) => {
  try {
    const filter = { user: req.user.userId };

    if (req.query.unread === 'true') {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Notifications retrieved successfully',
      count: notifications.length,
      notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      message: 'Server error while retrieving notifications'
    });
  }
};

// Small helper endpoint for a notification badge/count in the UI,
// so the user can tell they have updates without opening the list.
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user.userId,
      isRead: false
    });

    return res.status(200).json({ unreadCount: count });
  } catch (error) {
    console.error('Get unread count error:', error);
    return res.status(500).json({
      message: 'Server error while retrieving unread count'
    });
  }
};

// Mark a single notification as read
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        message: 'Notification not found'
      });
    }

    // Users can only mark their own notifications as read
    if (notification.user.toString() !== req.user.userId) {
      return res.status(403).json({
        message: 'You do not have access to this notification'
      });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({
      message: 'Server error while updating notification'
    });
  }
};

// Mark every notification belonging to the logged-in user as read
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({
      message: 'Server error while updating notifications'
    });
  }
};

module.exports = {
  createNotification,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
