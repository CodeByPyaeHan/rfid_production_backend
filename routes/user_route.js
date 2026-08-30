const express = require("express");
const router = express.Router();
const multer = require("multer");
const userController = require("../controllers/user_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const idCardController = require("../controllers/idCard_controller");
const { createImageUpload } = require("../middleware/imageUpload");
const profileUpload = createImageUpload("profiles");
const { userSchema } = require("../utils/schema");
const { bulkCardSchema } = require("../utils/schema");

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/import",
  validateToken,
  validateManager(),
  upload.single("file"),
  userController.importUsers,
);

router.get("/", validateToken, validateManager(), userController.getAll);
router.get(
  "/search-lookup",
  validateToken,
  validateManager(),
  userController.searchForResolve,
);

router.post(
  "/",
  validateToken,
  validateManager(),
  validateBody(userSchema.add),
  userController.createUser,
);

router.put(
  "/:id",
  validateToken,
  validateManager(),
  validateBody(userSchema.edit),
  userController.editUser,
);

router.delete(
  "/soft/:id",
  validateToken,
  validateManager(),
  userController.deleteUser,
);
router.delete(
  "/:id",
  validateToken,
  validateManager(),
  userController.forceDeleteUser,
);
router.patch(
  "/restore/:id",
  validateToken,
  validateManager(),
  userController.restoreUser,
);

// ── Authorizer routes (Admin/Librarian) ──
router.post(
  "/auth",
  validateToken,
  validateRole("ADMIN"),
  validateBody(userSchema.authAdd),
  userController.createAuthUser,
);
router.get(
  "/auth",
  validateToken,
  validateRole("ADMIN"),
  userController.getAllAuthUser,
);
router.put(
  "/auth/:id",
  validateToken,
  validateRole("ADMIN"),
  validateBody(userSchema.authUpdate),
  userController.editAuthUser,
);
router.delete(
  "/auth/soft/:id",
  validateToken,
  validateRole("ADMIN"),
  userController.deleteAuthUser,
);
router.patch(
  "/auth/restore/:id",
  validateToken,
  validateRole("ADMIN"),
  userController.restoreAuthUser,
);
router.delete(
  "/auth/:id",
  validateToken,
  validateRole("ADMIN"),
  userController.forceDropAuthUser,
);
router.patch(
  "/auth/:id/reset-password",
  validateToken,
  validateRole("ADMIN"),
  validateBody(userSchema.resetPassword),
  userController.resetAuthPassword,
);

router.get("/:id", validateToken, validateManager(), userController.getUser);
router.post(
  "/:id/reset-password",
  validateToken,
  validateManager(),
  userController.forceResetPassword,
);

router.post(
  "/bulk-card-data",
  validateToken,
  validateManager(),
  validateBody(bulkCardSchema.fetch),
  idCardController.getBulkCardData,
);

router.get("/:userId/card-data", idCardController.getCardDataForUser);

router.post(
  "/:id/profile-picture",
  validateToken,
  validateManager(),
  profileUpload.single("photo"),
  userController.uploadProfilePicture,
);

module.exports = router;
