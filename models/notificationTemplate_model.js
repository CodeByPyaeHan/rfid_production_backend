const mongoose = require("mongoose");

const NotificationTemplateSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "RESERVATION_READY",
        "RESERVATION_EXPIRED",
        "RESERVATION_CANCELLED",
        "DUE_SOON",
        "OVERDUE",
        "FINE_ISSUED",
        "GENERAL",
      ],
      required: true,
      unique: true,
    },
    name: { type: String, required: true },
    title_template: { type: String, required: true },
    body_template: { type: String, required: true },
    available_variables: [{ type: String }],
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model(
  "notificationtemplates",
  NotificationTemplateSchema,
);
