const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    ip_address: { type: String, default: null },
    severity: {
      type: String,
      enum: ["INFO", "WARNING", "CRITICAL"],
      default: "INFO",
    },
    action: { type: String, required: true },
    resource: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

AuditLogSchema.index({ user_id: 1, created_at: -1 });
AuditLogSchema.index({ action: 1, created_at: -1 });

AuditLogSchema.index(
  { created_at: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
module.exports = mongoose.model("auditlogs", AuditLogSchema);
