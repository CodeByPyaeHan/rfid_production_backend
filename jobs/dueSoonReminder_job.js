const cron = require("node-cron");
const Circulation = require("../models/circulation_model");
const Book = require("../models/book_model");
const notificationService = require("../services/notification_service");

async function runDueSoonReminder() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const dueSoonLoans = await Circulation.find({
    status: "BORROWED",
    due_date: { $gte: startOfToday, $lte: tomorrow },
  })
    .populate("user_id", "_id")
    .populate({
      path: "copy_id",
      populate: { path: "book_id", select: "title" },
    });

  let sent = 0;
  for (const c of dueSoonLoans) {
    try {
      await notificationService.send(c.user_id._id, "DUE_SOON", {
        reference_type: "CIRCULATION",
        reference_id: c._id,
        vars: {
          book_title: c.copy_id?.book_id?.title ?? "",
          due_date: c.due_date.toDateString(),
        },
      });
      sent++;
    } catch (err) {
      console.error(
        `DueSoon notify failed for circulation ${c._id}:`,
        err.message,
      );
    }
  }
  return { checked: dueSoonLoans.length, sent };
}

function startDueSoonReminderJob() {
  cron.schedule("0 8 * * *", async () => {
    try {
      const result = await runDueSoonReminder();
      console.log(
        `[DueSoonReminder] Checked ${result.checked}, sent ${result.sent}.`,
      );
    } catch (err) {
      console.error("[DueSoonReminder] Job failed:", err.message);
    }
  });
}

module.exports = { startDueSoonReminderJob, runDueSoonReminder };
