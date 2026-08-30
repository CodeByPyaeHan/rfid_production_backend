const mongoose = require("mongoose");

const BookCopySchema = new mongoose.Schema(
  {
    book_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "books",
      required: true,
      index: true,
    },
    accession_number: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    shelf_id: { type: mongoose.Schema.Types.ObjectId, ref: "shelves" },
    price: {
      raw: String,
      amount: String,
      currency: String,
    },
    acquired_date: {
      type: Date,
      default: Date.now,
    },
    acquired_method: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "pending_rfid",
        "available",
        "borrowed",
        "lost",
        "damaged",
        "reserved",
      ],
      default: "pending_rfid",
      index: true,
    },
    is_rfid_written: { type: Boolean, default: false },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("bookcopies", BookCopySchema);
