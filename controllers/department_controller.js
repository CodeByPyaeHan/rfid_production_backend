const departmentService = require("../services/department_service");
const staffService = require("../services/staff_service");
const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const { logAudit } = require("../utils/audit");
const Department = require("../models/department_model");
function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const create = asyncHandler(async (req, res) => {
  const { name, short_name, department_code } = req.body;
  const upper = short_name.trim().toUpperCase();

  const exist = await departmentService.getByShortName(upper);
  if (exist)
    throw httpError(
      exist.is_deleted
        ? `"${upper}" belongs to a deleted department. Restore it instead.`
        : `Department "${upper}" already exists.`,
      409,
    );

  if (department_code?.trim()) {
    const codeExist = await Department.findOne({
      department_code: department_code.trim().toUpperCase(),
    });
    if (codeExist)
      throw httpError(
        `Department code "${department_code}" already in use by "${codeExist.name}".`,
        409,
      );
  }

  const dept = await departmentService.add({
    name: name.trim(),
    short_name: upper,
    department_code: department_code?.trim().toUpperCase() || null,
  });

  await logAudit(req, {
    action: "DEPARTMENT_CREATED",
    resource: `department:${dept._id}`,
  });
  Msg(res, `Department "${dept.short_name}" created.`, dept, 201);
});

const update = asyncHandler(async (req, res) => {
  const dept = await departmentService.getById(req.params.id);
  if (!dept || dept.is_deleted) throw httpError("Department not found.", 404);

  const update = {};
  if (req.body.name !== undefined) update.name = req.body.name.trim();

  if (req.body.short_name !== undefined) {
    const upper = req.body.short_name.trim().toUpperCase();
    const exist = await departmentService.getByShortName(upper);
    if (exist && exist._id.toString() !== req.params.id) {
      throw httpError(`Short name "${upper}" already exists.`, 409);
    }
    update.short_name = upper;
  }

  if (req.body.department_code !== undefined) {
    const code = req.body.department_code?.trim()
      ? req.body.department_code.trim().toUpperCase()
      : null;

    if (code) {
      const codeExist = await Department.findOne({ department_code: code });
      if (codeExist && codeExist._id.toString() !== req.params.id) {
        throw httpError(
          `Department code "${code}" already in use by "${codeExist.name}".`,
          409,
        );
      }
    }
    update.department_code = code;
  }

  const updated = await departmentService.modify(req.params.id, update);
  await logAudit(req, {
    action: "DEPARTMENT_UPDATED",
    resource: `department:${req.params.id}`,
  });
  Msg(res, "Department updated.", updated);
});

const getAll = asyncHandler(async (req, res) => {
  console.log("Query params:", req.query);
  const includeDeleted = req.query.includeDeleted === "true";

  const departments = await departmentService.getAll(includeDeleted);

  Msg(res, "Departments fetched.", departments);
});

const softDelete = asyncHandler(async (req, res) => {
  const dept = await departmentService.getById(req.params.id);
  if (!dept || dept.is_deleted) throw httpError("Department not found.", 404);

  const count = await staffService.countByDepartment(req.params.id);
  if (count > 0) {
    throw httpError(
      `Cannot delete — ${count} staff still assigned to this department.`,
      409,
    );
  }

  await logAudit(req, {
    action: "DEPARTMENT_SOFT_DELETED",
    resource: `department:${req.params.id}`,
    severity: "WARNING",
  });

  await departmentService.softDelete(req.params.id);
  Msg(res, `Department "${dept.short_name}" deleted.`);
});

const restore = asyncHandler(async (req, res) => {
  const dept = await departmentService.getById(req.params.id);
  if (!dept) throw httpError("Department not found.", 404);
  if (!dept.is_deleted) throw httpError("Department is already active.", 400);

  await departmentService.restore(req.params.id);
  await logAudit(req, {
    action: "DEPARTMENT_RESTORED",
    resource: `department:${req.params.id}`,
  });
  Msg(res, `Department "${dept.short_name}" restored.`);
});

const hardDelete = asyncHandler(async (req, res) => {
  const dept = await departmentService.getById(req.params.id);
  if (!dept) throw httpError("Department not found.", 404);
  if (!dept.is_deleted)
    throw httpError("Department must be soft-deleted first.", 400);

  const count = await staffService.countByDepartment(req.params.id);
  if (count > 0) {
    throw httpError(
      `Cannot permanently delete — ${count} staff still reference this department.`,
      409,
    );
  }

  await departmentService.drop(req.params.id);
  await logAudit(req, {
    action: "DEPARTMENT_HARD_DELETED",
    resource: `department:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, `Department "${dept.short_name}" permanently deleted.`);
});

module.exports = {
  create,
  update,
  getAll,
  softDelete,
  restore,
  hardDelete,
};
