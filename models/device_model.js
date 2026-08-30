const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true },
    mac_address: { type: String, unique: true, required: true },
    last_seen: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

module.exports = mongoose.model("devices", DeviceSchema);
