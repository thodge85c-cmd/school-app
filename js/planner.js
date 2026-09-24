/**
 * planner.js – the "Plan my week" study-block generator.
 *
 * In plain language:
 *   1. For each day of the week, work out the free time: between wake and
 *      bed time, not during classes (with a 15-minute buffer either side),
 *      and not overlapping study blocks you've already done.
 *   2. Chop the free time into blocks (default 60 min), never more than the
 *      daily maximum (default 3 hours).
 *   3. Score every unfinished task: weight ÷ days until due. Sooner and
 *      heavier means a higher score.
 *   4. Hand out the earliest blocks to the highest-scoring task until its
 *      estimated hours are covered, then move to the next task. A block is
 *      never placed after the task's due date.
 */

import { dayKey, addDays, parseTime, toTime, fromLocal, parts } from './dates.js';
import { uid } from './ui.js';
import { classesOn } from './schedule.js';

const BUFFER_MIN = 15;

/** weight ÷ days until due. Weightless tasks count as 1% so they still get time. */
export function priorityScore(task, now = new Date()) {
  const days = Math.max(0.25, (new Date(task.dueDate) - now) / 86400000);
  return (Number(task.weight) || 1) / days;
}

/** Subtract [s,e) from a list of free windows [{start,end}] (all in minutes). */
function subtract(windows, s, e) {
  const out = [];
  for (const w of windows) {
    if (e <= w.start || s >= w.end) { out.push(w); continue; }
    if (s > w.start) out.push({ start: w.start, end: s });
    if (e < w.end) out.push({ start: e, end: w.end });
  }
  return out;
}

/**
 * Empty time slots on one day, as [{ key, start, end }] in minutes.
 * `keep` = blocks already on that day that must not be overlapped.
 */
export function freeSlots(state, key, keep, now) {
  const s = state.settings;
  const blockMin = Number(s.studyBlockMinutes) || 60;
  let windows = [{ start: parseTime(s.wakeTime || '07:30'), end: parseTime(s.bedTime || '23:30') }];
  if (windows[0].end <= windows[0].start) windows = [];

  // Today: nothing in the past. Round up to the next quarter hour.
  if (key === dayKey(now)) {
    const nowMin = Math.ceil(parts(now).minutes / 15) * 15;
    windows = subtract(windows, 0, nowMin);
  }
  for (const c of classesOn(state, key)) windows = subtract(windows, c.startMin - BUFFER_MIN, c.endMin + BUFFER_MIN);
  for (const b of keep) windows = subtract(windows, parseTime(b.start), parseTime(b.end));

  const slots = [];
  for (const w of windows) {
    for (let t = w.start; t + blockMin <= w.end; t += blockMin) slots.push({ key, start: t, end: t + blockMin });
  }
  return slots;
}

/**
 * Generate study blocks for the 7 days starting at weekKey (a Monday).
 * Returns the NEW blocks only; existing done blocks are respected, not touched.
 */
export function planWeek(state, weekKey, now = new Date()) {
  const s = state.settings;
  const today = dayKey(now);
  const blockMin = Number(s.studyBlockMinutes) || 60;
  const maxPerDay = (Number(s.maxStudyHoursPerDay) || 3) * 60;
  const dayCount = s.showWeekend === false ? 5 : 7;

  // Hours already scheduled per task (any date, done or not) count toward its estimate.
  const scheduled = new Map();
  for (const b of state.studyBlocks) {
    scheduled.set(b.taskId, (scheduled.get(b.taskId) || 0) + (parseTime(b.end) - parseTime(b.start)));
  }

  // Candidate tasks, best score first.
  const tasks = state.tasks
    .filter((t) => !t.done && new Date(t.dueDate) > now)
    .map((t) => ({
      task: t,
      score: priorityScore(t, now),
      remaining: Math.max(0, (Number(t.estHours) || 0) * 60 - (scheduled.get(t.id) || 0)),
    }))
    .filter((x) => x.remaining > 0)
    .sort((a, b) => b.score - a.score);
  if (!tasks.length) return [];

  // Free slots for every day, in order.
  const slots = [];
  for (let i = 0; i < dayCount; i++) {
    const key = addDays(weekKey, i);
    if (key < today) continue;
    const keep = state.studyBlocks.filter((b) => b.date === key);
    const usedAlready = keep.reduce((sum, b) => sum + (parseTime(b.end) - parseTime(b.start)), 0);
    let budget = maxPerDay - usedAlready;
    for (const slot of freeSlots(state, key, keep, now)) {
      if (budget < blockMin) break;
      slots.push({ ...slot, free: true });
      budget -= blockMin;
    }
  }

  const created = [];
  for (const item of tasks) {
    const dueMs = new Date(item.task.dueDate).getTime();
    for (const slot of slots) {
      if (item.remaining <= 0) break;
      if (!slot.free) continue;
      if (fromLocal(slot.key, toTime(slot.end)).getTime() > dueMs) continue;   // never after the due date
      slot.free = false;
      item.remaining -= blockMin;
      created.push({ id: uid(), taskId: item.task.id, date: slot.key, start: toTime(slot.start), end: toTime(slot.end), done: false });
    }
  }
  return created;
}

/** Remove this week's not-done blocks from today onward (used before re-planning). */
export function clearWeek(state, weekKey, now = new Date()) {
  const today = dayKey(now);
  const last = addDays(weekKey, 6);
  state.studyBlocks = state.studyBlocks.filter((b) => b.done || b.date < weekKey || b.date > last || b.date < today);
}

/** Study blocks on one day, earliest first. */
export function blocksOn(state, key) {
  return state.studyBlocks.filter((b) => b.date === key).sort((a, b) => a.start.localeCompare(b.start));
}
