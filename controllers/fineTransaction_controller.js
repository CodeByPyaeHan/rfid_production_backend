const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/fineTransaction_service");

const getAll = asyncHandler(async (req, res) => {
  Msg(res, "Transaction history fetched.", await service.getAll(req.query));
});

module.exports = { getAll };
