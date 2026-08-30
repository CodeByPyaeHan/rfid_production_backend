const APP_TIMEZONE = "Asia/Yangon";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {number} daysOffset - 0 = today, -1 = yesterday, -6 = 7 days ago, etc.
 */
function getMyanmarDayBoundaries(daysOffset = 0) {
  const now = new Date();
  const myanmarDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
  }).format(now);
  const todayStartMs = new Date(
    `${myanmarDateStr}T00:00:00.000+06:30`,
  ).getTime();
  const start = new Date(todayStartMs + daysOffset * DAY_MS);
  const end = new Date(start.getTime() + DAY_MS - 1);
  return { start, end };
}

function getMyanmarMonthStart() {
  const now = new Date();
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return new Date(`${ym}-01T00:00:00.000+06:30`);
}

function getMyanmarYearBoundaries(year) {
  return {
    yearStart: new Date(`${year}-01-01T00:00:00.000+06:30`),
    yearEnd: new Date(`${year}-12-31T23:59:59.999+06:30`),
  };
}

function formatMyanmarDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(
    date,
  );
}

module.exports = {
  APP_TIMEZONE,
  DAY_MS,
  getMyanmarDayBoundaries,
  getMyanmarMonthStart,
  getMyanmarYearBoundaries,
  formatMyanmarDateKey,
};
