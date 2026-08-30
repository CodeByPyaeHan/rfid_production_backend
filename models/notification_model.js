const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "RESERVATION_READY",
        "RESERVATION_EXPIRED",
        "RESERVATION_CANCELLED",
        "DUE_SOON",
        "OVERDUE",
        "FINE_ISSUED",
        "GENERAL",
      ],
      required: true,
    },
    reference_type: {
      type: String,
      enum: ["RESERVATION", "CIRCULATION", "FINE", "NONE"],
      default: "NONE",
    },
    reference_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    title: { type: String, required: true },
    message: { type: String, required: true },
    channel: { type: String, enum: ["IN_APP"], default: "IN_APP" },
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

NotificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });
module.exports = mongoose.model("notifications", NotificationSchema);
