const Joi = require("joi");

// ─── Reusable sub-schemas ────────────────────────────────────

const isbnSchema = Joi.string()
  .pattern(/^(97[89])?\d{9}[\dX]$/)
  .messages({
    "string.pattern.base": "ISBN must be a valid ISBN-10 or ISBN-13 format",
  });

const yearSchema = Joi.string()
  .pattern(/^\d{4}$/)
  .messages({
    "string.pattern.base": "Year must be a 4-digit number (e.g. 2023)",
  });

const loanPolicySchema = Joi.string()
  .valid("LOANABLE", "NOT_LOANABLE", "STAFF_ONLY")
  .default("LOANABLE");

const materialTypeSchema = Joi.string()
  .valid("BOOK", "BOOK_CD", "BOOK_DVD")
  .default("BOOK");

const documentTypeSchema = Joi.string()
  .valid("book", "thesis", "journal", "report")
  .default("book");

// ─── Manual Entry / Edit Schema ──────────────────────────────

const catalogBodySchema = Joi.object({
  // Required
  title: Joi.string().trim().min(1).max(500).required(),
  author: Joi.string().trim().min(1).max(300).required(),

  // Bibliographic — optional
  isbn: isbnSchema.optional().allow("", null),
  subtitle: Joi.string().trim().max(500).optional().allow("", null),
  authorRole: Joi.string().trim().max(200).optional().allow("", null),
  author2: Joi.string().trim().max(300).optional().allow("", null),
  author3: Joi.string().trim().max(300).optional().allow("", null),
  publisher: Joi.string().trim().max(300).optional().allow("", null),
  pubPlace: Joi.string().trim().max(200).optional().allow("", null),
  pubYear: yearSchema.optional().allow("", null),
  edition: Joi.string().trim().max(100).optional().allow("", null),
  pages: Joi.number().integer().min(1).max(99999).optional().allow(null),
  illustrations: Joi.string().trim().max(200).optional().allow("", null),
  dimensions: Joi.string().trim().max(100).optional().allow("", null),
  seriesTitle: Joi.string().trim().max(300).optional().allow("", null),
  seriesNo: Joi.string().trim().max(100).optional().allow("", null),
  generalNote: Joi.string().trim().max(2000).optional().allow("", null),
  bibNote: Joi.string().trim().max(2000).optional().allow("", null),
  acquisitionMethod: Joi.string().trim().max(500).optional().allow("", null),
  ebookUrl: Joi.string().uri().optional().allow("", null),

  // Classification
  classNumber: Joi.string().trim().max(50).optional().allow("", null),
  shelfLocation: Joi.string().trim().max(50).optional().allow("", null),
  documentType: documentTypeSchema.optional(),
  materialType: materialTypeSchema.optional(),
  loanPolicy: loanPolicySchema.optional(),
  keywords: Joi.array().items(Joi.string().trim().max(200)).max(50).optional(),
  language: Joi.string().trim().max(100).optional().allow("", null),

  // Copy info
  copyCount: Joi.number().integer().min(1).max(100).required(),
  shelfCode: Joi.string().trim().max(50).optional().allow("", null),
  price: Joi.number().min(0).max(9999999).optional().allow(null),
  acquiredDate: Joi.date().iso().max("now").optional().allow(null),
  accessionNumber: Joi.string().trim().max(20).optional().allow("", null),
}).options({ stripUnknown: true });

// ─── Add Copy Schema ──────────────────────────────────────────

const addCopySchema = Joi.object({
  copyCount: Joi.number().integer().min(1).max(100).required(),
  shelfCode: Joi.string().trim().max(50).optional().allow("", null),
  price: Joi.number().min(0).max(9999999).optional().allow(null),
  acquiredDate: Joi.date().iso().max("now").optional().allow(null),
}).options({ stripUnknown: true });

// ─── Edit Book Schema (copyCount မလို) ───────────────────────

const editBookSchema = catalogBodySchema.fork(["copyCount"], (schema) =>
  schema.optional(),
);

// ─── Query Params Schema ──────────────────────────────────────
const booksQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(200).optional().allow(""),
  documentType: documentTypeSchema.optional().allow(""),
  loanPolicy: loanPolicySchema.optional().allow(""),
}).options({ stripUnknown: true });

// ─── ISBN URL Param Schema ─────────────────────────────────────

const isbnParamSchema = Joi.object({
  isbn: Joi.string().min(10).max(20).required(),
  // normalizeIsbn() က deep validation လုပ်မယ်
  // Joi ကတော့ length check ပဲ လုပ်
}).options({ stripUnknown: true });

module.exports = {
  catalogBodySchema,
  addCopySchema,
  editBookSchema,
  booksQuerySchema,
  isbnParamSchema,
};
