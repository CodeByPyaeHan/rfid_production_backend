const express = require("express");
const router = express.Router();
const controller = require("../controllers/department_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { departmentSchema } = require("../utils/schema");

router.get("/", validateToken, validateManager(), controller.getAll);

router.post(
  "/",
  validateToken,
  validateRole("ADMIN"),
  validateBody(departmentSchema.create),
  controller.create,
);
router.put(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  validateBody(departmentSchema.update),
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
