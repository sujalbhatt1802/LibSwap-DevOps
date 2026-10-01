const BookRequest = require('../models/BookRequest');
const { createNotification } = require('./notificationController');

// As a user, request a book that isn't currently in the library collection
const requestBook = async (req, res) => {
  try {
    const { title, author, genre, reason } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: 'Book title is required'
      });
    }

    const bookRequest = await BookRequest.create({
      requestedBy: req.user.userId,
      title: title.trim(),
      author: author ? author.trim() : undefined,
      genre: genre ? genre.trim() : undefined,
      reason: reason ? reason.trim() : undefined
    });

    // Let the user know their request went through, so the request
    // itself immediately shows up in their notifications too
    await createNotification({
      user: req.user.userId,
      type: 'book_request',
      title: 'Book request submitted',
      message: `Your request for "${bookRequest.title}" has been sent to the library.`,
      relatedId: bookRequest._id
    });

    return res.status(201).json({
      message: 'Book request submitted successfully',
      bookRequest
    });
  } catch (error) {
    console.error('Book request error:', error);
    return res.status(500).json({
      message: 'Server error while submitting book request'
    });
  }
};

// Let a user see the book requests they've personally made
const getMyBookRequests = async (req, res) => {
  try {
    const bookRequests = await BookRequest.find({
      requestedBy: req.user.userId
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Book requests retrieved successfully',
      count: bookRequests.length,
      bookRequests
    });
  } catch (error) {
    console.error('Get my book requests error:', error);
    return res.status(500).json({
      message: 'Server error while retrieving book requests'
    });
  }
};

// Staff view of all book requests, optionally filtered by ?status=
const getAllBookRequests = async (req, res) => {
  try {
    if (req.user.role !== 'staff') {
      return res.status(403).json({
        message: 'Only staff can view all book requests'
      });
    }

    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const bookRequests = await BookRequest.find(filter)
      .populate('requestedBy', 'username fullName email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Book requests retrieved successfully',
      count: bookRequests.length,
      bookRequests
    });
  } catch (error) {
    console.error('Get all book requests error:', error);
    return res.status(500).json({
      message: 'Server error while retrieving book requests'
    });
  }
};

// Staff action: approve, reject or mark a book request fulfilled.
// This is where the notification loop closes - the requester is told
// about the outcome instead of having to keep checking back.
const updateBookRequestStatus = async (req, res) => {
  try {
    if (req.user.role !== 'staff') {
      return res.status(403).json({
        message: 'Only staff can update book requests'
      });
    }

    const { status, staffNote } = req.body;
    const allowedStatuses = ['pending', 'approved', 'rejected', 'fulfilled'];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Status must be one of: ${allowedStatuses.join(', ')}`
      });
    }

    const bookRequest = await BookRequest.findById(req.params.id);

    if (!bookRequest) {
      return res.status(404).json({
        message: 'Book request not found'
      });
    }

    bookRequest.status = status;
    bookRequest.reviewedBy = req.user.userId;
    if (staffNote !== undefined) {
      bookRequest.staffNote = staffNote.trim();
    }

    await bookRequest.save();

    // Notify the original requester about the status change
    const statusMessages = {
      approved: `Good news! Your request for "${bookRequest.title}" was approved and is being sourced.`,
      rejected: `Your request for "${bookRequest.title}" was not approved.`,
      fulfilled: `"${bookRequest.title}" is now available in the library catalogue.`,
      pending: `Your request for "${bookRequest.title}" is pending review.`
    };

    await createNotification({
      user: bookRequest.requestedBy,
      type: 'book_request',
      title: 'Book request update',
      message: statusMessages[status],
      relatedId: bookRequest._id
    });

    return res.status(200).json({
      message: 'Book request updated successfully',
      bookRequest
    });
  } catch (error) {
    console.error('Update book request error:', error);
    return res.status(500).json({
      message: 'Server error while updating book request'
    });
  }
};

module.exports = {
  requestBook,
  getMyBookRequests,
  getAllBookRequests,
  updateBookRequestStatus
};
