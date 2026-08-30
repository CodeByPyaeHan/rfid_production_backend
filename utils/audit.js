const auditLogService = require("../services/auditLog_service");
const { getIO } = require("../sockets/socketServer");

async function logAudit(req, { action, resource = null, severity = "INFO" }) {
  try {
    const log = await auditLogService.add({
      user_id: req.user?.id || req.user?._id,
      ip_address: req.ip,
      severity,
      action,
      resource,
    });

    if (severity !== "INFO") {
      try {
        const populated = await log.populate("user_id", "username name role");
        getIO().to("role:ADMIN").emit("audit:new", populated);
      } catch (emitErr) {
        console.error("Audit socket emit failed:", emitErr.message);
      }
    }
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
}

module.exports = { logAudit };
