const express = require('express');

const {
    createReview,
    getBookReviews,
    getMyReviews,
    updateReview,
    deleteReview
} = require('../controllers/reviewController');

const authMiddleware =
    require('../middleware/authMiddleware');

const router = express.Router();


/*
 * Create a review for a book
 */
router.post(
    '/books/:bookId/reviews',
    authMiddleware,
    createReview
);


/*
 * View approved reviews for a book
 */
router.get(
    '/books/:bookId/reviews',
    getBookReviews
);


/*
 * View my own reviews
 */
router.get(
    '/reviews/my',
    authMiddleware,
    getMyReviews
);


/*
 * Update my own review
 */
router.patch(
    '/reviews/:reviewId',
    authMiddleware,
    updateReview
);


/*
 * Delete my own review
 */
router.delete(
    '/reviews/:reviewId',
    authMiddleware,
    deleteReview
);


module.exports = router;