const Book = require("../models/book_model");
const BookCopy = require("../models/bookCopy_model");
const Shelf = require("../models/shelf_model");
const { buildMarcJsonFromForm } = require("../mappers/marc.maper");
const { downloadExternalImageAsCover } = require("../utils/downloadImage");
const {
  normalizeIsbn,
  cleanStr,
  normalizePrice,
  normalizeDate,
  ensureAccessionNumber,
} = require("../utils/marcHelpers");
const { escapeRegex } = require(`../${process.env.FACADE_PATH}`);

const { validateRow } = require(`../${process.env.FACADE_PATH}`);

async function resolveCollection(collectionName) {
  const name = cleanStr(collectionName);
  if (!name) return null;
  let coll = await Collection.findOne({ collection_name: name });
  if (!coll) coll = await Collection.create({ collection_name: name });
  return coll._id;
}

async function validateShelfId(shelfId) {
  if (!shelfId) return null;
  const shelf = await Shelf.findOne({ _id: shelfId, is_deleted: false });
  if (!shelf) {
    const err = new Error("Selected shelf not found or has been deleted.");
    err.status = 400;
    throw err;
  }
  return shelf._id;
}

/**
 * @param {Object} form
 * @returns {Promise<{book, copies}>}
 */

const create = async (form) => {
  if (!cleanStr(form.title) || !cleanStr(form.author)) {
    throw { status: 400, message: "Title and Author are required." };
  }
  if (!form.copyCount || form.copyCount < 1) {
    throw { status: 400, message: "At least 1 copy is required." };
  }
  const shelfId = await validateShelfId(form.shelfId);
  const marcJson = buildMarcJsonFromForm(form);

  const book = new Book({
    title: cleanStr(form.title),
    author: cleanStr(form.author),
    isbn_number: cleanStr(normalizeIsbn(form.isbn_number)),
    publisher: cleanStr(form.publisher),
    pub_year: cleanStr(form.pubYear),
    class_number: cleanStr(form.classNumber),
    document_type: form.documentType || "book",
    material_type: form.materialType || "BOOK",
    loan_policy: form.loanPolicy || "LOANABLE",
    book_language: cleanStr(form.language) || "mya",
    ebook_url: cleanStr(form.ebookUrl),
    keywords: Array.isArray(form.keywords)
      ? form.keywords.map((k) => cleanStr(k)).filter(Boolean)
      : [],
    marc_json: marcJson,
  });

  if (form.cover_image_external_url) {
    try {
      book.cover_image_url = await downloadExternalImageAsCover(
        form.cover_image_external_url,
      );
    } catch (err) {
      console.error(
        "Cover download failed (book will still be created):",
        err.message,
      );
    }
  }

  const createdBook = await book.save();

  const createdCopies = [];
  for (let i = 1; i <= form.copyCount; i++) {
    const accessionNumber = await ensureAccessionNumber(
      form.accessionNumber || null,
    );
    const copy = new BookCopy({
      book_id: createdBook._id,
      accession_number: accessionNumber,
      copy_number: i,
      shelf_id: shelfId,
      price: normalizePrice(form.price) ?? null,
      acquired_date: normalizeDate(form.acquiredDate) ?? null,
      acquired_method: cleanStr(form.acquisitionMethod),
      status: "pending_rfid",
      is_rfid_written: false,
    });
    createdCopies.push(await copy.save());
  }

  return { book: createdBook, copies: createdCopies };
};

const addCopy = async (bookId, req) => {
  const { copyCount, shelfId, price, acquiredDate } = req.body;

  if (!copyCount || copyCount < 1) {
    throw { status: 400, message: "At least 1 copy is required." };
  }
  const book = await Book.findById(bookId);
  if (!book) throw { status: 404, message: "Book not found." };
  const validShelfId = await validateShelfId(shelfId);
  const createdCopies = [];
  for (let i = 1; i <= copyCount; i++) {
    const accessionNumber = await ensureAccessionNumber(null);
    const copy = new BookCopy({
      book_id: book._id,
      accession_number: accessionNumber,
      shelf_id: validShelfId,
      price: normalizePrice(price) ?? null,
      acquired_date: acquiredDate ? normalizeDate(acquiredDate) : null,
      status: "pending_rfid",
    });
    createdCopies.push(await copy.save());
  }

  return { book, copies: createdCopies };
};

const getAll = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(50, parseInt(query.limit) || 20);
  const search = query.search?.trim() || "";
  const documentType = query.documentType || "";
  const includeDeleted = query.includeDeleted === "true";
  const filter = includeDeleted ? { is_deleted: true } : { is_deleted: false };

  if (search) {
    const safeSearch = escapeRegex(search);

    if (query.search_by) {
      const map = {
        title: "title",
        author: "author",
        isbn: "isbn_number",
        call_number: "class_number",
        keyword: "keywords",
      };
      const field = map[query.search_by];

      if (field) {
        filter[field] = { $regex: safeSearch, $options: "i" };
      } else {
        filter.$or = [
          { title: { $regex: safeSearch, $options: "i" } },
          { author: { $regex: safeSearch, $options: "i" } },
          { isbn_number: { $regex: safeSearch, $options: "i" } },
          { keywords: { $regex: safeSearch, $options: "i" } },
        ];
      }
    } else {
      filter.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { author: { $regex: safeSearch, $options: "i" } },
        { isbn_number: { $regex: safeSearch, $options: "i" } },
        { keywords: { $regex: safeSearch, $options: "i" } },
      ];
    }
  }

  if (query.documentType) filter.document_type = query.documentType;
  if (query.loanPolicy) filter.loan_policy = query.loanPolicy;

  if (
    query.availability === "available" ||
    query.availability === "unavailable" ||
    query.availability === "borrowed"
  ) {
    const copyAgg = await BookCopy.aggregate([
      {
        $match: {
          is_deleted: { $ne: true },
          status: { $ne: "lost" },
        },
      },
      {
        $group: {
          _id: "$book_id",
          available: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$status", "available"] },
                    { $eq: ["$status", "damaged"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          borrowed: {
            $sum: {
              $cond: [{ $eq: ["$status", "borrowed"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const availableBookIds = copyAgg
      .filter((c) => c.available > 0)
      .map((c) => c._id);
    const unavailableBookIds = copyAgg
      .filter((c) => c.available === 0)
      .map((c) => c._id);
    // ★ Portal အတွက် Reserve လုပ်၍ရသော (available မရှိတော့ဘဲ borrowed သာရှိသော) စာအုပ်များ
    const borrowedBookIds = copyAgg
      .filter((c) => c.available === 0 && c.borrowed > 0)
      .map((c) => c._id);

    if (query.availability === "available") {
      filter._id = { $in: availableBookIds };
    } else if (query.availability === "borrowed") {
      filter._id = { $in: borrowedBookIds }; // Portal အတွက်
    } else if (query.availability === "unavailable") {
      filter._id = { $in: unavailableBookIds }; // Admin အတွက် (မပျက်အောင်ထားသည်)
    }
  }
  const [books, total] = await Promise.all([
    Book.find(filter)
      .select(
        "title author isbn_number class_number publisher pub_year document_type loan_policy material_type keywords  created_at is_deleted deleted_at created_at cover_image_url",
      )
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit),

    Book.countDocuments(filter),
  ]);

  const bookIds = books.map((b) => b._id);

  const copyCounts = await BookCopy.aggregate([
    {
      $match: {
        book_id: { $in: bookIds },
        is_deleted: { $ne: true },
        status: { $nin: ["lost"] },
      },
    },
    {
      $group: {
        _id: "$book_id",
        total: { $sum: 1 },
        available: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ["$status", "available"] },
                  { $eq: ["$status", "damaged"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        borrowed: {
          $sum: {
            $cond: [{ $eq: ["$status", "borrowed"] }, 1, 0],
          },
        },
        pending_rfid: {
          $sum: {
            $cond: [{ $eq: ["$status", "pending_rfid"] }, 1, 0],
          },
        },
      },
    },
  ]);

  const countMap = Object.fromEntries(
    copyCounts.map((c) => [
      c._id.toString(),
      {
        total: c.total,
        available: c.available,
        borrowed: c.borrowed,
        pending_rfid: c.pending_rfid,
      },
    ]),
  );

  const data = books.map((b) => ({
    ...b.toObject(),
    copies: countMap[b._id.toString()] || {
      total: 0,
      available: 0,
      borrowed: 0,
      pending_rfid: 0,
    },
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getDetail = async (id) => {
  const book = await Book.findById(id);

  if (!book) {
    const err = new Error("Book not found.");
    err.status = 404;
    throw err;
  }

  const copies = await BookCopy.find({ book_id: book._id, is_deleted: false })
    .populate("shelf_id", "shelf_code")
    .sort({ accession_number: 1 });

  return { book, copies };
};

const update = async (id, form) => {
  const book = await Book.findById(id);
  if (!book) throw { status: 404, message: "Book not found." };

  if (!form.title || !form.author) {
    throw { status: 400, message: "Title and Author are required." };
  }

  const marc_json = buildMarcJsonFromForm(form);

  const updateData = {
    title: form.title?.trim() || null,
    author: form.author?.trim() || null,
    isbn_number: form.isbn_number?.trim() || null,
    publisher: form.publisher?.trim() || null,
    pub_year: form.pubYear?.trim() || null,
    class_number: form.classNumber?.trim() || null,
    document_type: form.documentType || "book",
    material_type: form.materialType || "BOOK",
    loan_policy: form.loanPolicy || "LOANABLE",
    book_language: form.language?.trim() || null,
    keywords: Array.isArray(form.keywords) ? form.keywords.filter(Boolean) : [],
    marc_json,
  };

  const updated = await Book.findByIdAndUpdate(
    id,
    { $set: updateData },
    { returnDocument: "after", runValidators: true },
  );

  return { success: true, book: updated };
};

const hardDelete = async (id) => {
  const book = await Book.findOne({ _id: id, is_deleted: true });
  if (!book) {
    const err = new Error(
      "Book must be soft-deleted first before permanent deletion.",
    );
    err.status = 400;
    throw err;
  }

  const copyResult = await BookCopy.deleteMany({ book_id: id });

  await book.deleteOne();

  return {
    deletedId: id,
    title: book.title,
    copiesDeleted: copyResult.deletedCount,
  };
};

const softDelete = async (id) => {
  const book = await Book.findOne({ _id: id, is_deleted: false });
  if (!book) {
    const err = new Error("Book not found or already deleted.");
    err.status = 404;
    throw err;
  }

  const now = new Date();

  await Book.findByIdAndUpdate(id, {
    $set: { is_deleted: true, deleted_at: now },
  });

  const copyResult = await BookCopy.updateMany(
    { book_id: id, is_deleted: false },
    { $set: { is_deleted: true, deleted_at: now } },
  );

  return {
    deletedId: id,
    title: book.title,
    copiesDeleted: copyResult.modifiedCount,
  };
};

const restore = async (id) => {
  const book = await Book.findOne({ _id: id, is_deleted: true });
  if (!book) {
    const err = new Error("Deleted book not found.");
    err.status = 404;
    throw err;
  }

  await Book.findByIdAndUpdate(id, {
    $set: { is_deleted: false, deleted_at: null },
  });

  const copyResult = await BookCopy.updateMany(
    { book_id: id, is_deleted: true, deleted_at: book.deleted_at },
    { $set: { is_deleted: false, deleted_at: null } },
  );

  return {
    restoredId: id,
    title: book.title,
    copiesRestored: copyResult.modifiedCount,
  };
};

// ══════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════

const buildSearchFilter = (search, searchBy) => {
  const safeSearch = escapeRegex(search.trim());
  const fieldMap = {
    title: "title",
    author: "author",
    isbn: "isbn_number",
    call_number: "class_number",
    keyword: "keywords",
  };

  const field = fieldMap[searchBy];
  if (field) {
    return { [field]: { $regex: safeSearch, $options: "i" } };
  }

  return {
    $or: [
      { title: { $regex: safeSearch, $options: "i" } },
      { author: { $regex: safeSearch, $options: "i" } },
      { isbn_number: { $regex: safeSearch, $options: "i" } },
      { keywords: { $regex: safeSearch, $options: "i" } },
    ],
  };
};

const getCopyCounts = async (bookIds) => {
  const copyCounts = await BookCopy.aggregate([
    {
      $match: {
        book_id: { $in: bookIds },
        is_deleted: { $ne: true },
        status: { $nin: ["lost"] },
      },
    },
    {
      $group: {
        _id: "$book_id",
        total: { $sum: 1 },
        available: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ["$status", "available"] },
                  { $eq: ["$status", "damaged"] },
                  { $eq: ["$status", "pending_rfid"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        borrowed: { $sum: { $cond: [{ $eq: ["$status", "borrowed"] }, 1, 0] } },
        pending_rfid: {
          $sum: { $cond: [{ $eq: ["$status", "pending_rfid"] }, 1, 0] },
        },
      },
    },
  ]);

  return Object.fromEntries(
    copyCounts.map((c) => [
      c._id.toString(),
      {
        total: c.total,
        available: c.available,
        borrowed: c.borrowed,
        pending_rfid: c.pending_rfid,
      },
    ]),
  );
};

const getAvailabilityBookIds = async () => {
  const copyAgg = await BookCopy.aggregate([
    { $match: { is_deleted: { $ne: true }, status: { $ne: "lost" } } },
    {
      $group: {
        _id: "$book_id",
        available: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ["$status", "available"] },
                  { $eq: ["$status", "damaged"] },
                  { $eq: ["$status", "pending_rfid"] },
                ],
              },
              1,
              0,
            ],
          },
        },
        borrowed: { $sum: { $cond: [{ $eq: ["$status", "borrowed"] }, 1, 0] } },
      },
    },
  ]);

  return {
    availableIds: copyAgg.filter((c) => c.available > 0).map((c) => c._id),
    borrowedIds: copyAgg
      .filter((c) => c.available === 0 && c.borrowed > 0)
      .map((c) => c._id),
  };
};

const runPaginatedQuery = async ({
  filter,
  page,
  limit,
  selectFields,
  sortBy = "created_at",
  sortDir = -1,
}) => {
  const [books, total] = await Promise.all([
    Book.find(filter)
      .select(selectFields)
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * limit)
      .limit(limit),
    Book.countDocuments(filter),
  ]);
  return { books, total };
};

const getAllForLibrarian = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(50, parseInt(query.limit) || 20);
  const search = query.search?.trim() || "";
  const includeDeleted = query.includeDeleted === "true";

  const sortBy =
    query.sortBy === "class_number" ? "class_number" : "created_at";
  const sortDir = query.sortDir === "asc" ? 1 : -1;
  const filter = includeDeleted ? { is_deleted: true } : { is_deleted: false };

  if (search) Object.assign(filter, buildSearchFilter(search, query.search_by));
  if (query.class_number) {
    const cnFilter = buildClassNumberFilter(query.class_number);
    if (cnFilter) Object.assign(filter, cnFilter);
  }
  if (query.documentType) filter.document_type = query.documentType;
  if (query.loanPolicy) filter.loan_policy = query.loanPolicy;

  const { books, total } = await runPaginatedQuery({
    filter,
    page,
    limit,
    selectFields:
      "title author isbn_number class_number publisher pub_year document_type loan_policy material_type keywords  created_at is_deleted deleted_at cover_image_url",
  });

  const bookIds = books.map((b) => b._id);
  const countMap = await getCopyCounts(bookIds);

  const data = books.map((b) => ({
    ...b.toObject(),
    copies: countMap[b._id.toString()] || {
      total: 0,
      available: 0,
      borrowed: 0,
      pending_rfid: 0,
    },
  }));

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getAllForPortal = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(50, parseInt(query.limit) || 20);
  const search = query.search?.trim() || "";

  const filter = { is_deleted: false };

  if (search) Object.assign(filter, buildSearchFilter(search, query.search_by));
  if (query.class_number) {
    const cnFilter = buildClassNumberFilter(query.class_number);
    if (cnFilter) Object.assign(filter, cnFilter);
  }
  if (["available", "borrowed"].includes(query.availability)) {
    const { availableIds, borrowedIds } = await getAvailabilityBookIds();
    filter._id = {
      $in: query.availability === "available" ? availableIds : borrowedIds,
    };
  }

  const { books, total } = await runPaginatedQuery({
    filter,
    page,
    limit,
    selectFields:
      "title author isbn_number class_number publisher pub_year document_type material_type keywords  loan_policy cover_image_url",
  });

  const bookIds = books.map((b) => b._id);
  const countMap = await getCopyCounts(bookIds);

  const data = books.map((b) => {
    const c = countMap[b._id.toString()] || {
      total: 0,
      available: 0,
      borrowed: 0,
    };
    return {
      ...b.toObject(),
      copies: { total: c.total, available: c.available, borrowed: c.borrowed },
    };
  });

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

function buildClassNumberFilter(classNumberQuery) {
  const prefix = String(classNumberQuery).trim();
  if (!/^\d{1,3}$/.test(prefix)) return null;
  return { class_number: { $regex: `^${prefix}` } };
}
/**
 * @param {Buffer} fileBuffer
 * @returns {Promise<{imported:number, skipped:number, errors:number, errorDetails:string[]}>}
 */

module.exports = {
  create,
  getAll,
  getDetail,
  update,
  addCopy,
  softDelete,
  hardDelete,
  restore,
  getAllForLibrarian,
  getAllForPortal,
};
