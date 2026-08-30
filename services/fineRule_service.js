const model = require("../models/fineRule_model");
const User = require("../models/user_model");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const create = async (data) => {
  const doc = { fine_type: data.fine_type };
  if (data.role) doc.role = data.role;
  if (data.role === "STUDENT" && data.semester) doc.semester = data.semester;
  if (data.role === "STAFF" && data.department)
    doc.department = data.department;

  if (data.fine_type === "OVERDUE") {
    doc.rate_per_day = data.rate_per_day;
    doc.grace_period_days = data.grace_period_days ?? 0;
    if (data.max_fine_cap !== undefined) doc.max_fine_cap = data.max_fine_cap;
  } else {
    doc.flat_amount = data.flat_amount;
  }

  try {
    return await new model(doc).save();
  } catch (err) {
    if (err.code === 11000)
      throw httpError("A fine rule with this exact scope already exists.", 409);
    throw err;
  }
};

const getById = async (id) =>
  await model
    .findById(id)
    .populate("semester", "name short_name")
    .populate("department", "name short_name");

const getAll = async (includeDeleted = false) => {
  const filter = includeDeleted ? { is_deleted: true } : { is_deleted: false };
  return await model
    .find(filter)
    .populate("semester", "name short_name")
    .populate("department", "name short_name")
    .sort({ fine_type: 1, created_at: -1 });
};

const update = async (id, data) =>
  await model.findByIdAndUpdate(id, data, { new: true, runValidators: true });

const softDelete = async (id) =>
  await model.findByIdAndUpdate(
    id,
    { is_deleted: true, deleted_at: new Date() },
    { new: true },
  );
const restore = async (id) =>
  await model.findByIdAndUpdate(
    id,
    { is_deleted: false, deleted_at: null },
    { new: true },
  );
const hardDelete = async (id) => await model.findByIdAndDelete(id);

const resolve = async (userId, fine_type) => {
  const user = await User.findById(userId)
    .populate("student")
    .populate("staff");
  if (!user) throw httpError("User not found.", 404);
  if (!["OVERDUE", "LOST", "DAMAGED"].includes(fine_type))
    throw httpError("Invalid fine_type.", 400);

  let rule = null;

  if (user.role === "STUDENT" && user.student?.semester) {
    rule = await model.findOne({
      fine_type,
      role: "STUDENT",
      semester: user.student.semester,
      department: null,
      is_deleted: false,
    });
  } else if (user.role === "STAFF" && user.staff?.department) {
    rule = await model.findOne({
      fine_type,
      role: "STAFF",
      department: user.staff.department,
      semester: null,
      is_deleted: false,
    });
  }

  if (!rule) {
    rule = await model.findOne({
      fine_type,
      role: user.role,
      semester: null,
      department: null,
      is_deleted: false,
    });
  }

  if (!rule) {
    rule = await model.findOne({
      fine_type,
      role: null,
      semester: null,
      department: null,
      is_deleted: false,
    });
  }

  if (!rule)
    throw httpError(`No fine rule configured for type "${fine_type}".`, 404);

  return {
    rule,
    matched_by:
      rule.semester || rule.department
        ? "specific"
        : rule.role
          ? "role_default"
          : "universal",
    user: { _id: user._id, username: user.username, role: user.role },
  };
};

module.exports = {
  create,
  getById,
  getAll,
  update,
  softDelete,
  restore,
  hardDelete,
  resolve,
};
