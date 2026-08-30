const express = require("express");
const router = express.Router();
const controller = require("../controllers/fineTransaction_controller");
const { validateToken, validateRole } = require(
  `../${process.env.FACADE_PATH}`,
);

router.get(
  "/",
  validateToken,
  validateRole("ADMIN", "LIBRARIAN"),
  controller.getAll,
);

module.exports = router;
