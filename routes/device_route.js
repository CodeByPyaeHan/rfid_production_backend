const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/device_controller");
const { validateToken, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
router.get("/", validateToken, validateManager(), deviceController.getAll);
router.get(
  "/:id",
  validateToken,
  validateManager(),
  deviceController.getSingle,
);

router.put("/:id", deviceController.update);

module.exports = router;
