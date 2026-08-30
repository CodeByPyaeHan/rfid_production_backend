const FineTransaction = require("../models/fineTransaction_model");

const getAll = async (query = {}) => {
  const { page = 1, payment_method, start_date, end_date } = query;
  const limit = Number(process.env.PAGE_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const filter = {};
  if (payment_method) filter.payment_method = payment_method;
  if (start_date || end_date) {
    filter.transaction_date = {};
    if (start_date) filter.transaction_date.$gte = new Date(start_date);
    if (end_date) {
      const e = new Date(end_date);
      e.setHours(23, 59, 59, 999);
      filter.transaction_date.$lte = e;
    }
  }

  const [transactions, total] = await Promise.all([
    FineTransaction.find(filter)
      .populate("collected_by", "username name")
      .populate({
        path: "fine_id",
        populate: { path: "user_id", select: "username name" },
      })
      .sort({ transaction_date: -1 })
      .skip(skip)
      .limit(limit),
    FineTransaction.countDocuments(filter),
  ]);
  return {
    transactions,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

module.exports = { getAll };
