const asyncHandler = require("express-async-handler");
const { Msg } = require(`../${process.env.FACADE_PATH}`);
const userService = require("../services/user_service");
const crypto = require("crypto");
const { activeLoginSessions } = require("../sockets/activeLoginSessions");
const loginSessionTimers = new Map();
const { publishReaderMode } = require("../services/mqtt_service");

const {
  loginService,
  refreshTokenService,
  getMeService,
  changePasswordService,
  rfidLoginService,
  setInitialPasswordService,
} = require("../services/auth_service");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const loginHandler = asyncHandler(async (req, res) => {
  const result = await loginService(req.body);

  res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

  return Msg(res, "Login successful.", {
    accessToken: result.accessToken,
    user: result.user,
  });
});

const refreshHandler = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  const result = await refreshTokenService(refreshToken);

  return Msg(res, "Token refreshed.", {
    accessToken: result.accessToken,
    user: result.user,
  });
});

const logoutHandler = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken", { path: "/api/auth" });
  return Msg(res, "Logged out successfully.", null);
});

const meHandler = asyncHandler(async (req, res) => {
  const user = await getMeService(req.user.userId);
  return Msg(res, "Current user fetched.", { user });
});

const changePasswordHandler = asyncHandler(async (req, res) => {
  const result = await changePasswordService(req.user.userId, req.body);
  return Msg(res, "Password changed successfully.", result);
});

const rfidLoginHandler = asyncHandler(async (req, res) => {
  const result = await rfidLoginService(req.body.identifier);

  if (!result.requiresPassword) {
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return Msg(res, "Login successful.", {
      accessToken: result.accessToken,
      user: result.user,
    });
  }
  return Msg(res, "Password required.", {
    requiresPassword: true,
    username: result.username,
  });
});

const setInitialPasswordHandler = asyncHandler(async (req, res) => {
  const result = await setInitialPasswordService(
    req.user.userId,
    req.body.newPassword,
  );
  return Msg(res, "Password set successfully.", result);
});

const updateMeHandler = asyncHandler(async (req, res) => {
  const allowed = {};
  if (req.body.email !== undefined) allowed.email = req.body.email;
  if (req.body.phone !== undefined) allowed.phone = req.body.phone;
  if (Object.keys(allowed).length === 0)
    throw httpError("No valid fields to update.", 400);

  const updated = await userService.update(req.user.userId, allowed);
  const result = updated.toObject();
  delete result.password;
  Msg(res, "Profile updated.", result);
});

const generateRfidLoginSession = (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) {
      return res
        .status(400)
        .json({ success: false, message: "Device ID is required" });
    }

    // Clear previous timer for this device
    if (loginSessionTimers.has(device_id)) {
      clearTimeout(loginSessionTimers.get(device_id));
      loginSessionTimers.delete(device_id);
    }

    const token = crypto.randomUUID();
    activeLoginSessions.set(device_id, token);

    const timer = setTimeout(
      () => {
        activeLoginSessions.delete(device_id);
        loginSessionTimers.delete(device_id);

        if (activeLoginSessions.size === 0) {
          publishReaderMode("close");
        }
      },
      5 * 60 * 1000,
    );

    loginSessionTimers.set(device_id, timer);
    publishReaderMode("start");
    return Msg(res, "RFID login session generated.", {
      session_token: token,
      device_id,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error generating session token" });
  }
};

const closeRfidLoginSession = (req, res) => {
  try {
    const { device_id } = req.query;
    if (!device_id) {
      return res
        .status(400)
        .json({ success: false, message: "Device ID is required" });
    }

    if (loginSessionTimers.has(device_id)) {
      clearTimeout(loginSessionTimers.get(device_id));
      loginSessionTimers.delete(device_id);
    }
    activeLoginSessions.delete(device_id);

    if (activeLoginSessions.size === 0) {
      publishReaderMode("close");
    }

    return Msg(res, "RFID login session closed.", { device_id });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error closing session" });
  }
};

module.exports = {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  changePasswordHandler,
  rfidLoginHandler,
  setInitialPasswordHandler,
  updateMeHandler,
  generateRfidLoginSession,
  activeLoginSessions,
  closeRfidLoginSession,
};
