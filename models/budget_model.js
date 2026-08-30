const mongoose = require("mongoose");

const BudgetSchema = new mongoose.Schema(
  {
    fiscal_year: { type: Number, required: true, unique: true, min: 2000 },
    total_amount: { type: Number, required: true, min: 0 },
    used_amount: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, default: "" },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

BudgetSchema.virtual("remaining_amount").get(function () {
  return this.total_amount - this.used_amount;
});

module.exports = mongoose.model("budgets", BudgetSchema);
