const { Server } = require("socket.io");
const { verifyAccessToken } = require("../utils/token");
const { activeLoginSessions } = require("../sockets/activeLoginSessions");

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: ["https://ucsmgy.work", "http://ucsmgy.portal"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth;

    if (auth?.kiosk_key) {
      if (auth.kiosk_key === process.env.KIOSK_SECRET_KEY) {
        socket.isKiosk = true;
        return next();
      }
      return next(new Error("Invalid Kiosk Key"));
    }

    if (auth?.rfidSessionToken) {
      socket.isLoginTerminal = true;
      return next();
    }

    const token = auth?.token;
    if (!token) return next(new Error("Authentication required."));
    try {
      const payload = verifyAccessToken(token);
      socket.user = payload;
      return next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("auth:join_login_room", (token, ack) => {
      for (const room of [...socket.rooms]) {
        if (room.startsWith("rfid-session:")) socket.leave(room);
      }

      let matchedDeviceId = null;
      for (const [deviceId, activeToken] of activeLoginSessions.entries()) {
        if (activeToken === token) {
          matchedDeviceId = deviceId;
          break;
        }
      }

      if (matchedDeviceId) {
        socket.join(`rfid-session:${token}`);
        socket.join("kiosk-room");
        console.log(
          `[Socket] Terminal ${matchedDeviceId} joined/renewed login room with token ${token.slice(0, 8)}…`,
        );
        if (typeof ack === "function") ack({ success: true });
      } else {
        console.log(`[Socket] Invalid or expired RFID session token`);
        if (typeof ack === "function")
          ack({ success: false, reason: "expired" });
      }
    });

    if (socket.isKiosk) {
      socket.join("kiosk-room");
      console.log("✅ Kiosk Socket Connected and joined kiosk-room!");
    } else if (socket.user) {
      socket.join(`user:${socket.user.userId}`);
      if (["STAFF", "LIBRARIAN", "ADMIN"].includes(socket.user.role)) {
        socket.join(`role:${socket.user.role}`);
        socket.join("inout-monitor");
      }
    }

    socket.on("disconnect", () => {});
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.io not initialized.");
  return io;
}

module.exports = { initSocket, getIO };
