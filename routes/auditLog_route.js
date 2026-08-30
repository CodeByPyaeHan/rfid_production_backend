const express = require("express");
const router = express.Router();
const controller = require("../controllers/auditLog_controller");
const { validateToken, validateRole } = require(
  `../${process.env.FACADE_PATH}`,
);

router.get("/", validateToken, validateRole("ADMIN"), controller.getAll);
router.get(
  "/actions",
  validateToken,
  validateRole("ADMIN"),
  controller.getActions,
);

module.exports = router;
