const mongoose = require("mongoose");
const borrowRuleSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["STAFF", "STUDENT", "GUEST"], required: true },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: "semesters" },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "departments" },
    max_books: { type: Number, required: true },
    loan_period_days: { type: Number, required: true },
    reserve_limit: { type: Number, required: true },
    max_renewals: { type: Number, required: true },
    hold_period_days: { type: Number, required: true, default: 3 },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
borrowRuleSchema.index(
  { role: 1, semester: 1, department: 1 },
  { unique: true },
);
module.exports = mongoose.model("borrowrules", borrowRuleSchema);
