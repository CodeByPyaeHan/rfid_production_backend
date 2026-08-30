const mongoose = require("mongoose");

const ReservationSchema = new mongoose.Schema(
  {
    book_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "books",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "READY_FOR_PICKUP",
        "FULFILLED",
        "EXPIRED",
        "CANCELLED",
      ],
      default: "PENDING",
    },
    copy_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookcopies",
      default: null,
    },
    circulation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "circulations",
      default: null,
    },
    reserved_at: { type: Date, default: Date.now },
    ready_at: { type: Date, default: null },
    hold_expires_at: { type: Date, default: null },
    fulfilled_at: { type: Date, default: null },
    cancelled_at: { type: Date, default: null },
    handled_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

ReservationSchema.index({ book_id: 1, status: 1, reserved_at: 1 });
ReservationSchema.index({ user_id: 1, status: 1 });

module.exports = mongoose.model("reservations", ReservationSchema);
