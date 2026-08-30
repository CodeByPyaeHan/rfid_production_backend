const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/dashboard_service");

const getStats = asyncHandler(async (req, res) => {
  Msg(res, "Dashboard stats fetched.", await service.getStats());
});

const getWeeklyTrend = asyncHandler(async (req, res) => {
  Msg(res, "Weekly trend fetched.", await service.getWeeklyTrend());
});

const getHourly = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Hourly distribution fetched.",
    await service.getHourlyDistribution(),
  );
});

const getRecent = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  Msg(
    res,
    "Recent transactions fetched.",
    await service.getRecentTransactions(limit),
  );
});

module.exports = {
  getStats,
  getWeeklyTrend,
  getHourly,
  getRecent,
};
