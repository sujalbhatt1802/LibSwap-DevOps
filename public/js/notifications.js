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
const unreadFilter = document.getElementById('unreadFilter');
const unreadBadge = document.getElementById('unreadBadge');
const markAllButton = document.getElementById('markAllButton');
const message = document.getElementById('message');
const notificationList = document.getElementById('notificationList');

// Reads the saved login token, matching the same localStorage keys
// used elsewhere in the app (token / userId / fullName / role)
const getToken = () => localStorage.getItem('token');

// Shows the login form or the notifications, depending on whether
// the visitor already has a saved token
const updateVisibleSection = () => {
    const token = getToken();

    if (token) {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');

        const fullName = localStorage.getItem('fullName');
        welcomeText.textContent = fullName ? `Signed in as ${fullName}` : 'Signed in';

        loadNotifications();
    } else {
        appSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
    }
};

// Logs the visitor in using the existing auth API, then stores the
// token so the notifications API calls below can use it
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

// Formats a timestamp the way a person reads it, e.g. "2 hours ago"
const formatRelativeTime = (isoString) => {
    const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);

    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
};

// Turns a notification type into a friendlier label
const typeLabels = {
    book_request: 'Book request',
    book_swap: 'Book swap',
    account: 'Account',
    system: 'System'
};

// Shows the notifications on the page
const displayNotifications = (notifications) => {
    notificationList.replaceChildren();
    message.textContent = '';

    if (notifications.length === 0) {
        message.textContent = 'No notifications to show.';
        return;
    }

    notifications.forEach((notification) => {
        const card = document.createElement('div');
        card.classList.add('notification-card');
        if (!notification.isRead) {
            card.classList.add('unread');
        }

        const cardTop = document.createElement('div');
        cardTop.classList.add('notification-card-top');

        const title = document.createElement('h3');
        title.textContent = notification.title;
        cardTop.appendChild(title);

        const notificationMessage = document.createElement('p');
        notificationMessage.textContent = notification.message;

        const meta = document.createElement('div');
        meta.classList.add('notification-meta');

        const type = document.createElement('span');
        type.classList.add('notification-type');
        type.textContent = typeLabels[notification.type] || 'System';

        const time = document.createElement('span');
        time.classList.add('notification-time');
        time.textContent = formatRelativeTime(notification.createdAt);

        meta.append(type, time);
        card.append(cardTop, notificationMessage, meta);

        // Only unread notifications get a "Mark read" action
        if (!notification.isRead) {
            const markReadButton = document.createElement('button');
            markReadButton.textContent = 'Mark as read';
            markReadButton.classList.add('secondary-button');
            markReadButton.style.marginTop = '10px';

            markReadButton.addEventListener('click', () => markOneAsRead(notification._id));

            card.appendChild(markReadButton);
        }

        notificationList.appendChild(card);
    });
};

// Updates the small unread count badge next to the filter
const updateUnreadBadge = async () => {
    try {
        const response = await fetch('/api/notifications/unread-count', {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        const data = await response.json();

        if (!response.ok) {
            return;
        }

        unreadBadge.textContent = `${data.unreadCount} unread`;
        unreadBadge.classList.toggle('zero', data.unreadCount === 0);
    } catch (error) {
        console.error(error);
    }
};

// Loads notifications from the backend, respecting the selected filter
const loadNotifications = async () => {
    try {
        message.textContent = 'Loading notifications...';
        notificationList.replaceChildren();

        let url = '/api/notifications';
        if (unreadFilter.value === 'unread') {
            url += '?unread=true';
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (response.status === 401) {
            // Saved token has expired or is invalid - send them back to login
            localStorage.clear();
            updateVisibleSection();
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to load notifications');
        }

        displayNotifications(data.notifications);
        updateUnreadBadge();
    } catch (error) {
        console.error(error);
        message.textContent = 'Unable to load notifications. Please try again.';
    }
};

// Marks a single notification as read, then refreshes the list
const markOneAsRead = async (notificationId) => {
    try {
        const response = await fetch(`/api/notifications/${notificationId}/read`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Failed to mark notification as read');
        }

        loadNotifications();
    } catch (error) {
        console.error(error);
        message.textContent = 'Unable to update that notification. Please try again.';
    }
};

// Marks every notification as read
markAllButton.addEventListener('click', async () => {
    markAllButton.disabled = true;

    try {
        const response = await fetch('/api/notifications/mark-all-read', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Failed to mark all notifications as read');
        }

        loadNotifications();
    } catch (error) {
        console.error(error);
        message.textContent = 'Unable to update notifications. Please try again.';
    } finally {
        markAllButton.disabled = false;
    }
});

// Reload whenever the filter changes
unreadFilter.addEventListener('change', loadNotifications);

// Also allow the Enter key to submit the login form
loginPassword.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        loginButton.click();
    }
});

// Decide which section to show as soon as the page loads
updateVisibleSection();
