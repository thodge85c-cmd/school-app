/**
 * schedule.js – timetable logic and the Week tab.
 *
 * Questions this file answers:
 *   - Which classes happen on a given day? (respecting term dates, break days,
 *     and Guelph's "this Thursday runs on a Tuesday timetable" make-up days)
 *   - What's the next class, and is one happening right now?
 *   - How do we draw the week grid?
 */

import {
  dayKey, addDays, weekdayName, weekdayIndex, parseTime, fromLocal, parts,
  formatRange, formatKey, formatWeekLabel, DAYS,
} from './dates.js';
import { h, clear, emptyState } from './ui.js';

// --- Which classes are on which day -----------------------------------------

/** True if the day is inside the term (inclusive). Empty term dates mean "always". */
export function isInTerm(settings, key) {
  if (settings.termStart && key < settings.termStart) return false;
  if (settings.termEnd && key > settings.termEnd) return false;
  return true;
}

/** The break (e.g. Thanksgiving) covering this day, or null. */
export function breakOn(settings, key) {
  return (settings.breaks || []).find((b) => b.start && b.end && key >= b.start && key <= b.end) || null;
}

/** The make-up-day rule for this day, or null. */
export function overrideOn(settings, key) {
  return (settings.scheduleOverrides || []).find((o) => o.date === key) || null;
}

/** Which weekday's timetable this date follows ("Mon" … "Sun"). */
export function timetableDay(settings, key) {
  const o = overrideOn(settings, key);
  return o ? o.followsDay : weekdayName(key);
}

/** A short note for unusual days, e.g. "Thanksgiving – no classes". */
export function dayNote(settings, key) {
  const b = breakOn(settings, key);
  if (b) return `${b.label || 'Break'} – no classes`;
  const o = overrideOn(settings, key);
  if (o) return o.label || `Runs on a ${o.followsDay} timetable`;
  if (settings.examStart && settings.examEnd && key >= settings.examStart && key <= settings.examEnd) return 'Exam period';
  return null;
}

/**
 * Every class session on a given day, sorted by start time.
 * Each item: { course, session, key, startMin, endMin }.
 */
export function classesOn(state, key) {
  const s = state.settings;
  if (!isInTerm(s, key) || breakOn(s, key)) return [];
  const day = timetableDay(s, key);
  const out = [];
  for (const course of state.courses) {
    for (const session of course.sessions || []) {
      if (!(session.days || []).includes(day)) continue;
      out.push({ course, session, key, startMin: parseTime(session.start), endMin: parseTime(session.end) });
    }
  }
  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/**
 * The next class from "now" (looking up to two weeks ahead), or null.
 * If a class is in progress right now, that one is returned with isNow: true.
 */
export function nextClass(state, now = new Date(), lookaheadDays = 14) {
  const today = dayKey(now);
  for (let i = 0; i <= lookaheadDays; i++) {
    const key = addDays(today, i);
    for (const item of classesOn(state, key)) {
      const start = fromLocal(key, item.session.start);
      const end = fromLocal(key, item.session.end);
      if (end <= now) continue;            // already finished
      return { ...item, start, end, isNow: start <= now };
    }
  }
  return null;
}

/** "Rozanski Hall · ROZH 101" (whatever parts are filled in). */
export function locationText(session) {
  return [session.building, session.room].filter(Boolean).join(' · ') || 'Location not set';
}

// --- Week tab ---------------------------------------------------------------

const GRID_START = 8 * 60;   // 8:00 AM
const GRID_END = 22 * 60;    // 10:00 PM
const HOUR_PX = 44;          // height of one hour on screen

function yFor(minutes) {
  const clamped = Math.min(Math.max(minutes, GRID_START), GRID_END);
  return ((clamped - GRID_START) / 60) * HOUR_PX;
}

/**
 * Draw the Week tab into `root`.
 * ctx = { state, now, weekKey (a Monday), setWeek(key), openCourse(course),
 *         openDay(key), tasksDueOn(key), extraBlocks(key) }
 */
export function renderWeekView(root, ctx) {
  const { state, now, weekKey } = ctx;
  const showWeekend = state.settings.showWeekend !== false;
  const dayCount = showWeekend ? 7 : 5;
  const todayKey = dayKey(now);
  const keys = Array.from({ length: dayCount }, (_, i) => addDays(weekKey, i));

  clear(root);

  // Navigation row: ‹  Sep 21 – 27  ›  [Today]
  root.append(h('div', { class: 'week-nav' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous week', onclick: () => ctx.setWeek(addDays(weekKey, -7)) }, '‹'),
    h('div', { class: 'week-label', text: formatWeekLabel(weekKey) }),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next week', onclick: () => ctx.setWeek(addDays(weekKey, 7)) }, '›'),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => ctx.setWeek(addDays(todayKey, -weekdayIndex(todayKey))) }, 'Today'),
  ));

  // Notes for unusual days this week (breaks, make-up days).
  const notes = keys.map((k) => ({ k, note: dayNote(state.settings, k) })).filter((x) => x.note);
  if (notes.length) {
    root.append(h('ul', { class: 'week-notes' },
      notes.map(({ k, note }) => h('li', {}, h('strong', { text: `${weekdayName(k)} ${formatKey(k)}` }), ` · ${note}`))));
  }

  const columns = `var(--gutter) repeat(${dayCount}, 1fr)`;

  // Day headings with due-date dots.
  const head = h('div', { class: 'week-head', style: { gridTemplateColumns: columns } }, h('div', { class: 'gutter' }));
  for (const k of keys) {
    const due = ctx.tasksDueOn(k);
    head.append(h('button', {
      class: `day-head${k === todayKey ? ' today' : ''}`, type: 'button',
      'aria-label': `${weekdayName(k)} ${formatKey(k)}${due.length ? `, ${due.length} due` : ''}`,
      onclick: () => ctx.openDay(k),
    },
      h('span', { class: 'dow', text: weekdayName(k) }),
      h('span', { class: 'dom', text: String(Number(k.slice(8))) }),
      h('span', { class: 'dots' }, due.slice(0, 3).map((t) => h('i', { class: `dot colour-${t.colour}` }))),
    ));
  }

  // The grid itself.
  const grid = h('div', { class: 'week-grid', style: { gridTemplateColumns: columns, height: `${yFor(GRID_END)}px` } });
  const gutter = h('div', { class: 'gutter' });
  for (let m = GRID_START; m < GRID_END; m += 60) {
    const hour = m / 60;
    const label = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
    gutter.append(h('span', { class: 'hour-label', style: { top: `${yFor(m)}px` }, text: label }));
  }
  grid.append(gutter);

  for (const k of keys) {
    const col = h('div', { class: `day-col${k === todayKey ? ' today' : ''}` });
    col.style.setProperty('--hour-px', `${HOUR_PX}px`);

    for (const item of classesOn(state, k)) {
      const top = yFor(item.startMin);
      const height = Math.max(yFor(item.endMin) - top, 18);
      col.append(h('button', {
        class: `block colour-${item.course.colour}`, type: 'button',
        style: { top: `${top}px`, height: `${height}px` },
        'aria-label': `${item.course.code} ${item.session.type}, ${formatRange(item.session.start, item.session.end)}`,
        onclick: () => ctx.openCourse(item.course, item),
      },
        h('span', { class: 'block-code', text: item.course.code.split('*')[0] }),
        h('span', { class: 'block-type', text: item.session.type[0] }),
      ));
    }

    // Study blocks and anything else another module wants to draw (Stage 3).
    if (ctx.extraBlocks) for (const el of ctx.extraBlocks(k, yFor, HOUR_PX)) col.append(el);

    // A thin line showing the current time on today's column.
    if (k === todayKey) {
      const mins = parts(now).minutes;
      if (mins >= GRID_START && mins <= GRID_END) {
        col.append(h('div', { class: 'now-line', style: { top: `${yFor(mins)}px` } }));
      }
    }
    grid.append(col);
  }

  const wrap = h('div', { class: 'week-wrap' }, head, grid);
  attachSwipe(wrap, (dir) => ctx.setWeek(addDays(weekKey, dir * 7)));
  root.append(wrap);

  if (!state.courses.length) root.append(emptyState('No courses yet – add them in Settings.'));
}

/** Call onSwipe(+1) for a left swipe (next week) and onSwipe(-1) for a right swipe. */
function attachSwipe(el, onSwipe) {
  let startX = 0; let startY = 0; let tracking = false;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/** Export the grid constants so other modules (study blocks) line up with the grid. */
export const GRID = { start: GRID_START, end: GRID_END, hourPx: HOUR_PX, y: yFor };
export { DAYS };
