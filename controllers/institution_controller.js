const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/institution_service");
const { logAudit } = require("../utils/audit");

const getAll = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Institutions fetched.",
    await service.getAll(req.query.includeDeleted === "true"),
  );
});
const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body);
  await logAudit(req, {
    action: "INSTITUTION_CREATED",
    resource: `institution:${result._id}`,
    severity: "WARNING",
  });
  Msg(res, `Institution "${result.code}" registered.`, result, 201);
});
const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body);
  await logAudit(req, {
    action: "INSTITUTION_UPDATED",
    resource: `institution:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, "Institution updated.", result);
});
const softDelete = asyncHandler(async (req, res) => {
  const result = await service.softDelete(req.params.id);
  await logAudit(req, {
    action: "INSTITUTION_DELETED",
    resource: `institution:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, `Institution "${result.code}" deleted.`);
});
const restore = asyncHandler(async (req, res) => {
  Msg(res, "Institution restored.", await service.restore(req.params.id));
});
const hardDelete = asyncHandler(async (req, res) => {
  const result = await service.hardDelete(req.params.id);
  await logAudit(req, {
    action: "INSTITUTION_PERMANENTLY_DELETED",
    resource: `institution:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, `Institution "${result.code}" permanently deleted.`);
});

module.exports = { getAll, create, update, softDelete, restore, hardDelete };
