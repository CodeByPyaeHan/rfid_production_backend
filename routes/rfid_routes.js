const express = require("express");
const router = express.Router();
const controller = require("../controllers/rfid_controller");
const { validateToken, validateManager, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { rfidSchema } = require("../utils/schema");
const mqttService = require("../services/mqtt_service");

router.post(
  "/write-tag",
  validateToken,
  validateManager(),
  validateBody(rfidSchema.writeTag),
  controller.writeTag,
);

router.post("/borrow-confirm", controller.confirmBorrow);
router.post("/return-confirm", controller.confirmReturn);
router.get("/system-status", controller.getSystemStatus);

router.get(
  "/search-copies",
  validateToken,
  validateManager(),
  controller.searchCopies,
);

router.post(
  "/cancel-book",
  validateBody(rfidSchema.cancelBook),
  controller.cancelBook,
);

router.post("/cancel-session", controller.cancelSession);

router.post("/override-scanner", (req, res) => {
  mqttService.setScannerMode("LIBRARIAN");
  res.json({
    message: "Scanner overridden for Guest Checkout (Valid for 2 mins)",
  });
});

router.post("/release-scanner", (req, res) => {
  const mqttService = require("../services/mqtt_service");
  mqttService.setScannerMode("KIOSK");
  res.json({ message: "Scanner successfully released to Kiosk mode." });
});

module.exports = router;
