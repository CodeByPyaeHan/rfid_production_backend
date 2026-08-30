const asyncHandler = require("express-async-handler");
const multer = require("multer");
const { Msg } = require(`../${process.env.FACADE_PATH}`);

const marcMrcService = require("../services/marcMrc_service");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (ext === "mrc" || ext === "marc") return cb(null, true);
    cb(new Error("Only .mrc or .marc files are accepted."));
  },
});

const exportSingle = asyncHandler(async (req, res) => {
  const buffer = await marcMrcService.exportSingle(req.params.id);
  const date = new Date().toISOString().split("T")[0];

  res.set({
    "Content-Type": "application/marc",
    "Content-Disposition": `attachment; filename="marc-${req.params.id}-${date}.mrc"`,
    "Content-Length": buffer.length,
  });
  return res.send(buffer);
});

const exportBulk = asyncHandler(async (req, res) => {
  req.setTimeout(300000);
  const { search, documentType, limit } = req.query;

  const buffer = await marcMrcService.exportBulk({
    search,
    documentType,
  });

  const date = new Date().toISOString().split("T")[0];
  res.set({
    "Content-Type": "application/marc",
    "Content-Disposition": `attachment; filename="catalog-export-${date}.mrc"`,
    "Content-Length": buffer.length,
  });
  return res.send(buffer);
});

const importMrc = asyncHandler(async (req, res) => {
  if (!req.file) {
    const err = new Error("Please select a .mrc file before importing.");
    err.status = 400;
    throw err;
  }

  const result = await marcMrcService.importMrc(req.file.buffer);
  return Msg(res, "MRC import completed.", result, 200);
});

module.exports = {
  exportSingle,
  exportBulk,
  importMrc,
  uploadMrc: upload.single("file"),
};
