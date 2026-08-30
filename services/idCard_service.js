const User = require("../models/user_model");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const getBulkCardData = async (userIds) => {
  const users = await User.find({ _id: { $in: userIds }, is_deleted: false })
    .populate({
      path: "student",
      populate: [
        { path: "semester", select: "name short_name" },
        { path: "major", select: "name short_name" },
      ],
    })
    .populate({
      path: "staff",
      populate: { path: "department", select: "name short_name" },
    });

  if (users.length === 0) throw httpError("No matching users found.", 404);

  return users.map((u) => {
    const base = {
      _id: u._id,
      name: u.name,
      username: u.username,
      role: u.role,
      profile_picture: u.profile_picture,
      nrc_number: u.nrc_number,
      address: u.address,
    };

    if (u.role === "STUDENT" && u.student) {
      return {
        ...base,
        major: u.student.major?.name ?? null,
        roll_number: u.student.roll_number,
        semester: u.student.semester?.name ?? null,
        father_name: u.student.father_name,
        national_reg_no: null,
      };
    }

    return {
      ...base,
      department: u.staff?.department?.name ?? null,
      designation: u.staff?.designation ?? null,
      national_reg_no: u.staff?.national_reg_no ?? null,
      father_name: null,
    };
  });
};

const getCardDataForUser = async (userId) => {
  const [data] = await getBulkCardData([userId]);
  if (!data) throw httpError("Card data not found.", 404);
  return data;
};

module.exports = { getBulkCardData, getCardDataForUser };
