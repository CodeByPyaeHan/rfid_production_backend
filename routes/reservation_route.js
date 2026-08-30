const express = require("express");
const router = express.Router();
const controller = require("../controllers/reservation_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { reservationSchema } = require("../utils/schema");

router.post(
  "/",
  validateToken,
  validateBody(reservationSchema.create),
  controller.create,
);
router.post(
  "/manual",
  validateToken,
  validateManager(),
  validateBody(reservationSchema.manualCreate),
  controller.manualCreate,
);
router.get("/my", validateToken, controller.getMy);
router.get("/queue", validateToken, validateManager(), controller.getQueue);
router.get(
  "/pending-count",
  validateToken,
  validateManager(),
  controller.getPendingCount,
);
router.get("/:id", validateToken, controller.getById);
router.post(
  "/:id/fulfill",
  validateToken,
  validateManager(),
  controller.fulfill,
);
router.post("/:id/cancel", validateToken, controller.cancel);
router.post(
  "/run-expiry",
  validateToken,
  validateRole("ADMIN"),
  controller.runExpiry,
);

module.exports = router;
