const mongoose = require('mongoose');

// Stores a review submitted by a user for a library book
const reviewSchema = new mongoose.Schema(
    {
        // User who submitted the review
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        // Book the review belongs to
        bookId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Book',
            required: true
        },

        // Rating given by the user
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },

        // Written review content that may require moderation
        comment: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000
        },

        // New reviews wait for staff moderation
        moderationStatus: {
            type: String,
            enum: [
                'pending',
                'approved',
                'removed'
            ],
            default: 'pending'
        },

        // Optional explanation if moderation action is taken
        moderationReason: {
            type: String,
            trim: true,
            default: ''
        },

        // Staff user who performed the moderation action
        moderatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },

        // Time when the review was moderated
        moderatedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    'Review',
    reviewSchema
);