const Semester = require("../models/semester_model");
const Student = require("../models/student_model");
const User = require("../models/user_model");
const { withTransaction } = require("./transaction_service");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const previewPromotion = async (fromSemesterId) => {
  const fromSemester = await Semester.findOne({
    _id: fromSemesterId,
    is_deleted: false,
  });
  if (!fromSemester) throw httpError("Semester not found.", 404);

  const studentCount = await Student.countDocuments({
    semester: fromSemesterId,
  });

  const nextSemester = await Semester.findOne({
    order: { $gt: fromSemester.order },
    degree_level: fromSemester.degree_level,
    is_deleted: false,
  }).sort({ order: 1 });

  return {
    from_semester: {
      _id: fromSemester._id,
      name: fromSemester.name,
      order: fromSemester.order,
      degree_level: fromSemester.degree_level,
    },
    to_semester: nextSemester
      ? {
          _id: nextSemester._id,
          name: nextSemester.name,
          order: nextSemester.order,
        }
      : null,
    action: nextSemester ? "PROMOTE" : "GRADUATE",
    affected_student_count: studentCount,
  };
};

const executePromotion = async (fromSemesterId) => {
  return await withTransaction(async (session) => {
    const fromSemester = await Semester.findOne({
      _id: fromSemesterId,
      is_deleted: false,
    }).session(session);
    if (!fromSemester) throw httpError("Semester not found.", 404);

    const nextSemester = await Semester.findOne({
      order: { $gt: fromSemester.order },
      degree_level: fromSemester.degree_level,
      is_deleted: false,
    })
      .sort({ order: 1 })
      .session(session);

    const students = await Student.find({ semester: fromSemesterId })
      .session(session)
      .select("user_id");
    if (students.length === 0)
      throw httpError("No students in this semester to promote.", 400);

    if (nextSemester) {
      await Student.updateMany(
        { semester: fromSemesterId },
        { $set: { semester: nextSemester._id } },
        { session },
      );
      return {
        action: "PROMOTE",
        from: fromSemester.name,
        to: nextSemester.name,
        affected: students.length,
      };
    }

    const userIds = students.map((s) => s.user_id);
    await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { status: "GRADUATED" } },
      { session },
    );

    await Student.updateMany(
      { semester: fromSemesterId },
      { $set: { semester: null } },
      { session },
    );

    return {
      action: "GRADUATE",
      from: fromSemester.name,
      to: null,
      affected: students.length,
    };
  });
};

module.exports = { previewPromotion, executePromotion };
