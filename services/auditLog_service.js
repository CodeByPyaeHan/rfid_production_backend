const model = require("../models/auditLog_model");
const User = require("../models/user_model");

const add = async (obj) => await new model(obj).save();

const getAll = async (query = {}) => {
  const { page = 1, action, severity, search, start_date, end_date } = query;
  const limit = Number(process.env.LOG_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const filter = {};
  if (action) filter.action = action;
  if (severity) filter.severity = severity;
  if (start_date || end_date) {
    filter.created_at = {};
    if (start_date) filter.created_at.$gte = new Date(start_date);
    if (end_date) {
      const e = new Date(end_date);
      e.setHours(23, 59, 59, 999);
      filter.created_at.$lte = e;
    }
  }
  if (search) {
    const regex = new RegExp(search, "i");
    const matchedUsers = await User.find({
      $or: [{ username: regex }, { name: regex }],
    }).select("_id");
    filter.user_id = { $in: matchedUsers.map((u) => u._id) };
  }

  const [logs, total] = await Promise.all([
    model
      .find(filter)
      .populate("user_id", "username name role")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    model.countDocuments(filter),
  ]);

  return {
    logs,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const getDistinctActions = async () => await model.distinct("action");

module.exports = { add, getAll, getDistinctActions };
