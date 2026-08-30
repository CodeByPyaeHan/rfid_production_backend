const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/reports_service");

const getSummary = asyncHandler(async (req, res) => {
  const year = req.query.year
    ? Number(req.query.year)
    : new Date().getFullYear();
  Msg(res, "Report summary fetched.", await service.getSummary(year));
});

module.exports = { getSummary };
