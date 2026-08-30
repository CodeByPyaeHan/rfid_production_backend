const express = require("express");
const multer = require("multer");
const controller = require("../controllers/book_controller");
const MrcController = require("../controllers/marcMrc_controller");
const CopyController = require("../controllers/copy_controller");
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const { bookSchema, bookCopySchema } = require("../utils/schema");
const { exportBulkMrc } = require("../services/marcMrc_service");
const { validate } = require("../models/bookCopy_model");
const { validateToken, validateRole, validateBody, validateManager } = require(
  `../${process.env.FACADE_PATH}`,
);

// Excel
router.post(
  "/import-excel",
  validateToken,
  validateManager(),
  upload.single("file"),
  controller.importExcel,
);

// ISBN
router.get(
  "/lookup-isbn/:isbn",
  validateToken,
  validateManager(),
  controller.lookupISBN,
);

// Book route
router.post(
  "/manual-entry",
  validateToken,
  validateManager(),
  validateBody(bookSchema.create),
  controller.create,
);

router.post(
  "/books/:bookId/add-copy",
  validateToken,
  validateManager(),
  validateBody(bookSchema.addCopy),
  controller.addCopy,
);

router.get("/books", validateBody(bookSchema.getAll), controller.getAll);

router.get(
  "/admin/books",
  validateToken,
  validateManager(),
  validateBody(bookSchema.getAllForLibrarian),
  controller.getAllForLibrarian,
);

router.get(
  "/portal/books",
  validateBody(bookSchema.getAllForPortal),
  controller.getAllForPortal,
);

router.get("/books/:id", controller.getDetail);

router.put(
  "/books/:id",
  validateToken,
  validateManager(),
  validateBody(bookSchema.update),
  controller.update,
);

// Book soft + hard + restore
router.delete(
  "/books/:id",
  validateToken,
  validateManager(),
  controller.softDelete,
); // soft delete
router.patch(
  "/books/:id/restore",
  validateToken,
  validateManager(),
  controller.restore,
);
router.delete(
  "/books/:id/permanent",
  validateToken,
  validateManager(),
  controller.hardDelete,
); // hard delete

//Export MRC
router.get(
  "/export/mrc/:id",
  validateToken,
  validateManager(),
  MrcController.exportSingle,
);
router.get(
  "/export/mrc",
  validateToken,
  validateManager(),
  MrcController.exportBulk,
);
router.post(
  "/import/mrc",
  validateToken,
  validateManager(),
  MrcController.uploadMrc,
  MrcController.importMrc,
);

//Body Copy Route
router.get("/copies", validateToken, validateManager(), CopyController.getAll);
router.put(
  "/copies/:id",
  validateToken,
  validateManager(),
  validateBody(bookCopySchema.update),
  CopyController.update,
);

router.delete(
  "/copies/:id",
  validateToken,
  validateManager(),
  CopyController.softDelete,
);
router.patch(
  "/copies/:id/restore",
  validateToken,
  validateManager(),
  CopyController.restore,
);
router.delete(
  "/copies/:id/permanent",
  validateToken,
  validateManager(),
  CopyController.hardDelete,
);
module.exports = router;
