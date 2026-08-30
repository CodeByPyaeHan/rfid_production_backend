const axios = require("axios");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "books");

async function downloadExternalImageAsCover(externalUrl) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  try {
    const response = await axios.get(externalUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const contentType = response.headers["content-type"] || "image/jpeg";
    const ext = contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : ".jpg";
    const filename = `${Date.now()}-isbn-cover${ext}`;

    fs.writeFileSync(path.join(UPLOAD_DIR, filename), response.data);

    console.log(`Image downloaded: /uploads/books/${filename}`);
    return `/uploads/books/${filename}`;
  } catch (error) {
    console.error(
      `Failed to download image from ${externalUrl}:`,
      error.message,
    );

    return null;
  }
}
module.exports = { downloadExternalImageAsCover };
