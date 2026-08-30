const inoutlogService = require("../services/userInOutLog_service");
const auditLogService = require("../services/auditLog_service");
const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);

function httpError(msg, status) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

const create = asyncHandler(async (req, res) => {
  const { user_id, log_type } = req.body;
  try {
    const log = await inoutlogService.add({ user_id, log_type });
    Msg(res, "Log created.", log, 201);
  } catch (err) {
    if (err.code === 11000) {
      throw httpError(
        "Duplicate scan detected (same user, type, and time).",
        409,
      );
    }
    throw err;
  }
});

const getAll = asyncHandler(async (req, res) => {
  const result = await inoutlogService.getAll(req.query);
  Msg(res, "User In/Out logs fetched.", result);
});

const drop = asyncHandler(async (req, res) => {
  const log = await inoutlogService.getById(req.params.id);
  if (!log) throw httpError("Log not found.", 404);

  await inoutlogService.drop(req.params.id);
  Msg(res, "Log deleted.");
});

async function logExportAudit(req, format, startDate, endDate) {
  try {
    await auditLogService.add({
      user_id: req.user?.id || req.user?._id,
      ip_address: req.ip,
      severity: "INFO",
      action: "EXPORT_INOUT_LOGS",
      resource: `format=${format}; range=${startDate}_to_${endDate}`,
    });
  } catch (err) {
    console.error("Failed to write audit log:", err.message);
  }
}

// ── Export JSON (start → end date) ──────────────────────────────
const exportJSON = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const result = await inoutlogService.exportJSON(startDate, endDate);
  await logExportAudit(req, "json", startDate, endDate);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=inoutlogs_${startDate}_to_${endDate}.json`,
  );
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(result);
});

// ── Export CSV (start → end date) ───────────────────────────────
const exportCSV = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const csvData = await inoutlogService.exportCSV(startDate, endDate);
  await logExportAudit(req, "csv", startDate, endDate);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=inoutlogs_${startDate}_to_${endDate}.csv`,
  );
  res.setHeader("Content-Type", "text/csv");
  return res.status(200).send(csvData);
});

// ── Import JSON ──────────────────────────────────────────────────
const importJSON = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError("JSON file is required.", 400);

  const result = await inoutlogService.importJSON(req.file.buffer);
  Msg(
    res,
    `Import completed — ${result.inserted} inserted, ${result.rejected} rejected.`,
    result,
  );
});

// ── Import CSV ────────────────────────────────────────────────────
const importCSV = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError("CSV file is required.", 400);

  const result = await inoutlogService.importCSV(req.file.buffer);
  Msg(
    res,
    `Import completed — ${result.inserted} inserted, ${result.rejected} rejected.`,
    result,
  );
});

module.exports = {
  create,
  getAll,
  drop,
  exportJSON,
  exportCSV,
  importJSON,
  importCSV,
};
