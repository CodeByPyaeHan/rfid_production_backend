const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/fine_service");
const { logAudit } = require("../utils/audit");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
function getUserId(req) {
  return req.user.id || req.user._id;
}

const getAll = asyncHandler(async (req, res) => {
  Msg(res, "Fines fetched.", await service.getAll(req.query));
});
const getById = asyncHandler(async (req, res) => {
  const fine = await service.getById(req.params.id);
  if (!fine) throw httpError("Fine not found.", 404);
  Msg(res, "Fine detail.", fine);
});
const pay = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Payment recorded.",
    await service.payFine(req.params.id, req.body, getUserId(req)),
    201,
  );
});
const waive = asyncHandler(async (req, res) => {
  const result = await service.waiveFine(req.params.id, getUserId(req));
  await logAudit(req, {
    action: "FINE_WAIVED",
    resource: `fine:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, "Fine waived.", result);
});
const getTransactions = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Transactions fetched.",
    await service.getTransactionsByFine(req.params.id),
  );
});

const getMyFines = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Your fines fetched.",
    await service.getMyFines(getUserId(req), req.query),
  );
});

module.exports = { getAll, getById, pay, waive, getTransactions, getMyFines };
