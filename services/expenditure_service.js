const model = require("../models/expenditure_model");
const user_model = require("../models/user_model");

async function buildFilter(query = {}) {
  const { budget_id, category, start_date, end_date, search, includeDeleted } =
    query;
  const isIncludeDeleted = includeDeleted === "true" || includeDeleted === true;
  const filter = { is_deleted: isIncludeDeleted };
  if (budget_id) filter.budget_id = budget_id;
  if (category) filter.category = category;
  if (start_date || end_date) {
    filter.expense_date = {};
    if (start_date) filter.expense_date.$gte = new Date(start_date);
    if (end_date) {
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      filter.expense_date.$lte = end;
    }
  }

  if (search) {
    const matchedUsers = await user_model
      .find({
        $or: [
          { username: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
        ],
      })
      .select("_id");
    filter.$or = [
      { description: { $regex: search, $options: "i" } },
      { created_by: { $in: matchedUsers.map((u) => u._id) } },
    ];
  }
  return filter;
}

const create = async (data, session = null) => {
  const exp = new model(data);
  if (session) await exp.save({ session });
  else await exp.save();
  return exp;
};

const populateOpts = (q) =>
  q
    .populate("budget_id", "fiscal_year")
    .populate("created_by", "username name");

const getById = async (id, session = null) => {
  let query = populateOpts(model.findById(id));
  if (session) query = query.session(session);
  return await query;
};

const list = async (filter) =>
  await populateOpts(model.find(filter)).sort({ expense_date: -1 });

const getAll = async (query = {}) => {
  const filter = await buildFilter(query);
  if (!query.page) return await list(filter);

  const limit = Number(process.env.PAGE_LIMIT) || 20;
  const currentPage = Number(query.page);
  const skip = (currentPage - 1) * limit;

  const [expenditures, total] = await Promise.all([
    populateOpts(model.find(filter))
      .sort({ expense_date: -1 })
      .skip(skip)
      .limit(limit),
    model.countDocuments(filter),
  ]);
  return {
    expenditures,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const update = async (id, data, session = null) => {
  const options = { new: true, runValidators: true };
  if (session) options.session = session;
  return await model.findByIdAndUpdate(id, data, options);
};

const softDelete = async (id, session = null) => {
  const options = { new: true };
  if (session) options.session = session;
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: true, deleted_at: new Date() },
    options,
  );
};

const restore = async (id, session = null) => {
  const options = { new: true };
  if (session) options.session = session;
  return await model.findByIdAndUpdate(
    id,
    { is_deleted: false, deleted_at: null },
    options,
  );
};

const hardDelete = async (id, session = null) => {
  const options = {};
  if (session) options.session = session;
  return await model.findByIdAndDelete(id, options);
};

module.exports = {
  create,
  getById,
  list,
  getAll,
  update,
  softDelete,
  restore,
  hardDelete,
};
