const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const ShelfService = require("../services/shelf_service");

const getAll = asyncHandler(async (req, res) => {
  const includeDeleted = req.query.includeDeleted === "true";
  const result = await ShelfService.getAll({ includeDeleted });
  return Msg(res, "Shelves fetched.", result);
});

const create = asyncHandler(async (req, res) => {
  const result = await ShelfService.create(req.body);
  const msg = result.restored
    ? `Shelf "${result.shelf.shelf_code}" restored.`
    : `Shelf "${result.shelf.shelf_code}" created.`;
  return Msg(res, msg, result.shelf, 201);
});

const update = asyncHandler(async (req, res) => {
  const result = await ShelfService.update(req.params.id, req.body);
  return Msg(res, "Shelf updated.", result);
});

const drop = asyncHandler(async (req, res) => {
  const result = await ShelfService.drop(req.params.id);
  return Msg(res, `Shelf "${result.shelf_code}" deleted.`, result);
});
const restore = asyncHandler(async (req, res) => {
  const result = await ShelfService.restore(req.params.id);
  return Msg(res, `Shelf "${result.shelf_code}" restored.`, result);
});

const hardDelete = asyncHandler(async (req, res) => {
  const result = await ShelfService.hardDelete(req.params.id);
  return Msg(res, `Shelf ${result.shelf_code} permanently deleted.`, result);
});

module.exports = {
  getAll,
  create,
  update,
  drop,
  restore,
  hardDelete,
};
