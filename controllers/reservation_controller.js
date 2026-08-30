const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/reservation_service");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}
function getUserId(req) {
  return req.user.id || req.user._id;
}

const create = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Reservation created.",
    await service.create(req.body.book_id, getUserId(req)),
    201,
  );
});

const manualCreate = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Reservation created.",
    await service.create(req.body.book_id, req.body.user_id),
    201,
  );
});

const getMy = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Your reservations.",
    await service.getMyReservations(getUserId(req)),
  );
});

const getQueue = asyncHandler(async (req, res) => {
  Msg(res, "Reservation queue fetched.", await service.getQueue(req.query));
});

const getById = asyncHandler(async (req, res) => {
  const r = await service.getById(req.params.id);
  if (!r) throw httpError("Reservation not found.", 404);
  const isOwner = r.user_id._id.toString() === getUserId(req).toString();
  const isStaff = ["STAFF", "LIBRARIAN", "ADMIN"].includes(req.user.role);
  if (!isOwner && !isStaff) throw httpError("Not authorized.", 403);
  Msg(res, "Reservation detail.", r);
});

const fulfill = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Book issued to student.",
    await service.fulfill(req.params.id, getUserId(req)),
  );
});
const cancel = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Reservation cancelled.",
    await service.cancel(req.params.id, req.user),
  );
});
const runExpiry = asyncHandler(async (req, res) => {
  Msg(res, "Expiry check completed.", await service.expireOverdueHolds());
});

const getPendingCount = asyncHandler(async (req, res) => {
  Msg(res, "Pending count fetched.", await service.getPendingCount());
});

module.exports = {
  create,
  manualCreate,
  getMy,
  getQueue,
  getById,
  fulfill,
  cancel,
  runExpiry,
  getPendingCount,
};
