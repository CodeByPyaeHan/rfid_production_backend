const express = require("express");
const router = express.Router();
const ShelfController = require("../controllers/shelf_controller");
const { shelfSchema } = require("../utils/schema");
const { validateBody } = require(`../${process.env.FACADE_PATH}`);

router.get("/", ShelfController.getAll);
router.post("/", validateBody(shelfSchema.create), ShelfController.create);
router.put("/:id", validateBody(shelfSchema.update), ShelfController.update);
router.delete("/:id", ShelfController.drop);
router.patch("/:id/restore", ShelfController.restore);
router.delete("/:id/permanent", ShelfController.hardDelete);

module.exports = router;
