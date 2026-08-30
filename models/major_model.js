const mongoose = require("mongoose");
const MajorSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true, trim: true },
    short_name: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      uppercase: true,
    },
    description: { type: String, trim: true, default: "" },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("majors", MajorSchema);
