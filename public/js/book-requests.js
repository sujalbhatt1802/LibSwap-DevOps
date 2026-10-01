// Getting the login section elements
const loginSection = document.getElementById('loginSection');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('loginMessage');

// Getting the main app section elements
const appSection = document.getElementById('appSection');
const welcomeText = document.getElementById('welcomeText');
const logoutButton = document.getElementById('logoutButton');

// New request form elements
const titleInput = document.getElementById('titleInput');
const authorInput = document.getElementById('authorInput');
const genreInput = document.getElementById('genreInput');
const reasonInput = document.getElementById('reasonInput');
const submitRequestButton = document.getElementById('submitRequestButton');
const requestMessage = document.getElementById('requestMessage');

// "My requests" elements
const myRequestsSection = document.getElementById('myRequestsSection');
const myRequestsMessage = document.getElementById('myRequestsMessage');
const myRequestsList = document.getElementById('myRequestsList');

// Staff-only elements
const staffSection = document.getElementById('staffSection');
const statusFilter = document.getElementById('statusFilter');
const staffMessage = document.getElementById('staffMessage');
const staffRequestsList = document.getElementById('staffRequestsList');

// Reads the saved login token, matching the same localStorage keys
// used elsewhere in the app (token / userId / fullName / role)
const getToken = () => localStorage.getItem('token');
const getRole = () => localStorage.getItem('role');

const statusLabels = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    fulfilled: 'Fulfilled'
};

// Shows the login form or the request tools, depending on whether
// the visitor already has a saved token
const updateVisibleSection = () => {
    const token = getToken();

    if (token) {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        myRequestsSection.classList.remove('hidden');

        const fullName = localStorage.getItem('fullName');
        welcomeText.textContent = fullName ? `Signed in as ${fullName}` : 'Signed in';

        // Only staff accounts see the full review panel
        if (getRole() === 'staff') {
            staffSection.classList.remove('hidden');
            loadStaffRequests();
        } else {
            staffSection.classList.add('hidden');
        }

        loadMyRequests();
    } else {
        appSection.classList.add('hidden');
        myRequestsSection.classList.add('hidden');
        staffSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
    }
};

// Logs the visitor in using the existing auth API
loginButton.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
        loginMessage.textContent = 'Please enter your email and password.';
        return;
    }

    loginButton.disabled = true;
    loginMessage.textContent = 'Signing in...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            loginMessage.textContent = data.message || 'Login failed.';
            return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.user.id);
        localStorage.setItem('fullName', data.user.fullName);
        localStorage.setItem('role', data.user.role);

        loginMessage.textContent = '';
        loginPassword.value = '';
        updateVisibleSection();
    } catch (error) {
        console.error(error);
        loginMessage.textContent = 'Unable to reach the server. Please try again.';
    } finally {
        loginButton.disabled = false;
    }
});

// Logs the visitor out and shows the login form again
logoutButton.addEventListener('click', () => {
    localStorage.clear();
    updateVisibleSection();
});

// Also allow the Enter key to submit the login form
loginPassword.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        loginButton.click();
    }
});

// Submits a new book request
submitRequestButton.addEventListener('click', async () => {
    const title = titleInput.value.trim();

    if (!title) {
        requestMessage.textContent = 'Please enter a book title.';
        return;
    }

    submitRequestButton.disabled = true;
    requestMessage.textContent = 'Submitting request...';

    try {
        const response = await fetch('/api/book-requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                title,
                author: authorInput.value.trim(),
                genre: genreInput.value.trim(),
                reason: reasonInput.value.trim()
            })
        });

        const data = await response.json();

        if (!response.ok) {
            requestMessage.textContent = data.message || 'Failed to submit request.';
            return;
        }

        requestMessage.textContent = 'Request submitted! You will be notified about any updates.';
        titleInput.value = '';
        authorInput.value = '';
        genreInput.value = '';
        reasonInput.value = '';

        loadMyRequests();
    } catch (error) {
        console.error(error);
        requestMessage.textContent = 'Unable to reach the server. Please try again.';
    } finally {
        submitRequestButton.disabled = false;
    }
});

// Builds a single request card. When actionsHtml/onRender is provided
// (staff view) it also wires up the approve/reject/fulfil buttons.
const buildRequestCard = (bookRequest, { showRequester = false, showActions = false } = {}) => {
    const card = document.createElement('div');
    card.classList.add('request-card');

    const requesterLine = showRequester && bookRequest.requestedBy
        ? `<p class="requester-name">Requested by: ${bookRequest.requestedBy.fullName || bookRequest.requestedBy.username || 'Unknown user'}</p>`
        : '';

    const staffNoteHtml = bookRequest.staffNote
        ? `<p class="staff-note"><strong>Library note:</strong> ${bookRequest.staffNote}</p>`
        : '';

    card.innerHTML = `
        <div class="request-card-top">
            <h3>${bookRequest.title}</h3>
            <span class="status-badge status-${bookRequest.status}">${statusLabels[bookRequest.status] || bookRequest.status}</span>
        </div>
        ${bookRequest.author ? `<p><strong>Author:</strong> ${bookRequest.author}</p>` : ''}
        ${bookRequest.genre ? `<p><strong>Genre:</strong> ${bookRequest.genre}</p>` : ''}
        ${bookRequest.reason ? `<p><strong>Reason:</strong> ${bookRequest.reason}</p>` : ''}
        ${requesterLine}
        ${staffNoteHtml}
    `;

    if (showActions) {
        const actions = document.createElement('div');
        actions.classList.add('staff-actions');

        const makeActionButton = (label, status, className) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.classList.add(className);
            button.addEventListener('click', () => updateRequestStatus(bookRequest._id, status));
            return button;
        };

        actions.appendChild(makeActionButton('Approve', 'approved', 'approve-button'));
        actions.appendChild(makeActionButton('Reject', 'rejected', 'reject-button'));
        actions.appendChild(makeActionButton('Mark fulfilled', 'fulfilled', 'fulfil-button'));

        card.appendChild(actions);
    }

    return card;
};

// Loads the logged-in user's own book requests
const loadMyRequests = async () => {
    try {
        myRequestsMessage.textContent = 'Loading your requests...';
        myRequestsList.innerHTML = '';

        const response = await fetch('/api/book-requests/me', {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (response.status === 401) {
            localStorage.clear();
            updateVisibleSection();
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to load your requests');
        }

        myRequestsMessage.textContent = '';

        if (data.bookRequests.length === 0) {
            myRequestsMessage.textContent = "You haven't requested any books yet.";
            return;
        }

        data.bookRequests.forEach((bookRequest) => {
            myRequestsList.appendChild(buildRequestCard(bookRequest));
        });
    } catch (error) {
        console.error(error);
        myRequestsMessage.textContent = 'Unable to load your requests. Please try again.';
    }
};

// Staff-only: loads every request in the system, optionally filtered by status
const loadStaffRequests = async () => {
    try {
        staffMessage.textContent = 'Loading requests...';
        staffRequestsList.innerHTML = '';

        let url = '/api/book-requests';
        if (statusFilter.value) {
            url += `?status=${encodeURIComponent(statusFilter.value)}`;
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to load requests');
        }

        staffMessage.textContent = '';

        if (data.bookRequests.length === 0) {
            staffMessage.textContent = 'No requests match this filter.';
            return;
        }

        data.bookRequests.forEach((bookRequest) => {
            staffRequestsList.appendChild(
                buildRequestCard(bookRequest, { showRequester: true, showActions: true })
            );
        });
    } catch (error) {
        console.error(error);
        staffMessage.textContent = 'Unable to load requests. Please try again.';
    }
};

// Staff action: change a request's status, which also triggers a
// notification to the original requester on the backend
const updateRequestStatus = async (requestId, status) => {
    try {
        const response = await fetch(`/api/book-requests/${requestId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({ status })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to update request');
        }

        loadStaffRequests();
    } catch (error) {
        console.error(error);
        staffMessage.textContent = 'Unable to update that request. Please try again.';
    }
};

statusFilter.addEventListener('change', loadStaffRequests);

// Decide which section to show as soon as the page loads
updateVisibleSection();
