const IsbnService = require("../services/isbnLookup_service");
const BookService = require("../services/book_service");
const { importExcelService } = require("../services/import_excel");
const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const { getIO } = require("../sockets/socketServer");

function emitCatalogChanged() {
  try {
    getIO().to("role:ADMIN").emit("dashboard:catalog-changed");
  } catch (err) {
    console.error("Socket emit failed:", err.message);
  }
}

const importExcel = asyncHandler(async (req, res) => {
  if (!req.file) {
    const err = new Error("Please select an Excel file before importing.");
    err.status = 400;
    throw err;
  }
  const result = await importExcelService(req.file.buffer);
  Msg(res, "Excel import completed successfully.", result);
  emitCatalogChanged();
});

const addCopy = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const result = await BookService.addCopy(bookId, req);
  Msg(res, `book copies added successfully.`, result);
  emitCatalogChanged();
});

const getAll = asyncHandler(async (req, res) => {
  const result = await BookService.getAll(req.query);
  return Msg(res, "Books fetched", result);
});

const getAllForLibrarian = asyncHandler(async (req, res) => {
  const result = await BookService.getAllForLibrarian(req.query);
  return Msg(res, "Books fetched", result);
});

const getAllForPortal = asyncHandler(async (req, res) => {
  const result = await BookService.getAllForPortal(req.query);
  return Msg(res, "Books fetched", result);
});

const getDetail = asyncHandler(async (req, res) => {
  const result = await BookService.getDetail(req.params.id);
  return Msg(res, "Book deatils fetched", result);
});

const update = asyncHandler(async (req, res) => {
  const result = await BookService.update(req.params.id, req.body);
  emitCatalogChanged();
  return Msg(res, "Book updated", result);
});

const softDelete = asyncHandler(async (req, res) => {
  const result = await BookService.softDelete(req.params.id);
  emitCatalogChanged();
  return Msg(
    res,
    `"${result.title}" and ${result.copiesDeleted} copies deleted.`,
    result,
  );
});

const restore = asyncHandler(async (req, res) => {
  const result = await BookService.restore(req.params.id);
  emitCatalogChanged();
  return Msg(
    res,
    `"${result.title}" and ${result.copiesRestored} copies restored.`,
    result,
  );
});

const hardDelete = asyncHandler(async (req, res) => {
  const result = await BookService.hardDelete(req.params.id);
  emitCatalogChanged();
  return Msg(res, `"${result.title}" permanently deleted.`, result);
});

const lookupISBN = asyncHandler(async (req, res) => {
  const { isbn } = req.params;
  if (!isbn || isbn.trim() === "") {
    const err = new Error("ISBN parameter is required.");
    err.status = 400;
    throw err;
  }
  const result = await IsbnService.lookupIsbn(isbn);
  emitCatalogChanged();
  return Msg(res, "ISBN found ", result);
});

const create = asyncHandler(async (req, res) => {
  const result = await BookService.create(req.body);
  emitCatalogChanged();
  return Msg(
    res,
    `Catalog saved. ${result.copies.length} copy(ies) pending RFID assignment.`,
    result,
  );
});

module.exports = {
  addCopy,
  getAll,
  getDetail,
  update,
  importExcel,
  create,
  lookupISBN,
  softDelete,
  hardDelete,
  restore,
  getAllForLibrarian,
  getAllForPortal,
};
