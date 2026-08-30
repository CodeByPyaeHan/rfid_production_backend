const model = require("../models/institution_model");
function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getAll = async (includeDeleted = false) => {
  const filter = includeDeleted ? {} : { is_deleted: false };
  return await model.find(filter).sort({ full_name: 1 });
};

const getAllActiveWithSecret = async () =>
  await model
    .find({ is_deleted: false, is_active: true })
    .select("+shared_secret");

const getById = async (id) => await model.findById(id);
const getByIdWithSecret = async (id) =>
  await model.findById(id).select("+shared_secret");
const getByCode = async (code) =>
  await model
    .findOne({ code: code.toUpperCase(), is_deleted: false, is_active: true })
    .select("+shared_secret");

const create = async (data) => {
  const upper = data.code.trim().toUpperCase();
  const exist = await model.findOne({ code: upper });
  if (exist)
    throw httpError(`Institution code "${upper}" already exists.`, 409);
  return await model.create({ ...data, code: upper });
};

const update = async (id, data) => {
  const inst = await model.findById(id);
  if (!inst || inst.is_deleted) throw httpError("Institution not found.", 404);
  return await model.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

const softDelete = async (id) => {
  const inst = await model.findById(id);
  if (!inst || inst.is_deleted) throw httpError("Institution not found.", 404);
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: true, deleted_at: new Date() },
    { new: true },
  );
};
const restore = async (id) => {
  const inst = await model.findById(id);
  if (!inst) throw httpError("Institution not found.", 404);
  if (!inst.is_deleted) throw httpError("Institution is already active.", 400);
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: false, deleted_at: null },
    { new: true },
  );
};
const hardDelete = async (id) => {
  const inst = await model.findById(id);
  if (!inst) throw httpError("Institution not found.", 404);
  if (!inst.is_deleted)
    throw httpError("Institution must be soft-deleted first.", 400);
  await model.findByIdAndDelete(id);
  return { deletedId: id, code: inst.code };
};

module.exports = {
  getAll,
  getAllActiveWithSecret,
  getById,
  getByIdWithSecret,
  getByCode,
  create,
  update,
  softDelete,
  restore,
  hardDelete,
};
