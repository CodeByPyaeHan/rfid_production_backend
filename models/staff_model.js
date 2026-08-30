const mongoose = require("mongoose");

const StaffSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "departments",
      required: true,
    },
    national_reg_no: { type: String, trim: true, default: null },
    designation: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("staffs", StaffSchema);
