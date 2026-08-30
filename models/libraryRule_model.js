const mongoose = require("mongoose");

const LibraryRuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["CONDUCT", "SAFETY", "PROPERTY_CARE", "TECHNOLOGY", "GENERAL"],
      default: "GENERAL",
    },
    display_order: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true },
    is_deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("libraryrules", LibraryRuleSchema);
