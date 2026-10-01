const express = require('express');

const authRoutes = require('./routes/authRoutes');
const bookRoutes = require('./routes/bookRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const bookRequestRoutes = require('./routes/bookRequestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const moderationRoutes = require('./routes/moderationRoutes');
const swapRoutes = require('./routes/swapRoutes');

const app = express();

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('LibSwap server is running');
});

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);

// Book request routes - ask for a book that isn't in the catalogue
app.use('/api/book-requests', bookRequestRoutes);

// Notification routes - library and book-swap activity alerts
app.use('/api/notifications', notificationRoutes);

app.use('/dashboard', dashboardRoutes);
app.use('/api', reviewRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/swap', swapRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        service: 'LibSwap'
    });
});

module.exports = app;
