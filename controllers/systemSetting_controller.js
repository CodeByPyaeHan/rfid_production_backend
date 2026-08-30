const asyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");

const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/systemSetting_service");
const { logAudit } = require("../utils/audit");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getSettings = asyncHandler(async (req, res) => {
  Msg(res, "Settings fetched.", await service.getSettings());
});

const updateSettings = asyncHandler(async (req, res) => {
  const result = await service.updateSettings(req.body);
  await logAudit(req, {
    action: "ID_CARD_SETTINGS_UPDATED",
    resource: "systemsettings:GLOBAL",
  });
  Msg(res, "Settings updated.", result);
});

const uploadSignature = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError("No image file provided.", 400);
  const url = `/uploads/signatures/${req.file.filename}`;
  const result = await service.updateSettings({ rector_signature_url: url });
  await logAudit(req, {
    action: "RECTOR_SIGNATURE_UPDATED",
    resource: "systemsettings:GLOBAL",
  });
  Msg(res, "Signature uploaded.", result);
});

const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError("No image file provided.", 400);

  const current = await service.getSettings();
  if (current.university_logo_url) {
    const oldPath = path.join(
      __dirname,
      "..",
      current.university_logo_url.replace(/^\/uploads\//, "uploads/"),
    );
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  const url = `/uploads/logos/${req.file.filename}`;
  const result = await service.updateSettings({ university_logo_url: url });
  await logAudit(req, {
    action: "UNIVERSITY_LOGO_UPDATED",
    resource: "systemsettings:GLOBAL",
  });
  Msg(res, "Logo uploaded.", result);
});

module.exports = { getSettings, updateSettings, uploadSignature, uploadLogo };
