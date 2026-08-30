const express = require("express");
const router = express.Router();
const {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  changePasswordHandler,
  rfidLoginHandler,
  setInitialPasswordHandler,
  updateMeHandler,
  generateRfidLoginSession,
  closeRfidLoginSession,
} = require("../controllers/auth_controller");
const { authenticate } = require("../middleware/authenticate");
const { authSchema } = require("../utils/schema");
const { validateToken, validateRole, validateBody } = require(
  `../${process.env.FACADE_PATH}`,
);

router.post("/login", loginHandler);
router.post("/refresh", refreshHandler);
router.post("/logout", logoutHandler);
router.get("/me", authenticate, meHandler);
router.post("/change-password", authenticate, changePasswordHandler);

router.post(
  "/rfid-login",
  validateBody(authSchema.rfidLogin),
  rfidLoginHandler,
);
router.post(
  "/set-initial-password",
  authenticate,
  validateBody(authSchema.setInitialPassword),
  setInitialPasswordHandler,
);

router.put(
  "/me",
  authenticate,
  validateBody(authSchema.updateMe),
  updateMeHandler,
);

router.get("/rfid-session", generateRfidLoginSession);
router.post("/rfid-session/close", closeRfidLoginSession);
module.exports = router;
