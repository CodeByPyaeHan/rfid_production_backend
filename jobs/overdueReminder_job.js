const cron = require("node-cron");
const Circulation = require("../models/circulation_model");
const notificationService = require("../services/notification_service");
const fineRuleService = require("../services/fineRule_service"); // ★ ထပ်ထည့်

async function runOverdueReminder() {
  const now = new Date();

  const overdueLoans = await Circulation.find({
    status: "BORROWED",
    due_date: { $lt: now },
  })
    .populate("user_id", "_id")
    .populate({
      path: "copy_id",
      populate: { path: "book_id", select: "title" },
    });

  let sent = 0;
  for (const c of overdueLoans) {
    const daysOverdue = Math.floor((now - c.due_date) / 86400000);

    let estimatedFine = "—";
    try {
      const { rule } = await fineRuleService.resolve(c.user_id._id, "OVERDUE");
      const chargeableDays = Math.max(
        0,
        daysOverdue - (rule.grace_period_days || 0),
      );
      if (chargeableDays > 0) {
        let amount = chargeableDays * rule.rate_per_day;
        if (rule.max_fine_cap != null)
          amount = Math.min(amount, rule.max_fine_cap);
        estimatedFine = amount.toLocaleString();
      } else {
        estimatedFine = "0";
      }
    } catch (err) {
      if (err.status !== 404)
        console.error(
          `FineRule resolve failed for user ${c.user_id._id}:`,
          err.message,
        );
    }

    try {
      await notificationService.send(c.user_id._id, "OVERDUE", {
        reference_type: "CIRCULATION",
        reference_id: c._id,
        vars: {
          book_title: c.copy_id?.book_id?.title ?? "",
          days_overdue: daysOverdue,
          fine_amount: estimatedFine,
        },
      });
      sent++;
    } catch (err) {
      console.error(
        `Overdue notify failed for circulation ${c._id}:`,
        err.message,
      );
    }
  }
  return { checked: overdueLoans.length, sent };
}

function startOverdueReminderJob() {
  cron.schedule("30 8 * * *", async () => {
    try {
      const result = await runOverdueReminder();
      console.log(
        `[OverdueReminder] Checked ${result.checked}, sent ${result.sent}.`,
      );
    } catch (err) {
      console.error("[OverdueReminder] Job failed:", err.message);
    }
  });
}

module.exports = { startOverdueReminderJob, runOverdueReminder };
