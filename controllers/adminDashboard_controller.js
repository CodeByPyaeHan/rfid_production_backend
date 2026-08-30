const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/adminDashboard_service");

const getKpis = asyncHandler(async (req, res) => {
  Msg(res, "KPIs fetched.", await service.getKpis());
});
const getBudgetOverview = asyncHandler(async (req, res) => {
  Msg(res, "Budget overview fetched.", await service.getBudgetOverview());
});
const getMonthlyTrend = asyncHandler(async (req, res) => {
  Msg(res, "Monthly trend fetched.", await service.getMonthlyTrend());
});
const getDdcDistribution = asyncHandler(async (req, res) => {
  Msg(res, "DDC distribution fetched.", await service.getDdcDistribution());
});

const getUserDistribution = asyncHandler(async (req, res) => {
  Msg(res, "User distribution fetched.", await service.getUserDistribution());
});
const getFineTrend = asyncHandler(async (req, res) => {
  Msg(res, "Fine trend fetched.", await service.getFineCollectionTrend());
});
const getTopBorrowedBooks = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Top borrowed books fetched.",
    await service.getTopBorrowedBooks(Number(req.query.limit) || 5),
  );
});

module.exports = {
  getKpis,
  getBudgetOverview,
  getMonthlyTrend,
  getUserDistribution,
  getDdcDistribution,
  getFineTrend,
  getTopBorrowedBooks,
};
