const mongoose = require("mongoose");
const Circulation = require("../models/circulation_model");
const Fine = require("../models/fine_model");
const User = require("../models/user_model");
const reservationService = require("./reservation_service");
const { buildTransactionEntry } = require("../utils/transactionFormatter");

const {
  APP_TIMEZONE,
  DAY_MS,
  formatMyanmarDateKey,
  getMyanmarDayBoundaries,
  getMyanmarMonthStart,
} = require("../utils/timezone");

function pctChange(today, yesterday) {
  if (yesterday === 0) return today > 0 ? null : 0;
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
}

const getStats = async () => {
  const now = new Date();
  const { start: todayStart, end: todayEnd } = getMyanmarDayBoundaries(0);
  const { start: yesterdayStart, end: yesterdayEnd } =
    getMyanmarDayBoundaries(-1);
  const { start: sevenDaysAgo } = getMyanmarDayBoundaries(-6);
  const { start: thirtyDaysAgo } = getMyanmarDayBoundaries(-29);
  const startOfMonth = getMyanmarMonthStart();

  const [
    todaysBorrows,
    yesterdaysBorrows,
    todaysReturns,
    yesterdaysReturns,
    overdueBooks,
    criticalOverdue,
    newStudents,
    newStaff,
    unpaidAgg,
    reservationCounts,
    circulationsThisMonth,
    activeLoans,
  ] = await Promise.all([
    Circulation.countDocuments({
      checkout_date: { $gte: todayStart, $lte: todayEnd },
    }),
    Circulation.countDocuments({
      checkout_date: { $gte: yesterdayStart, $lte: yesterdayEnd },
    }),
    Circulation.countDocuments({
      return_date: { $gte: todayStart, $lte: todayEnd },
    }),
    Circulation.countDocuments({
      return_date: { $gte: yesterdayStart, $lte: yesterdayEnd },
    }),
    Circulation.countDocuments({ status: "BORROWED", due_date: { $lt: now } }),
    Circulation.countDocuments({
      status: "BORROWED",
      due_date: { $lt: thirtyDaysAgo },
    }),
    User.countDocuments({
      role: "STUDENT",
      is_deleted: false,
      created_at: { $gte: sevenDaysAgo },
    }),
    User.countDocuments({
      role: "STAFF",
      is_deleted: false,
      created_at: { $gte: sevenDaysAgo },
    }),
    Fine.aggregate([
      { $match: { paid: false } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    reservationService.getPendingCount(),
    Circulation.countDocuments({ checkout_date: { $gte: startOfMonth } }),
    Circulation.countDocuments({ status: "BORROWED" }),
  ]);

  return {
    todays_borrows: {
      value: todaysBorrows,
      pct_change: pctChange(todaysBorrows, yesterdaysBorrows),
    },
    todays_returns: {
      value: todaysReturns,
      pct_change: pctChange(todaysReturns, yesterdaysReturns),
    },
    overdue_books: { value: overdueBooks, critical: criticalOverdue },
    new_members: {
      value: newStudents + newStaff,
      students: newStudents,
      staff: newStaff,
    },
    pending_reservations: {
      value: reservationCounts.pending_count + reservationCounts.ready_count,
      ready: reservationCounts.ready_count,
    },
    unpaid_fine_balance: unpaidAgg[0]?.total || 0,
    circulations_this_month: circulationsThisMonth,
    active_loans: activeLoans,
  };
};

const getWeeklyTrend = async () => {
  const { start } = getMyanmarDayBoundaries(-6);

  const [borrowAgg, returnAgg] = await Promise.all([
    Circulation.aggregate([
      { $match: { checkout_date: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$checkout_date",
              timezone: APP_TIMEZONE,
            },
          }, // ★ FIX
          count: { $sum: 1 },
        },
      },
    ]),
    Circulation.aggregate([
      { $match: { return_date: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$return_date",
              timezone: APP_TIMEZONE,
            },
          }, // ★ FIX
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const bMap = Object.fromEntries(borrowAgg.map((b) => [b._id, b.count]));
  const rMap = Object.fromEntries(returnAgg.map((r) => [r._id, r.count]));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const key = formatMyanmarDateKey(d);
    days.push({
      date: key,
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: APP_TIMEZONE,
      }),
      borrows: bMap[key] || 0,
      returns: rMap[key] || 0,
    });
  }
  return days;
};

/**
 * @param {string} timezone
 */
const getHourlyDistribution = async (timezone = APP_TIMEZONE) => {
  try {
    const { start: todayStart, end: todayEnd } = getMyanmarDayBoundaries(0);

    const [borrowAgg, returnAgg] = await Promise.all([
      Circulation.aggregate([
        {
          $match: {
            checkout_date: { $gte: todayStart, $lte: todayEnd },
            is_deleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: { $hour: { date: "$checkout_date", timezone } },
            count: { $sum: 1 },
          },
        },
      ]),
      Circulation.aggregate([
        {
          $match: {
            return_date: { $gte: todayStart, $lte: todayEnd },
            is_deleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: { $hour: { date: "$return_date", timezone } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const combined = {};
    [...borrowAgg, ...returnAgg].forEach((r) => {
      if (r._id !== null && r._id !== undefined) {
        combined[r._id] = (combined[r._id] || 0) + r.count;
      }
    });

    const hours = [];
    for (let h = 8; h <= 18; h++) {
      const label = h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`;
      hours.push({ hour: label, count: combined[h] || 0 });
    }
    return hours;
  } catch (error) {
    console.error("Error fetching hourly distribution:", error);
    throw error;
  }
};

const getRecentTransactions = async (limit = 20) => {
  const [recentCheckouts, recentReturns] = await Promise.all([
    Circulation.find({})
      .sort({ checkout_date: -1 })
      .limit(limit)
      .populate("user_id", "username name role")
      .populate({
        path: "copy_id",
        populate: { path: "book_id", select: "title" },
      }),
    Circulation.find({ return_date: { $ne: null } })
      .sort({ return_date: -1 })
      .limit(limit)
      .populate("user_id", "username name role")
      .populate({
        path: "copy_id",
        populate: { path: "book_id", select: "title" },
      })
      .populate("returned_by", "name"),
  ]);

  const returnIds = recentReturns.map((c) => c._id);
  const damagedFines = await Fine.find({
    circulation_id: { $in: returnIds },
    fine_type: "DAMAGED",
  }).select("circulation_id");
  const damagedSet = new Set(
    damagedFines.map((f) => f.circulation_id.toString()),
  );

  const checkoutEntries = recentCheckouts.map((c) =>
    buildTransactionEntry(c, "CHECKOUT"),
  );
  const returnEntries = recentReturns.map((c) => {
    const type =
      c.status === "LOST"
        ? "LOST"
        : damagedSet.has(c._id.toString())
          ? "DAMAGED_RETURN"
          : "RETURN";
    return buildTransactionEntry(c, type, {
      handledBy: c.returned_by?.name ?? null,
    });
  });

  return [...checkoutEntries, ...returnEntries]
    .filter((e) => e.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

module.exports = {
  getStats,
  getWeeklyTrend,
  getHourlyDistribution,
  getRecentTransactions,
};
