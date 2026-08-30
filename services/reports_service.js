const Book = require("../models/book_model");
const BookCopy = require("../models/bookCopy_model");
const Circulation = require("../models/circulation_model");
const Fine = require("../models/fine_model");
const FineTransaction = require("../models/fineTransaction_model");
const { getDdcDistribution } = require("./adminDashboard_service");

const { APP_TIMEZONE, getMyanmarYearBoundaries } = require("../utils/timezone");

const MONTH_NAMES = [
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

// ═══════════════════════ BORROW / RETURN / OVERDUE TRENDS ═══════════════════════

const getBorrowTrends = async (year) => {
  const { yearStart, yearEnd } = getMyanmarYearBoundaries(year);

  const [borrowAgg, returnAgg, overdueAgg] = await Promise.all([
    Circulation.aggregate([
      { $match: { checkout_date: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: { $month: { date: "$checkout_date", timezone: APP_TIMEZONE } },
          count: { $sum: 1 },
        },
      },
    ]),
    Circulation.aggregate([
      {
        $match: { return_date: { $gte: yearStart, $lte: yearEnd, $ne: null } },
      },
      {
        $group: {
          _id: { $month: { date: "$return_date", timezone: APP_TIMEZONE } },
          count: { $sum: 1 },
        },
      },
    ]),
    Fine.aggregate([
      {
        $match: {
          fine_type: "OVERDUE",
          created_at: { $gte: yearStart, $lte: yearEnd },
        },
      },
      {
        $group: {
          _id: { $month: { date: "$created_at", timezone: APP_TIMEZONE } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const bMap = Object.fromEntries(borrowAgg.map((b) => [b._id, b.count]));
  const rMap = Object.fromEntries(returnAgg.map((r) => [r._id, r.count]));
  const oMap = Object.fromEntries(overdueAgg.map((o) => [o._id, o.count]));

  return MONTH_NAMES.map((month, idx) => ({
    month,
    loans: bMap[idx + 1] || 0,
    returns: rMap[idx + 1] || 0,
    overdue: oMap[idx + 1] || 0,
  }));
};

// ═══════════════════════ COLLECTION GROWTH (cumulative, last 5 years) ═══════════════════════

const getCollectionGrowth = async () => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);

  return await Promise.all(
    years.map(async (year) => {
      const { yearEnd } = getMyanmarYearBoundaries(year);
      const [bibliographic, physical] = await Promise.all([
        Book.countDocuments({
          is_deleted: false,
          created_at: { $lte: yearEnd },
        }),
        BookCopy.countDocuments({
          is_deleted: false,
          created_at: { $lte: yearEnd },
        }),
      ]);
      return { year: String(year), bibliographic, physical };
    }),
  );
};

// ═══════════════════════ FINE COLLECTION STATS (monthly, current year) ═══════════════════════

const getFineCollectionStats = async (year) => {
  const { yearStart, yearEnd } = getMyanmarYearBoundaries(year);

  const [txnAgg, pendingAgg] = await Promise.all([
    FineTransaction.aggregate([
      { $match: { transaction_date: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: {
            month: {
              $month: { date: "$transaction_date", timezone: APP_TIMEZONE },
            },
            method: "$payment_method",
          },
          total: { $sum: "$amount_collected" },
        },
      },
    ]),
    Fine.aggregate([
      {
        $match: { paid: false, created_at: { $gte: yearStart, $lte: yearEnd } },
      },
      {
        $group: {
          _id: { $month: { date: "$created_at", timezone: APP_TIMEZONE } },
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  const collectedMap = {},
    waivedMap = {};
  txnAgg.forEach((r) => {
    const target = r._id.method === "WAIVER" ? waivedMap : collectedMap;
    target[r._id.month] = (target[r._id.month] || 0) + r.total;
  });
  const pendingMap = Object.fromEntries(
    pendingAgg.map((r) => [r._id, r.total]),
  );

  return MONTH_NAMES.map((month, idx) => ({
    month,
    collected: collectedMap[idx + 1] || 0,
    waived: waivedMap[idx + 1] || 0,
    pending: pendingMap[idx + 1] || 0,
  }));
};

// ═══════════════════════ CONSOLIDATED SUMMARY ═══════════════════════

const getSummary = async (year) => {
  const [borrowTrend, collectionGrowth, subjects, fineCollection] =
    await Promise.all([
      getBorrowTrends(year),
      getCollectionGrowth(),
      getDdcDistribution(),
      getFineCollectionStats(year),
    ]);
  return { borrowTrend, collectionGrowth, subjects, fineCollection };
};

module.exports = {
  getBorrowTrends,
  getCollectionGrowth,
  getFineCollectionStats,
  getSummary,
};
