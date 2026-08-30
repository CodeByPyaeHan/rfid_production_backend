const express = require("express");
const router = express.Router();
const controller = require("../controllers/fine_controller");
const { validateToken, validateRole, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { fineTransactionSchema } = require("../utils/schema");

router.get(
  "/",
  validateToken,
  validateRole("STAFF", "LIBRARIAN", "ADMIN"),
  controller.getAll,
);

router.get("/my", validateToken, controller.getMyFines);

router.get(
  "/:id",
  validateToken,
  validateRole("STAFF", "LIBRARIAN", "ADMIN"),
  controller.getById,
);
router.post(
  "/:id/pay",
  validateToken,
  validateRole("STAFF", "LIBRARIAN", "ADMIN"),
  validateBody(fineTransactionSchema.pay),
  controller.pay,
);
router.post(
  "/:id/waive",
  validateToken,
  validateRole("ADMIN"),
  controller.waive,
);
router.get(
  "/:id/transactions",
  validateToken,
  validateRole("STAFF", "LIBRARIAN", "ADMIN"),
  controller.getTransactions,
);

module.exports = router;
