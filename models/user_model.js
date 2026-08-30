const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      trim: true,
      required: true,
      lowercase: true,
    },
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: null },
    role: {
      type: String,
      enum: ["STUDENT", "STAFF", "LIBRARIAN", "ADMIN", "GUEST"],
      default: "STUDENT",
    },
    password: { type: String, select: false },
    profile_picture: { type: String, default: null },
    nrc_number: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "GRADUATED", "SUSPENDED"],
      default: "INACTIVE",
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },

    deleted_at: {
      type: Date,
      default: null,
    },
    home_institution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "institutions",
      default: null,
    },
    home_username: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true, $type: "string" },
    },
  },
);
UserSchema.virtual("student", {
  ref: "students",
  localField: "_id",
  foreignField: "user_id",
  justOne: true,
});

UserSchema.virtual("staff", {
  ref: "staffs",
  localField: "_id",
  foreignField: "user_id",
  justOne: true,
});

UserSchema.set("toJSON", { virtuals: true });
UserSchema.set("toObject", { virtuals: true });
module.exports = mongoose.model("users", UserSchema);
