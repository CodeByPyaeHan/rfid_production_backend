const express = require("express");
const router = express.Router();
const controller = require("../controllers/bookCover_controller");
const uploadMiddleware = require("../middleware/bookCoverUpload");
const { validateToken, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);

router.post(
  "/:bookId/cover",
  validateToken,
  validateManager(),
  uploadMiddleware.single("cover"),
  controller.upload,
);
router.delete(
  "/:bookId/cover",
  validateToken,
  validateManager(),
  controller.remove,
);

module.exports = router;
