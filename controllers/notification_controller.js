const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/notification_service");
function getUserId(req) {
  return req.user.id || req.user._id;
}

const getAll = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Notifications fetched.",
    await service.getAll(getUserId(req), req.query),
  );
});

const markRead = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Marked as read.",
    await service.markRead(req.params.id, getUserId(req)),
  );
});

const markAllRead = asyncHandler(async (req, res) => {
  Msg(res, "All marked as read.", await service.markAllRead(getUserId(req)));
});

const remove = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Notification deleted.",
    await service.remove(req.params.id, getUserId(req)),
  );
});

module.exports = { getAll, markRead, markAllRead, remove };
