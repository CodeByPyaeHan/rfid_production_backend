const { withTransaction } = require("../services/transaction_service");
const asyncHandler = require("express-async-handler");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const userService = require("../services/user_service");
const studentService = require("../services/student_service");
const staffService = require("../services/staff_service");
const semesterService = require("../services/semester_service");
const departmentService = require("../services/department_service");
const majorService = require("../services/major_service");
const { Msg, RDB, TOKEN, ENCODER } = require(`../${process.env.FACADE_PATH}`);
const { logAudit } = require("../utils/audit");
const { userImportRowSchema } = require("../utils/schema");
const { getIO } = require("../sockets/socketServer");

//Models
const Semester = require("../models/semester_model");
const Department = require("../models/department_model");
const Major = require("../models/major_model");

function httpError(msg, status) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

// Admin and Librarian

function emitUserCountChanged() {
  try {
    getIO().to("role:ADMIN").emit("dashboard:user-count-changed");
  } catch (err) {
    console.error("Socket emit failed:", err.message);
  }
}

const RFIDLogin = asyncHandler(async (req, res, next) => {
  let User = await userService.getByUsername(req.body.username, false);
  if (!User) throw httpError("No User with that username.", 404);
  if (!User.password) {
    let token = TOKEN.makeToken({ id: User._id });
    const { password, ...user } = User.toObject();
    await RDB.set(User._id, user);
    await logAudit(req, {
      action: "USER_LOGIN_RFID",
      resource: `user:${User._id}`,
      severity: "INFO",
    });
    Msg(res, "Login Success", token);
  } else {
    Msg(res, "Need to login", User.username);
  }
});

const getAllAuthUser = asyncHandler(async (req, res) => {
  const id = req.userId;
  const includeDeleted = req.query.includeDeleted === "true";
  const user = await userService.getAuthUser(id, includeDeleted);
  Msg(res, "All Authorizer.", user);
});

const createAuthUser = asyncHandler(async (req, res) => {
  const user = await userService.getByUsername(req.body.username);
  if (user) throw httpError("Username already exists.", 409);

  req.body.password = ENCODER.encode(req.body.password);
  const newUser = await userService.add(req.body);
  await logAudit(req, {
    action: "AUTHORIZER_CREATED",
    resource: `user:${newUser._id}`,
    severity: "WARNING",
  });
  const { password, ...result } = newUser.toObject();
  Msg(res, "Authorizer created.", result, 201);
  emitUserCountChanged();
});

const editAuthUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  if (!user) throw httpError("Authorizer Not Found!", 404); // ★ status

  const newUser = await userService.modify(user._id, req.body);
  await logAudit(req, {
    action: "AUTHORIZER_UPDATED",
    resource: `user:${user._id}`,
    severity: "WARNING",
  });
  const { password, ...newData } = newUser.toObject();
  Msg(res, "Authorizer updated.", newData);
  emitUserCountChanged();
});

const deleteAuthUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  if (!user) throw httpError("Authorizer Not Found!", 404);
  if (user.is_deleted) throw httpError("Authorizer already deleted.", 400);
  await userService.softDelete(user._id);
  await logAudit(req, {
    action: "AUTHORIZER_DELETED",
    resource: `user:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, `Authorizer "${user.username}" deleted.`);
  emitUserCountChanged();
});

const restoreAuthUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  if (!user) throw httpError("Authorizer Not Found!", 404);
  if (!user.is_deleted) throw httpError("Authorizer is already active.", 400);

  await userService.restore(user._id);
  await logAudit(req, {
    action: "USER_RESTORED",
    resource: `user:${user._id}`,
  });

  Msg(res, `Authorizer "${user.username}" restored.`);
  emitUserCountChanged();
});

const forceDropAuthUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  if (!user) throw httpError("Authorizer Not Found!", 404);
  if (!user.is_deleted)
    throw httpError("Authorizer must be soft-deleted first.", 400);

  await userService.hardDelete(user._id);
  await logAudit(req, {
    action: "USER_PERMANENTLY_DELETED",
    resource: `user:${req.params.id}`,
    severity: "CRITICAL",
  });

  Msg(res, `Authorizer "${user.username}" permanently deleted.`);
  emitUserCountChanged();
});

const resetAuthPassword = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  if (!user) throw httpError("Authorizer Not Found!", 404);

  const hashed = ENCODER.encode(req.body.newPassword);
  await userService.setPassword(req.params.id, hashed);
  await logAudit(req, {
    action: "PASSWORD_RESET_BY_ADMIN",
    resource: `user:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(res, `Password reset for "${user.username}".`);
  emitUserCountChanged();
});

// Student and Staff
const getAll = asyncHandler(async (req, res, next) => {
  const result = await userService.getAll(req.query);
  Msg(res, "Users retrieved successfully.", result);
});

const createUser = asyncHandler(async (req, res) => {
  const result = await withTransaction(async (session) => {
    let departmentId = null;
    let majorDoc = null;
    let semesterDoc = null;

    if (req.body.role === "STAFF") {
      const department = await departmentService.getById(req.body.department);
      if (!department || department.is_deleted)
        throw httpError("Department not found.", 400);
      departmentId = department._id;
    } else {
      semesterDoc = await semesterService.getById(req.body.semester);
      if (!semesterDoc || semesterDoc.is_deleted)
        throw httpError("Semester not found.", 400);

      majorDoc = await majorService.getById(req.body.major);
      if (!majorDoc || majorDoc.is_deleted)
        throw httpError("Major not found.", 400);
    }

    const username = await userService.generateUniqueUsername(
      req.body.name,
      req.body.role,
      userService.isStudentLike(req.body.role)
        ? { rollNumber: req.body.roll_number }
        : { departmentId },
    );

    const userData = { username, name: req.body.name, role: req.body.role };
    if (req.body.email) userData.email = req.body.email;
    if (req.body.phone) userData.phone = req.body.phone;
    if (req.body.status) userData.status = req.body.status;
    if (req.body.nrc_number) userData.nrc_number = req.body.nrc_number;
    if (req.body.address) userData.address = req.body.address;

    const newUser = await userService.add(userData, session);

    if (userService.isStudentLike(req.body.role)) {
      await studentService.add(
        {
          user_id: newUser._id,
          roll_number: req.body.roll_number,
          major: majorDoc._id,
          semester: semesterDoc._id,
          degree_level: req.body.degree_level || "BACHELOR",
          father_name: req.body.father_name || undefined,
        },
        session,
      );
    } else {
      await staffService.add(
        {
          user_id: newUser._id,
          department: departmentId,
          designation: req.body.designation,
          national_reg_no: req.body.national_reg_no || undefined,
        },
        session,
      );
    }
    return newUser;
  });
  await logAudit(req, {
    action: "USER_CREATED",
    resource: `user:${result._id}`,
    severity: "INFO",
  });
  Msg(
    res,
    `User created — username: @${result.username.replace("@", "")}`,
    result,
    201,
  );
  emitUserCountChanged();
});

const editUser = asyncHandler(async (req, res) => {
  const result = await withTransaction(async (session) => {
    const { id } = req.params;
    const user = await userService.getById(id);
    if (!user) throw httpError("User not found.", 404);

    const userData = {};
    if (req.body.name !== undefined) userData.name = req.body.name;
    if (req.body.email !== undefined) userData.email = req.body.email;
    if (req.body.phone !== undefined) userData.phone = req.body.phone;
    if (req.body.status !== undefined) userData.status = req.body.status;
    if (req.body.nrc_number !== undefined)
      userData.nrc_number = req.body.nrc_number;
    if (req.body.address !== undefined) userData.address = req.body.address;

    const updatedUser = await userService.update(id, userData, session);

    if (userService.isStudentLike(req.body.role)) {
      const studentData = {};
      if (req.body.major !== undefined) {
        const majorDoc = await majorService.getById(req.body.major);
        if (!majorDoc || majorDoc.is_deleted)
          throw httpError("Major not found.", 400);
        studentData.major = majorDoc._id;
      }
      if (req.body.semester !== undefined) {
        const semester = await semesterService.getById(req.body.semester);
        if (!semester || semester.is_deleted)
          throw httpError("Semester not found.", 400);
        studentData.semester = semester._id;
      }
      if (req.body.degree_level !== undefined)
        studentData.degree_level = req.body.degree_level;
      if (req.body.father_name !== undefined)
        studentData.father_name = req.body.father_name;
      if (req.body.roll_number !== undefined)
        studentData.roll_number = req.body.roll_number;

      const wasInactive = user.status === "INACTIVE";
      const staysInactiveOrGoingInactive =
        (req.body.status ?? user.status) === "INACTIVE";
      if (
        wasInactive &&
        staysInactiveOrGoingInactive &&
        (req.body.roll_number !== undefined || req.body.name !== undefined)
      ) {
        const newUsername = await userService.generateUniqueUsername(
          req.body.name ?? user.name,
          req.body.role,
          {
            rollNumber:
              req.body.roll_number ??
              (await studentService.getByUserId(id)).roll_number,
          },
        );
        if (newUsername !== user.username)
          await userService.update(id, { username: newUsername }, session);
      }

      if (Object.keys(studentData).length > 0)
        await studentService.updateByUserId(id, studentData, session);
    } else if (req.body.role === "STAFF") {
      const staffData = {};
      if (req.body.designation !== undefined)
        staffData.designation = req.body.designation;
      if (req.body.national_reg_no !== undefined)
        staffData.national_reg_no = req.body.national_reg_no;
      if (req.body.department !== undefined) {
        const department = await departmentService.getById(req.body.department);
        if (!department || department.is_deleted)
          throw httpError("Department not found.", 400);
        staffData.department = department._id;
      }
      if (Object.keys(staffData).length > 0)
        await staffService.updateByUserId(id, staffData, session);
    }
    return updatedUser;
  });
  await logAudit(req, {
    action: "USER_UPDATED",
    resource: `user:${req.params.id}`,
    severity: "INFO",
  });
  Msg(res, "User updated successfully.", result);
  emitUserCountChanged();
});

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getByIdPopulated(req.params.id);
  if (!user) throw httpError("User not found.", 404);
  Msg(res, "User fetched.", user);
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  if (!user) throw httpError("User not found.", 404); // ★ status

  await userService.softDelete(user._id);
  await logAudit(req, {
    action: "USER_DELETED",
    resource: `user:${user._id}`,
    severity: "WARNING",
  });
  Msg(res, "User deleted successfully.");
  emitUserCountChanged();
});

const restoreUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  if (!user) throw httpError("User not found.", 404); // ★ status
  if (!user.is_deleted) throw httpError("User is already active.", 400); // ★ status

  await userService.restore(user._id);
  await logAudit(req, {
    action: "USER_RESTORED",
    resource: `user:${user._id}`,
    severity: "INFO",
  });
  Msg(res, "User restored successfully.");
  emitUserCountChanged();
});

const forceDeleteUser = asyncHandler(async (req, res) => {
  await withTransaction(async (session) => {
    const user = await userService.getById(req.params.id);
    if (!user) throw httpError("User not found.", 404); // ★ status

    if (user.role === "STUDENT")
      await studentService.deleteByUserId(user._id, session);
    if (user.role === "STAFF")
      await staffService.deleteByUserId(user._id, session);

    await userService.hardDelete(user._id, session);
  });
  await logAudit(req, {
    action: "USER_PERMANENTLY_DELETED",
    resource: `user:${req.params.id}`,
    severity: "CRITICAL",
  });
  Msg(res, "User permanently deleted.");
  emitUserCountChanged();
});

const importUsers = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError("Excel file is required.", 400);

  const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const [allSemesters, allDepartments, allMajors] = await Promise.all([
    Semester.find({ is_deleted: false }),
    Department.find({ is_deleted: false }),
    Major.find({ is_deleted: false }),
  ]);
  const semesterMap = new Map(
    allSemesters.map((s) => [s.short_name.toUpperCase(), s]),
  );
  const departmentMap = new Map(
    allDepartments.map((d) => [d.short_name.toUpperCase(), d]),
  );
  const majorMap = new Map();
  allMajors.forEach((m) => {
    majorMap.set(m.name.toLowerCase(), m);
    majorMap.set(m.short_name.toUpperCase(), m);
  });

  const failed = [];
  let success = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const rowName = row["Name"] || `Row ${rowNum}`;

    try {
      const rollNumberCell = row["Roll Number"]
        ? String(row["Roll Number"]).trim()
        : "";
      const departmentCell = row["Department"]
        ? String(row["Department"]).trim()
        : "";

      if (rollNumberCell && departmentCell) {
        throw new Error(
          `Row has both "Roll Number" and "Department" filled — ambiguous role. Provide only one.`,
        );
      }

      const role = rollNumberCell ? "STUDENT" : "STAFF";

      const payload = {
        role,
        name: String(row["Name"] || "").trim(),
        email: row["Email"] ? String(row["Email"]).trim() : undefined,
        phone: row["Phone"] ? String(row["Phone"]).trim() : undefined,
        nrc_number: row["NRC Number"]
          ? String(row["NRC Number"]).trim()
          : undefined,
        address: row["Address"] ? String(row["Address"]).trim() : undefined,
        roll_number: rollNumberCell || undefined,
        major: row["Major"] ? String(row["Major"]).trim() : undefined,
        semester: row["Semester"] ? String(row["Semester"]).trim() : undefined,
        father_name: row["Father Name"]
          ? String(row["Father Name"]).trim()
          : undefined,
        department: departmentCell || undefined,
        designation: row["Designation"]
          ? String(row["Designation"]).trim()
          : undefined,
        national_reg_no: row["National Registration No"]
          ? String(row["National Registration No"]).trim()
          : undefined,
      };

      const { error } = userImportRowSchema.validate(payload);
      if (error) throw new Error(error.details[0].message);

      await withTransaction(async (session) => {
        let majorDoc = null;
        let semesterDoc = null;
        let departmentDoc = null;

        if (role === "STUDENT") {
          semesterDoc = semesterMap.get((payload.semester || "").toUpperCase());
          if (!semesterDoc)
            throw new Error(`Semester "${payload.semester}" not found.`);

          majorDoc =
            majorMap.get((payload.major || "").toLowerCase()) ||
            majorMap.get((payload.major || "").toUpperCase());
          if (!majorDoc) throw new Error(`Major "${payload.major}" not found.`);
        } else {
          departmentDoc = departmentMap.get(
            (payload.department || "").toUpperCase(),
          );
          if (!departmentDoc)
            throw new Error(`Department "${payload.department}" not found.`);
        }

        const username = await userService.generateUniqueUsername(
          payload.name,
          role,
          role === "STUDENT"
            ? { rollNumber: payload.roll_number }
            : { departmentId: departmentDoc?._id },
        );

        const userData = { username, name: payload.name, role };
        if (payload.email) userData.email = payload.email;
        if (payload.phone) userData.phone = payload.phone;
        if (payload.nrc_number) userData.nrc_number = payload.nrc_number;
        if (payload.address) userData.address = payload.address;

        const newUser = await userService.add(userData, session);

        if (role === "STUDENT") {
          await studentService.add(
            {
              user_id: newUser._id,
              roll_number: payload.roll_number,
              major: majorDoc._id,
              semester: semesterDoc._id,
              father_name: payload.father_name || undefined,
            },
            session,
          );
        } else {
          await staffService.add(
            {
              user_id: newUser._id,
              department: departmentDoc._id,
              designation: payload.designation,
              national_reg_no: payload.national_reg_no || undefined,
            },
            session,
          );
        }
      });

      success++;
    } catch (err) {
      let errorMessage = err.message;

      if (err.code === 11000 && err.keyPattern) {
        const duplicateField = Object.keys(err.keyPattern)[0];
        const duplicateValue = err.keyValue ? err.keyValue[duplicateField] : "";

        let fieldName = duplicateField;
        if (duplicateField === "email") fieldName = "Email";
        if (duplicateField === "roll_number") fieldName = "Roll Number";
        if (duplicateField === "nrc_number") fieldName = "NRC Number";
        if (duplicateField === "phone") fieldName = "Phone Number";
        if (duplicateField === "username") fieldName = "Username";

        errorMessage = `The ${fieldName} "${duplicateValue}" is already registered in the system.`;
      }

      failed.push({ row: rowNum, name: rowName, error: errorMessage });
    }
  }

  Msg(res, `Import completed — ${success}/${rows.length} succeeded.`, {
    total: rows.length,
    success,
    failedCount: failed.length,
    failed,
  });
  emitUserCountChanged();
});

const searchForResolve = asyncHandler(async (req, res) => {
  Msg(
    res,
    "Users found.",
    await userService.searchForResolve(req.query.search),
  );
});

const forceResetPassword = asyncHandler(async (req, res) => {
  const result = await userService.forceResetPassword(req.params.id);
  await logAudit(req, {
    action: "USER_PASSWORD_FORCE_RESET",
    resource: `user:${req.params.id}`,
    severity: "WARNING",
  });
  Msg(
    res,
    `Password reset to default for "${result.username}". Advise the user to change it after logging in.`,
    result,
  );
});

const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError("No image file provided.", 400);
  const user = await userService.getById(req.params.id);
  if (!user || user.is_deleted) throw httpError("User not found.", 404);

  if (user.profile_picture) {
    const oldPath = path.join(
      __dirname,
      "..",
      user.profile_picture.replace(/^\/uploads\//, "uploads/"),
    );
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  const url = `/uploads/profiles/${req.file.filename}`;
  const updated = await userService.update(req.params.id, {
    profile_picture: url,
  });
  Msg(res, "Profile picture uploaded.", updated);
});

module.exports = {
  getAllAuthUser,
  createAuthUser,
  editAuthUser,
  deleteAuthUser,
  restoreAuthUser,
  forceDropAuthUser,

  resetAuthPassword,
  RFIDLogin,
  createUser,
  editUser,
  getUser,
  deleteUser,
  restoreUser,
  forceDeleteUser,
  getAll,
  importUsers,
  searchForResolve,
  forceResetPassword,
  uploadProfilePicture,
};
