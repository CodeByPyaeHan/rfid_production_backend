const mongoose = require("mongoose");

const scanLogSchema = new mongoose.Schema(
  {
    device_id: {
      type: mongoose.Schema.ObjectId,
      ref: "devices",
      required: true,
    },
    rfid_code: {
      type: String,
      required: true,
    },
    scan_type: { type: String, required: true, enum: ["user", "book"] },
  },
  { timestamps: { createdAt: "scan_time", updatedAt: false } },
);
scanLogSchema.index(
  { scan_time: 1 },
  { expireAfterSeconds: 120 * 24 * 60 * 60 },
);
module.exports = mongoose.model("scanlogs", scanLogSchema);
