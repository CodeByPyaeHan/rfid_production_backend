const Shelf = require("../models/shelf_model");
const BookCopy = require("../models/bookCopy_model");
const { shelfSchema } = require("../utils/schema");

const getAll = async ({ includeDeleted = false } = {}) => {
  const filter = includeDeleted ? { is_deleted: true } : { is_deleted: false };

  const shelves = await Shelf.find(filter).sort({ shelf_code: 1 }).lean();

  const shelfIds = shelves.map((s) => s._id);
  const counts = await BookCopy.aggregate([
    { $match: { shelf_id: { $in: shelfIds } } },
    { $group: { _id: "$shelf_id", count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(
    counts.map((c) => [c._id.toString(), c.count]),
  );

  return shelves.map((s) => ({
    ...s,
    copy_count: countMap[s._id.toString()] ?? 0,
  }));
};

const create = async ({ shelf_code, description }) => {
  if (!shelf_code?.trim()) {
    const err = new Error("Shelf code is required.");
    err.status = 400;
    throw err;
  }

  // Check duplicate — including soft-deleted ones
  const exists = await Shelf.findOne({ shelf_code: shelf_code.trim() });

  if (exists) {
    // ★ If previously soft-deleted → restore it
    if (exists.is_deleted) {
      const restored = await Shelf.findByIdAndUpdate(
        exists._id,
        {
          $set: {
            is_deleted: false,
            deleted_at: null,
            description: description?.trim() || exists.description,
          },
        },
        { returnDocument: "after" },
      );
      return { shelf: restored, restored: true };
    }

    const err = new Error(`Shelf "${shelf_code}" already exists.`);
    err.status = 409;
    throw err;
  }

  const shelf = await Shelf.create({
    shelf_code: shelf_code.trim(),
    description: description?.trim() || null,
  });

  return { shelf, restored: false };
};

const update = async (id, { shelf_code, description, is_active }) => {
  const shelf = await Shelf.findOne({ _id: id, is_deleted: false });
  if (!shelf) {
    const err = new Error("Shelf not found.");
    err.status = 404;
    throw err;
  }

  if (shelf_code && shelf_code.trim() !== shelf.shelf_code) {
    const exists = await Shelf.findOne({
      shelf_code: shelf_code.trim(),
      _id: { $ne: id },
      is_deleted: false,
    });
    if (exists) {
      const err = new Error(`Shelf code "${shelf_code}" already exists.`);
      err.status = 409;
      throw err;
    }
  }

  const update = {};
  if (shelf_code !== undefined) update.shelf_code = shelf_code.trim();
  if (description !== undefined)
    update.description = description?.trim() || null;
  if (is_active !== undefined) update.is_active = is_active;

  return await Shelf.findByIdAndUpdate(
    id,
    { $set: update },
    { returnDocument: "after", runValidators: true },
  );
};

const drop = async (id) => {
  const shelf = await Shelf.findOne({ _id: id, is_deleted: false });
  if (!shelf) {
    const err = new Error("Shelf not found.");
    err.status = 404;
    throw err;
  }

  // Prevent delete if copies assigned
  const copyCount = await BookCopy.countDocuments({ shelf_id: id });
  if (copyCount > 0) {
    const err = new Error(
      `Cannot delete — ${copyCount} copies are assigned to this shelf. ` +
        `Reassign copies first.`,
    );
    err.status = 409;
    throw err;
  }

  // ★ Soft delete — mark as deleted, record timestamp
  const deleted = await Shelf.findByIdAndUpdate(
    id,
    {
      $set: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    },
    { returnDocument: "after" },
  );

  return { deletedId: id, shelf_code: deleted.shelf_code };
};

const restore = async (id) => {
  const shelf = await Shelf.findOne({ _id: id, is_deleted: true });
  if (!shelf) {
    const err = new Error("Deleted shelf not found.");
    err.status = 404;

    wqa;
    throw err;
  }

  return await Shelf.findByIdAndUpdate(
    id,
    { $set: { is_deleted: false, deleted_at: null } },
    { returnDocument: "after" },
  );
};

const hardDelete = async (id) => {
  const shelf = await Shelf.findOne({ _id: id, is_deleted: true });
  if (!shelf) {
    const err = new Error(
      "Shelf must be soft-deleted first before permanent deletion.",
    );
    err.status = 400;
    throw err;
  }

  const copyCount = await BookCopy.countDocuments({ shelf_id: id });
  if (copyCount > 0) {
    const err = new Error(
      `Cannot permanently delete — ${copyCount} copies still reference this shelf.`,
    );
    err.status = 409;
    throw err;
  }

  await shelf.deleteOne();
  return { deletedId: id, shelf_code: shelf.shelf_code };
};

module.exports = {
  getAll,
  create,
  update,
  drop,
  restore,
  hardDelete,
};
