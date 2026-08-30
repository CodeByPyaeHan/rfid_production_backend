const model = require("../models/libraryRule_model");
function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getAll = async (includeDeleted = false) => {
  const filter = includeDeleted ? {} : { is_deleted: false };
  return await model
    .find(filter)
    .sort({ display_order: 1, created_at: 1 })
    .populate("created_by", "username name");
};

const getPublic = async () =>
  await model
    .find({ is_deleted: false, is_active: true })
    .sort({ display_order: 1, created_at: 1 })
    .select("-created_by -is_deleted -deleted_at");

const getById = async (id) => await model.findById(id);

const create = async (data, userId) =>
  await model.create({ ...data, created_by: userId });

const update = async (id, data) => {
  const rule = await model.findById(id);
  if (!rule || rule.is_deleted) throw httpError("Rule not found.", 404);
  return await model.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

const softDelete = async (id) => {
  const rule = await model.findById(id);
  if (!rule || rule.is_deleted) throw httpError("Rule not found.", 404);
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: true, deleted_at: new Date() },
    { new: true },
  );
};

const restore = async (id) => {
  const rule = await model.findById(id);
  if (!rule) throw httpError("Rule not found.", 404);
  if (!rule.is_deleted) throw httpError("Rule is already active.", 400);
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: false, deleted_at: null },
    { new: true },
  );
};

const hardDelete = async (id) => {
  const rule = await model.findById(id);
  if (!rule) throw httpError("Rule not found.", 404);
  if (!rule.is_deleted)
    throw httpError("Rule must be soft-deleted first.", 400);
  await model.findByIdAndDelete(id);
  return { deletedId: id, title: rule.title };
};

module.exports = {
  getAll,
  getPublic,
  getById,
  create,
  update,
  softDelete,
  restore,
  hardDelete,
};
