const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const financeService = require("../services/finance_service");

function getUserId(req) {
  return req.user.id || req.user._id;
}

const createPurchase = asyncHandler(async (req, res) => {
  const result = await financeService.createBookPurchase(
    req.body,
    getUserId(req),
  );
  Msg(res, "Book purchase created.", result, 201);
});
const getPurchases = asyncHandler(async (req, res) => {
  Msg(res, "Purchase list.", await financeService.getAllPurchases(req.query));
});

const getPurchase = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Purchase detail.",
    await financeService.getPurchaseById(req.params.id),
  );
});
const updatePurchase = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Purchase updated.",
    await financeService.updateBookPurchase(req.params.id, req.body),
  );
});
const softDeletePurchase = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Purchase deleted.",
    await financeService.softDeleteBookPurchase(req.params.id),
  );
});
const restorePurchase = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Purchase restored.",
    await financeService.restoreBookPurchase(req.params.id),
  );
});
const hardDeletePurchase = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Purchase permanently deleted.",
    await financeService.hardDeleteBookPurchase(req.params.id),
  );
});

const createExpenditure = asyncHandler(async (req, res) => {
  const result = await financeService.createExpenditure(
    req.body,
    getUserId(req),
  );
  Msg(res, "Expenditure created.", result, 201);
});
const getExpenditures = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Expenditure list.",
    await financeService.getAllExpenditures(req.query),
  );
});
const getExpenditure = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Expenditure detail.",
    await financeService.getExpenditureById(req.params.id),
  );
});
const updateExpenditure = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Expenditure updated.",
    await financeService.updateExpenditure(req.params.id, req.body),
  );
});
const softDeleteExpenditure = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Expenditure deleted.",
    await financeService.softDeleteExpenditure(req.params.id),
  );
});
const restoreExpenditure = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Expenditure restored.",
    await financeService.restoreExpenditure(req.params.id),
  );
});
const hardDeleteExpenditure = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Expenditure permanently deleted.",
    await financeService.hardDeleteExpenditure(req.params.id),
  );
});

const dashboard = asyncHandler(async (req, res) => {
  Msg(res, "Finance dashboard.", await financeService.getDashboard(req.query));
});
const monthlyReport = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  Msg(
    res,
    "Monthly report.",
    await financeService.getMonthlyReport(Number(year), Number(month)),
  );
});
const categoryReport = asyncHandler(async (req, res) => {
  Msg(res, "Category report.", await financeService.getCategoryReport());
});
const transactionHistory = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Transaction history.",
    await financeService.getTransactionHistory(req.query),
  );
});

module.exports = {
  createPurchase,
  getPurchases,
  getPurchase,
  updatePurchase,
  softDeletePurchase,
  restorePurchase,
  hardDeletePurchase,
  createExpenditure,
  getExpenditures,
  getExpenditure,
  updateExpenditure,
  softDeleteExpenditure,
  restoreExpenditure,
  hardDeleteExpenditure,
  dashboard,
  monthlyReport,
  categoryReport,
  transactionHistory,
};
