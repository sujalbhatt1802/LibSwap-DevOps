const mongoose = require('mongoose');
const Review = require('../models/Review');


// Get all reviews that are waiting for moderation
const getPendingReviews = async (req, res) => {
    try {
        const pendingReviews = await Review.find({
            moderationStatus: 'pending'
        })
            .populate(
                'bookId',
                'title author'
            )
            .populate(
                'userId',
                'fullName email'
            )
            .sort({
                createdAt: -1
            });

        res.status(200).json({
            message:
                'Pending reviews retrieved successfully',
            count: pendingReviews.length,
            reviews: pendingReviews
        });

    } catch (error) {
        console.error(
            'Unable to retrieve pending reviews:',
            error
        );

        res.status(500).json({
            message:
                'Unable to retrieve pending reviews'
        });
    }
};


// Approve a pending review
const approveReview = async (req, res) => {
    try {
        // Check that the review ID has a valid MongoDB format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                message: 'Invalid review ID'
            });
        }

        const review = await Review.findById(
            req.params.id
        );

        if (!review) {
            return res.status(404).json({
                message: 'Review not found'
            });
        }

        // Only reviews still waiting for moderation
        // can be approved
        if (review.moderationStatus !== 'pending') {
            return res.status(409).json({
                message:
                    'Review has already been moderated'
            });
        }

        review.moderationStatus = 'approved';

        // Record which staff user performed the action
        review.moderatedBy = req.user.userId;

        // Record when the moderation action happened
        review.moderatedAt = new Date();

        // Clear an old moderation reason if one exists
        review.moderationReason = '';

        await review.save();

        // Notify connected moderation pages in real time
        const io = req.app.get('io');

        if (io) {
            io.emit('moderationChanged');
        }

        return res.status(200).json({
            message: 'Review approved successfully',
            review
        });

    } catch (error) {
        console.error(
            'Unable to approve review:',
            error
        );

        return res.status(500).json({
            message: 'Unable to approve review'
        });
    }
};


// Remove a pending review
const removeReview = async (req, res) => {
    try {
        // Check that the review ID has a valid MongoDB format
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                message: 'Invalid review ID'
            });
        }

        const review = await Review.findById(
            req.params.id
        );

        if (!review) {
            return res.status(404).json({
                message: 'Review not found'
            });
        }

        // Only reviews still waiting for moderation
        // can be removed
        if (review.moderationStatus !== 'pending') {
            return res.status(409).json({
                message:
                    'Review has already been moderated'
            });
        }

        review.moderationStatus = 'removed';

        // Record which staff user performed the action
        review.moderatedBy = req.user.userId;

        // Record when the moderation action happened
        review.moderatedAt = new Date();

        await review.save();

        // Notify connected moderation pages in real time
        const io = req.app.get('io');

        if (io) {
            io.emit('moderationChanged');
        }

        return res.status(200).json({
            message: 'Review removed successfully',
            review
        });

    } catch (error) {
        console.error(
            'Unable to remove review:',
            error
        );

        return res.status(500).json({
            message: 'Unable to remove review'
        });
    }
};


module.exports = {
    getPendingReviews,
    approveReview,
    removeReview
};