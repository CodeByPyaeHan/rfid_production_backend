const express = require("express");
const router = express.Router();
const budgetController = require("../controllers/budget_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { budgetSchema } = require("../utils/schema");

router.get("/", validateToken, validateManager(), budgetController.getAll);
router.get("/:id", validateToken, validateManager(), budgetController.getById);
router.post(
  "/",
  validateToken,
  validateManager(),
  validateBody(budgetSchema.create),
  budgetController.create,
);
router.put(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  validateBody(budgetSchema.update),
  budgetController.update,
);
router.delete(
  "/soft/:id",
  validateToken,
  validateRole("ADMIN"),
  budgetController.softDelete,
);
router.patch(
  "/restore/:id",
  validateToken,
  validateRole("ADMIN"),
  budgetController.restore,
);
router.delete(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  budgetController.hardDelete,
);

module.exports = router;
