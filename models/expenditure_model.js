const mongoose = require("mongoose");

const ExpenditureSchema = new mongoose.Schema(
  {
    budget_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "budgets",
      required: true,
    },
    category: {
      type: String,
      enum: ["BOOK_PURCHASE", "OTHERS"],
      default: "OTHERS",
    },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    expense_date: { type: Date, required: true },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("expenditures", ExpenditureSchema);
