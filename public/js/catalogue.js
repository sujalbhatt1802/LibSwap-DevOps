// Getting the main page elements
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const bookList = document.getElementById('bookList');
const message = document.getElementById('message');

const genreFilter = document.getElementById('genreFilter');
const availabilityFilter = document.getElementById('availabilityFilter');
const sortSelect = document.getElementById('sortSelect');
const reviewModal = document.getElementById('reviewModal');

const closeReviewModal =
    document.getElementById('closeReviewModal');

const reviewForm =
    document.getElementById('reviewForm');

const reviewBookTitle =
    document.getElementById('reviewBookTitle');

const reviewBookAuthor =
    document.getElementById('reviewBookAuthor');

const ratingStars =
    document.querySelectorAll('.star-button');

const ratingText =
    document.getElementById('ratingText');

const reviewComment =
    document.getElementById('reviewComment');

const commentCount =
    document.getElementById('commentCount');

const submitReviewButton =
    document.getElementById('submitReviewButton');

const reviewMessage =
    document.getElementById('reviewMessage');

// Stores the currently selected book for review
let selectedBookId = null;
let selectedRating = 0;

// Connect this catalogue page to Socket.IO
const socket = io();

// Stores the books returned by the backend
let currentBooks = [];

// Enables or disables the catalogue controls while data is loading
const setLoadingState = (isLoading) => {
    searchButton.disabled = isLoading;
    searchInput.disabled = isLoading;
    genreFilter.disabled = isLoading;
    availabilityFilter.disabled = isLoading;
    sortSelect.disabled = isLoading;

    searchButton.textContent = isLoading ? 'Searching...' : 'Search';
};

// Adds the available genres to the genre dropdown
const updateGenreOptions = (books) => {
    const selectedGenre = genreFilter.value;

    const genres = [
        ...new Set(
            books
                .map((book) => book.genre)
                .filter((genre) => genre)
        )
    ].sort();

    genreFilter.innerHTML = '<option value="">All genres</option>';

    genres.forEach((genre) => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilter.appendChild(option);
    });

    // Keep the selected genre if it still exists in the new results
    if (genres.includes(selectedGenre)) {
        genreFilter.value = selectedGenre;
    }
};

// Shows the books on the page
const displayBooks = (books) => {
    bookList.innerHTML = '';
    message.textContent = '';

    // If there are no matching books, show a message
    if (books.length === 0) {
        message.textContent = 'No books found.';
        return;
    }

    // Create one card for each book
    books.forEach((book) => {
        const card = document.createElement('div');
        card.classList.add('book-card');

        // Book title
        const title = document.createElement('h2');
        title.textContent = book.title;

        // Author
        const author = document.createElement('p');
        const authorLabel = document.createElement('strong');
        authorLabel.textContent = 'Author: ';
        author.appendChild(authorLabel);
        author.appendChild(document.createTextNode(book.author));

        // Genre
        const genre = document.createElement('p');
        const genreLabel = document.createElement('strong');
        genreLabel.textContent = 'Genre: ';
        genre.appendChild(genreLabel);
        genre.appendChild(
            document.createTextNode(book.genre || 'Not specified')
        );

        // Availability
        const availability = document.createElement('p');
        const availabilityLabel = document.createElement('strong');
        availabilityLabel.textContent = 'Availability: ';
        availability.appendChild(availabilityLabel);
        availability.appendChild(
            document.createTextNode(
                book.available ? 'Available' : 'Unavailable'
            )
        );

        // Add all book information to the card
        card.appendChild(title);
        card.appendChild(author);
        card.appendChild(genre);
        card.appendChild(availability);

        card.innerHTML = `
    <h2>${book.title}</h2>

    <p>
        <strong>Author:</strong>
        ${book.author}
    </p>

    <p>
        <strong>Genre:</strong>
        ${book.genre || 'Not specified'}
    </p>

    <p>
        <strong>Availability:</strong>
        <span class="${book.available ? 'available' : 'unavailable'}">
            ${book.available ? 'Available' : 'Unavailable'}
        </span>
    </p>

    <div class="book-review-actions">

        <button
            type="button"
            class="view-reviews-button"
            data-book-id="${book._id}"
        >
            View Reviews
        </button>

        <button
            type="button"
            class="write-review-button"
            data-book-id="${book._id}"
            data-book-title="${encodeURIComponent(book.title)}"
            data-book-author="${encodeURIComponent(book.author)}"
        >
            Write Review
        </button>

    </div>
`;
        document.addEventListener('click', (event) => {

            const viewButton =
                event.target.closest('.view-reviews-button');

            if (!viewButton) {
                return;
            }

            const bookId =
                viewButton.dataset.bookId;

            const book =
                currentBooks.find(
                    (item) => item._id === bookId
                );

            if (!book) {
                return;
            }

            loadBookReviews(
                bookId,
                book.title,
                book.author
            );
        });
        // Add the card to the page
        bookList.appendChild(card);
    });
};

// Applies the selected filters and sorting
const applyFiltersAndSorting = () => {
    let booksToDisplay = [...currentBooks];

    const selectedGenre = genreFilter.value;
    const selectedAvailability = availabilityFilter.value;
    const selectedSort = sortSelect.value;

    // Filter books by genre
    if (selectedGenre) {
        booksToDisplay = booksToDisplay.filter(
            (book) => book.genre === selectedGenre
        );
    }

    // Filter books by availability
    if (selectedAvailability === 'available') {
        booksToDisplay = booksToDisplay.filter(
            (book) => book.available === true
        );
    }

    if (selectedAvailability === 'unavailable') {
        booksToDisplay = booksToDisplay.filter(
            (book) => book.available === false
        );
    }

    // Sort books using the selected option
    if (selectedSort === 'title-asc') {
        booksToDisplay.sort((a, b) =>
            a.title.localeCompare(b.title)
        );
    }

    if (selectedSort === 'title-desc') {
        booksToDisplay.sort((a, b) =>
            b.title.localeCompare(a.title)
        );
    }

    if (selectedSort === 'author-asc') {
        booksToDisplay.sort((a, b) =>
            a.author.localeCompare(b.author)
        );
    }

    displayBooks(booksToDisplay);
};

// This function loads books from our backend API
const loadBooks = async (searchTerm = '') => {
    try {
        // Show a loading message while we wait for the server
        message.textContent = 'Loading books...';

        // Clear old book results before showing new ones
        bookList.innerHTML = '';

        setLoadingState(true);

        // Build the API URL
        let url = '/api/books';

        // If the user searched for something, add it to the URL
        if (searchTerm) {
            url += `?search=${encodeURIComponent(searchTerm)}`;
        }

        // Ask the backend for the books
        const response = await fetch(url);

        // If the server gives an error, stop here
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        // Convert the response into JavaScript data
        const books = await response.json();

        // Make sure the API returned a list of books
        if (!Array.isArray(books)) {
            throw new Error('Invalid book data received from server');
        }

        currentBooks = books;

        // Add the genres returned by the backend to the filter
        updateGenreOptions(books);

        // Display the books using the selected filters and sorting
        applyFiltersAndSorting();

    } catch (error) {
        // Remove old data so failed requests do not leave stale results
        currentBooks = [];
        bookList.innerHTML = '';

        // Show a simple error message if something goes wrong
        message.textContent = 'Unable to load books. Please try again.';
        console.error(error);

    } finally {
        // Re-enable the controls after the request finishes
        setLoadingState(false);
    }
};

// When the search button is clicked, search using the typed text
searchButton.addEventListener('click', () => {
    const searchTerm = searchInput.value.trim();
    loadBooks(searchTerm);
});

// Also allow the Enter key to search
searchInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        const searchTerm = searchInput.value.trim();
        loadBooks(searchTerm);
    }
});

// Apply filters whenever a filter option changes
genreFilter.addEventListener('change', applyFiltersAndSorting);
availabilityFilter.addEventListener('change', applyFiltersAndSorting);
sortSelect.addEventListener('change', applyFiltersAndSorting);

// Listen for real-time book changes from the server
socket.on('booksChanged', () => {
    // Keep the current search term when refreshing the catalogue
    const searchTerm = searchInput.value.trim();

    // Reload the catalogue automatically without refreshing the browser
    loadBooks(searchTerm);
});

// Open the review form for a selected book
document.addEventListener('click', (event) => {

    const writeButton =
        event.target.closest('.write-review-button');

    if (!writeButton) {
        return;
    }

    const token = localStorage.getItem('token');

    // User must be logged in to submit a review
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    selectedBookId = writeButton.dataset.bookId;

    const title = decodeURIComponent(
        writeButton.dataset.bookTitle
    );

    const author = decodeURIComponent(
        writeButton.dataset.bookAuthor
    );

    reviewBookTitle.textContent = title;
    reviewBookAuthor.textContent = `by ${author}`;

    // Reset form
    reviewForm.reset();
    selectedRating = 0;

    updateRatingStars();

    ratingText.textContent =
        'Select a rating';

    commentCount.textContent = '0';

    reviewMessage.textContent = '';

    reviewModal.classList.remove('hidden');

    reviewComment.focus();
});

const updateRatingStars = () => {

    ratingStars.forEach((star) => {

        const rating =
            Number(star.dataset.rating);

        star.classList.toggle(
            'selected',
            rating <= selectedRating
        );
    });

    if (selectedRating > 0) {
        ratingText.textContent =
            `${selectedRating} out of 5`;
    }
};


ratingStars.forEach((star) => {

    star.addEventListener('click', () => {

        selectedRating =
            Number(star.dataset.rating);

        updateRatingStars();
    });

});

reviewComment.addEventListener('input', () => {

    commentCount.textContent =
        reviewComment.value.length;
});

const closeReviewModalHandler = () => {

    reviewModal.classList.add('hidden');

    selectedBookId = null;
    selectedRating = 0;

    reviewForm.reset();

    updateRatingStars();

    ratingText.textContent =
        'Select a rating';

    commentCount.textContent = '0';

    reviewMessage.textContent = '';
};


closeReviewModal.addEventListener(
    'click',
    closeReviewModalHandler
);


reviewModal.addEventListener('click', (event) => {

    if (event.target === reviewModal) {
        closeReviewModalHandler();
    }

});

reviewForm.addEventListener(
    'submit',
    async (event) => {

        event.preventDefault();

        const token =
            localStorage.getItem('token');

        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        if (!selectedRating) {

            reviewMessage.textContent =
                'Please select a rating.';

            return;
        }

        const comment =
            reviewComment.value.trim();

        if (!comment) {

            reviewMessage.textContent =
                'Please enter a review.';

            return;
        }

        submitReviewButton.disabled = true;

        submitReviewButton.textContent =
            'Submitting...';

        reviewMessage.textContent = '';

        try {

            const response = await fetch(
                `/api/books/${selectedBookId}/reviews`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },

                    body: JSON.stringify({
                        rating: selectedRating,
                        comment
                    })
                }
            );

            const data =
                await response.json();

            if (!response.ok) {

                reviewMessage.textContent =
                    data.message ||
                    'Unable to submit review.';

                return;
            }

            reviewMessage.textContent =
                'Review submitted successfully and is awaiting moderation.';

            setTimeout(() => {
                closeReviewModalHandler();
            }, 1500);

        } catch (error) {

            console.error(
                'Review submission error:',
                error
            );

            reviewMessage.textContent =
                'Unable to connect to the server.';

        } finally {

            submitReviewButton.disabled = false;

            submitReviewButton.textContent =
                'Submit Review';
        }
    }
);



const viewReviewsModal =
    document.getElementById('viewReviewsModal');

const closeViewReviewsModal =
    document.getElementById('closeViewReviewsModal');

const viewReviewsBookTitle =
    document.getElementById('viewReviewsBookTitle');

const viewReviewsBookAuthor =
    document.getElementById('viewReviewsBookAuthor');

const reviewsSummary =
    document.getElementById('reviewsSummary');

const bookReviewsList =
    document.getElementById('bookReviewsList');

const myReviewsButton =
    document.getElementById('myReviewsButton');

const myReviewsModal =
    document.getElementById('myReviewsModal');

const closeMyReviewsModal =
    document.getElementById('closeMyReviewsModal');

const myReviewsList =
    document.getElementById('myReviewsList');// Load all books when the page first opens

const loadBookReviews = async (
    bookId,
    bookTitle,
    bookAuthor
) => {

    viewReviewsBookTitle.textContent = bookTitle;
    viewReviewsBookAuthor.textContent =
        `by ${bookAuthor}`;

    bookReviewsList.innerHTML =
        '<p class="reviews-loading">Loading reviews...</p>';

    reviewsSummary.innerHTML = '';

    viewReviewsModal.classList.remove('hidden');

    try {

        const response = await fetch(
            `/api/books/${bookId}/reviews`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                'Unable to load reviews'
            );
        }

        const reviews = Array.isArray(result.reviews)
            ? result.reviews
            : [];

        if (reviews.length === 0) {

            reviewsSummary.innerHTML =
                '<p class="review-count">No approved reviews yet.</p>';

            bookReviewsList.innerHTML =
                '<div class="empty-reviews">No reviews available for this book.</div>';

            return;
        }

        const totalRating = reviews.reduce(
            (sum, review) =>
                sum + Number(review.rating),
            0
        );

        const averageRating =
            totalRating / reviews.length;

        reviewsSummary.innerHTML = `
            <div class="average-rating">
                <strong>${averageRating.toFixed(1)}</strong>
                <span>/ 5</span>
                <span class="average-stars">
                    ${createStars(
            Math.round(averageRating)
        )}
                </span>
            </div>

            <p class="review-count">
                ${reviews.length}
                ${reviews.length === 1 ? 'review' : 'reviews'}
            </p>
        `;

        bookReviewsList.innerHTML = '';

        reviews.forEach((review) => {

            const card =
                createBookReviewCard(review);

            bookReviewsList.appendChild(card);
        });

    } catch (error) {

        console.error(
            'Load reviews error:',
            error
        );

        bookReviewsList.innerHTML =
            '<div class="empty-reviews">Unable to load reviews.</div>';
    }
};

const createStars = (rating) => {
    let stars = '';
    for (let i = 1; i <= 5; i++) {

        stars += i <= rating
            ? '★'
            : '☆';
    }
    return stars;
};

const createBookReviewCard = (review) => {
    const card =
        document.createElement('article');

    card.className = 'public-review-card';

    const reviewerName =
        review.userId?.fullName ||
        review.userId?.username ||
        'LibSwap Student';

    card.innerHTML = `
        <div class="public-review-top">

            <div>
                <h3>${reviewerName}</h3>

                <p class="review-date">
                    ${review.createdAt
            ? new Date(
                review.createdAt
            ).toLocaleDateString()
            : ''}
                </p>
            </div>

            <div class="public-review-rating">
                ${createStars(
                Number(review.rating)
            )}
            </div>

        </div>

        <p class="public-review-comment">
            ${escapeHtml(review.comment)}
        </p>
    `;

    return card;
};

const escapeHtml = (text) => {

    const div = document.createElement('div');

    div.textContent = text || '';

    return div.innerHTML;
};

closeViewReviewsModal.addEventListener(
    'click',
    () => {
        viewReviewsModal.classList.add(
            'hidden'
        );
    }
);

viewReviewsModal.addEventListener(
    'click',
    (event) => {

        if (event.target === viewReviewsModal) {
            viewReviewsModal.classList.add(
                'hidden'
            );
        }
    }
);

const loadMyReviews = async () => {

    const token =
        localStorage.getItem('token');

    if (!token) {
        window.location.href =
            '/login.html';

        return;
    }

    myReviewsList.innerHTML =
        '<p class="reviews-loading">Loading your reviews...</p>';

    myReviewsModal.classList.remove('hidden');

    try {

        const response = await fetch(
            '/api/reviews/my',
            {
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                'Unable to load your reviews'
            );
        }

        const reviews =
            Array.isArray(result.reviews)
                ? result.reviews
                : [];

        if (reviews.length === 0) {

            myReviewsList.innerHTML =
                '<div class="empty-reviews">You have not submitted any reviews yet.</div>';

            return;
        }

        myReviewsList.innerHTML = '';

        reviews.forEach((review) => {

            const card =
                createMyReviewCard(review);

            myReviewsList.appendChild(card);
        });

    } catch (error) {

        console.error(
            'Load my reviews error:',
            error
        );

        myReviewsList.innerHTML =
            '<div class="empty-reviews">Unable to load your reviews.</div>';
    }
};


const createMyReviewCard = (review) => {

    const card =
        document.createElement('article');

    card.className = 'my-review-card';

    const bookTitle =
        review.bookId?.title ||
        'Unknown book';

    const status =
        review.moderationStatus ||
        'pending';

    card.innerHTML = `
        <div class="my-review-header">

            <div>
                <h3>${bookTitle}</h3>

                <div class="my-review-stars">
                    ${createStars(
                        Number(review.rating)
                    )}
                </div>
            </div>

            <span class="review-status ${status}">
                ${status}
            </span>

        </div>

        <p class="my-review-comment">
            ${escapeHtml(review.comment)}
        </p>

        <div class="my-review-actions">

            <button
                type="button"
                class="edit-review-button"
                data-review-id="${review._id}"
            >
                Edit
            </button>

            <button
                type="button"
                class="delete-review-button"
                data-review-id="${review._id}"
            >
                Delete
            </button>

        </div>
    `;

    return card;
};

myReviewsButton.addEventListener(
    'click',
    loadMyReviews
);

closeMyReviewsModal.addEventListener(
    'click',
    () => {
        myReviewsModal.classList.add(
            'hidden'
        );
    }
);

myReviewsModal.addEventListener(
    'click',
    (event) => {

        if (event.target === myReviewsModal) {
            myReviewsModal.classList.add(
                'hidden'
            );
        }
    }
);

document.addEventListener('click', async (event) => {

    const editButton =
        event.target.closest('.edit-review-button');

    if (!editButton) {
        return;
    }

    const reviewId =
        editButton.dataset.reviewId;

    const newRating =
        prompt(
            'Enter new rating (1-5):'
        );

    if (newRating === null) {
        return;
    }

    const numericRating =
        Number(newRating);

    if (
        !Number.isInteger(numericRating) ||
        numericRating < 1 ||
        numericRating > 5
    ) {

        alert(
            'Rating must be an integer between 1 and 5.'
        );

        return;
    }

    const newComment =
        prompt(
            'Enter your new review:'
        );

    if (newComment === null) {
        return;
    }

    const token =
        localStorage.getItem('token');

    try {

        const response = await fetch(
            `/api/reviews/${reviewId}`,
            {
                method: 'PATCH',

                headers: {
                    'Content-Type':
                        'application/json',

                    Authorization:
                        `Bearer ${token}`
                },

                body: JSON.stringify({
                    rating: numericRating,
                    comment:
                        newComment.trim()
                })
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                'Unable to update review'
            );
        }

        alert(
            'Review updated successfully and sent for moderation.'
        );

        await loadMyReviews();

    } catch (error) {

        alert(error.message);

        console.error(error);
    }
});

document.addEventListener('click', async (event) => {

    const deleteButton =
        event.target.closest('.delete-review-button');

    if (!deleteButton) {
        return;
    }

    const reviewId =
        deleteButton.dataset.reviewId;

    const confirmed =
        confirm(
            'Are you sure you want to delete this review?'
        );

    if (!confirmed) {
        return;
    }

    const token =
        localStorage.getItem('token');

    try {

        const response = await fetch(
            `/api/reviews/${reviewId}`,
            {
                method: 'DELETE',

                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                'Unable to delete review'
            );
        }

        alert(
            'Review deleted successfully.'
        );

        await loadMyReviews();

    } catch (error) {

        alert(error.message);

        console.error(error);
    }
});

loadBooks();