const mongoose = require("mongoose");

const ExternalLoanLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
    home_username: { type: String, required: true },
    partner_institution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "institutions",
      required: true,
    },
    book_title: { type: String, required: true },
    due_date: { type: Date, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

module.exports = mongoose.model("externalloanlogs", ExternalLoanLogSchema);
