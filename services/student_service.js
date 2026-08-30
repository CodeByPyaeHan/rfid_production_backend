const model = require("../models/student_model");

const getByRollNumber = async (roll_number) =>
  await model.findOne({ roll_number });

const countBySemester = async (semesterId) =>
  await model.countDocuments({ semester: semesterId });

const add = async (data, session) => {
  const student = new model(data);
  await student.save({ session });
  return student;
};
const getById = async (id) => await model.findById(id);
const getAll = async () => await model.find();
const updateByUserId = async (userId, data, session) => {
  return await model.findOneAndUpdate({ user_id: userId }, data, {
    returnDocument: "after",
    runValidators: true,
    session,
  });
};
const deleteByUserId = async (userId, session) => {
  return model.findOneAndDelete({ user_id: userId }, { session });
};
const modify = async (id, obj) =>
  await model.findByIdAndUpdate(id, obj, {
    returnDocument: "after",
    runValidators: true,
  });

const drop = async (id) => await model.findByIdAndDelete(id);

module.exports = {
  add,
  getById,
  modify,
  drop,
  getAll,
  updateByUserId,
  deleteByUserId,
  getByRollNumber,
  countBySemester,
};
