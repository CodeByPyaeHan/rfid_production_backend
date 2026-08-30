const express = require("express");
const router = express.Router();
const controller = require("../controllers/dashboard_controller");
const { validateToken, validateRole, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);

router.get("/stats", validateToken, validateManager(), controller.getStats);
router.get(
  "/weekly-trend",
  validateToken,
  validateManager(),
  controller.getWeeklyTrend,
);
router.get("/hourly", validateToken, validateManager(), controller.getHourly);
router.get("/recent", validateToken, validateManager(), controller.getRecent);

module.exports = router;
