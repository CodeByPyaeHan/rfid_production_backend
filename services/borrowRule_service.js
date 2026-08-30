const model = require("../models/borrowRule_model");
const User = require("../models/user_model");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const create = async (data) => {
  const doc = {
    role: data.role,
    max_books: data.max_books,
    loan_period_days: data.loan_period_days,
    reserve_limit: data.reserve_limit,
    max_renewals: data.max_renewals,
    hold_period_days: data.hold_period_days,
  };
  if (data.role === "STUDENT" && data.semester) doc.semester = data.semester;
  if (data.role === "STAFF" && data.department)
    doc.department = data.department;

  try {
    return await new model(doc).save();
  } catch (err) {
    if (err.code === 11000)
      throw httpError("A rule with this exact scope already exists.", 409);
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
    .sort({ role: 1, created_at: -1 });
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

const resolve = async (userId) => {
  const user = await User.findById(userId)
    .populate("student")
    .populate("staff");
  if (!user) throw httpError("User not found.", 404);
  if (!["STUDENT", "STAFF", "GUEST"].includes(user.role))
    throw httpError(
      "Borrow rules only apply to STUDENT/STAFF/GUEST roles.",
      400,
    );

  let rule = null;
  if (user.role === "STUDENT" && user.student?.semester) {
    rule = await model.findOne({
      role: "STUDENT",
      semester: user.student.semester,
      department: null,
      is_deleted: false,
    });
  } else if (user.role === "STAFF" && user.staff?.department) {
    rule = await model.findOne({
      role: "STAFF",
      department: user.staff.department,
      semester: null,
      is_deleted: false,
    });
  }

  if (!rule)
    rule = await model.findOne({
      role: user.role,
      semester: null,
      department: null,
      is_deleted: false,
    });
  if (!rule)
    throw httpError(
      `No borrow rule configured for role "${user.role}". Please configure a default rule.`,
      404,
    );

  return {
    rule,
    matched_by: rule.semester || rule.department ? "specific" : "default",
    user: { _id: user._id, username: user.username, role: user.role },
  };
};

const getDefaultForRole = async (role) => {
  return await model.findOne({
    role,
    semester: null,
    department: null,
    is_deleted: false,
  });
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
  getDefaultForRole,
};
