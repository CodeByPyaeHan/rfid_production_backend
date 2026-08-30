const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/circulation_service");
const { logAudit } = require("../utils/audit");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
function getUserId(req) {
  return req.user.id || req.user._id;
}

const lookupStudents = asyncHandler(async (req, res) => {
  Msg(res, "Students found.", await service.lookupStudents(req.query.search));
});

const getStudentPreview = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Student preview.",
    await service.getStudentPreview(req.params.userId),
  );
});

const lookupCopies = asyncHandler(async (req, res) => {
  Msg(res, "Copies found.", await service.lookupCopies(req.query.search));
});

const getCopyPreview = asyncHandler(async (req, res) => {
  Msg(res, "Copy preview.", await service.getCopyPreview(req.params.copyId));
});

const checkout = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Book checked out.",
    await service.checkout(
      req.body.copy_id,
      req.body.user_id,
      getUserId(req),
      req.body.due_date,
    ),
    201,
  );
});

const rfidCheckout = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Checked out successfully.",
    await service.rfidCheckout(
      req.body.copy_identifier,
      req.body.user_identifier,
    ),
    201,
  );
});

const processReturn = asyncHandler(async (req, res) => {
  const result = await service.processReturn(
    req.params.id,
    req.body.condition,
    getUserId(req),
  );
  let msg =
    req.body.condition === "LOST" ? "Marked as lost." : "Book returned.";
  if (result.overdueFine) msg += ` Overdue fine: ${result.overdueFine.amount}.`;
  if (result.conditionFine)
    msg += ` ${req.body.condition} fine: ${result.conditionFine.amount}.`;
  Msg(res, msg, result);
});

const getMyLoans = asyncHandler(async (req, res) => {
  Msg(res, "Your loans fetched.", await service.getMyLoans(getUserId(req)));
});

const getMyDashboard = asyncHandler(async (req, res) => {
  Msg(res, "Dashboard fetched.", await service.getMyDashboard(getUserId(req)));
});

const getMyMonthlyActivity = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Monthly activity fetched.",
    await service.getMonthlyActivity(
      getUserId(req),
      req.query.year ? Number(req.query.year) : undefined,
    ),
  );
});

const renew = asyncHandler(async (req, res) => {
  Msg(res, "Loan renewed.", await service.renew(req.params.id, req.user));
});

const getAll = asyncHandler(async (req, res) => {
  Msg(res, "Circulation records fetched.", await service.getAll(req.query));
});
const getById = asyncHandler(async (req, res) => {
  const c = await service.getById(req.params.id);
  if (!c) throw httpError("Circulation record not found.", 404);
  Msg(res, "Circulation detail.", c);
});

const getHistory = asyncHandler(async (req, res) => {
  Msg(res, "History fetched.", await service.getHistory(req.query));
});

const verifyGuestOnly = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Verification result.",
    await service.verifyGuestOnly(req.body.institution_id, req.body.identifier),
  );
});

const guestCheckout = asyncHandler(async (req, res) => {
  const result = await service.guestCheckout(
    req.body.institution_id,
    req.body.identifier,
    req.body.copy_id,
    getUserId(req),
  );
  await logAudit(req, {
    action: "GUEST_CHECKOUT",
    resource: `circulation:${result.circulation._id}`,
    severity: "INFO",
  });

  Msg(
    res,
    `Guest checkout successful for ${result.guest_user.name} (${result.guest_user.home_institution}).`,
    result,
    201,
  );
});

module.exports = {
  lookupStudents,
  getStudentPreview,
  lookupCopies,
  getCopyPreview,
  checkout,
  processReturn,
  renew,
  getAll,
  getById,
  getHistory,
  rfidCheckout,
  getMyLoans,
  getMyDashboard,
  getMyMonthlyActivity,
  verifyGuestOnly,
  guestCheckout,
};
