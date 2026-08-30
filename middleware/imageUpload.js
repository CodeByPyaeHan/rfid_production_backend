const multer = require("multer");
const path = require("path");
const fs = require("fs");

function createImageUpload(subfolder) {
  const uploadDir = path.join(__dirname, "..", "uploads", subfolder);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = path
        .basename(file.originalname, ext)
        .replace(/[^a-z0-9]/gi, "-")
        .slice(0, 40);
      cb(null, `${Date.now()}-${safeName}${ext}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    if (!allowed.includes(path.extname(file.originalname).toLowerCase()))
      return cb(new Error("Only JPG, PNG, or WEBP images are allowed."));
    cb(null, true);
  };

  return multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
}

module.exports = { createImageUpload };
