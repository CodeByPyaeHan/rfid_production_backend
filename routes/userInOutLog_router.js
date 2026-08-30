const express = require("express");
const router = express.Router();
const multer = require("multer");
const userInOutController = require("../controllers/userInOutLog_controller");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);
const { inOutLogSchema } = require("../utils/schema");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── RFID device — public, no token (per requirement) ───────────
router.post(
  "/",
  validateBody(inOutLogSchema.create),
  userInOutController.create,
);

// ── Admin/Librarian only ─────────────────────────────────────────
router.get("/", validateToken, validateManager(), userInOutController.getAll);

router.get(
  "/export/json",
  validateToken,
  validateManager(),
  userInOutController.exportJSON,
);
router.get(
  "/export/csv",
  validateToken,
  validateManager(),
  userInOutController.exportCSV,
);

router.post(
  "/import/json",
  upload.single("file"),
  validateToken,
  validateManager(),
  userInOutController.importJSON,
);
router.post(
  "/import/csv",
  upload.single("file"),
  validateToken,
  validateManager(),
  userInOutController.importCSV,
);

router.delete(
  "/:id",
  validateToken,
  validateRole("ADMIN"),
  userInOutController.drop,
);

module.exports = router;
