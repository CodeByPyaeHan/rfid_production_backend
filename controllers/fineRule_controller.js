const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/fineRule_service");
const { logAudit } = require("../utils/audit");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getAll = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Fine rules fetched.",
    await service.getAll(req.query.includeDeleted === "true"),
  );
});
const getById = asyncHandler(async (req, res) => {
  const rule = await service.getById(req.params.id);
  if (!rule) throw httpError("Rule not found.", 404);
  Msg(res, "Rule fetched.", rule);
});

const create = asyncHandler(async (req, res) => {
  const newRule = await service.create(req.body);

  await logAudit(req, {
    action: "FINE_RULE_CREATED",
    resource: `fine_rule:${newRule._id}`,
    severity: "INFO",
  });

  Msg(res, "Fine rule created.", newRule, 201);
});

const update = asyncHandler(async (req, res) => {
  const rule = await service.getById(req.params.id);
  if (!rule || rule.is_deleted) throw httpError("Rule not found.", 404);
  await logAudit(req, {
    action: "FINE_RULE_UPDATED",
    resource: `fine_rule:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, "Fine rule updated.", await service.update(req.params.id, req.body));
});

const softDelete = asyncHandler(async (req, res) => {
  const rule = await service.getById(req.params.id);
  if (!rule || rule.is_deleted) throw httpError("Rule not found.", 404);
  await service.softDelete(req.params.id);
  await logAudit(req, {
    action: "FINE_RULE_DELETED",
    resource: `fine_rule:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, "Fine rule deleted.");
});

const restore = asyncHandler(async (req, res) => {
  const rule = await service.getById(req.params.id);
  if (!rule) throw httpError("Rule not found.", 404);
  if (!rule.is_deleted) throw httpError("Rule is already active.", 400);
  await service.restore(req.params.id);
  await logAudit(req, {
    action: "FINE_RULE_RESTORED",
    resource: `fine_rule:${req.params.id}`,
    severity: "INFO",
  });
  Msg(res, "Fine rule restored.");
});

const hardDelete = asyncHandler(async (req, res) => {
  const rule = await service.getById(req.params.id);
  if (!rule) throw httpError("Rule not found.", 404);
  if (!rule.is_deleted)
    throw httpError("Rule must be soft-deleted first.", 400);
  await service.hardDelete(req.params.id);
  await logAudit(req, {
    action: "FINE_RULE_PERMANENTLY_DELETED",
    resource: `fine_rule:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, "Fine rule permanently deleted.");
});

const resolve = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Resolved rule.",
    await service.resolve(req.params.userId, req.query.fine_type),
  );
});

module.exports = {
  getAll,
  getById,
  create,
  update,
  softDelete,
  restore,
  hardDelete,
  resolve,
};
