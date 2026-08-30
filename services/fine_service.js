const mongoose = require("mongoose");
const Fine = require("../models/fine_model");
const FineTransaction = require("../models/fineTransaction_model");
const { withTransaction } = require("./transaction_service");
const { getIO } = require("../sockets/socketServer");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getById = async (id) =>
  await Fine.findById(id)
    .populate("user_id", "username name")
    .populate({
      path: "circulation_id",
      populate: {
        path: "copy_id",
        populate: { path: "book_id", select: "title" },
      },
    });

const getAll = async (query = {}) => {
  const { page = 1, user_id, paid, fine_type, search } = query;
  const limit = Number(process.env.PAGE_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const filter = {};
  if (user_id) filter.user_id = user_id;
  if (paid !== undefined) filter.paid = paid === "true";
  if (fine_type) filter.fine_type = fine_type;

  if (search) {
    const regex = new RegExp(search, "i");
    const students = await Student.find({ roll_number: regex }).select(
      "user_id",
    );
    const matchedUsers = await User.find({
      $or: [
        { name: regex },
        { username: regex },
        { _id: { $in: students.map((s) => s.user_id) } },
      ],
    }).select("_id");
    filter.user_id = { $in: matchedUsers.map((u) => u._id) };
  }

  const [finesDocs, total] = await Promise.all([
    Fine.find(filter)
      .populate("user_id", "username name")
      .populate({
        path: "circulation_id",
        populate: {
          path: "copy_id",
          populate: { path: "book_id", select: "title" },
        },
      })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Fine.countDocuments(filter),
  ]);

  const userIds = [
    ...new Set(finesDocs.map((f) => f.user_id?._id).filter(Boolean)),
  ];

  const unpaidBalances = await Fine.aggregate([
    {
      $match: {
        user_id: { $in: userIds },
        paid: false,
      },
    },
    {
      $group: {
        _id: "$user_id",
        totalUnpaid: { $sum: "$amount" },
      },
    },
  ]);

  const balanceMap = Object.fromEntries(
    unpaidBalances.map((b) => [b._id.toString(), b.totalUnpaid]),
  );

  const fineIds = finesDocs.map((f) => f._id);
  const paidAmounts = await FineTransaction.aggregate([
    { $match: { fine_id: { $in: fineIds } } },
    { $group: { _id: "$fine_id", totalPaid: { $sum: "$amount_collected" } } },
  ]);

  const paidMap = Object.fromEntries(
    paidAmounts.map((p) => [p._id.toString(), p.totalPaid]),
  );

  const fines = finesDocs.map((f) => {
    const totalPaid = paidMap[f._id.toString()] || 0;
    const remaining = f.amount - totalPaid;

    return {
      ...f,
      paid_amount: totalPaid,
      remaining_amount: Math.max(0, remaining),
      user_total_unpaid: balanceMap[f.user_id?._id?.toString()] || 0,
    };
  });
  return {
    fines,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const getPaidTotal = async (fineId, session = null) => {
  let query = FineTransaction.aggregate([
    { $match: { fine_id: new mongoose.Types.ObjectId(fineId) } },
    { $group: { _id: null, total: { $sum: "$amount_collected" } } },
  ]);
  if (session) query = query.session(session);
  const result = await query;
  return result[0]?.total || 0;
};

const payFine = async (
  fineId,
  { amount_collected, payment_method },
  collectedBy,
) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const fine = await Fine.findById(fineId).session(session);
    if (!fine) throw httpError("Fine not found.", 404);
    if (fine.paid) throw httpError("This fine is already fully paid.", 400);

    const alreadyPaid = await getPaidTotal(fineId, session);
    const remaining = fine.amount - alreadyPaid;
    if (amount_collected > remaining)
      throw httpError(`Amount exceeds remaining balance (${remaining}).`, 400);

    const transaction = await new FineTransaction({
      fine_id: fineId,
      amount_collected,
      payment_method,
      collected_by: collectedBy,
    }).save({ session });

    const newTotal = alreadyPaid + amount_collected;
    if (newTotal >= fine.amount) {
      fine.paid = true;
      fine.paid_date = new Date();
      await fine.save({ session });
    }

    registerAfterCommit(() => {
      try {
        getIO().to("role:ADMIN").emit("dashboard:fine-updated");
      } catch (err) {
        console.error("Socket emit failed:", err.message);
      }
    });
    return {
      transaction,
      fine,
      remaining_balance: Math.max(0, fine.amount - newTotal),
    };
  });
};

const waiveFine = async (fineId, adminId) => {
  return await withTransaction(async (session, registerAfterCommit) => {
    const fine = await Fine.findById(fineId).session(session);
    if (!fine) throw httpError("Fine not found.", 404);
    if (fine.paid) throw httpError("This fine is already settled.", 400);

    const alreadyPaid = await getPaidTotal(fineId, session);
    const remaining = fine.amount - alreadyPaid;

    if (remaining > 0) {
      await new FineTransaction({
        fine_id: fineId,
        amount_collected: remaining,
        payment_method: "WAIVER",
        collected_by: adminId,
      }).save({ session });
    }

    fine.paid = true;
    fine.paid_date = new Date();
    await fine.save({ session });

    registerAfterCommit(() => {
      try {
        getIO().to("role:ADMIN").emit("dashboard:fine-updated");
      } catch (err) {
        console.error("Socket emit failed:", err.message);
      }
    });
    return fine;
  });
};

const getTransactionsByFine = async (fineId) =>
  await FineTransaction.find({ fine_id: fineId })
    .populate("collected_by", "username name")
    .sort({ transaction_date: -1 });

const getMyFines = async (userId, query = {}) => {
  const { paid, fine_type } = query;
  const filter = { user_id: userId };
  if (paid !== undefined) filter.paid = paid === "true";
  if (fine_type) filter.fine_type = fine_type;

  return await Fine.find(filter)
    .populate({
      path: "circulation_id",
      populate: {
        path: "copy_id",
        populate: { path: "book_id", select: "title" },
      },
    })
    .sort({ created_at: -1 });
};

module.exports = {
  getById,
  getAll,
  payFine,
  waiveFine,
  getTransactionsByFine,
  getPaidTotal,
  getMyFines,
};
