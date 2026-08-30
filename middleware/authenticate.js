const { verifyAccessToken } = require("../utils/token");

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token missing." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload; // { userId, role, username }
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: "Access token expired.", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid access token." });
  }
}

module.exports = { authenticate };
