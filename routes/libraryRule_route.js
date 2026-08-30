const express = require("express");
const router = express.Router();
const controller = require("../controllers/libraryRule_controller");
const { validateToken, validateManager, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { libraryRuleSchema } = require("../utils/schema");

router.get("/public", controller.getPublic);
router.get("/", validateToken, validateManager(), controller.getAll);
router.post(
  "/",
  validateToken,
  validateManager(),
  validateBody(libraryRuleSchema.create),
  controller.create,
);
router.put(
  "/:id",
  validateToken,
  validateManager(),
  validateBody(libraryRuleSchema.update),
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
