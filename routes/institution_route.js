const express = require("express");
const router = express.Router();
const controller = require("../controllers/institution_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { institutionSchema } = require("../utils/schema");

router.get("/", validateToken, validateManager(), controller.getAll);
router.post(
  "/",
  validateToken,
  validateRole("ADMIN"),
  validateBody(institutionSchema.create),
  controller.create,
);
router.put(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  validateBody(institutionSchema.update),
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
