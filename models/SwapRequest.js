const mongoose = require("mongoose");

const swapRequestSchema = new mongoose.Schema(
  {
    requestedBookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    offeredBookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true
    },
    message: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled"],   // ⭐ FIXED
      default: "pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SwapRequest", swapRequestSchema);
