document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    const logoutButtons =
        document.querySelectorAll('[data-logout]');

    logoutButtons.forEach((button) => {
        button.addEventListener('click', logoutUser);
    });
});


/* =========================================
   LOGIN
   ========================================= */

async function handleLogin(event) {
    event.preventDefault();

    const email = document
        .getElementById('loginEmail')
        .value
        .trim();

    const password = document
        .getElementById('loginPassword')
        .value;

    const loginButton =
        document.getElementById('loginButton');

    const loginMessage =
        document.getElementById('loginMessage');

    // Loading state
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';
    loginMessage.textContent = '';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await response.json();

        // Backend returned an error
        if (!response.ok) {
            loginMessage.textContent =
                data.message || 'Invalid email or password';

            return;
        }

        // Make sure required login data exists
        if (
            !data.token ||
            !data.user ||
            !data.user.id ||
            !data.user.role
        ) {
            loginMessage.textContent =
                'Invalid response from server';

            return;
        }

        /*
         * Store authentication information
         * required by the rest of the application.
         */

        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.user.id);
        localStorage.setItem('username', data.user.username);
        localStorage.setItem('fullName', data.user.fullName);
        localStorage.setItem('email', data.user.email);
        localStorage.setItem('role', data.user.role);

        /*
         * Redirect based on role
         */

        if (data.user.role === 'student') {
            window.location.href = '/dashboard.html';
        } else if (data.user.role === 'staff') {
            window.location.href = '/admin-books.html';
        } else {
            localStorage.clear();

            loginMessage.textContent =
                'Unable to determine user role';
        }

    } catch (error) {
        console.error('Login error:', error);

        loginMessage.textContent =
            'Unable to connect to the server';

    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Sign In';
    }
}


/* =========================================
   STUDENT REGISTRATION
   ========================================= */

async function handleRegister(event) {
    event.preventDefault();

    const username = document
        .getElementById('registerUsername')
        .value
        .trim();

    const fullName = document
        .getElementById('registerFullName')
        .value
        .trim();

    const email = document
        .getElementById('registerEmail')
        .value
        .trim();

    const password = document
        .getElementById('registerPassword')
        .value;

    const confirmPassword = document
        .getElementById('registerConfirmPassword')
        .value;

    const registerButton =
        document.getElementById('registerButton');

    const registerMessage =
        document.getElementById('registerMessage');

    registerMessage.textContent = '';

    // Client-side password check
    if (password !== confirmPassword) {
        registerMessage.textContent =
            'Passwords do not match';

        return;
    }

    if (password.length < 6) {
        registerMessage.textContent =
            'Password must be at least 6 characters long';

        return;
    }

    // Loading state
    registerButton.disabled = true;
    registerButton.textContent = 'Creating account...';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                fullName,
                email,
                password
            })
        });

        const data = await response.json();

        // Backend error
        if (!response.ok) {
            registerMessage.textContent =
                data.message || 'Registration failed';

            return;
        }

        // Successful registration
        registerMessage.textContent =
            'Account created successfully. Redirecting...';

        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1200);

    } catch (error) {
        console.error('Registration error:', error);

        registerMessage.textContent =
            'Unable to connect to the server';

    } finally {
        registerButton.disabled = false;
        registerButton.textContent =
            'Create Student Account';
    }
}

/* =========================================
   SHARED LOGOUT
   ========================================= */

function logoutUser() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('fullName');
    localStorage.removeItem('email');
    localStorage.removeItem('role');

    window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {

    const logoutButtons =
        document.querySelectorAll('[data-logout]');

    logoutButtons.forEach((button) => {
        button.addEventListener('click', logoutUser);
    });

});

/* =========================================
   SHARED LOGOUT
========================================= */

function logoutUser() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('fullName');
    localStorage.removeItem('email');
    localStorage.removeItem('role');

    window.location.href = '/login.html';
}

// Make function available globally
window.logoutUser = logoutUser;

// Attach logout handlers
document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', logoutUser);
});

function logoutUser() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('fullName');
    localStorage.removeItem('email');
    localStorage.removeItem('role');

    window.location.href = '/login.html';
}