const mongoose = require("mongoose");

const FineSchema = new mongoose.Schema(
  {
    circulation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "circulations",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    fine_type: {
      type: String,
      enum: ["OVERDUE", "LOST", "DAMAGED"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    paid: { type: Boolean, default: false },
    paid_date: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

FineSchema.index({ user_id: 1, paid: 1 });
module.exports = mongoose.model("fines", FineSchema);
