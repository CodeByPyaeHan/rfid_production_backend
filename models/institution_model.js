const mongoose = require("mongoose");

const InstitutionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    full_name: { type: String, required: true, trim: true },
    api_url: { type: String, required: true, trim: true },
    shared_secret: { type: String, required: true, select: false },
    is_active: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("institutions", InstitutionSchema);
