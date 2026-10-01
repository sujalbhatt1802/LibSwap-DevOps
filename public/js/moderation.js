// Main moderation page elements
const moderationMessage =
    document.getElementById('moderationMessage');

const reviewList =
    document.getElementById('reviewList');


// Connect this moderation page to Socket.IO
const socket = io();


// Returns the JWT saved when the user logged in
const getToken = () => {
    return localStorage.getItem('token');
};


// Shows a message at the top of the moderation page
const showMessage = (text, isError = false) => {
    moderationMessage.textContent = text;

    if (isError) {
        moderationMessage.className = 'error-message';
    } else {
        moderationMessage.className = 'success-message';
    }
};


// Clears all reviews currently displayed
const clearReviews = () => {
    reviewList.innerHTML = '';
};


// Displays a message when there are no pending reviews
const showEmptyState = () => {
    clearReviews();

    const emptyState = document.createElement('div');

    emptyState.className = 'empty-state';

    emptyState.textContent =
        'There are currently no reviews waiting for moderation.';

    reviewList.appendChild(emptyState);
};


// Sends an approve or remove request to the backend
const moderateReview = async (reviewId, action) => {
    const token = getToken();

    if (!token) {
        showMessage(
            'Staff login is required to moderate reviews.',
            true
        );

        return;
    }

    try {
        const response = await fetch(
            `/api/moderation/reviews/${reviewId}/${action}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                'Unable to moderate review'
            );
        }

        if (action === 'approve') {
            showMessage(
                'Review approved successfully.'
            );
        } else {
            showMessage(
                'Review removed successfully.'
            );
        }

        // Reload this page immediately after the action
        await loadPendingReviews();

    } catch (error) {
        showMessage(
            error.message,
            true
        );

        console.error(error);
    }
};


// Creates one moderation review card
const createReviewCard = (review) => {
    const card = document.createElement('article');

    card.className = 'review-card';


    // Book title
    const heading = document.createElement('h3');

    if (review.bookId && review.bookId.title) {
        heading.textContent = review.bookId.title;
    } else {
        heading.textContent = 'Unknown book';
    }


    // Book author
    const author = document.createElement('p');
    author.className = 'review-detail';

    const authorLabel = document.createElement('span');
    authorLabel.className = 'review-label';
    authorLabel.textContent = 'Book author: ';

    const authorValue = document.createElement('span');

    if (review.bookId && review.bookId.author) {
        authorValue.textContent = review.bookId.author;
    } else {
        authorValue.textContent = 'Not available';
    }

    author.appendChild(authorLabel);
    author.appendChild(authorValue);


    // Reviewer
    const reviewer = document.createElement('p');
    reviewer.className = 'review-detail';

    const reviewerLabel = document.createElement('span');
    reviewerLabel.className = 'review-label';
    reviewerLabel.textContent = 'Submitted by: ';

    const reviewerValue = document.createElement('span');

    if (review.userId) {
        reviewerValue.textContent =
            review.userId.fullName ||
            review.userId.email ||
            'Unknown user';
    } else {
        reviewerValue.textContent = 'Unknown user';
    }

    reviewer.appendChild(reviewerLabel);
    reviewer.appendChild(reviewerValue);


    // Rating
    const rating = document.createElement('p');
    rating.className = 'review-detail';

    const ratingLabel = document.createElement('span');
    ratingLabel.className = 'review-label';
    ratingLabel.textContent = 'Rating: ';

    const ratingValue = document.createElement('span');
    ratingValue.textContent = `${review.rating} / 5`;

    rating.appendChild(ratingLabel);
    rating.appendChild(ratingValue);


    // Moderation status
    const status = document.createElement('p');
    status.className = 'review-detail';

    const statusLabel = document.createElement('span');
    statusLabel.className = 'review-label';
    statusLabel.textContent = 'Status: ';

    const statusValue = document.createElement('span');
    statusValue.textContent =
        review.moderationStatus || 'pending';

    status.appendChild(statusLabel);
    status.appendChild(statusValue);


    // Submission date
    const submitted = document.createElement('p');
    submitted.className = 'review-detail';

    const submittedLabel = document.createElement('span');
    submittedLabel.className = 'review-label';
    submittedLabel.textContent = 'Submitted: ';

    const submittedValue = document.createElement('span');

    if (review.createdAt) {
        submittedValue.textContent =
            new Date(review.createdAt).toLocaleString();
    } else {
        submittedValue.textContent = 'Not available';
    }

    submitted.appendChild(submittedLabel);
    submitted.appendChild(submittedValue);


    // Review comment
    const comment = document.createElement('div');
    comment.className = 'review-comment';

    comment.textContent =
        review.comment || 'No review comment provided.';


    // Area containing moderation buttons
    const actions = document.createElement('div');
    actions.className = 'moderation-actions';


    // Approve button
    const approveButton = document.createElement('button');

    approveButton.type = 'button';
    approveButton.className = 'approve-button';
    approveButton.textContent = 'Approve';

    approveButton.addEventListener('click', async () => {
        approveButton.disabled = true;
        removeButton.disabled = true;

        await moderateReview(
            review._id,
            'approve'
        );
    });


    // Remove button
    const removeButton = document.createElement('button');

    removeButton.type = 'button';
    removeButton.className = 'remove-button';
    removeButton.textContent = 'Remove';

    removeButton.addEventListener('click', async () => {
        const confirmed = confirm(
            'Are you sure you want to remove this review?'
        );

        if (!confirmed) {
            return;
        }

        approveButton.disabled = true;
        removeButton.disabled = true;

        await moderateReview(
            review._id,
            'remove'
        );
    });


    actions.appendChild(approveButton);
    actions.appendChild(removeButton);


    card.appendChild(heading);
    card.appendChild(author);
    card.appendChild(reviewer);
    card.appendChild(rating);
    card.appendChild(status);
    card.appendChild(submitted);
    card.appendChild(comment);
    card.appendChild(actions);

    return card;
};


// Loads reviews waiting for staff moderation
const loadPendingReviews = async () => {
    const token = getToken();

    if (!token) {
        clearReviews();

        showMessage(
            'Please log in with a staff account to view moderation content.',
            true
        );

        return;
    }

    try {
        showMessage(
            'Loading pending reviews...'
        );

        const response = await fetch(
            '/api/moderation/reviews/pending',
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                'Unable to load pending reviews'
            );
        }

        if (!Array.isArray(result.reviews)) {
            throw new Error(
                'Invalid moderation data received'
            );
        }

        if (result.reviews.length === 0) {
            showMessage(
                'Staff access confirmed.'
            );

            showEmptyState();

            return;
        }

        clearReviews();

        result.reviews.forEach((review) => {
            const reviewCard =
                createReviewCard(review);

            reviewList.appendChild(reviewCard);
        });

        showMessage(
            `${result.reviews.length} pending review(s) loaded.`
        );

    } catch (error) {
        clearReviews();

        showMessage(
            error.message,
            true
        );

        console.error(error);
    }
};


// Checks that the current user is staff before
// loading protected moderation information
const checkStaffAccess = async () => {
    const token = getToken();

    if (!token) {
        clearReviews();

        showMessage(
            'Please log in with a staff account to access content moderation.',
            true
        );

        return false;
    }

    try {
        const response = await fetch(
            '/api/auth/me',
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            clearReviews();

            showMessage(
                'Your login session is invalid or has expired.',
                true
            );

            return false;
        }

        const result = await response.json();

        if (
            !result.user ||
            result.user.role !== 'staff'
        ) {
            clearReviews();

            showMessage(
                'Staff access is required to view content moderation.',
                true
            );

            return false;
        }

        return true;

    } catch (error) {
        clearReviews();

        showMessage(
            'Unable to verify staff access.',
            true
        );

        console.error(error);

        return false;
    }
};


// Listen for moderation changes from the server
socket.on('moderationChanged', async () => {
    // Automatically refresh the pending queue
    // without refreshing the browser page
    await loadPendingReviews();
});


// Starts the moderation page
const initialiseModerationPage = async () => {
    const hasStaffAccess =
        await checkStaffAccess();

    if (!hasStaffAccess) {
        return;
    }

    await loadPendingReviews();
};


initialiseModerationPage();