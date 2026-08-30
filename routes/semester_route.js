const express = require("express");
const router = express.Router();
const controller = require("../controllers/semester_controller");
const promotionController = require("../controllers/semesterPromotion_controller");

const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { semesterSchema } = require("../utils/schema");

router.get("/", validateToken, validateManager(), controller.getAll);
router.post(
  "/",
  validateToken,
  validateManager(),
  validateBody(semesterSchema.create),
  controller.create,
);
router.put(
  "/:id",
  validateToken,
  validateManager(),
  validateBody(semesterSchema.update),
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

router.get(
  "/:id/promotion-preview",
  validateToken,
  validateRole("ADMIN"),
  promotionController.preview,
);
router.post(
  "/:id/promote",
  validateToken,
  validateRole("ADMIN"),
  promotionController.execute,
);
module.exports = router;
