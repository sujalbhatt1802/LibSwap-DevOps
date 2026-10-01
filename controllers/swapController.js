const mongoose = require("mongoose");
const SwapRequest = require("../models/SwapRequest");
const Book = require("../models/Book");

// SEND SWAP REQUEST
exports.sendSwapRequest = async (req, res) => {
  try {
    const { requestedBookId, offeredBookId, ownerId } = req.body;

    // ⭐ Extract requester securely from token
    const requesterId = req.user.userId;

    if (!requestedBookId || !offeredBookId || !ownerId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (!mongoose.Types.ObjectId.isValid(requestedBookId) || !mongoose.Types.ObjectId.isValid(offeredBookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID format" });
    }

    const [requestedBook, offeredBook] = await Promise.all([
      Book.findById(requestedBookId),
      Book.findById(offeredBookId)
    ]);

    if (!requestedBook || !offeredBook) {
      return res.status(404).json({ success: false, message: "One or both books not found" });
    }

    if (requestedBook.ownerId.toString() !== ownerId) {
      return res.status(400).json({ success: false, message: "Requested book does not belong to the specified owner" });
    }

    if (offeredBook.ownerId.toString() !== requesterId) {
      return res.status(403).json({ success: false, message: "You can only offer books that you own" });
    }

    if (requestedBook.borrowedBy || requestedBook.reservedBy || offeredBook.borrowedBy || offeredBook.reservedBy) {
      return res.status(400).json({ success: false, message: "Cannot swap books that are currently borrowed or reserved" });
    }

    const existingPendingOffer = await SwapRequest.findOne({
      requesterId,
      offeredBookId,
      status: "pending"
    });

    if (existingPendingOffer) {
      return res.status(400).json({ success: false, message: "You have already offered this book in another pending swap" });
    }

    const swap = await SwapRequest.create({
      requesterId,
      requestedBookId,
      offeredBookId,
      ownerId,
      status: "pending"
    });

    const io = req.app.get("io");
    if (io) io.emit("swapUpdated");

    return res.status(201).json({ success: true, message: "Swap request sent", data: swap });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ACCEPT SWAP REQUEST
exports.acceptSwapRequest = async (req, res) => {
  try {
    const swapId = req.params.id;
    const currentUserId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(swapId)) {
      return res.status(400).json({ success: false, message: "Invalid swap ID" });
    }

    const swap = await SwapRequest.findById(swapId)
      .populate("requestedBookId")
      .populate("offeredBookId");

    if (!swap) return res.status(404).json({ success: false, message: "Swap request not found" });

    if (swap.ownerId.toString() !== currentUserId) {
      return res.status(403).json({ success: false, message: "Unauthorized to accept this swap" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ success: false, message: "Swap already processed" });
    }

    const requestedBook = swap.requestedBookId;
    const offeredBook = swap.offeredBookId;

    if (requestedBook.borrowedBy || requestedBook.reservedBy || 
    offeredBook.borrowedBy || offeredBook.reservedBy) {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot accept swap: One or both books are currently borrowed or reserved by another user." 
      });
    }

    const tempOwner = requestedBook.ownerId;
    requestedBook.ownerId = offeredBook.ownerId;
    offeredBook.ownerId = tempOwner;

    await requestedBook.save();
    await offeredBook.save();

    swap.status = "accepted";
    await swap.save();

    await SwapRequest.updateMany(
      {
        _id: { $ne: swapId },
        status: "pending",
        $or: [
          { requestedBookId: requestedBook._id },
          { requestedBookId: offeredBook._id },
          { offeredBookId: requestedBook._id },
          { offeredBookId: offeredBook._id }
        ]
      },
      { $set: { status: "rejected" } }
    );

    const io = req.app.get("io");
    if (io) io.emit("swapUpdated");

    return res.json({ success: true, message: "Swap accepted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// REJECT SWAP REQUEST
exports.rejectSwapRequest = async (req, res) => {
  try {
    const swapId = req.params.id;
    const currentUserId = req.user.userId;

    const swap = await SwapRequest.findById(swapId);
    if (!swap) return res.status(404).json({ success: false, message: "Swap request not found" });

    if (swap.ownerId.toString() !== currentUserId) {
      return res.status(403).json({ success: false, message: "Unauthorized to reject this swap" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ success: false, message: "Swap already processed" });
    }

    swap.status = "rejected";
    await swap.save();

    const io = req.app.get("io");
    if (io) io.emit("swapUpdated");

    return res.json({ success: true, message: "Swap rejected" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// CANCEL SWAP REQUEST
exports.cancelSwapRequest = async (req, res) => {
  try {
    const swapId = req.params.id;
    const currentUserId = req.user.userId;

    const swap = await SwapRequest.findById(swapId);
    if (!swap) return res.status(404).json({ success: false, message: "Swap request not found" });

    if (swap.requesterId.toString() !== currentUserId) {
      return res.status(403).json({ success: false, message: "Unauthorized to cancel this swap" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ success: false, message: "Cannot cancel processed swap" });
    }

    swap.status = "cancelled";
    await swap.save();

    const io = req.app.get("io");
    if (io) io.emit("swapUpdated");

    return res.json({ success: true, message: "Swap cancelled" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET ALL SWAP REQUESTS
exports.getAllSwapRequests = async (req, res) => {
  try {
    // ⭐ Secure user ID from token
    const userId = req.user.userId;

    const sent = await SwapRequest.find({ requesterId: userId })
      .populate("requestedBookId", "title author")
      .populate("offeredBookId", "title author")
      .sort({ createdAt: -1 });

    const received = await SwapRequest.find({ ownerId: userId })
      .populate("requestedBookId", "title author")
      .populate("offeredBookId", "title author")
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: { sent, received } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
