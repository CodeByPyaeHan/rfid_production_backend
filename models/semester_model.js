const mongoose = require("mongoose");

const SemesterSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true, trim: true },
    short_name: { type: String, unique: true, required: true, trim: true },
    order: { type: Number, required: true },
    degree_level: {
      type: String,
      enum: ["BACHELOR", "MASTER"],
      default: "BACHELOR",
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

SemesterSchema.index({ order: 1, degree_level: 1 }, { unique: true });

module.exports = mongoose.model("semesters", SemesterSchema);
