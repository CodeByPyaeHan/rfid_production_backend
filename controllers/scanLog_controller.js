const scanLogService = require("../services/scanLog_service");
const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);

const getSingle = asyncHandler(async (req, res) => {
  const scanLog = await scanLogService.getById(req.params.id);
  if (!scanLog) {
    const err = new Error("No Has scanLog.");
    err.status = 400;
    throw err;
  }
  Msg(res, "Single scanLog.", scanLog);
});
const getAll = asyncHandler(async (req, res) => {
  const allscanLog = await scanLogService.getAll();
  if (!allscanLog) {
    const err = new Error("No Has scanLog.");
    err.status = 400;
    throw err;
  }
  Msg(res, "All scanLog.", allscanLog);
});
const create = asyncHandler(async (req, res) => {
  const scanData = {
    ...req.body,
    scan_type: req.body.rfid_code.startsWith("@") ? "user" : "book",
  };

  const newScanLog = await scanLogService.add(scanData);

  Msg(res, "Scan log created.", newScanLog);
});

module.exports = {
  getSingle,
  create,
  getAll,
};
