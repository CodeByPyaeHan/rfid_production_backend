const model = require("../models/scanLog_model");

const add = async (obj) => await new model(obj).save();
const getById = async (id) => await model.findById(id);
const getAll = async () => await model.find().populate("device_id");

module.exports = {
  add,
  getById,
  getAll,
};
