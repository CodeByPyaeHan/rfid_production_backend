const deviceService = require("../services/device_service");
const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);

const getSingle = asyncHandler(async (req, res) => {
  const device = await deviceService.getById(req.params.id);
  if (!device) {
    const err = new Error("No Has Device.");
    err.status = 400;
    throw err;
  }
  Msg(res, "Single Device.", device);
});
const getAll = asyncHandler(async (req, res) => {
  const allDevice = await deviceService.getAll();
  if (!allDevice) {
    const err = new Error("No Has Device.");
    err.status = 400;
    throw err;
  }
  Msg(res, "All Device.", allDevice);
});
const update = asyncHandler(async (req, res) => {
  const device = await deviceService.getById(req.params.id);
  if (!device) {
    const err = new Error("Invalid Device.");
    err.status = 400;
    throw err;
  }
  const newDevice = await deviceService.modify(device._id, req.body);
  Msg(res, "Device updated.", newDevice);
});

module.exports = {
  getSingle,
  update,
  getAll,
};
