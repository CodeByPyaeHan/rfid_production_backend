const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/major_service");
const { logAudit } = require("../utils/audit");

const getAll = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Majors fetched.",
    await service.getAll(req.query.includeDeleted === "true"),
  );
});

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body);
  await logAudit(req, {
    action: "MAJOR_CREATED",
    resource: `major:${result._id}`,
  });
  Msg(res, `Major "${result.short_name}" created.`, result, 201);
});

const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body);
  await logAudit(req, {
    action: "MAJOR_UPDATED",
    resource: `major:${req.params.id}`,
  });
  Msg(res, "Major updated.", result);
});

const softDelete = asyncHandler(async (req, res) => {
  const result = await service.softDelete(req.params.id);
  await logAudit(req, {
    action: "MAJOR_DELETED",
    resource: `major:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, `Major "${result.short_name}" deleted.`);
});

const restore = asyncHandler(async (req, res) => {
  const result = await service.restore(req.params.id);
  await logAudit(req, {
    action: "MAJOR_RESTORED",
    resource: `major:${req.params.id}`,
  });
  Msg(res, `Major "${result.short_name}" restored.`);
});

const hardDelete = asyncHandler(async (req, res) => {
  const result = await service.hardDelete(req.params.id);
  await logAudit(req, {
    action: "MAJOR_PERMANENTLY_DELETED",
    resource: `major:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, `Major "${result.short_name}" permanently deleted.`);
});

module.exports = { getAll, create, update, softDelete, restore, hardDelete };
