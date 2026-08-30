const Budget = require("../models/budget_model");

const getById = async (id, session = null) => {
  let query = Budget.findById(id);
  if (session) query = query.session(session);
  return await query;
};

const getByFiscalYear = async (fiscal_year, session = null) => {
  let query = Budget.findOne({ fiscal_year, is_deleted: false });
  if (session) query = query.session(session);
  return await query;
};

const getAll = async (includeDeleted = false) => {
  const filter = includeDeleted ? { is_deleted: true } : { is_deleted: false };
  return await Budget.find(filter)
    .populate("created_by", "username name")
    .sort({ fiscal_year: -1 });
};

const increaseUsedAmount = async (id, amount, session = null) => {
  const options = { new: true };
  if (session) options.session = session;
  return await Budget.findByIdAndUpdate(
    id,
    { $inc: { used_amount: amount } },
    options,
  );
};

const decreaseUsedAmount = async (id, amount, session = null) => {
  const options = { new: true };
  if (session) options.session = session;
  return await Budget.findByIdAndUpdate(
    id,
    { $inc: { used_amount: -amount } },
    options,
  );
};

const create = async (data, session = null) => {
  const budget = new Budget(data);
  if (session) await budget.save({ session });
  else await budget.save();
  return budget;
};

const update = async (id, data, session = null) => {
  const options = { new: true, runValidators: true };
  if (session) options.session = session;
  return await Budget.findByIdAndUpdate(id, data, options);
};

const softDelete = async (id) =>
  await Budget.findByIdAndUpdate(
    id,
    { is_deleted: true, deleted_at: new Date() },
    { new: true },
  );

const restore = async (id) =>
  await Budget.findByIdAndUpdate(
    id,
    { is_deleted: false, deleted_at: null },
    { new: true },
  );

const hardDelete = async (id, session = null) => {
  const options = {};
  if (session) options.session = session;
  return await Budget.findByIdAndDelete(id, options);
};

module.exports = {
  getById,
  getByFiscalYear,
  getAll,
  increaseUsedAmount,
  decreaseUsedAmount,
  create,
  update,
  softDelete,
  restore,
  hardDelete,
};
