const express = require("express");
const router = express.Router();
const controller = require("../controllers/major_controller");
const { validateToken, validateManager, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { majorSchema } = require("../utils/schema");

router.get("/", validateToken, validateManager(), controller.getAll);
router.post(
  "/",
  validateToken,
  validateManager(),
  validateBody(majorSchema.create),
  controller.create,
);
router.put(
  "/:id",
  validateToken,
  validateManager(),
  validateBody(majorSchema.update),
  controller.update,
);
router.delete(
  "/soft/:id",
  validateToken,
  validateManager(),
  controller.softDelete,
);
router.patch(
  "/restore/:id",
  validateToken,
  validateManager(),
  controller.restore,
);
router.delete("/:id", validateToken, validateManager(), controller.hardDelete);

module.exports = router;
