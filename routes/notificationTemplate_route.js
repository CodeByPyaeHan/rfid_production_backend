const express = require("express");
const router = express.Router();
const controller = require("../controllers/notificationTemplate_controller");
const { validateToken, validateRole, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);
const { notificationTemplateSchema } = require("../utils/schema");

router.get("/", validateToken, validateRole("ADMIN"), controller.getAll);
router.put(
  "/:type",
  validateToken,
  validateRole("ADMIN"),
  validateBody(notificationTemplateSchema.upsert),
  controller.upsert,
);

module.exports = router;
