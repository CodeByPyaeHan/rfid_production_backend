const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/auditLog_service");

const getAll = asyncHandler(async (req, res) => {
  Msg(res, "Audit logs fetched.", await service.getAll(req.query));
});
const getActions = asyncHandler(async (req, res) => {
  Msg(res, "Actions fetched.", await service.getDistinctActions());
});

module.exports = { getAll, getActions };
