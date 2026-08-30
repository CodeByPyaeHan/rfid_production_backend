const asyncHandler = require("express-async-handler");
const fs = require("fs");
const path = require("path");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const Book = require("../models/book_model");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError("No image file provided.", 400);

  const book = await Book.findById(req.params.bookId);
  if (!book || book.is_deleted) {
    fs.unlink(req.file.path, () => {});
    throw httpError("Book not found.", 404);
  }

  if (book.cover_image_url) {
    const oldPath = path.join(
      __dirname,
      "..",
      book.cover_image_url.replace(/^\/uploads\//, "uploads/"),
    );
    fs.unlink(oldPath, () => {});
  }

  const url = `/uploads/books/${req.file.filename}`;
  book.cover_image_url = url;
  await book.save();

  Msg(res, "Cover image uploaded.", { cover_image_url: url, book });
});

const remove = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.bookId);
  if (!book || book.is_deleted) throw httpError("Book not found.", 404);

  if (book.cover_image_url) {
    const oldPath = path.join(
      __dirname,
      "..",
      book.cover_image_url.replace(/^\/uploads\//, "uploads/"),
    );
    fs.unlink(oldPath, () => {});
  }
  book.cover_image_url = null;
  await book.save();

  Msg(res, "Cover image removed.", book);
});

module.exports = { upload, remove };
