const model = require("../models/device_model");

const add = async (obj) => await new model(obj).save();
const getById = async (id) => await model.findById(id);
const getAll = async () => await model.find();

const modify = async (id, obj) =>
  await model.findByIdAndUpdate(id, obj, {
    returnDocument: "after",
    runValidators: true,
  });

module.exports = {
  add,
  getById,
  modify,
  getAll,
};
