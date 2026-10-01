const mongoose = require('mongoose');

// A Notification tells one user about something that happened -
// a book request being approved, a book swap update, etc - so they
// don't have to go check every part of the system manually.
const notificationSchema = new mongoose.Schema(
    {
        // Who the notification is for
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        // Broad category, useful for filtering/grouping on the frontend.
        // Kept generic so future features (e.g. book swapping) can reuse
        // this same notification system instead of building their own.
        type: {
            type: String,
            enum: ['book_request', 'book_swap', 'account', 'system'],
            default: 'system'
        },

        title: {
            type: String,
            required: true,
            trim: true
        },

        message: {
            type: String,
            required: true,
            trim: true
        },

        // Optional link back to whatever triggered this notification
        // (e.g. a BookRequest id), so the frontend can deep-link to it
        relatedId: {
            type: mongoose.Schema.Types.ObjectId
        },

        isRead: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Notifications are almost always fetched "for this user, newest first",
// so index on that access pattern.
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
