const express = require("express");
const router = express.Router();
const controller = require("../controllers/external_controller");
const { validateInstitutionAuth } = require("../middleware/institutionAuth");
const { validateBody } = require(`../${process.env.FACADE_PATH}`);
const { externalApiSchema } = require("../utils/schema");

router.get(
  "/search-catalog",
  validateInstitutionAuth,
  controller.searchCatalog,
);
router.post(
  "/verify-user",
  validateInstitutionAuth,
  validateBody(externalApiSchema.verifyUser),
  controller.verifyUser,
);
router.post(
  "/notify-checkout",
  validateInstitutionAuth,
  validateBody(externalApiSchema.notifyCheckout),
  controller.notifyCheckout,
);

module.exports = router;
