const semester_model = require("../models/semester_model");
const model = require("../models/staff_model");

const add = async (data, session) => {
  const staff = new model(data);
  await staff.save({ session });

  return staff;
};
const getById = async (id) => await model.findById(id);
const getAll = async () => await model.find();

const modify = async (id, obj) =>
  await model.findByIdAndUpdate(id, obj, {
    returnDocument: "after",
    runValidators: true,
  });
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
const drop = async (id) => await model.findByIdAndDelete(id);

const countByDepartment = async (departmentId) =>
  await model.countDocuments({ department: departmentId });
module.exports = {
  add,
  getById,
  modify,
  drop,
  getAll,
  updateByUserId,
  deleteByUserId,
  countByDepartment,
};
