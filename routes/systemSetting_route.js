const express = require("express");
const router = express.Router();
const controller = require("../controllers/systemSetting_controller");
const { createImageUpload } = require("../middleware/imageUpload");
const { validateToken, validateManager, validateRole, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { systemSettingSchema } = require("../utils/schema");

const uploadSignature = createImageUpload("signatures");
const uploadLogo = createImageUpload("logos");

router.get("/id-card", controller.getSettings);
router.put(
  "/id-card",
  validateBody(systemSettingSchema.update),
  controller.updateSettings,
);
router.post(
  "/id-card/signature",

  uploadSignature.single("signature"),
  controller.uploadSignature,
);
router.post(
  "/id-card/logo",

  uploadLogo.single("logo"),
  controller.uploadLogo,
);

module.exports = router;
