/**
 * syllabus.js – turn a pasted course outline into draft tasks.
 *
 * No AI here: we look at every line of the text and pull out anything that
 * looks like a date ("Oct 15", "October 15, 2026", "15 Oct", "10/15",
 * "2026-10-15") and anything that looks like a weight ("25%"). Lines with a
 * date become draft tasks that you check in a preview before saving.
 */

import { fromLocal } from './dates.js';
import { uid } from './ui.js';
import { EST_HOURS } from './storage.js';
import { guessType } from './gcal.js';

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

// Each pattern finds a date and tells us how to read the pieces.
const DATE_PATTERNS = [
  { re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i'), read: (m) => ({ month: MONTHS[m[1].toLowerCase()], day: +m[2], year: m[3] ? +m[3] : null }) },
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?`, 'i'), read: (m) => ({ month: MONTHS[m[2].toLowerCase()], day: +m[1], year: m[3] ? +m[3] : null }) },
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/, read: (m) => ({ year: +m[1], month: +m[2], day: +m[3] }) },
  { re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, read: (m) => ({ month: +m[1], day: +m[2], year: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null }) },
];

const PERCENT_RE = /(\d{1,3}(?:\.\d+)?)\s*%/;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

const pad = (n) => String(n).padStart(2, '0');

/** Find the first date in a line. Returns { key: "2026-10-15", match } or null. */
export function findDate(line, defaultYear) {
  for (const p of DATE_PATTERNS) {
    const m = p.re.exec(line);
    if (!m) continue;
    const d = p.read(m);
    if (!d.month || d.month > 12 || !d.day || d.day > 31) continue;
    const year = d.year || defaultYear;
    return { key: `${year}-${pad(d.month)}-${pad(d.day)}`, match: m[0] };
  }
  return null;
}

/** "1:00 pm" → "13:00", or null. */
function findTime(line) {
  const m = TIME_RE.exec(line);
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  return `${pad(h)}:${pad(+(m[2] || 0))}`;
}

/** Tidy a title: strip the date, weight, and leftover separators. */
function cleanTitle(line, dateMatch) {
  let t = line.replace(dateMatch, ' ').replace(PERCENT_RE, ' ').replace(TIME_RE, ' ');
  t = t.replace(/\b(due|on|by|date|weight|worth)\b:?/gi, ' ');
  t = t.replace(/[|•·\-–—:,;()\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t || 'Untitled';
}

/**
 * Parse pasted text into draft tasks.
 * Each draft: { id, title, type, dateKey, time, weight, include: true, line }
 */
export function parseSyllabus(text, { defaultYear } = {}) {
  const year = defaultYear || new Date().getFullYear();
  const drafts = [];
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 4) continue;
    const date = findDate(line, year);
    if (!date) continue;
    const pct = PERCENT_RE.exec(line);
    drafts.push({
      id: uid(),
      title: cleanTitle(line, date.match),
      type: guessType(line),
      dateKey: date.key,
      time: findTime(line) || '23:59',
      weight: pct ? Math.min(100, Number(pct[1])) : 0,
      include: true,
      line,
    });
  }
  return drafts;
}

/** Turn an approved draft into a real task. */
export function taskFromDraft(d, courseId) {
  return {
    id: uid(), courseId, title: d.title, type: d.type,
    dueDate: fromLocal(d.dateKey, d.time || '23:59').toISOString(),
    weight: Number(d.weight) || 0, estHours: EST_HOURS[d.type] ?? 2,
    done: false, grade: null, source: 'syllabus',
  };
}
