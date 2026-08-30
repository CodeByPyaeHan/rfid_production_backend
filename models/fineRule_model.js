const mongoose = require("mongoose");

const fineRuleSchema = new mongoose.Schema(
  {
    fine_type: {
      type: String,
      enum: ["OVERDUE", "LOST", "DAMAGED"],
      required: true,
    },
    role: { type: String, enum: ["STAFF", "STUDENT", "GUEST"] },
    semester: { type: mongoose.Schema.Types.ObjectId, ref: "semesters" },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "departments" },
    rate_per_day: { type: Number, default: null },
    flat_amount: { type: Number, default: null },
    grace_period_days: { type: Number, default: 0 },
    max_fine_cap: { type: Number, default: null },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

fineRuleSchema.index(
  { fine_type: 1, role: 1, semester: 1, department: 1 },
  { unique: true },
);
module.exports = mongoose.model("finerules", fineRuleSchema);
