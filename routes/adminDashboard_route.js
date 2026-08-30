const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminDashboard_controller");
const { validateToken, validateRole } = require(
  `../${process.env.FACADE_PATH}`,
);

const adminOnly = validateRole("ADMIN");

router.get("/kpis", validateToken, adminOnly, controller.getKpis);
router.get(
  "/budget-overview",
  validateToken,
  adminOnly,
  controller.getBudgetOverview,
);
router.get(
  "/monthly-trend",
  validateToken,
  adminOnly,
  controller.getMonthlyTrend,
);

router.get(
  "/ddc-distribution",
  validateToken,
  adminOnly,
  controller.getDdcDistribution,
);

router.get(
  "/user-distribution",
  validateToken,
  adminOnly,
  controller.getUserDistribution,
);
router.get("/fine-trend", validateToken, adminOnly, controller.getFineTrend);
router.get(
  "/top-borrowed-books",
  validateToken,
  adminOnly,
  controller.getTopBorrowedBooks,
);

module.exports = router;
