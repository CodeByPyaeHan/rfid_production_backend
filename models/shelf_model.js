const mongoose = require("mongoose");

const ShelfSchema = new mongoose.Schema(
  {
    shelf_code: { type: String, unique: true, required: true, trim: true },
    description: { type: String, default: null },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },

  { timestamps: { createdAt: "created_at" } },
);

module.exports = mongoose.model("shelves", ShelfSchema);
