const mongoose = require('mongoose');

// This schema explains what information we want to store for each library book
const bookSchema = new mongoose.Schema(
    {
        // Book title is required
        title: {
            type: String,
            required: true,
            trim: true
        },

        // Author name is also required
        author: {
            type: String,
            required: true,
            trim: true
        },

        // Genre is optional, but useful for searching later
        genre: {
            type: String,
            trim: true
        },

        // This tells us if the book is currently available to borrow
        available: {
            type: Boolean,
            default: true
        },

        // fields for Student Dashboard + Swap Requests

                ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false
        },

        borrowedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },

        borrowedAt: { type: Date, default: null },
        dueAt: { type: Date, default: null },
        // Private circulation data stays out of public catalogue responses.
        loanHistory: {
            type: [{
                user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                borrowedAt: Date,
                dueAt: Date,
                returnedAt: { type: Date, default: null }
            }],
            default: [],
            select: false
        },
        reservationQueue: {
            type: [{
                user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                reservedAt: { type: Date, default: Date.now },
                readyAt: { type: Date, default: null }
            }],
            default: [],
            select: false
        },
        circulationVersion: { type: Number, default: 0, select: false },
        // Keep the first reservation here for existing dashboard integrations.
        reservedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }

    },
    {
        // MongoDB will automatically save createdAt and updatedAt
        timestamps: true
    }
);

// Exporting the Book model so other files can use it
module.exports = mongoose.model('Book', bookSchema);
