const express = require("express");
const router = express.Router();
const financeController = require("../controllers/finance_controller");
const { validateToken, validateRole, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { financeSchema } = require("../utils/schema");

// Purchases
router.post(
  "/purchases",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  validateBody(financeSchema.purchaseCreate),
  financeController.createPurchase,
);
router.get(
  "/purchases",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  financeController.getPurchases,
);
router.get(
  "/purchases/:id",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  financeController.getPurchase,
);
router.put(
  "/purchases/:id",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  validateBody(financeSchema.purchaseUpdate),
  financeController.updatePurchase,
);
router.delete(
  "/purchases/soft/:id",
  validateToken,
  validateRole("ADMIN"),
  financeController.softDeletePurchase,
);
router.patch(
  "/purchases/restore/:id",
  validateToken,
  validateRole("ADMIN"),
  financeController.restorePurchase,
);
router.delete(
  "/purchases/:id",
  validateToken,
  validateRole("ADMIN"),
  financeController.hardDeletePurchase,
);

// Expenditures
router.post(
  "/expenditures",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  validateBody(financeSchema.expenditureCreate),
  financeController.createExpenditure,
);
router.get(
  "/expenditures",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  financeController.getExpenditures,
);
router.get(
  "/expenditures/:id",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  financeController.getExpenditure,
);
router.put(
  "/expenditures/:id",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  validateBody(financeSchema.expenditureUpdate),
  financeController.updateExpenditure,
);
router.delete(
  "/expenditures/soft/:id",
  validateToken,
  validateRole("ADMIN"),
  financeController.softDeleteExpenditure,
);
router.patch(
  "/expenditures/restore/:id",
  validateToken,
  validateRole("ADMIN"),
  financeController.restoreExpenditure,
);
router.delete(
  "/expenditures/:id",
  validateToken,
  validateRole("ADMIN"),
  financeController.hardDeleteExpenditure,
);

// Reports
router.get(
  "/dashboard",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  financeController.dashboard,
);
router.get(
  "/report/monthly",
  validateToken,
  validateRole("ADMIN"),
  financeController.monthlyReport,
);
router.get(
  "/report/category",
  validateToken,
  validateRole("ADMIN"),
  financeController.categoryReport,
);
router.get(
  "/history",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  financeController.transactionHistory,
);

module.exports = router;
