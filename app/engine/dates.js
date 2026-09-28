/* Calendar days as plain integers: days since 1970-01-01. No clock time and
no time zone, so a date read in Dubai is the same date read in London, and
"days between" is simple subtraction.
*/
const MS_PER_DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function day(year, month, dayOfMonth) {
  return Date.UTC(year, month - 1, dayOfMonth) / MS_PER_DAY;
}

/** "2026-09-28" to a day number. Anything else, or an impossible date such
as 2026-02-30, gives null. */
export function parseIsoDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const n = day(y, mo, d);
  const back = new Date(n * MS_PER_DAY);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return n;
}

/** Monday is 0, Sunday is 6. */
export function weekday(n) {
  return (((n + 3) % 7) + 7) % 7;   // 1 Jan 1970 was a Thursday
}

export function toIso(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** "28 Sep" */
export function fmtShort(n) {
  const d = new Date(n * MS_PER_DAY);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Mon 28 Sep 2026" */
export function fmtLong(n) {
  if (n == null) return "not set";
  const d = new Date(n * MS_PER_DAY);
  return `${WEEKDAY_NAMES[weekday(n)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
