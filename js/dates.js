/**
 * dates.js – date and time helpers.
 *
 * Everything the app shows is in the America/Toronto timezone, no matter
 * what the phone's clock is set to. JavaScript's built-in Date only knows
 * "UTC" and "wherever the device is", so we lean on the browser's Intl API
 * to convert to Toronto time.
 *
 * Two ideas are used everywhere in the app:
 *   - a "day key" is a string like "2026-09-24" (one calendar day in Toronto)
 *   - a "time" is a string like "13:30" (24-hour clock, minutes precision)
 * Strings like these sort correctly with plain < and >, which keeps the
 * code simple.
 */

export const TZ = 'America/Toronto';
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Formatter that breaks a Date into Toronto-time pieces (year, month, ...).
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short',
});

/** Break a Date into its Toronto-time parts. */
export function parts(date = new Date()) {
  const p = {};
  for (const item of partsFormatter.formatToParts(date)) p[item.type] = item.value;
  const hour = Number(p.hour) % 24; // some browsers report midnight as "24"
  const minute = Number(p.minute);
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour,
    minute,
    minutes: hour * 60 + minute,       // minutes since midnight
    weekday: p.weekday,                // "Mon" … "Sun"
    dayKey: `${p.year}-${p.month}-${p.day}`,
  };
}

/** "2026-09-24" for the Toronto day that contains this Date. */
export function dayKey(date = new Date()) {
  return parts(date).dayKey;
}

// --- Day-key arithmetic ----------------------------------------------------
// We do day maths in UTC on purpose: UTC has no daylight-saving jumps, so
// "add one day" is always exactly 24 hours and never lands on the wrong date.

function keyToUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Add (or subtract) whole days to a day key. */
export function addDays(key, n) {
  return utcToKey(keyToUTC(key) + n * MS_PER_DAY);
}

/** Whole days from key a to key b (negative if b is earlier). */
export function daysBetween(a, b) {
  return Math.round((keyToUTC(b) - keyToUTC(a)) / MS_PER_DAY);
}

/** 0 for Monday … 6 for Sunday. */
export function weekdayIndex(key) {
  return (new Date(keyToUTC(key)).getUTCDay() + 6) % 7;
}

/** "Mon" … "Sun" for a day key. */
export function weekdayName(key) {
  return DAYS[weekdayIndex(key)];
}

/** The Monday that starts the week containing this day key. */
export function weekStart(key) {
  return addDays(key, -weekdayIndex(key));
}

// --- Times ("13:30") --------------------------------------------------------

/** "13:30" → 810 (minutes since midnight). */
export function parseTime(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 810 → "13:30". */
export function toTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 810 → "1:30 PM". */
export function formatMinutes(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "13:30", "14:20" → "1:30–2:20 PM" (the AM/PM is only repeated if it differs). */
export function formatRange(startT, endT) {
  const a = formatMinutes(parseTime(startT));
  const b = formatMinutes(parseTime(endT));
  if (a.slice(-2) === b.slice(-2)) return `${a.slice(0, -3)}–${b}`;
  return `${a}–${b}`;
}

// --- Building real Dates from Toronto day + time ---------------------------

/**
 * Turn a Toronto day key and time into a real Date (an exact instant).
 * We make a first guess as if Toronto were UTC, look at what Toronto time
 * that guess actually lands on, and nudge by the difference. Two passes
 * cover the rare case where the first nudge crosses a daylight-saving change.
 */
export function fromLocal(key, time = '00:00') {
  const [y, m, d] = key.split('-').map(Number);
  const mins = parseTime(time);
  const want = Date.UTC(y, m - 1, d, Math.floor(mins / 60), mins % 60);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess));
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += want - got;
  }
  return new Date(guess);
}

/** Start of the Toronto day (midnight) as a Date. */
export function startOfDay(key) {
  return fromLocal(key, '00:00');
}

// --- Human-friendly formatting ---------------------------------------------

/** "1:30 PM" in Toronto time. */
export function formatTime(date) {
  return formatMinutes(parts(date).minutes);
}

/** "Thursday, September 24" */
export function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric',
  }).format(date);
}

/** "Sep 24" (or "Sep 24, 2026" with { year: true }). */
export function formatKey(key, { year = false } = {}) {
  const opts = { timeZone: TZ, month: 'short', day: 'numeric' };
  if (year) opts.year = 'numeric';
  return new Intl.DateTimeFormat('en-US', opts).format(fromLocal(key, '12:00'));
}

/** "Sep 21 – 27" or "Sep 28 – Oct 4" for a week starting on Monday. */
export function formatWeekLabel(mondayKey) {
  const sundayKey = addDays(mondayKey, 6);
  const a = formatKey(mondayKey);
  const b = formatKey(sundayKey);
  if (a.split(' ')[0] === b.split(' ')[0]) return `${a} – ${b.split(' ')[1]}`;
  return `${a} – ${b}`;
}

/**
 * A due date the way a person would say it:
 * "Today, 11:59 PM" · "Tomorrow, 11:59 PM" · "Thursday, 1:00 PM" · "Oct 15, 11:59 PM"
 */
export function formatDue(date, now = new Date()) {
  const today = dayKey(now);
  const key = dayKey(date);
  const diff = daysBetween(today, key);
  const t = formatTime(date);
  if (diff === 0) return `Today, ${t}`;
  if (diff === 1) return `Tomorrow, ${t}`;
  if (diff === -1) return `Yesterday, ${t}`;
  if (diff > 1 && diff < 7) return `${DAYS_LONG[weekdayIndex(key)]}, ${t}`;
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return `${formatKey(key, { year: !sameYear })}, ${t}`;
}

/** Milliseconds → "in 45 min" · "in 2 h 10 min" · "in 3 days". */
export function countdown(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const days = Math.round(h / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** Milliseconds → "25 min left" · "1 h 5 min left". */
export function timeLeft(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

/** "Good morning" / "Good afternoon" / "Good evening" based on Toronto time. */
export function greetingFor(date = new Date()) {
  const h = parts(date).hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
