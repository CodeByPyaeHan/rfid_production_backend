const model = require("../models/semester_model");

function httpError(msg, status) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

const add = async (obj) => await new model(obj).save();

const getById = async (id) => await model.findById(id);

const getByShortName = async (short_name, session = null) => {
  let query = model.findOne({ short_name });
  if (session) {
    query = query.session(session);
  }
  return await query;
};

const getByOrder = async (order, degree_level) => {
  return await model.findOne({
    order,
    degree_level: degree_level,
    is_deleted: false,
  });
};

const getAll = async (includeDeleted = false) => {
  const filter = includeDeleted ? { is_deleted: true } : { is_deleted: false };

  return await model.find(filter).sort({
    degree_level: 1,
    order: 1,
  });
};

const create = async ({ name, short_name, order, degree_level }) => {
  const upperShortName = short_name.trim().toUpperCase();
  const exist = await getByShortName(upperShortName);

  if (exist) {
    throw httpError(
      exist.is_deleted
        ? `"${upperShortName}" belongs to a deleted semester. Restore it instead.`
        : `Semester "${upperShortName}" already exists.`,
      409,
    );
  }

  const parsedOrder = Number(order);
  const level = degree_level || "BACHELOR";

  const orderExist = await getByOrder(parsedOrder, level);

  if (orderExist) {
    throw httpError(
      `Order ${parsedOrder} is already used by "${orderExist.name}" in the ${level} track.`,
      409,
    );
  }

  return await add({
    name: name.trim(),
    short_name: upperShortName,
    order: parsedOrder,
    degree_level: level,
  });
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
  getByOrder,
  modify,
  softDelete,
  restore,
  drop,
  getAll,
  create,
};
