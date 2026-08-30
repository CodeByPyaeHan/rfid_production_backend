const model = require("../models/department_model");
const staffService = require("../services/staff_service");

const add = async (obj) => await new model(obj).save();

const getById = async (id) => await model.findById(id);
const getByShortName = async (short_name, session = null) => {
  let query = model.findOne({ short_name });
  if (session) {
    query = query.session(session);
  }
  return await query;
};
const getAll = async (includeDeleted = false) => {
  const filter = includeDeleted ? { is_deleted: true } : { is_deleted: false };
  const departments = await model.find(filter).sort({ name: 1 });
  return Promise.all(
    departments.map(async (d) => ({
      ...d.toObject(),
      staff_count: await staffService.countByDepartment(d._id),
    })),
  );
};

const modify = async (id, obj) =>
  await model.findByIdAndUpdate(id, obj, {
    returnDocument: "after",
    runValidators: true,
  });

const softDelete = async (id) =>
  await model.findByIdAndUpdate(
    id,
    { is_deleted: true, deleted_at: new Date() },
    { returnDocument: "after" },
  );

const restore = async (id) =>
  await model.findByIdAndUpdate(
    id,
    { is_deleted: false, deleted_at: null },
    { returnDocument: "after" },
  );

const drop = async (id) => await model.findByIdAndDelete(id);

module.exports = {
  add,
  getById,
  getByShortName,
  getAll,
  modify,
  softDelete,
  restore,
  drop,
};
