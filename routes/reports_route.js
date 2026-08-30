const express = require("express");
const router = express.Router();
const controller = require("../controllers/reports_controller");
const { validateToken, validateRole } = require(
  `../${process.env.FACADE_PATH}`,
);

router.get(
  "/summary",
  validateToken,
  validateRole("ADMIN"),
  controller.getSummary,
);

module.exports = router;
