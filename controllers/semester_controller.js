const asyncHandler = require("express-async-handler");
const semesterService = require("../services/semester_service");
const studentService = require("../services/student_service");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const { logAudit } = require("../utils/audit");
const Semester = require("../models/semester_model");

function httpError(msg, status) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

const getAll = asyncHandler(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === "true";
  const semesters = await semesterService.getAll(includeDeleted);

  const withCounts = await Promise.all(
    semesters.map(async (s) => ({
      ...s.toObject(),
      student_count: await studentService.countBySemester(s._id),
    })),
  );

  Msg(res, "Semesters fetched.", withCounts);
});

const create = asyncHandler(async (req, res) => {
  const { name, short_name, order, degree_level } = req.body;

  if (!name || !short_name || order === undefined) {
    throw httpError("Name, short_name and order are required.", 400);
  }

  const sem = await semesterService.create({
    name,
    short_name,
    order,
    degree_level,
  });

  await logAudit(req, {
    action: "SEMESTER_CREATED",
    resource: `semester:${sem._id}`,
  });
  Msg(res, "Semester created.", sem, 201);
});

const update = asyncHandler(async (req, res) => {
  const sem = await semesterService.getById(req.params.id);
  if (!sem || sem.is_deleted) throw httpError("Semester not found.", 404);

  const updateData = {};

  const level =
    req.body.degree_level !== undefined
      ? req.body.degree_level
      : sem.degree_level;

  if (req.body.name !== undefined) updateData.name = req.body.name.trim();

  if (req.body.degree_level !== undefined)
    updateData.degree_level = req.body.degree_level;

  if (req.body.short_name !== undefined) {
    const upper = req.body.short_name.trim().toUpperCase();

    const exist = await Semester.findOne({
      short_name: upper,
      degree_level: level,
      is_deleted: false,
    });

    if (exist && exist._id.toString() !== req.params.id) {
      throw httpError(
        `Short name "${upper}" already exists in the ${level} track.`,
        409,
      );
    }
    updateData.short_name = upper;
  }

  if (req.body.order !== undefined) {
    const parsedOrder = Number(req.body.order);

    const orderExist = await Semester.findOne({
      order: parsedOrder,
      degree_level: level,
      is_deleted: false,
    });

    if (orderExist && orderExist._id.toString() !== req.params.id) {
      throw httpError(
        `Order ${parsedOrder} is already used by "${orderExist.name}" in the ${level} track.`,
        409,
      );
    }
    updateData.order = parsedOrder;
  }

  const updated = await semesterService.modify(req.params.id, updateData);

  await logAudit(req, {
    action: "SEMESTER_UPDATED",
    resource: `semester:${req.params.id}`,
  });

  Msg(res, "Semester updated.", updated);
});

const softDelete = asyncHandler(async (req, res) => {
  const sem = await semesterService.getById(req.params.id);
  if (!sem || sem.is_deleted) throw httpError("Semester not found.", 404);

  const count = await studentService.countBySemester(req.params.id);
  if (count > 0) {
    throw httpError(
      `Cannot delete — ${count} students still assigned to this semester.`,
      409,
    );
  }
  await logAudit(req, {
    action: "SEMESTER_SOFT_DELETED",
    resource: `semester:${req.params.id}`,
    severity: "WARNING",
  });
  await semesterService.softDelete(req.params.id);
  Msg(res, `Semester "${sem.short_name}" deleted.`);
});

const restore = asyncHandler(async (req, res) => {
  const sem = await semesterService.getById(req.params.id);
  if (!sem) throw httpError("Semester not found.", 404);
  if (!sem.is_deleted) throw httpError("Semester is already active.", 400);

  await semesterService.restore(req.params.id);
  await logAudit(req, {
    action: "SEMESTER_RESTORED",
    resource: `semester:${req.params.id}`,
  });
  Msg(res, `Semester "${sem.short_name}" restored.`);
});

const hardDelete = asyncHandler(async (req, res) => {
  const sem = await semesterService.getById(req.params.id);
  if (!sem) throw httpError("Semester not found.", 404);
  if (!sem.is_deleted)
    throw httpError("Semester must be soft-deleted first.", 400);

  const count = await studentService.countBySemester(req.params.id);
  if (count > 0) {
    throw httpError(
      `Cannot permanently delete — ${count} students still reference this semester.`,
      409,
    );
  }

  await semesterService.drop(req.params.id);
  await logAudit(req, {
    action: "SEMESTER_HARD_DELETED",
    resource: `semester:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, `Semester "${sem.short_name}" permanently deleted.`);
});

module.exports = { getAll, create, update, softDelete, restore, hardDelete };
