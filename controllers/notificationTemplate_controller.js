const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/notificationTemplate_service");

const getAll = asyncHandler(async (req, res) => {
  Msg(res, "Templates fetched.", await service.getAll());
});
const upsert = asyncHandler(async (req, res) => {
  Msg(res, "Template saved.", await service.upsert(req.params.type, req.body));
});

module.exports = { getAll, upsert };
