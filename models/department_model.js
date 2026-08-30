const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true, trim: true },
    short_name: { type: String, unique: true, required: true, trim: true },
    department_code: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

DepartmentSchema.index(
  { department_code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      department_code: { $exists: true, $type: "string" },
    },
  },
);

module.exports = mongoose.model("departments", DepartmentSchema);
