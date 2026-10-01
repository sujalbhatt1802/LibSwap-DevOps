const mongoose = require('mongoose');

const Review = require('../models/Review');
const Book = require('../models/Book');


/*
 * Create a new review for a book
 */
const createReview = async (req, res) => {
    try {
        const { bookId } = req.params;
        const { rating, comment } = req.body;

        // Check whether the book ID is valid
        if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({
                message: 'Invalid book ID'
            });
        }

        // Validate rating
        const numericRating = Number(rating);

        if (
            !Number.isInteger(numericRating) ||
            numericRating < 1 ||
            numericRating > 5
        ) {
            return res.status(400).json({
                message: 'Rating must be an integer between 1 and 5'
            });
        }

        // Validate comment
        const trimmedComment =
            typeof comment === 'string'
                ? comment.trim()
                : '';

        if (!trimmedComment) {
            return res.status(400).json({
                message: 'Review comment is required'
            });
        }

        if (trimmedComment.length > 1000) {
            return res.status(400).json({
                message:
                    'Review comment cannot exceed 1000 characters'
            });
        }

        // Make sure the book exists
        const book = await Book.findById(bookId);

        if (!book) {
            return res.status(404).json({
                message: 'Book not found'
            });
        }

        // Prevent the same student from reviewing
        // the same book more than once
        const existingReview = await Review.findOne({
            userId: req.user.userId,
            bookId
        });

        if (existingReview) {
            return res.status(409).json({
                message: 'You have already reviewed this book'
            });
        }

        // Create a new review.
        // It starts as pending because staff moderation
        // is already part of the LibSwap system.
        const review = await Review.create({
            userId: req.user.userId,
            bookId,
            rating: numericRating,
            comment: trimmedComment,
            moderationStatus: 'pending'
        });

        return res.status(201).json({
            message:
                'Review submitted successfully and is awaiting moderation',
            review
        });

    } catch (error) {
        console.error(
            'Create review error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to create review'
        });
    }
};


/*
 * Get reviews for a specific book
 *
 * Only approved reviews are returned to normal users.
 */
const getBookReviews = async (req, res) => {
    try {
        const { bookId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({
                message: 'Invalid book ID'
            });
        }

        const reviews = await Review.find({
            bookId,
            moderationStatus: 'approved'
        })
            .populate(
                'userId',
                'username fullName'
            )
            .sort({
                createdAt: -1
            });

        return res.status(200).json({
            count: reviews.length,
            reviews
        });

    } catch (error) {
        console.error(
            'Get book reviews error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to retrieve reviews'
        });
    }
};


/*
 * Get reviews submitted by the logged-in user
 */
const getMyReviews = async (req, res) => {
    try {
        const reviews = await Review.find({
            userId: req.user.userId
        })
            .populate(
                'bookId',
                'title author'
            )
            .sort({
                createdAt: -1
            });

        return res.status(200).json({
            count: reviews.length,
            reviews
        });

    } catch (error) {
        console.error(
            'Get my reviews error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to retrieve your reviews'
        });
    }
};


/*
 * Update the logged-in user's own review
 */
const updateReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { rating, comment } = req.body;

        if (!mongoose.Types.ObjectId.isValid(reviewId)) {
            return res.status(400).json({
                message: 'Invalid review ID'
            });
        }

        const review = await Review.findOne({
            _id: reviewId,
            userId: req.user.userId
        });

        if (!review) {
            return res.status(404).json({
                message:
                    'Review not found or not owned by you'
            });
        }

        if (rating !== undefined) {
            const numericRating = Number(rating);

            if (
                !Number.isInteger(numericRating) ||
                numericRating < 1 ||
                numericRating > 5
            ) {
                return res.status(400).json({
                    message:
                        'Rating must be an integer between 1 and 5'
                });
            }

            review.rating = numericRating;
        }

        if (comment !== undefined) {
            const trimmedComment = comment.trim();

            if (!trimmedComment) {
                return res.status(400).json({
                    message: 'Review comment is required'
                });
            }

            if (trimmedComment.length > 1000) {
                return res.status(400).json({
                    message:
                        'Review comment cannot exceed 1000 characters'
                });
            }

            review.comment = trimmedComment;
        }

        // Send edited reviews back through moderation
        review.moderationStatus = 'pending';
        review.moderationReason = '';
        review.moderatedBy = null;
        review.moderatedAt = null;

        await review.save();

        return res.status(200).json({
            message:
                'Review updated and submitted for moderation',
            review
        });

    } catch (error) {
        console.error(
            'Update review error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to update review'
        });
    }
};


/*
 * Delete the logged-in user's own review
 */
const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(reviewId)) {
            return res.status(400).json({
                message: 'Invalid review ID'
            });
        }

        const review = await Review.findOneAndDelete({
            _id: reviewId,
            userId: req.user.userId
        });

        if (!review) {
            return res.status(404).json({
                message:
                    'Review not found or not owned by you'
            });
        }

        return res.status(200).json({
            message: 'Review deleted successfully'
        });

    } catch (error) {
        console.error(
            'Delete review error:',
            error
        );

        return res.status(500).json({
            message: 'Unable to delete review'
        });
    }
};


module.exports = {
    createReview,
    getBookReviews,
    getMyReviews,
    updateReview,
    deleteReview
};