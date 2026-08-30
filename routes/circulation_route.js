const express = require("express");
const router = express.Router();
const controller = require("../controllers/circulation_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { circulationSchema, guestCheckoutSchema } = require("../utils/schema");

router.get("/my", validateToken, controller.getMyLoans);
router.get("/my-dashboard", validateToken, controller.getMyDashboard);
router.get(
  "/my-monthly-activity",
  validateToken,
  controller.getMyMonthlyActivity,
);

router.post(
  "/checkout",
  validateToken,
  validateManager(),
  validateBody(circulationSchema.checkout),
  controller.checkout,
);

router.post(
  "/rfid-checkout",
  validateBody(circulationSchema.rfidCheckout),
  controller.rfidCheckout,
);

router.get(
  "/lookup/students",
  validateToken,
  validateManager(),
  controller.lookupStudents,
);
router.get(
  "/lookup/students/:userId",
  validateToken,
  validateManager(),
  controller.getStudentPreview,
);
router.get(
  "/lookup/copies",
  validateToken,
  validateManager(),
  controller.lookupCopies,
);
router.get(
  "/lookup/copies/:copyId",
  validateToken,
  validateManager(),
  controller.getCopyPreview,
);

router.get("/history", validateToken, validateManager(), controller.getHistory);
router.get("/", validateToken, validateManager(), controller.getAll);
router.get("/:id", validateToken, validateManager(), controller.getById);

router.post(
  "/:id/process-return",
  validateToken,
  validateManager(),
  validateBody(circulationSchema.processReturn),
  controller.processReturn,
);
router.post(
  "/:id/renew",
  validateToken,
  validateRole("STAFF", "STUDENT", "LIBRARIAN"),
  controller.renew,
);

router.post(
  "/verify-guest",
  validateToken,
  validateManager(),
  validateBody(guestCheckoutSchema.verify),
  controller.verifyGuestOnly,
);
router.post(
  "/guest-checkout",
  validateToken,
  validateManager(),
  validateBody(guestCheckoutSchema.create),
  controller.guestCheckout,
);
module.exports = router;
