const cron = require("node-cron");
const reservationService = require("../services/reservation_service");

function startReservationExpiryJob() {
  cron.schedule("0 * * * *", async () => {
    try {
      const result = await reservationService.expireOverdueHolds();
      if (result.expiredCount > 0)
        console.log(
          `[ReservationExpiry] Expired ${result.expiredCount} reservation(s).`,
        );
    } catch (err) {
      console.error("[ReservationExpiry] Job failed:", err.message);
    }
  });
}
module.exports = { startReservationExpiryJob };
