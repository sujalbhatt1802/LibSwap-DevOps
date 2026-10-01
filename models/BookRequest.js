const mongoose = require('mongoose');

// A BookRequest is created when a student can't find a book in the
// catalogue and asks the library to source it.
const bookRequestSchema = new mongoose.Schema(
    {
        // Who asked for the book
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        // Basic details about the book being requested.
        // Author/genre/reason are optional since the student may not
        // know every detail of a book that isn't in the library yet.
        title: {
            type: String,
            required: true,
            trim: true
        },

        author: {
            type: String,
            trim: true
        },

        genre: {
            type: String,
            trim: true
        },

        reason: {
            type: String,
            trim: true,
            maxlength: 500
        },

        // Lifecycle of the request as library staff work through it
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'fulfilled'],
            default: 'pending'
        },

        // Optional note from staff explaining a decision
        // (e.g. why a request was rejected, or how it was fulfilled)
        staffNote: {
            type: String,
            trim: true,
            maxlength: 500
        },

        // Staff member who last actioned the request
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('BookRequest', bookRequestSchema);
