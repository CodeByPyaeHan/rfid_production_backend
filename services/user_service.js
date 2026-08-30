const model = require("../models/user_model");
const fs = require("fs");
const path = require("path");
const Student = require("../models/student_model");
const Staff = require("../models/staff_model");
const Department = require("../models/department_model");
const DEFAULT_RESET_PASSWORD = process.env.DEFAULT_RESET_PASSWORD || "123456";

const getByEmail = async (email) => await model.findOne({ email });

const setPassword = async (id, newPassword) => {
  const user = await model.findById(id);
  if (!user) return null;
  user.password = newPassword;
  await user.save();
  return user;
};

const getByIdPopulated = async (id) =>
  await model
    .findById(id)
    .populate({
      path: "student",
      populate: { path: "semester", select: "name short_name" },
    })
    .populate({
      path: "staff",
      populate: { path: "department", select: "name short_name" },
    })
    .select("-password");

const add = async (data, session) => {
  const user = new model(data);
  await user.save({ session });

  return user;
};

const getById = async (id) => await model.findById(id);

const getAuthUser = async (currentUserId, includeDeleted = false) => {
  const filePath = path.join(__dirname, "../test/data/users.json");
  let migratedUsernames = [];
  if (fs.existsSync(filePath)) {
    const migratedUsers = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    migratedUsernames = migratedUsers.map((u) => u.username);
  }
  const filter = {
    _id: { $ne: currentUserId },
    role: { $in: ["ADMIN", "LIBRARIAN"] },
    is_deleted: includeDeleted,
    username: { $nin: migratedUsernames },
  };
  return await model.find(filter).select("-password");
};

const getByUsername = async (username, is_deleted = undefined) => {
  const query = { username };

  if (is_deleted !== undefined) {
    query.is_deleted = is_deleted;
  }

  return await model.findOne(query);
};

const getByRollno = async (rollno) => await model.findOne({ rollno });
const getByName = async (name) => await model.find({ name });

const paginate = async (pageNumber) => {
  const limit = Number(process.env.USER_LIMIT);
  const pageNum = Number(pageNumber);
  const reqPage = pageNum == 1 ? 0 : pageNum - 1;
  const skipCount = reqPage * limit;
  const [users, total] = await Promise.all([
    model
      .find({ role: { $ne: "ADMIN" } })
      .skip(skipCount)
      .limit(limit),
    model.countDocuments({ role: { $ne: "ADMIN" } }),
  ]);

  return {
    users,
    totalPages: Math.ceil(total / limit),
    currentPage: pageNum,
  };
};

const update = async (id, data, session) => {
  return await model
    .findByIdAndUpdate(id, data, {
      returnDocument: "after",
      runValidators: true,
      session,
    })
    .select("-password");
};

const softDelete = async (id) => {
  return await model.findByIdAndUpdate(
    id,
    {
      is_deleted: true,
      deleted_at: new Date(),
    },
    {
      returnDocument: "after",
    },
  );
};

const restore = async (id, session) => {
  return await model.findByIdAndUpdate(
    id,
    {
      is_deleted: false,
      deleted_at: null,
    },
    {
      returnDocument: "after",
      session,
    },
  );
};

const hardDelete = async (id, session) => {
  return model.findByIdAndDelete(id, { session });
};

const modify = async (id, obj) =>
  await model.findByIdAndUpdate(id, obj, {
    returnDocument: "after",
    runValidators: true,
  });

const findQuery = async (pageNumber, filter) => {
  const limit = Number(process.env.USER_LIMIT);
  const pageNum = Number(pageNumber);
  const reqPage = pageNum == 1 ? 0 : pageNum - 1;
  const skipCount = reqPage * limit;
  const [users, total] = await Promise.all([
    model.find(filter).skip(skipCount).limit(limit),
  ]);

  return {
    users,
    totalPages: Math.ceil(total / limit),
    currentPage: pageNum,
  };
};

const getAll = async (query) => {
  const {
    page = 1,
    role,
    status,
    search,
    includeDeleted,
    semester,
    department,
  } = query;

  const limit = Number(process.env.USER_LIMIT) || 10;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const filter =
    includeDeleted === "true" || includeDeleted === true
      ? { is_deleted: true }
      : { is_deleted: false };

  if (role) filter.role = role;
  if (status) filter.status = status;

  if (search) {
    filter.$or = [
      { username: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (semester) {
    const studentMatches = await Student.find({ semester }).select("user_id");
    const semesterUserIds = studentMatches.map((s) => s.user_id);

    filter._id = filter._id
      ? {
          $in: filter._id.$in.filter((id) =>
            semesterUserIds.some((sid) => sid.equals(id)),
          ),
        }
      : { $in: semesterUserIds };
  }

  if (department) {
    const staffMatches = await Staff.find({ department }).select("user_id");
    const departmentUserIds = staffMatches.map((s) => s.user_id);

    filter._id = filter._id
      ? {
          $in: filter._id.$in.filter((id) =>
            departmentUserIds.some((sid) => sid.equals(id)),
          ),
        }
      : { $in: departmentUserIds };
  }

  const [users, total] = await Promise.all([
    model
      .find(filter)
      .populate(STUDENT_POPULATE)
      .populate(STAFF_POPULATE)
      .select("-password")
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 }),
    model.countDocuments(filter),
  ]);

  return {
    users,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
      hasNext: currentPage < Math.ceil(total / limit),
      hasPrev: currentPage > 1,
    },
  };
};

const searchForResolve = async (search) => {
  if (!search || search.trim().length < 2) return [];
  const regex = new RegExp(search.trim(), "i");

  const students = await Student.find({ roll_number: regex }).select(
    "user_id roll_number",
  );
  const staffs = await Staff.find({ designation: regex }).select(
    "user_id designation",
  );
  const rollUserIds = students.map((s) => s.user_id);
  const staffUserIds = staffs.map((s) => s.user_id);

  const users = await model
    .find({
      is_deleted: false,
      role: { $in: ["STUDENT", "STAFF"] },
      $or: [
        { name: regex },
        { username: regex },
        { _id: { $in: [...rollUserIds, ...staffUserIds] } },
      ],
    })
    .select("username name role")
    .limit(10);

  const studentMap = Object.fromEntries(
    students.map((s) => [s.user_id.toString(), s.roll_number]),
  );

  return users.map((u) => ({
    _id: u._id,
    username: u.username,
    name: u.name,
    role: u.role,
    roll_number: studentMap[u._id.toString()] ?? null,
  }));
};

async function generateUsername(name, role, extra = {}) {
  const cleanName = String(name)
    .trim()
    .replace(/^Mg\s+/i, "")
    .replace(/^Ma\s+/i, "")
    .replace(/^Dr\.\s*/i, "")
    .replace(/^Dr\s+/i, "")
    .replace(/^U\s+/i, "")
    .replace(/^Daw\s+/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();

  if (role === "STUDENT") {
    const digits = String(extra.rollNumber || "").match(/\d+/)?.[0] || "";
    return `@${cleanName}${digits}`;
  }

  if (role === "STAFF") {
    const dept = await Department.findById(extra.departmentId);
    const deptSlug = (dept?.short_name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (dept?.department_code) {
      return `@${cleanName}_${deptSlug}_${dept.department_code.toLowerCase()}`;
    }
    return `@${cleanName}_${deptSlug}`;
  }

  return `@${cleanName}`;
}

async function generateUniqueUsername(name, role, extra = {}) {
  const base = await generateUsername(name, role, extra);
  let candidate = base;
  let suffix = 2;
  while (await model.findOne({ username: candidate })) {
    candidate = `${base}${suffix}`;
    suffix++;
  }
  return candidate;
}

function isStudentLike(role) {
  return role === "STUDENT";
}

const forceResetPassword = async (id) => {
  const user = await model.findById(id).select("+password");
  if (!user || user.is_deleted) throw httpError("User not found.", 404);
  const { ENCODER } = require(`../${process.env.FACADE_PATH}`);

  user.password = ENCODER.encode(DEFAULT_RESET_PASSWORD);

  await user.save();
  return { username: user.username };
};

const STUDENT_POPULATE = {
  path: "student",
  populate: [
    { path: "semester", select: "name short_name" },
    { path: "major", select: "name short_name" },
  ],
};

const STAFF_POPULATE = {
  path: "staff",
  populate: { path: "department", select: "name short_name" },
};

module.exports = {
  getAuthUser,
  add,
  getById,
  getByUsername,
  getByEmail,
  getByName,
  getByRollno,
  getByIdPopulated,
  setPassword,
  modify,
  update,
  softDelete,
  restore,
  hardDelete,
  getAll,
  searchForResolve,
  generateUsername,
  generateUniqueUsername,
  isStudentLike,
  forceResetPassword,
  STUDENT_POPULATE,
  STAFF_POPULATE,
};
