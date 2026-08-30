const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/semesterPromotion_service");
const { logAudit } = require("../utils/audit");
function getUserId(req) {
  return req.user.id || req.user._id;
}

const preview = asyncHandler(async (req, res) => {
  Msg(res, "Preview generated.", await service.previewPromotion(req.params.id));
});

const execute = asyncHandler(async (req, res) => {
  const result = await service.executePromotion(req.params.id, getUserId(req));
  await logAudit(req, {
    action:
      result.action === "GRADUATE" ? "STUDENTS_GRADUATED" : "STUDENTS_PROMOTED",
    resource: `semester:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(
    res,
    `${result.affected} student(s) ${result.action === "GRADUATE" ? "marked as graduated" : `promoted to ${result.to}`}.`,
    result,
  );
});

module.exports = { preview, execute };
