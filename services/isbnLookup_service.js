// services/isbnLookupService.js
const axios = require("axios");
const Book = require("../models/book_model");
const { normalizeIsbn } = require("../utils/marcHelpers");

const {
  lookupOpenLibrary,
} = require("../integrations/books/openLibrary.client");
const {
  lookupGoogleBooks,
} = require("../integrations/books/googleBooks.client");

const lookupIsbn = async (rawIsbn) => {
  const isbn = normalizeIsbn(rawIsbn);

  if (!isbn) {
    return { status: "invalid", message: "Invalid ISBN format." };
  }

  // 1. Check existing book
  const existing = await Book.findOne({ isbn_number: isbn });
  if (existing) {
    return { status: "existing_book", book: existing };
  }

  let openData = null;
  let googleData = null;

  // 2. Try Open Library
  try {
    openData = await lookupOpenLibrary(isbn);
  } catch (err) {
    console.log("OpenLibrary error:", err.message);
  }

  // 3. Try Google Books
  try {
    googleData = await lookupGoogleBooks(isbn);
  } catch (err) {
    console.log("GoogleBooks error:", err.message);
  }

  // 4. If both failed
  if (!openData && !googleData) {
    return {
      status: "not_found",
      message: "ISBN not found in both Open Library and Google Books.",
    };
  }

  const finalData = {
    ...(openData || googleData),
  };

  return {
    status: "found",
    source: openData ? "openlibrary" : "google",
    formData: finalData,
  };
};

module.exports = { lookupIsbn };
