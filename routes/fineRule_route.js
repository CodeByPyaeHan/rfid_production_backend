// routes/fineRule_route.js — same shape
const express = require("express");
const router = express.Router();
const controller = require("../controllers/fineRule_controller");
const { validateToken, validateRole, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { fineRuleSchema } = require("../utils/schema");

router.get(
  "/",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  controller.getAll,
);
router.get(
  "/:id",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  controller.getById,
);
router.get(
  "/resolve/:userId",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  controller.resolve,
);
router.post(
  "/",
  validateToken,
  validateRole("ADMIN"),
  validateBody(fineRuleSchema.create),
  controller.create,
);
router.put(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  validateBody(fineRuleSchema.update),
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
