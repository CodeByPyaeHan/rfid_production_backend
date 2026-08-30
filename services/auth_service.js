const bcrypt = require("bcryptjs");
const User = require("../models/user_model");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/token");
const { ENCODER } = require(`../${process.env.FACADE_PATH}`);
const { parseUserCardPayload } = require("../utils/rfidPayload");

const loginService = async ({ username, password }) => {
  if (!username?.trim() || !password) {
    const err = new Error("Username and password are required.");
    err.status = 400;
    throw err;
  }

  const user = await User.findOne({
    username: username.trim().toLowerCase(),
    is_deleted: false,
  }).select("+password");

  if (!user) {
    const err = new Error("Invalid username or password.");
    err.status = 401;
    throw err;
  }

  if (user.status === "SUSPENDED") {
    const err = new Error("Your account has been suspended. Contact admin.");
    err.status = 403;
    throw err;
  }
  if (user.status === "INACTIVE") {
    const err = new Error(
      "Your account is inactive. Contact admin to activate.",
    );
    err.status = 403;
    throw err;
  }

  if (user.status === "GRADUATED") {
    const err = new Error("This account is no longer active (graduated).");
    err.status = 403;
    throw err;
  }

  const isMatch = await ENCODER.compare(password, user.password);
  if (!isMatch) {
    const err = new Error("Invalid username or password.");
    err.status = 401;
    throw err;
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  console.log("profile image si ", user.profile_picture);

  return {
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      profile_picture: user.profile_picture,
    },
  };
};

const refreshTokenService = async (refreshToken) => {
  if (!refreshToken) {
    const err = new Error("Refresh token missing.");
    err.status = 401;
    throw err;
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    const err = new Error("Invalid or expired refresh token.");
    err.status = 401;
    throw err;
  }

  const user = await User.findOne({
    _id: payload.userId,
    is_deleted: false,
  });

  if (!user || user.status !== "ACTIVE") {
    const err = new Error("User not found or inactive.");
    err.status = 401;
    throw err;
  }

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    user: {
      _id: user._id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      profile_picture: user.profile_picture,
    },
  };
};

const changePasswordService = async (
  userId,
  { currentPassword, newPassword },
) => {
  if (!newPassword || newPassword.length < 6) {
    const err = new Error("New password must be at least 6 characters.");
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId).select("+password");
  if (!user) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    const err = new Error("Current password is incorrect.");
    err.status = 400;
    throw err;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  return { success: true };
};

const rfidLoginService = async (rawCardIdentifier) => {
  if (!rawCardIdentifier?.trim()) {
    const err = new Error("RFID identifier is required.");
    err.status = 400;
    throw err;
  }

  const { institutionCode, username } = parseUserCardPayload(
    rawCardIdentifier.trim(),
  );

  if (institutionCode && institutionCode !== process.env.INSTITUTION_CODE) {
    const err = new Error(
      "This card belongs to another institution and cannot be used to log in here.",
    );
    err.status = 403;
    throw err;
  }

  const user = await User.findOne({
    username: username.toLowerCase(),
    is_deleted: false,
  }).select("+password");

  if (!user) {
    const err = new Error("No account associated with this card.");
    err.status = 404;
    throw err;
  }

  if (user.status === "SUSPENDED") {
    const err = new Error("Account suspended.");
    err.status = 403;
    throw err;
  }
  if (user.status === "INACTIVE") {
    const err = new Error("Account inactive.");
    err.status = 403;
    throw err;
  }
  if (user.status === "GRADUATED") {
    const err = new Error("Account graduated.");
    err.status = 403;
    throw err;
  }

  if (["ADMIN", "LIBRARIAN"].includes(user.role)) {
    return { requiresPassword: true, username: user.username };
  }

  if (!user.password) {
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    return {
      requiresPassword: false,
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }

  return { requiresPassword: true, username: user.username };
};

const setInitialPasswordService = async (userId, newPassword) => {
  if (!newPassword || newPassword.length < 6) {
    const err = new Error("Password must be at least 6 characters.");
    err.status = 400;
    throw err;
  }
  const user = await User.findById(userId).select("+password");
  if (!user) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }
  if (user.password) {
    const err = new Error("Password already set. Use change password instead.");
    err.status = 400;
    throw err;
  }
  user.password = ENCODER.encode(newPassword);
  await user.save();
  return { success: true };
};

const getMeService = async (userId) => {
  const user = await User.findOne({ _id: userId, is_deleted: false })
    .select("+password")
    .populate({
      path: "student",
      populate: [
        {
          path: "semester",
          select: "name",
        },
        {
          path: "major",
          select: "name short_name",
        },
      ],
    })
    .populate({
      path: "staff",
      populate: {
        path: "department",
        select: "name short_name",
      },
    });
  if (!user) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  const result = user.toObject();
  result.has_password = !!result.password;
  delete result.password;
  return result;
};

module.exports = {
  loginService,
  refreshTokenService,
  refreshTokenService,
  getMeService,
  changePasswordService,
  rfidLoginService,
  setInitialPasswordService,
};
