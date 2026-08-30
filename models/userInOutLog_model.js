const mongoose = require("mongoose");

const InOutLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    log_type: {
      type: String,
      enum: ["IN", "OUT"],
      required: true,
    },
  },
  { timestamps: { createdAt: "scan_time", updatedAt: false } },
);
InOutLogSchema.index(
  {
    user_id: 1,
    log_type: 1,
    scan_time: 1,
  },
  {
    unique: true,
  },
);

InOutLogSchema.index(
  { scan_time: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);
module.exports = mongoose.model("inoutlogs", InOutLogSchema);
