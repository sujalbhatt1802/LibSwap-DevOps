const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const app = require('./app');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

// Create an HTTP server using our Express application
const server = http.createServer(app);

// Attach Socket.IO to the same server
const io = new Server(server);

// Make Socket.IO available inside Express controllers
app.set('io', io);

// Optional message when a browser connects
io.on('connection', (socket) => {
    console.log('A client connected for real-time updates');

    socket.on('disconnect', () => {
        console.log('A client disconnected');
    });
});

// Connect to MongoDB first
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');

        // Start the HTTP + Socket.IO server
        server.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('MongoDB connection failed:', error.message);
    });