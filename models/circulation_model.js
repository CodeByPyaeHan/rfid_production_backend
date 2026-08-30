const mongoose = require("mongoose");

const CirculationSchema = new mongoose.Schema(
  {
    copy_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "bookcopies",
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    checkout_date: { type: Date, default: Date.now },
    due_date: { type: Date, required: true },
    return_date: { type: Date, default: null },
    status: {
      type: String,
      enum: ["BORROWED", "RETURNED", "LOST"],
      default: "BORROWED",
    },
    renewed_count: { type: Number, default: 0 },
    checked_out_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    returned_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    toJSON: { virtuals: true },
  },
);

CirculationSchema.index({ user_id: 1, status: 1 });
CirculationSchema.index({ copy_id: 1, status: 1 });

CirculationSchema.virtual("is_overdue").get(function () {
  return this.status === "BORROWED" && this.due_date < new Date();
});

module.exports = mongoose.model("circulations", CirculationSchema);
