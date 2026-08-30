const mongoose = require("mongoose");

const BookPurchaseSchema = new mongoose.Schema(
  {
    expenditure_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "expenditures",
      required: true,
      unique: true,
    },
    budget_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "budgets",
      required: true,
    },
    book_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "books",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    unit_price: { type: Number, required: true, min: 0 },
    total_price: { type: Number, required: true, min: 0 },
    vendor_name: { type: String, required: true, trim: true },
    purchase_date: { type: Date, required: true },
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

module.exports = mongoose.model("bookpurchases", BookPurchaseSchema);
