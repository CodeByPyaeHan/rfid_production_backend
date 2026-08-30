const model = require("../models/major_model");
const Student = require("../models/student_model");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getById = async (id) => await model.findById(id);

const getByShortName = async (short_name) =>
  await model.findOne({ short_name });

const getAll = async (includeDeleted = false) => {
  const filter = includeDeleted ? {} : { is_deleted: false };
  const majors = await model.find(filter).sort({ name: 1 });
  return await Promise.all(
    majors.map(async (m) => ({
      ...m.toObject(),
      student_count: await Student.countDocuments({ major: m._id }),
    })),
  );
};

const create = async ({ name, short_name, description }) => {
  const upper = short_name.trim().toUpperCase();
  const exist = await model.findOne({ short_name: upper });
  if (exist)
    throw httpError(
      exist.is_deleted
        ? `"${upper}" belongs to a deleted major. Restore it instead.`
        : `Major "${upper}" already exists.`,
      409,
    );

  return await model.create({
    name: name.trim(),
    short_name: upper,
    description: description?.trim() || "",
  });
};

const update = async (id, data) => {
  const major = await model.findById(id);
  if (!major || major.is_deleted) throw httpError("Major not found.", 404);

  const update = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.description !== undefined)
    update.description = data.description.trim();
  if (data.short_name !== undefined) {
    const upper = data.short_name.trim().toUpperCase();
    const exist = await model.findOne({ short_name: upper });
    if (exist && exist._id.toString() !== id)
      throw httpError(`Short name "${upper}" already exists.`, 409);
    update.short_name = upper;
  }
  return await model.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  });
};

const softDelete = async (id) => {
  const major = await model.findById(id);
  if (!major || major.is_deleted) throw httpError("Major not found.", 404);
  const count = await Student.countDocuments({ major: major._id });
  if (count > 0)
    throw httpError(
      `Cannot delete — ${count} student(s) still assigned to this major.`,
      409,
    );
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: true, deleted_at: new Date() },
    { new: true },
  );
};

const restore = async (id) => {
  const major = await model.findById(id);
  if (!major) throw httpError("Major not found.", 404);
  if (!major.is_deleted) throw httpError("Major is already active.", 400);
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: false, deleted_at: null },
    { new: true },
  );
};

const hardDelete = async (id) => {
  const major = await model.findById(id);
  if (!major) throw httpError("Major not found.", 404);
  if (!major.is_deleted)
    throw httpError("Major must be soft-deleted first.", 400);
  const count = await Student.countDocuments({ major: major._id });
  if (count > 0)
    throw httpError(
      `Cannot permanently delete — ${count} student(s) still reference this major.`,
      409,
    );
  await model.findByIdAndDelete(id);
  return { deletedId: id, name: major.name, short_name: major.short_name };
};

module.exports = {
  getById,
  getByShortName,
  getAll,
  create,
  update,
  softDelete,
  restore,
  hardDelete,
};
