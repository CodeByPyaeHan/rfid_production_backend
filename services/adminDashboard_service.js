const Book = require("../models/book_model");
const BookCopy = require("../models/bookCopy_model");
const User = require("../models/user_model");
const Circulation = require("../models/circulation_model");
const Fine = require("../models/fine_model");
const FineTransaction = require("../models/fineTransaction_model");
const Budget = require("../models/budget_model");
const reservationService = require("./reservation_service");
const APP_TIMEZONE = "Asia/Yangon";

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const DDC_COLORS = {
  0: "#64748b",
  1: "#a855f7",
  2: "#8b5cf6",
  3: "#3b82f6",
  4: "#0ea5e9",
  5: "#06b6d4",
  6: "#10b981",
  7: "#f59e0b",
  8: "#ef4444",
  9: "#ec4899",
};

function monthBounds(offsetMonths = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + offsetMonths + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

// ═══════════════════════ KPI CARDS ═══════════════════════

const getKpis = async () => {
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);

  const [
    totalBooks,
    booksThisMonth,
    booksLastMonth,
    totalCopies,
    copiesThisMonth,
    copiesLastMonth,
    activeMembers,
    membersThisMonth,
    membersLastMonth,
    activeLoans,
    overdueLoans,
    unpaidAgg,
    reservationCounts,
  ] = await Promise.all([
    Book.countDocuments({ is_deleted: false }),
    Book.countDocuments({
      is_deleted: false,
      created_at: { $gte: thisMonth.start, $lte: thisMonth.end },
    }),
    Book.countDocuments({
      is_deleted: false,
      created_at: { $gte: lastMonth.start, $lte: lastMonth.end },
    }),
    BookCopy.countDocuments({ is_deleted: false }),
    BookCopy.countDocuments({
      is_deleted: false,
      created_at: { $gte: thisMonth.start, $lte: thisMonth.end },
    }),
    BookCopy.countDocuments({
      is_deleted: false,
      created_at: { $gte: lastMonth.start, $lte: lastMonth.end },
    }),
    User.countDocuments({
      is_deleted: false,
      status: "ACTIVE",
      role: { $ne: "GUEST" },
    }),
    User.countDocuments({
      is_deleted: false,
      role: { $ne: "GUEST" },
      created_at: { $gte: thisMonth.start, $lte: thisMonth.end },
    }),
    User.countDocuments({
      is_deleted: false,
      role: { $ne: "GUEST" },
      created_at: { $gte: lastMonth.start, $lte: lastMonth.end },
    }),
    Circulation.countDocuments({ status: "BORROWED" }),
    Circulation.countDocuments({
      status: "BORROWED",
      due_date: { $lt: new Date() },
    }),
    Fine.aggregate([
      { $match: { paid: false } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    reservationService.getPendingCount(),
  ]);

  return {
    bibliographic_records: {
      value: totalBooks,
      pct_change: pctChange(booksThisMonth, booksLastMonth),
    },
    physical_copies: {
      value: totalCopies,
      pct_change: pctChange(copiesThisMonth, copiesLastMonth),
    },
    active_members: {
      value: activeMembers,
      pct_change: pctChange(membersThisMonth, membersLastMonth),
    },
    active_loans: { value: activeLoans, overdue: overdueLoans },
    unpaid_fine_balance: {
      value: unpaidAgg[0]?.total || 0,
      count: unpaidAgg[0]?.count || 0,
    },
    pending_reservations: {
      value: reservationCounts.pending_count + reservationCounts.ready_count,
      ready: reservationCounts.ready_count,
    },
  };
};

// ═══════════════════════ BUDGET OVERVIEW ═══════════════════════

// ★ "Current year" = calendar year matching Budget.fiscal_year (Number field)
const getBudgetOverview = async () => {
  const currentYear = new Date().getFullYear();
  const budget = await Budget.findOne({
    fiscal_year: currentYear,
    is_deleted: false,
  });

  if (!budget) {
    return {
      configured: false,
      fiscal_year: currentYear,
      total_amount: 0,
      used_amount: 0,
      remaining_amount: 0,
      usage_percentage: 0,
    };
  }

  const remaining = budget.total_amount - budget.used_amount;
  const usagePct =
    budget.total_amount > 0
      ? (budget.used_amount / budget.total_amount) * 100
      : 0;

  return {
    configured: true,
    fiscal_year: budget.fiscal_year,
    total_amount: budget.total_amount,
    used_amount: budget.used_amount,
    remaining_amount: remaining,
    usage_percentage: Number(usagePct.toFixed(1)),
  };
};

// ═══════════════════════ MONTHLY BORROW/RETURN TREND (current year) ═══════════════════════

const getMonthlyTrend = async () => {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [borrowAgg, returnAgg] = await Promise.all([
    Circulation.aggregate([
      { $match: { checkout_date: { $gte: yearStart } } },
      { $group: { _id: { $month: "$checkout_date" }, count: { $sum: 1 } } },
    ]),
    Circulation.aggregate([
      { $match: { return_date: { $gte: yearStart, $ne: null } } },
      { $group: { _id: { $month: "$return_date" }, count: { $sum: 1 } } },
    ]),
  ]);

  const bMap = Object.fromEntries(borrowAgg.map((b) => [b._id, b.count]));
  const rMap = Object.fromEntries(returnAgg.map((r) => [r._id, r.count]));
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const result = [];
  for (let m = 0; m <= now.getMonth(); m++) {
    result.push({
      month: monthNames[m],
      loans: bMap[m + 1] || 0,
      returns: rMap[m + 1] || 0,
    });
  }
  return result;
};

const getDdcDistribution = async () => {
  const agg = await Book.aggregate([
    {
      $match: {
        is_deleted: false,
        class_number: { $exists: true, $nin: [null, ""] },
      },
    },
    {
      $addFields: {
        ddc_digit: { $substrCP: [{ $trim: { input: "$class_number" } }, 0, 1] },
      },
    },
    {
      $match: {
        ddc_digit: { $in: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] },
      },
    },
    { $group: { _id: "$ddc_digit", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const total = agg.reduce((sum, r) => sum + r.count, 0) || 1;
  return agg.map((r) => ({
    code: r._id,
    count: r.count,
    percentage: Number(((r.count / total) * 100).toFixed(1)),
    color: DDC_COLORS[r._id] || "#94a3b8",
  }));
};

const getUserDistribution = async () => {
  const agg = await User.aggregate([
    { $match: { is_deleted: false } },
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);
  const palette = {
    STUDENT: "#06b6d4",
    STAFF: "#3b82f6",
    LIBRARIAN: "#a855f7",
    ADMIN: "#f59e0b",
  };
  const total = agg.reduce((s, r) => s + r.count, 0) || 1;

  return agg
    .map((r) => ({
      role: r._id,
      count: r.count,
      percentage: Number(((r.count / total) * 100).toFixed(1)),
      color: palette[r._id] || "#64748b",
    }))
    .sort((a, b) => b.count - a.count);
};

// ═══════════════════════ FINE COLLECTION TREND (last 30 days) ═══════════════════════

const getFineCollectionTrend = async () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const agg = await FineTransaction.aggregate([
    { $match: { transaction_date: { $gte: start } } },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$transaction_date",
              timezone: APP_TIMEZONE,
            },
          },
          method: "$payment_method",
        },
        total: { $sum: "$amount_collected" },
      },
    },
  ]);

  const map = {};
  agg.forEach((r) => {
    if (!map[r._id.date]) map[r._id.date] = { collected: 0, waived: 0 };
    if (r._id.method === "WAIVER") map[r._id.date].waived += r.total;
    else map[r._id.date].collected += r.total;
  });

  function formatDateKey(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = formatDateKey(d);
    days.push({
      date: key,
      label: d.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        timeZone: APP_TIMEZONE,
      }),
      collected: map[key]?.collected || 0,
      waived: map[key]?.waived || 0,
    });
  }
  return days;
};

// ═══════════════════════ TOP BORROWED BOOKS (this month) — bonus insight ═══════════════════════

const getTopBorrowedBooks = async (limit = 5) => {
  const thisMonth = monthBounds(0);
  return await Circulation.aggregate([
    {
      $match: { checkout_date: { $gte: thisMonth.start, $lte: thisMonth.end } },
    },
    {
      $lookup: {
        from: "bookcopies",
        localField: "copy_id",
        foreignField: "_id",
        as: "copy",
      },
    },
    { $unwind: "$copy" },
    { $group: { _id: "$copy.book_id", borrow_count: { $sum: 1 } } },
    { $sort: { borrow_count: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "books",
        localField: "_id",
        foreignField: "_id",
        as: "book",
      },
    },
    { $unwind: "$book" },
    {
      $project: {
        _id: 0,
        title: "$book.title",
        author: "$book.author",
        borrow_count: 1,
      },
    },
  ]);
};

module.exports = {
  getKpis,
  getBudgetOverview,
  getMonthlyTrend,
  getUserDistribution,
  getFineCollectionTrend,
  getTopBorrowedBooks,
  getDdcDistribution,
};
