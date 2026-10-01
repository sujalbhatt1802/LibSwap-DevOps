const express = require('express');

const {
    getPendingReviews,
    approveReview,
    removeReview
} = require('../controllers/moderationController');

const authMiddleware =
    require('../middleware/authMiddleware');

const staffOnly =
    require('../middleware/staffOnly');

const router = express.Router();


// Only authenticated staff can view content
// waiting for moderation
router.get(
    '/reviews/pending',
    authMiddleware,
    staffOnly,
    getPendingReviews
);


// Only authenticated staff can approve a review
router.put(
    '/reviews/:id/approve',
    authMiddleware,
    staffOnly,
    approveReview
);


// Only authenticated staff can remove a review
router.put(
    '/reviews/:id/remove',
    authMiddleware,
    staffOnly,
    removeReview
);


module.exports = router;