const mongoose = require("mongoose");

const SystemSettingSchema = new mongoose.Schema(
  {
    singleton_key: { type: String, default: "GLOBAL", unique: true },
    university_name: {
      type: String,
      required: true,
      default: "University Name",
    },
    university_logo_url: { type: String, default: null },
    academic_year: {
      type: String,
      required: true,
      default: () =>
        `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    },
    rector_signature_url: { type: String, default: null },
    active_template_id: { type: Number, enum: [1, 2, 3, 4, 5], default: 1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("systemsettings", SystemSettingSchema);
