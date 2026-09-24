/**
 * gcal.js – read-only Google Calendar sync.
 *
 * How it works, in plain language:
 *   1. We load Google's sign-in script (Google Identity Services).
 *   2. When you tap "Connect", Google shows a pop-up asking you to allow
 *      READ-ONLY access to your calendars. It hands back a short-lived
 *      "access token" (a password that expires after about an hour).
 *   3. With that token we ask the Calendar API for your events between today
 *      and the end of term.
 *   4. Events whose title mentions a course become tasks. Anything else goes
 *      into a Review list so you can assign a course or ignore it.
 *
 * There is no server and no client secret. The only Google value in the code
 * is the Client ID, which is safe to be public.
 */

import { dayKey, fromLocal } from './dates.js';
import { uid } from './ui.js';
import { EST_HOURS } from './storage.js';

/**
 * Paste your Google "Web client" ID here once you have one (see README).
 * You can also paste it into Settings instead, which overrides this.
 */
export const CLIENT_ID = '';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_KEY = 'uniPlanner.gcalToken';   // sessionStorage: cleared when the app is fully closed

export function getClientId(state) {
  return (state.settings.gcalClientId || CLIENT_ID || '').trim();
}

// --- Google's script ---------------------------------------------------------

let gisPromise = null;

/** Load Google Identity Services once. Fails if offline. */
function loadGis() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error("Couldn't reach Google. Are you online?")); };
    document.head.append(s);
  });
  return gisPromise;
}

// --- Access token ------------------------------------------------------------

function readToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (t && t.token && t.expiresAt > Date.now() + 60 * 1000) return t.token;
  } catch { /* ignore */ }
  return null;
}

function writeToken(token, expiresInSec) {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresInSec * 1000 }));
  } catch { /* ignore */ }
}

export function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

/** True if we can sync right now without bothering the user. */
export function hasValidToken() {
  return Boolean(readToken());
}

/**
 * Get an access token. If one is cached and fresh, use it. Otherwise open the
 * Google pop-up (which needs to be triggered by a tap, or browsers block it).
 */
export async function getToken(state, { interactive = true } = {}) {
  const cached = readToken();
  if (cached) return cached;
  if (!interactive) throw new Error('Google sign-in needed – tap Sync.');
  const clientId = getClientId(state);
  if (!clientId) throw new Error('Add your Google Client ID in Settings first.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(`Google sign-in failed: ${resp.error}`)); return; }
        writeToken(resp.access_token, Number(resp.expires_in) || 3600);
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || 'Google sign-in was cancelled.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// --- Calendar API calls ------------------------------------------------------

async function apiGet(token, path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { clearToken(); throw new Error('Google sign-in expired – tap Sync again.'); }
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}`);
  return res.json();
}

/** Your calendars: [{ id, name, primary }]. */
export async function listCalendars(token) {
  const data = await apiGet(token, '/users/me/calendarList', { minAccessRole: 'reader' });
  return (data.items || []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, primary: Boolean(c.primary) }));
}

/** All events on one calendar between two Dates (recurring events expanded). */
export async function listEvents(token, calendarId, timeMin, timeMax) {
  const items = [];
  let pageToken = null;
  do {
    const data = await apiGet(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250', pageToken,
    });
    for (const e of data.items || []) {
      if (e.status === 'cancelled' || !e.start) continue;
      items.push({
        id: e.id,
        title: e.summary || '(no title)',
        // All-day events have start.date; timed events have start.dateTime.
        start: e.start.dateTime || e.start.date,
        end: e.end?.dateTime || e.end?.date || null,
        allDay: !e.start.dateTime,
        calendarId,
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return items;
}

// --- Matching events to courses ----------------------------------------------

/** "ACCT*1220" → "acct1220"; also strips punctuation from titles. */
function squash(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find the course an event title belongs to, or null.
 * Matches "ACCT*1220", "ACCT 1220", "ACCT1220", the subject on its own
 * ("ACCT"), or the course name ("Financial Accounting").
 */
export function matchCourse(title, courses) {
  const flat = squash(title);
  const words = (title || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  // Full code first (most specific).
  for (const c of courses) {
    const code = squash(c.code);
    if (code && flat.includes(code)) return c;
  }
  // Then the subject prefix as its own word ("ACCT midterm").
  for (const c of courses) {
    const subject = (c.code || '').split(/[^a-z]/i)[0].toLowerCase();
    if (subject.length >= 3 && words.includes(subject)) return c;
  }
  // Then the course name.
  for (const c of courses) {
    const name = squash(c.name);
    if (name.length >= 6 && flat.includes(name)) return c;
  }
  return null;
}

/** Guess Assignment / Quiz / Midterm / Final / Other from the title. */
export function guessType(title) {
  const t = (title || '').toLowerCase();
  if (/\bfinal\b/.test(t)) return 'Final';
  if (/\bmidterm\b|\bmid-term\b/.test(t)) return 'Midterm';
  if (/\bquiz|\btest\b/.test(t)) return 'Quiz';
  if (/assignment|homework|essay|report|project|paper|\bdue\b|lab\b/.test(t)) return 'Assignment';
  return 'Other';
}

/** Try to read a weight like "25%" out of the title. */
function guessWeight(title) {
  const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(title || '');
  return m ? Math.min(100, Number(m[1])) : 0;
}

/** When is the event "due"? All-day events → 11:59 PM that day. */
function dueFromEvent(ev) {
  if (ev.allDay) return fromLocal(ev.start, '23:59').toISOString();
  const d = new Date(ev.start);
  return Number.isNaN(d.getTime()) ? fromLocal(dayKey(), '23:59').toISOString() : d.toISOString();
}

/** Build a brand-new task from an event. */
export function taskFromEvent(ev, courseId) {
  const type = guessType(ev.title);
  return {
    id: uid(), courseId, title: ev.title, type,
    dueDate: dueFromEvent(ev), weight: guessWeight(ev.title), estHours: EST_HOURS[type] ?? 2,
    done: false, grade: null, source: 'gcal', gcalEventId: ev.id,
  };
}

/**
 * Merge freshly fetched events into the app data. Mutates state.
 * Returns { added, updated, review } counts.
 *
 * Rules:
 *  - An event we've already imported (same gcalEventId) is UPDATED: title and
 *    due date follow the calendar; done/grade/weight you set by hand are kept.
 *  - A new event that mentions a course becomes a task.
 *  - Anything else waits in the Review list (unless you ignored it before).
 */
export function mergeEvents(state, events) {
  const counts = { added: 0, updated: 0, review: 0 };
  const byEventId = new Map(state.tasks.filter((t) => t.gcalEventId).map((t) => [t.gcalEventId, t]));
  const ignored = new Set(state.gcal.ignoredEventIds || []);
  const review = new Map((state.gcal.review || []).map((r) => [r.eventId, r]));

  for (const ev of events) {
    const existing = byEventId.get(ev.id);
    if (existing) {
      const due = dueFromEvent(ev);
      if (existing.title !== ev.title || existing.dueDate !== due) {
        existing.title = ev.title;
        existing.dueDate = due;
        counts.updated++;
      }
      review.delete(ev.id);
      continue;
    }
    if (ignored.has(ev.id)) continue;
    const course = matchCourse(ev.title, state.courses);
    if (course) {
      state.tasks.push(taskFromEvent(ev, course.id));
      counts.added++;
      review.delete(ev.id);
    } else if (!review.has(ev.id)) {
      review.set(ev.id, { eventId: ev.id, title: ev.title, start: ev.start, allDay: ev.allDay });
      counts.review++;
    }
  }

  // Drop review items whose events no longer exist.
  const seen = new Set(events.map((e) => e.id));
  state.gcal.review = [...review.values()].filter((r) => seen.has(r.eventId));
  return counts;
}

/** Turn a Review item into a task for the chosen course. */
export function assignReviewItem(state, eventId, courseId) {
  const item = (state.gcal.review || []).find((r) => r.eventId === eventId);
  if (!item) return null;
  const task = taskFromEvent({ id: item.eventId, title: item.title, start: item.start, allDay: item.allDay }, courseId);
  state.tasks.push(task);
  state.gcal.review = state.gcal.review.filter((r) => r.eventId !== eventId);
  return task;
}

/** Hide a Review item for good. */
export function ignoreReviewItem(state, eventId) {
  state.gcal.review = (state.gcal.review || []).filter((r) => r.eventId !== eventId);
  if (!state.gcal.ignoredEventIds.includes(eventId)) state.gcal.ignoredEventIds.push(eventId);
}

// --- The full sync -----------------------------------------------------------

/**
 * Fetch events from every selected calendar and merge them in.
 * Throws with a friendly message if something goes wrong.
 */
export async function sync(state, { interactive = true } = {}) {
  if (!navigator.onLine) throw new Error("You're offline – try again later.");
  const token = await getToken(state, { interactive });
  const calendarIds = state.gcal.calendarIds || [];
  if (!calendarIds.length) throw new Error('Pick at least one calendar in Settings.');

  const s = state.settings;
  const timeMin = fromLocal(dayKey(), '00:00');
  const endKey = [s.termEnd, s.examEnd].filter(Boolean).sort().pop() || dayKey();
  const timeMax = fromLocal(endKey, '23:59');
  if (timeMax < timeMin) throw new Error('Your term end date is in the past – update it in Settings.');

  const all = [];
  for (const id of calendarIds) all.push(...await listEvents(token, id, timeMin, timeMax));

  const counts = mergeEvents(state, all);
  state.gcal.lastSync = new Date().toISOString();
  state.settings.gcalConnected = true;
  return { ...counts, fetched: all.length };
}
