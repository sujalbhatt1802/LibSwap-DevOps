const express = require("express");
const Book = require("../models/Book.js");
const SwapRequest = require("../models/SwapRequest.js");
const authMiddleware = require("../middleware/authMiddleware.js");
const { circulationView } = require('../controllers/borrowController');

const router = express.Router();

/* -------------------------------------------
   GET MY BOOKS (Owned)
-------------------------------------------- */
router.get("/my-books/:userId", authMiddleware, async (req, res) => {
  try {
    const tokenUserId = req.user.userId;
    const { userId } = req.params;

    if (tokenUserId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Unauthorized: You can only view your own books." 
      });
    }

    const books = await Book.find({ ownerId: userId });

    // Enrich each book object with original uploader status
    const enrichedBooks = await Promise.all(
      books.map(async (book) => {
        const bookObj = book.toObject();

        // Check the earliest accepted swap for this book
        const firstSwap = await SwapRequest.findOne({
          status: "accepted",
          $or: [
            { requestedBookId: book._id },
            { offeredBookId: book._id }
          ]
        }).sort({ createdAt: 1 });

        if (firstSwap) {
          const originalUploaderId =
            firstSwap.requestedBookId.toString() === book._id.toString()
              ? firstSwap.ownerId.toString()
              : firstSwap.requesterId.toString();

          bookObj.isOriginalUploader = originalUploaderId === tokenUserId;
        } else {
          // If never swapped, the current owner is the original uploader
          bookObj.isOriginalUploader = true;
        }

        return bookObj;
      })
    );

    return res.status(200).json({ success: true, data: enrichedBooks });
  } catch (error) {
    console.error("Dashboard my-books error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------
   GET BORROWED BOOKS
-------------------------------------------- */
router.get("/borrowed/:userId", authMiddleware, async (req, res) => {
  try {
    const tokenUserId = req.user.userId;
    const { userId } = req.params;

    if (tokenUserId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Unauthorized: You can only view your own borrowed books." 
      });
    }

    const books = await Book.find({ borrowedBy: userId }).select('+reservationQueue').lean();
    return res.status(200).json({ success: true, data: books.map(book => circulationView(book, userId)) });
  } catch (error) {
    console.error("Dashboard borrowed error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------
   GET RESERVED BOOKS
-------------------------------------------- */
router.get("/reservations/:userId", authMiddleware, async (req, res) => {
  try {
    const tokenUserId = req.user.userId;
    const { userId } = req.params;

    if (tokenUserId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Unauthorized: You can only view your own reservations." 
      });
    }

    const books = await Book.find({ $or: [{ reservedBy: userId }, { 'reservationQueue.user': userId }] })
      .select('+reservationQueue').lean();
    return res.status(200).json({ success: true, data: books.map(book => circulationView(book, userId)) });
  } catch (error) {
    console.error("Dashboard reservations error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------
   ADD A PERSONAL BOOK (Owned by User)
-------------------------------------------- */
router.post("/my-books/:userId", authMiddleware, async (req, res) => {
  try {
    const tokenUserId = req.user.userId;
    const { userId } = req.params;

    if (tokenUserId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Unauthorized: You can only add books to your own account." 
      });
    }

    let { title, author, genre } = req.body;

    if (typeof title !== 'string' || typeof author !== 'string') {
      return res.status(400).json({ success: false, message: "Invalid data format." });
    }

    title = title.trim();
    author = author.trim();
    genre = typeof genre === 'string' ? genre.trim() : "";

    if (!title || !author) {
      return res.status(400).json({ success: false, message: "Title and author cannot be empty or just spaces." });
    }

    if (title.length > 100 || author.length > 50 || genre.length > 30) {
      return res.status(400).json({ success: false, message: "Input exceeds maximum allowed length." });
    }

    const existingBook = await Book.findOne({ title, author, ownerId: tokenUserId });
    if (existingBook) {
      return res.status(400).json({ success: false, message: "You have already added this book." });
    }

    const newBook = new Book({
      title,
      author,
      genre,
      ownerId: tokenUserId,
      available: true
    });

    const savedBook = await newBook.save();
    return res.status(201).json({ success: true, data: savedBook });
  } catch (error) {
    console.error("Dashboard add book error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------
   DELETE A PERSONAL BOOK
-------------------------------------------- */
router.delete("/my-books/:userId/:bookId", authMiddleware, async (req, res) => {
  try {
    const tokenUserId = req.user.userId;
    const { userId, bookId } = req.params;

    if (tokenUserId !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Unauthorized: You can only delete your own books." 
      });
    }

    const book = await Book.findOne({ _id: bookId, ownerId: tokenUserId });
    
    if (!book) {
      return res.status(404).json({ success: false, message: "Book not found or permission denied." });
    }

    if (book.borrowedBy || book.reservedBy) {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot delete this book because it is currently borrowed or reserved." 
      });
    }

    //  find the VERY FIRST time this book was ever swapped
    const firstSwap = await SwapRequest.findOne({
      status: "accepted",
      $or: [
        { requestedBookId: bookId },
        { offeredBookId: bookId }
      ]
    }).sort({ createdAt: 1 }); // 1 means ascending (oldest first)

    // if the book has a swap history, verify the user is the original giver
    if (firstSwap) {
      let originalUploaderId;
      
      // if the book was the requested one, the owner at that time was the original uploader
      if (firstSwap.requestedBookId.toString() === bookId) {
        originalUploaderId = firstSwap.ownerId.toString();
      } 
      // if the book was the offered one, the requester was the original uploader
      else {
        originalUploaderId = firstSwap.requesterId.toString();
      }

      // if the current user isn't the one who initiated its very first swap, they acquired it later
      if (originalUploaderId !== tokenUserId) {
        return res.status(403).json({
          success: false,
          message: "You cannot delete a book you acquired through a swap. Only the original uploader can delete it."
        });
      }
    }

    await Book.findByIdAndDelete(bookId);
    return res.status(200).json({ success: true, message: "Book deleted successfully." });
  } catch (error) {
    console.error("Dashboard delete book error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
