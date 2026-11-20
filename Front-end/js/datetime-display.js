// Shows dates as dd/mm/yyyy HH:mm ET (24-hour, Eastern time), like "14/10/2026 11:15 ET".
// Dates should be stored and sent as UTC ISO strings, like "2026-10-14T15:15:00Z".
// Load this before any page script that shows dates:
//   <script src="js/datetime-display.js"></script>

function formatDateTime(isoText) {
  if (!isoText) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoText));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")} ET`;
}
