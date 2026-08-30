const { getIO } = require("../sockets/socketServer");
const Notification = require("../models/notification_model");
const NotificationTemplate = require("../models/notificationTemplate_model");
const User = require("../models/user_model");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

function render(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? vars[key] : "",
  );
}

const DEFAULTS = {
  RESERVATION_READY: {
    title: "Ready for Pickup: {{book_title}}",
    body: "Hello {{student_name}}, your reserved book '{{book_title}}' is now ready at the library counter. Please collect it before {{hold_expires_at}}.",
  },
  RESERVATION_EXPIRED: {
    title: "Reservation Expired: {{book_title}}",
    body: "Hi {{student_name}}, your reservation for '{{book_title}}' has expired because it was not collected in time.",
  },
  RESERVATION_CANCELLED: {
    title: "Reservation Cancelled: {{book_title}}",
    body: "Hi {{student_name}}, your reservation for '{{book_title}}' has been cancelled.",
  },
  DUE_SOON: {
    title: "Reminder: Book Due Soon",
    body: "Hi {{student_name}}, '{{book_title}}' is due on {{due_date}}. Please return or renew it to avoid overdue fines.",
  },
  OVERDUE: {
    title: "OVERDUE: {{book_title}}",
    body: "Dear {{student_name}}, your book '{{book_title}}' is {{days_overdue}} days overdue. Daily fine rate: {{fine_amount}} MMK.",
  },
  FINE_ISSUED: {
    title: "New Fine Issued: {{amount}} MMK",
    body: "A fine of {{amount}} MMK has been added to your account for '{{reason}}'. Please settle your dues at the main counter.",
  },
};

const send = async (
  userId,
  type,
  opts = {},
  session = null,
  registerAfterCommit = null,
) => {
  let userQuery = User.findById(userId).select("role");
  if (session) userQuery = userQuery.session(session);
  const targetUser = await userQuery;
  if (!targetUser || targetUser.role === "GUEST") return null;
  const { reference_type = "NONE", reference_id = null, vars = {} } = opts;

  const template = await NotificationTemplate.findOne({
    type,
    is_active: true,
  });
  const fallback = DEFAULTS[type];
  const titleSrc = template?.title_template || fallback?.title || type;
  const bodySrc = template?.body_template || fallback?.body || "";

  const doc = new Notification({
    user_id: userId,
    type,
    reference_type,
    reference_id,
    title: render(titleSrc, vars),
    message: render(bodySrc, vars),
  });
  if (session) await doc.save({ session });
  else await doc.save();

  const emitFn = () => {
    try {
      getIO().to(`user:${userId}`).emit("notification:new", doc.toObject());
    } catch (err) {
      console.error("Socket emit failed:", err.message);
    }
  };

  if (registerAfterCommit) registerAfterCommit(emitFn);
  else emitFn();

  return doc;
};

const getAll = async (userId, query = {}) => {
  const { page = 1, unread_only } = query;
  const limit = Number(process.env.PAGE_LIMIT) || 20;
  const currentPage = Number(page);
  const skip = (currentPage - 1) * limit;

  const filter = { user_id: userId };
  if (unread_only === "true") filter.is_read = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user_id: userId, is_read: false }),
  ]);
  return {
    notifications,
    unread_count: unreadCount,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage,
      limit,
    },
  };
};

const markRead = async (id, userId) => {
  const notif = await Notification.findOne({ _id: id, user_id: userId });
  if (!notif) throw httpError("Notification not found.", 404);
  notif.is_read = true;
  notif.read_at = new Date();
  await notif.save();
  return notif;
};

const markAllRead = async (userId) => {
  await Notification.updateMany(
    { user_id: userId, is_read: false },
    { is_read: true, read_at: new Date() },
  );
  return { success: true };
};

const remove = async (id, userId) => {
  const notif = await Notification.findOneAndDelete({
    _id: id,
    user_id: userId,
  });
  if (!notif) throw httpError("Notification not found.", 404);
  return { success: true };
};

module.exports = { send, getAll, markRead, markAllRead, remove };
