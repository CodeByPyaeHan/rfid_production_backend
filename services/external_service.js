const User = require("../models/user_model");
const Book = require("../models/book_model");
const BookCopy = require("../models/bookCopy_model");
const ExternalLoanLog = require("../models/externalLoanLog_model");
const circulationService = require("./circulation_service");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const searchCatalog = async (query) => {
  if (!query || query.trim().length < 2) return [];
  const regex = new RegExp(escapeRegex(query.trim()), "i");
  const books = await Book.find({
    is_deleted: false,
    $or: [{ title: regex }, { author: regex }],
  })
    .select("title author isbn_number class_number cover_image_url")
    .limit(20);

  const bookIds = books.map((b) => b._id);
  const copyCounts = await BookCopy.aggregate([
    {
      $match: {
        book_id: { $in: bookIds },
        is_deleted: { $ne: true },
        status: { $in: ["available", "pending_rfid"] },
      },
    },
    { $group: { _id: "$book_id", available: { $sum: 1 } } },
  ]);

  const countMap = Object.fromEntries(
    copyCounts.map((c) => [c._id.toString(), c.available]),
  );

  return books.map((b) => ({
    title: b.title,
    author: b.author,
    isbn: b.isbn_number,
    class_number: b.class_number,
    cover_image_url: b.cover_image_url,
    available_count: countMap[b._id.toString()] || 0,
  }));
};

const verifyUser = async (username) => {
  const user = await User.findOne({
    username: String(username).trim().toLowerCase(),
    is_deleted: false,
  }).select("_id username name role status");
  if (!user) return { valid: false, reason: "User not found." };
  if (["GUEST", "LIBRARIAN", "ADMIN"].includes(user.role)) {
    return {
      valid: false,
      reason:
        "This account type is not eligible for reciprocal walk-in borrowing.",
    };
  }

  const eligibility = await circulationService.checkUserEligibility(user._id);
  if (!eligibility.eligible)
    return { valid: false, reason: eligibility.reason };

  return {
    valid: true,
    name: user.name,
    role: user.role,
    username: user.username,
  };
};

const recordExternalLoan = async (
  callingInstitution,
  { username, book_title, due_date },
) => {
  const user = await User.findOne({
    username: String(username).trim().toLowerCase(),
    is_deleted: false,
  }).select("_id");
  return await ExternalLoanLog.create({
    user_id: user?._id ?? null,
    home_username: username,
    partner_institution: callingInstitution._id,
    book_title,
    due_date,
  });
};

module.exports = { searchCatalog, verifyUser, recordExternalLoan };
