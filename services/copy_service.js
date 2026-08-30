const BookCopy = require("../models/bookCopy_model");
const Book = require("../models/book_model");
const Shelf = require("../models/shelf_model");
const { normalizePrice, normalizeDate } = require("../utils/marcHelpers");
const { escapeRegex } = require(`../${process.env.FACADE_PATH}`);

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

const getAll = async ({
  page,
  limit,
  search,
  status,
  rfidStatus,
  includeDeleted = false,
}) => {
  try {
    const baseFilter = {};
    if (!includeDeleted) {
      baseFilter.is_deleted = false;
    } else {
      baseFilter.is_deleted = true;
    }

    if (rfidStatus === "written") {
      baseFilter.is_rfid_written = true;
    } else if (rfidStatus === "not_written") {
      baseFilter.is_rfid_written = false;
    }

    if (status) {
      // status may be a single value ("borrowed") or a comma-separated
      // list ("available,pending_rfid") from a merged display filter
      const statuses = status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      baseFilter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    let copyFilter = { ...baseFilter };
    if (search) {
      const safeSearch = escapeRegex(search);
      copyFilter.$or = [
        { accession_number: { $regex: safeSearch, $options: "i" } },
      ];
    }

    let [copies, total] = await Promise.all([
      BookCopy.find(copyFilter)
        .populate("book_id", "title author class_number isbn_number")
        .populate("shelf_id", "shelf_code")
        .sort({ accession_number: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BookCopy.countDocuments(copyFilter),
    ]);

    if (search && copies.length === 0) {
      const safeSearch = escapeRegex(search);
      const matchedBooks = await Book.find(
        {
          $or: [
            { title: { $regex: safeSearch, $options: "i" } },
            { author: { $regex: safeSearch, $options: "i" } },
          ],
          ...(includeDeleted ? { is_deleted: true } : { is_deleted: false }),
        },
        "_id",
      ).lean();

      if (matchedBooks.length > 0) {
        const bookIds = matchedBooks.map((b) => b._id);
        const titleFilter = { ...baseFilter, book_id: { $in: bookIds } };
        [copies, total] = await Promise.all([
          BookCopy.find(titleFilter)
            .populate("book_id", "title author class_number isbn_number")
            .populate("shelf_id", "shelf_code")
            .sort({ accession_number: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
          BookCopy.countDocuments(titleFilter),
        ]);
      }
    }

    const [statusAgg, rfidAgg] = await Promise.all([
      BookCopy.aggregate([
        { $match: { is_deleted: false } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      BookCopy.aggregate([
        { $match: { is_deleted: false } },
        { $group: { _id: "$is_rfid_written", count: { $sum: 1 } } },
      ]),
    ]);

    const summary = statusAgg.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    summary.rfid_written = 0;
    summary.rfid_not_written = 0;

    rfidAgg.forEach((r) => {
      if (r._id === true) {
        summary.rfid_written = r.count;
      } else {
        summary.rfid_not_written += r.count;
      }
    });

    return {
      data: copies,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error(error);
  }
};

const update = async (id, payload) => {
  const {
    status,
    rfid_tag_id,
    price,
    acquired_date,
    acquired_method,
    shelfId,
  } = payload;

  const copy = await BookCopy.findById(id);
  if (!copy) {
    const err = new Error("Copy not found.");
    err.status = 404;
    throw err;
  }

  const update = {};
  if (status !== undefined) update.status = status;
  if (price !== undefined) update.price = normalizePrice(price);
  if (acquired_method !== undefined) {
    update.acquired_method = acquired_method;
  }
  if (acquired_date !== undefined) {
    update.acquired_date = acquired_date ? normalizeDate(acquired_date) : null;
  }
  if (shelfId !== undefined) {
    update.shelf_id = shelfId ? await validateShelfId(shelfId) : null;
  }
  const updated = await BookCopy.findByIdAndUpdate(
    id,
    { $set: update },
    { returnDocument: "after", runValidators: true },
  )
    .populate("book_id", "title author class_number")
    .populate("shelf_id", "shelf_code");

  if (!updated) {
    const err = new Error("Copy not found after update.");
    err.status = 404;
    throw err;
  }

  return updated;
};

const hardDelete = async (id) => {
  const copy = await BookCopy.findOne({ _id: id, is_deleted: true });
  if (!copy) {
    const err = new Error(
      "Copy must be soft-deleted first before permanent deletion.",
    );
    err.status = 400;
    throw err;
  }

  await copy.deleteOne();
  return { deletedId: id, accession_number: copy.accession_number };
};

const softDelete = async (id) => {
  const copy = await BookCopy.findOne({ _id: id, is_deleted: false });
  if (!copy) {
    const err = new Error("Copy not found or already deleted.");
    err.status = 404;
    throw err;
  }

  const updated = await BookCopy.findByIdAndUpdate(
    id,
    { $set: { is_deleted: true, deleted_at: new Date() } },
    { returnDocument: "after" },
  );

  return { deletedId: id, accession_number: updated.accession_number };
};

const restore = async (id) => {
  const copy = await BookCopy.findOne({ _id: id, is_deleted: true });
  if (!copy) {
    const err = new Error("Deleted copy not found.");
    err.status = 404;
    throw err;
  }

  const restored = await BookCopy.findByIdAndUpdate(
    id,
    { $set: { is_deleted: false, deleted_at: null } },
    { returnDocument: "after" },
  )
    .populate("book_id", "title author")
    .populate("shelf_id", "shelf_code");

  return restored;
};

module.exports = {
  getAll,
  update,
  hardDelete,
  softDelete,
  restore,
};
