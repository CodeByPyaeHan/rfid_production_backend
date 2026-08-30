const mongoose = require("mongoose");
const FineTransactionSchema = new mongoose.Schema(
  {
    fine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "fines",
      required: true,
    },
    amount_collected: { type: Number, required: true, min: 0.01 },
    payment_method: {
      type: String,
      enum: ["CASH", "ONLINE", "WAIVER"],
      required: true,
    },
    collected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    transaction_date: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

module.exports = mongoose.model("finetransactions", FineTransactionSchema);
