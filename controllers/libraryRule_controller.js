const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const service = require("../services/libraryRule_service");
const { logAudit } = require("../utils/audit");
function getUserId(req) {
  return req.user.id || req.user._id;
}
function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getAll = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Rules fetched.",
    await service.getAll(req.query.includeDeleted === "true"),
  );
});
const getPublic = asyncHandler(async (req, res) => {
  Msg(res, "Rules fetched.", await service.getPublic());
}); // ★ no auth required
const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.body, getUserId(req));
  await logAudit(req, {
    action: "LIBRARY_RULE_CREATED",
    resource: `libraryrule:${result._id}`,
  });
  Msg(res, "Rule created.", result, 201);
});
const update = asyncHandler(async (req, res) => {
  const result = await service.update(req.params.id, req.body);
  await logAudit(req, {
    action: "LIBRARY_RULE_UPDATED",
    resource: `libraryrule:${req.params.id}`,
  });
  Msg(res, "Rule updated.", result);
});
const softDelete = asyncHandler(async (req, res) => {
  const result = await service.softDelete(req.params.id);
  await logAudit(req, {
    action: "LIBRARY_RULE_DELETED",
    resource: `libraryrule:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, `Rule "${result.title}" deleted.`);
});
const restore = asyncHandler(async (req, res) => {
  const result = await service.restore(req.params.id);
  await logAudit(req, {
    action: "LIBRARY_RULE_RESTORED",
    resource: `libraryrule:${req.params.id}`,
  });
  Msg(res, `Rule "${result.title}" restored.`);
});
const hardDelete = asyncHandler(async (req, res) => {
  const result = await service.hardDelete(req.params.id);
  await logAudit(req, {
    action: "LIBRARY_RULE_PERMANENTLY_DELETED",
    resource: `libraryrule:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, `Rule "${result.title}" permanently deleted.`);
});

module.exports = {
  getAll,
  getPublic,
  create,
  update,
  softDelete,
  restore,
  hardDelete,
};
