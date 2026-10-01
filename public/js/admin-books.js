// Getting the main admin page elements
const bookForm = document.getElementById('bookForm');
const titleInput = document.getElementById('title');
const authorInput = document.getElementById('author');
const genreInput = document.getElementById('genre');
const availableInput = document.getElementById('available');

const saveButton = document.getElementById('saveButton');
const cancelButton = document.getElementById('cancelButton');
const adminMessage = document.getElementById('adminMessage');
const bookTableBody = document.getElementById('bookTableBody');

// Stores the ID of the book currently being edited
// null means we are adding a new book
let editingBookId = null;

// Returns the JWT saved when the user logged in
const getToken = () => {
    return localStorage.getItem('token');
};

// Creates the Authorization header used by protected routes
const getAuthHeaders = () => {
    const token = getToken();

    if (!token) {
        return {};
    }

    return {
        Authorization: `Bearer ${token}`
    };
};

// Shows a message to the admin
const showMessage = (text, isError = false) => {
    adminMessage.textContent = text;

    if (isError) {
        adminMessage.className = 'error-message';
    } else {
        adminMessage.className = 'success-message';
    }
};

// Disables the management form when the user is not staff
const disableManagement = () => {
    titleInput.disabled = true;
    authorInput.disabled = true;
    genreInput.disabled = true;
    availableInput.disabled = true;
    saveButton.disabled = true;
    cancelButton.disabled = true;
};

// Checks whether the logged-in user is staff
const checkStaffAccess = async () => {
    const token = getToken();

    if (!token) {
        disableManagement();

        showMessage(
            'Please log in with a staff account to manage library books.',
            true
        );

        return false;
    }

    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            disableManagement();

            showMessage(
                'Your login session is invalid or has expired.',
                true
            );

            return false;
        }

        const result = await response.json();

        if (!result.user || result.user.role !== 'staff') {
            disableManagement();

            showMessage(
                'Staff access is required to manage library books.',
                true
            );

            return false;
        }

        return true;

    } catch (error) {
        disableManagement();

        showMessage(
            'Unable to verify staff access.',
            true
        );

        console.error(error);

        return false;
    }
};

// Resets the form back to Add Book mode
const resetForm = () => {
    bookForm.reset();

    editingBookId = null;

    saveButton.textContent = 'Add Book';

    // Newly added books are available by default
    availableInput.value = 'true';
};

// Creates one row in the admin book table
const createBookRow = (book) => {
    const row = document.createElement('tr');

    const titleCell = document.createElement('td');
    titleCell.textContent = book.title;

    const authorCell = document.createElement('td');
    authorCell.textContent = book.author;

    const genreCell = document.createElement('td');
    genreCell.textContent = book.genre || 'Not specified';

    const availabilityCell = document.createElement('td');
    availabilityCell.textContent = book.available
        ? 'Available'
        : 'Unavailable';

    const actionsCell = document.createElement('td');

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';

    editButton.addEventListener('click', () => {
        editingBookId = book._id;

        titleInput.value = book.title;
        authorInput.value = book.author;
        genreInput.value = book.genre || '';
        availableInput.value = String(book.available);

        saveButton.textContent = 'Update Book';

        adminMessage.textContent = '';
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';

    deleteButton.addEventListener('click', async () => {
        const token = getToken();

        if (!token) {
            showMessage(
                'Staff login is required to delete books.',
                true
            );

            return;
        }

        const confirmed = confirm(
            `Are you sure you want to delete "${book.title}"?`
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/books/${book._id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || 'Unable to delete book'
                );
            }

            showMessage('Book deleted successfully.');

            await loadBooks();

        } catch (error) {
            showMessage(error.message, true);
            console.error(error);
        }
    });

    actionsCell.appendChild(editButton);
    actionsCell.appendChild(deleteButton);

    row.appendChild(titleCell);
    row.appendChild(authorCell);
    row.appendChild(genreCell);
    row.appendChild(availabilityCell);
    row.appendChild(actionsCell);

    return row;
};

// Loads all books from the backend
const loadBooks = async () => {
    try {
        bookTableBody.innerHTML = '';

        const response = await fetch('/api/books');

        if (!response.ok) {
            throw new Error('Unable to load books');
        }

        const books = await response.json();

        if (!Array.isArray(books)) {
            throw new Error('Invalid book data received');
        }

        if (books.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');

            cell.colSpan = 5;
            cell.textContent = 'No books found.';

            row.appendChild(cell);
            bookTableBody.appendChild(row);

            return;
        }

        books.forEach((book) => {
            const row = createBookRow(book);
            bookTableBody.appendChild(row);
        });

    } catch (error) {
        showMessage(
            'Unable to load books. Please try again.',
            true
        );

        console.error(error);
    }
};

// Handles adding and updating books
bookForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    adminMessage.textContent = '';

    const token = getToken();

    if (!token) {
        showMessage(
            'Staff login is required to manage books.',
            true
        );

        return;
    }

    const bookData = {
        title: titleInput.value.trim(),
        author: authorInput.value.trim(),
        genre: genreInput.value.trim(),
        available: availableInput.value === 'true'
    };

    try {
        let url = '/api/books';
        let method = 'POST';

        // If we are editing an existing book, use PUT instead
        if (editingBookId) {
            url = `/api/books/${editingBookId}`;
            method = 'PUT';
        }

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(bookData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || 'Unable to save book'
            );
        }

        if (editingBookId) {
            showMessage('Book updated successfully.');
        } else {
            showMessage('Book added successfully.');
        }

        resetForm();

        await loadBooks();

    } catch (error) {
        showMessage(error.message, true);
        console.error(error);
    }
});

// Cancel editing and return to Add Book mode
cancelButton.addEventListener('click', () => {
    resetForm();
    adminMessage.textContent = '';
});

// Check authorization and load books when the admin page opens
const initialiseAdminPage = async () => {
    await checkStaffAccess();
    await loadBooks();
};

initialiseAdminPage();