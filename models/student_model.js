const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    roll_number: { type: String, unique: true, required: true },
    major: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "majors",
      required: true,
    },
    semester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "semesters",
      required: true,
    },
    degree_level: {
      type: String,
      enum: ["BACHELOR", "MASTER", "PHD"],
      default: "BACHELOR",
    },
    father_name: { type: String, trim: true, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("students", StudentSchema);
