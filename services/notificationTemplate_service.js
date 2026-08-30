const model = require("../models/notificationTemplate_model");

function httpError(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

const TYPE_DEFAULTS = {
  RESERVATION_READY: {
    name: "Book Ready For Pickup Notice",
    title_template: "Ready for Pickup: {{book_title}}",
    body_template:
      "Hello {{student_name}}, your reserved book '{{book_title}}' is now ready at the library counter. Please collect it before {{hold_expires_at}}.",
    available_variables: ["student_name", "book_title", "hold_expires_at"],
  },
  RESERVATION_EXPIRED: {
    name: "Reservation Expired Notice",
    title_template: "Reservation Expired: {{book_title}}",
    body_template:
      "Hi {{student_name}}, your reservation for '{{book_title}}' has expired because it was not collected in time.",
    available_variables: ["student_name", "book_title"],
  },
  RESERVATION_CANCELLED: {
    name: "Reservation Cancelled Notice",
    title_template: "Reservation Cancelled: {{book_title}}",
    body_template:
      "Hi {{student_name}}, your reservation for '{{book_title}}' has been cancelled.",
    available_variables: ["student_name", "book_title"],
  },
  DUE_SOON: {
    name: "Upcoming Book Due Date Reminder",
    title_template: "Reminder: Book Due Soon",
    body_template:
      "Hi {{student_name}}, '{{book_title}}' is due on {{due_date}}. Please return or renew it to avoid overdue fines.",
    available_variables: ["student_name", "book_title", "due_date"],
  },
  OVERDUE: {
    name: "Overdue Book Alert",
    title_template: "OVERDUE: {{book_title}}",
    body_template:
      "Dear {{student_name}}, your book '{{book_title}}' is {{days_overdue}} days overdue. Daily fine rate: {{fine_amount}} MMK.",
    available_variables: [
      "student_name",
      "book_title",
      "days_overdue",
      "fine_amount",
    ],
  },
  FINE_ISSUED: {
    name: "Library Fine Notice",
    title_template: "New Fine Issued: {{amount}} MMK",
    body_template:
      "A fine of {{amount}} MMK has been added to your account for '{{reason}}'. Please settle your dues at the main counter.",
    available_variables: ["student_name", "amount", "reason"],
  },
  GENERAL: {
    name: "General Announcement",
    title_template: "{{title}}",
    body_template: "{{message}}",
    available_variables: ["title", "message"],
  },
};

const getAll = async () => {
  const existing = await model.find();
  const existingByType = Object.fromEntries(
    existing.map((t) => [t.type, t.toObject()]),
  );

  return Object.keys(TYPE_DEFAULTS).map(
    (type) =>
      existingByType[type] ?? {
        _id: null,
        type,
        is_active: true,
        ...TYPE_DEFAULTS[type],
      },
  );
};

const upsert = async (type, data) => {
  if (!TYPE_DEFAULTS[type])
    throw httpError(`Invalid notification type "${type}".`, 400);

  return await model.findOneAndUpdate(
    { type },
    {
      $set: {
        name: data.name,
        title_template: data.title_template,
        body_template: data.body_template,
        is_active: data.is_active,
        available_variables: TYPE_DEFAULTS[type].available_variables, // ★ server-controlled, never client-editable
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );
};

module.exports = { getAll, upsert, TYPE_DEFAULTS };
