const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const mqttService = require("../services/mqtt_service");
const BookCopy = require("../models/bookCopy_model");
const Book = require("../models/book_model");
const { buildUserCardPayload } = require("../utils/rfidPayload");

const writeTag = asyncHandler(async (req, res) => {
  const { type, targetId } = req.body;
  let textToWrite = targetId;

  if (type === "book") {
    const prefix = process.env.RFID_BOOK_PREFIX || "";
    textToWrite = `${prefix}${targetId}`;
  } else if (type === "user") {
    textToWrite = buildUserCardPayload(targetId);
  }

  mqttService.publishWriteRequest(type, targetId, textToWrite);
  Msg(res, `Write request sent. Data: ${textToWrite}`, {
    status: "pending",
    written_text: textToWrite,
  });
});

const confirmBorrow = asyncHandler(async (req, res) => {
  const result = await mqttService.confirmBorrow();
  Msg(
    res,
    `${result.success_count}/${result.total} book(s) checked out successfully.`,
    result,
  );
});

const getSystemStatus = asyncHandler(async (req, res) => {
  Msg(res, "Kiosk status fetched.", mqttService.getSession());
});

const searchCopies = asyncHandler(async (req, res) => {
  const q = req.query.q;
  if (!q) return Msg(res, "Query required", []);

  const books = await Book.find({
    title: { $regex: q, $options: "i" },
    is_deleted: false,
  }).select("_id");
  const bookIds = books.map((b) => b._id);

  const copies = await BookCopy.find({
    $or: [
      { accession_number: { $regex: q, $options: "i" } },
      { book_id: { $in: bookIds } },
    ],
    is_deleted: { $ne: true },
    status: { $ne: "lost" },
  })
    .populate("book_id", "title author")
    .limit(15);

  const result = copies.map((c) => ({
    _id: c._id.toString(),
    accession_number: c.accession_number,
    title: c.book_id?.title || "Unknown Title",
    author: c.book_id?.author || "Unknown Author",
    status: c.status,
    is_rfid_written: c.is_rfid_written,
  }));

  Msg(res, "Copies found", result);
});

const confirmReturn = asyncHandler(async (req, res) => {
  const result = await mqttService.confirmReturn();
  Msg(
    res,
    `${result.success_count}/${result.total} book(s) returned successfully.`,
    result,
  );
});

const cancelBook = asyncHandler(async (req, res) => {
  const result = mqttService.cancelBook(req.body.copy_id);
  Msg(res, "Book removed from session.", result);
});

const cancelSession = asyncHandler(async (req, res) => {
  const result = mqttService.cancelSession();
  Msg(res, "Session cancelled.", result);
});

module.exports = {
  writeTag,
  confirmBorrow,
  confirmReturn,
  getSystemStatus,
  searchCopies,
  cancelBook,
  cancelSession,
};
