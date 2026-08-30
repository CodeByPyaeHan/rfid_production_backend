const express = require("express");
const router = express.Router();
const controller = require("../controllers/borrowRule_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { borrowRuleSchema } = require("../utils/schema");

router.get("/", validateToken, validateManager(), controller.getAll);
router.get("/:id", validateToken, validateManager(), controller.getById);
router.get(
  "/resolve/:userId",
  validateToken,
  validateManager(),
  controller.resolve,
);
router.post(
  "/",
  validateToken,
  validateRole("ADMIN"),
  validateBody(borrowRuleSchema.create),
  controller.create,
);
router.put(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  validateBody(borrowRuleSchema.update),
  controller.update,
);
router.delete(
  "/soft/:id",
  validateToken,
  validateRole("ADMIN"),
  controller.softDelete,
);
router.patch(
  "/restore/:id",
  validateToken,
  validateRole("ADMIN"),
  controller.restore,
);
router.delete(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  controller.hardDelete,
);

module.exports = router;
