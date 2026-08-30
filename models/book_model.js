const mongoose = require("mongoose");
const BookSchema = new mongoose.Schema(
  {
    isbn_number: { type: String, sparse: true, index: true },
    title: { type: String, required: true, index: true },
    author: String,
    publisher: { type: String, default: null },
    pub_year: { type: String, default: null },
    book_language: { type: String, default: "mya" },
    cover_image_url: { type: String, default: null },
    ebook_url: { type: String, default: null },
    class_number: String,
    document_type: {
      type: String,
      enum: ["book", "thesis", "journal", "report"],
      default: "book",
    },
    material_type: {
      type: String,
      enum: ["BOOK", "BOOK_CD", "BOOK_DVD"],
      default: "BOOK",
    },
    loan_policy: {
      type: String,
      enum: ["LOANABLE", "NOT_LOANABLE", "STAFF_ONLY"],
      default: "LOANABLE",
    },
    marc_json: { type: mongoose.Schema.Types.Mixed, default: {} },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    keywords: { type: [String], default: [] },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

BookSchema.index({ title: "text", author: "text", keywords: "text" });
module.exports = mongoose.model("books", BookSchema);
