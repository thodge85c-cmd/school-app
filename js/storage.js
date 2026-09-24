/**
 * storage.js – loading, saving, backing up and restoring your data.
 *
 * All the app's data lives in the phone's localStorage under ONE key,
 * as a single JSON object. That makes backup/restore a one-liner and
 * means nothing is ever half-saved.
 *
 * The object has a "version" number. If a future update changes the shape
 * of the data, migrate() upgrades old saved data instead of losing it.
 */

import { uid } from './ui.js';

export const STORAGE_KEY = 'uniPlanner.v1';   // the one localStorage key (kept as-is so backups stay compatible)
export const DATA_VERSION = 1;                 // bump when the data shape changes, and add a migration below
export const APP_VERSION = '1.0.0';            // shown on the Settings tab

/** Colour names a course can use. The actual shades are in styles.css. */
export const COLOURS = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'pink', 'yellow'];
export const TASK_TYPES = ['Assignment', 'Quiz', 'Midterm', 'Final', 'Other'];
export const SESSION_TYPES = ['Lecture', 'Seminar', 'Lab'];

/** Default study-time estimates (hours) by task type. Editable per task. */
export const EST_HOURS = { Assignment: 3, Quiz: 1.5, Midterm: 5, Final: 8, Other: 2 };

/** Fresh data for a first-time install: your Fall 2026 timetable. */
export function defaultState() {
  return {
    version: DATA_VERSION,
    courses: [
      {
        id: 'econ1050', code: 'ECON*1050', name: 'Introductory Microeconomics', colour: 'blue', targetGrade: 50,
        sessions: [
          { id: 'econ1050-lec', type: 'Lecture', days: ['Mon', 'Wed'], start: '13:30', end: '14:20', building: 'War Memorial Hall', room: 'WMEM 103' },
        ],
      },
      {
        id: 'mcs1000', code: 'MCS*1000', name: 'Introductory Marketing', colour: 'orange', targetGrade: 50,
        sessions: [
          { id: 'mcs1000-sem', type: 'Seminar', days: ['Tue'], start: '13:30', end: '14:20', building: 'MacNaughton', room: 'MACN 118' },
          { id: 'mcs1000-lec', type: 'Lecture', days: ['Tue'], start: '19:00', end: '20:50', building: 'Alexander Hall', room: 'ALEX 200' },
        ],
      },
      {
        id: 'acct1220', code: 'ACCT*1220', name: 'Intro Financial Accounting', colour: 'green', targetGrade: 50,
        sessions: [
          { id: 'acct1220-sem', type: 'Seminar', days: ['Wed'], start: '15:30', end: '16:20', building: 'MacKinnon', room: 'MCKN 232' },
          { id: 'acct1220-lec', type: 'Lecture', days: ['Thu'], start: '19:00', end: '20:50', building: 'Rozanski Hall', room: 'ROZH 101' },
        ],
      },
      {
        id: 'mgmt1000', code: 'MGMT*1000', name: 'Introduction to Business', colour: 'purple', targetGrade: 50,
        sessions: [
          { id: 'mgmt1000-sem', type: 'Seminar', days: ['Thu'], start: '12:30', end: '14:20', building: 'MacDonald Hall', room: 'MAC 232' },
          { id: 'mgmt1000-lec', type: 'Lecture', days: ['Thu'], start: '14:30', end: '15:50', building: 'Rozanski Hall', room: 'ROZH 101' },
        ],
      },
    ],
    tasks: [],
    notes: [],
    studyBlocks: [],
    gcal: { calendarIds: [], lastSync: null, ignoredEventIds: [], review: [] },
    settings: {
      termStart: '2026-09-10',
      termEnd: '2026-12-04',
      examStart: '2026-12-07',
      examEnd: '2026-12-22',
      // Days with no classes at all.
      breaks: [
        { id: 'brk-thanksgiving', label: 'Thanksgiving', start: '2026-10-12', end: '2026-10-12' },
        { id: 'brk-fallbreak', label: 'Fall study break', start: '2026-10-13', end: '2026-10-13' },
      ],
      // Days that run on a different weekday's timetable (Guelph's make-up days).
      scheduleOverrides: [
        { id: 'ovr-dec3', date: '2026-12-03', followsDay: 'Tue', label: 'Runs on a Tuesday timetable' },
        { id: 'ovr-dec4', date: '2026-12-04', followsDay: 'Mon', label: 'Runs on a Monday timetable' },
      ],
      wakeTime: '07:30',
      bedTime: '23:30',
      studyBlockMinutes: 60,
      maxStudyHoursPerDay: 3,
      displayName: 'Trent',
      showWeekend: true,
      gcalConnected: false,
      gcalClientId: '',        // Google Web client ID (can also be set in js/gcal.js)
    },
  };
}

/**
 * Fill in anything missing from an older or partial save so the rest of the
 * app can rely on every field existing.
 */
function withDefaults(data) {
  const base = defaultState();
  const out = { ...base, ...data };
  out.courses = Array.isArray(data.courses) ? data.courses : base.courses;
  out.tasks = Array.isArray(data.tasks) ? data.tasks : [];
  out.notes = Array.isArray(data.notes) ? data.notes : [];
  out.studyBlocks = Array.isArray(data.studyBlocks) ? data.studyBlocks : [];
  out.gcal = { ...base.gcal, ...(data.gcal || {}) };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  if (!Array.isArray(out.settings.breaks)) out.settings.breaks = [];
  if (!Array.isArray(out.settings.scheduleOverrides)) out.settings.scheduleOverrides = [];
  for (const c of out.courses) {
    if (!c.id) c.id = uid();
    if (!Array.isArray(c.sessions)) c.sessions = [];
    for (const s of c.sessions) if (!s.id) s.id = uid();
  }
  return out;
}

/** Upgrade data saved by an older version of the app. */
function migrate(data) {
  let v = Number(data.version) || 1;
  // Example for the future:
  // if (v === 1) { ...change fields...; v = 2; }
  data.version = v;
  return data;
}

/** Read the saved data (or start fresh). Never throws. */
export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return defaultState();
    return withDefaults(migrate(data));
  } catch (err) {
    console.error('Could not read saved data, starting fresh.', err);
    return defaultState();
  }
}

/** Write the data. Called after every change so nothing is ever lost. */
export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Could not save.', err);
    return false;
  }
}

/** Download a .json backup of everything. */
export function exportJSON(state, todayKey) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grif-planner-backup-${todayKey}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Turn the text of a backup file back into app data.
 * Throws an Error with a friendly message if the file isn't a Grif Planner backup.
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.courses) || !Array.isArray(data.tasks)) {
    throw new Error("That file doesn't look like a Grif Planner backup.");
  }
  return withDefaults(migrate(data));
}

/** Wipe everything and go back to the built-in defaults. */
export function reset() {
  localStorage.removeItem(STORAGE_KEY);
  return defaultState();
}

// --- Small per-device preferences (which tab is open, current filter …) ----
// These are NOT part of your data, so they're kept under a separate key and
// left out of backups.

const PREFS_KEY = 'uniPlanner.ui';

export function loadPrefs() {
  try {
    return { tab: 'home', taskFilter: 'all', ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')) };
  } catch {
    return { tab: 'home', taskFilter: 'all' };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
