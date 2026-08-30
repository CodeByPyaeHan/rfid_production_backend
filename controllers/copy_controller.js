const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const CopyService = require("../services/copy_service");

const { getIO } = require("../sockets/socketServer");

function emitCopyChanged() {
  try {
    getIO().to("role:ADMIN").emit("dashboard:catalog-changed");
  } catch (err) {
    console.error("Socket emit failed:", err.message);
  }
}

const getAll = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const search = req.query.search?.trim() || "";
  const status = req.query.status?.trim() || "";
  const includeDeleted = req.query.includeDeleted === "true";
  const rfidStatus = req.query.rfidStatus?.trim() || "";
  const result = await CopyService.getAll({
    page,
    limit,
    search,
    status,
    rfidStatus,
    includeDeleted,
  });

  return Msg(res, "Copies fetched.", result);
});

const update = asyncHandler(async (req, res) => {
  const updated = await CopyService.update(req.params.id, req.body);
  emitCopyChanged();
  return Msg(res, "Copy updated.", { copy: updated });
});

const softDelete = asyncHandler(async (req, res) => {
  const result = await CopyService.softDelete(req.params.id);
  emitCopyChanged();
  return Msg(res, `Copy ${result.accession_number} deleted.`, result);
});

const restore = asyncHandler(async (req, res) => {
  const result = await CopyService.restore(req.params.id);
  emitCopyChanged();
  return Msg(res, `Copy ${result.accession_number} restored.`, {
    copy: result,
  });
});

const hardDelete = asyncHandler(async (req, res) => {
  const result = await CopyService.hardDelete(req.params.id);
  emitCopyChanged();
  return Msg(
    res,
    `Copy ${result.accession_number} permanently deleted.`,
    result,
  );
});

module.exports = {
  getAll,
  update,
  softDelete,
  hardDelete,
  restore,
};
