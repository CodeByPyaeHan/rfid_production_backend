const express = require("express");
const router = express.Router();
const scanLogController = require("../controllers/scanLog_controller");
const { validateToken, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
router.get("/", validateToken, validateManager(), scanLogController.getAll);
router.get(
  "/:id",
  validateToken,
  validateManager(),
  scanLogController.getSingle,
);
router.post("/", scanLogController.create);

module.exports = router;
