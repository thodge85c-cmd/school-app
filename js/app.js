/**
 * app.js – where everything starts.
 *
 * This file:
 *   1. loads your saved data,
 *   2. wires up the bottom tab bar,
 *   3. draws whichever tab is selected (Home is drawn right here; the
 *      Week, Tasks and Settings tabs live in their own files),
 *   4. re-draws every so often so countdowns stay fresh,
 *   5. registers the service worker so the app works offline.
 */

import * as storage from './storage.js';
import {
  dayKey, weekStart, formatLongDate, greetingFor, countdown, timeLeft, formatDue,
  formatRange, formatKey, weekdayIndex, fromLocal, DAYS_LONG,
} from './dates.js';
import { h, clear, openSheet, closeSheet, isSheetOpen, toast, emptyState } from './ui.js';
import { nextClass, classesOn, dayNote, locationText, renderWeekView } from './schedule.js';
import {
  renderTasksView, openTaskForm, dueSoon, tasksDueOn, taskRow, upcomingForCourse, courseById,
} from './tasks.js';
import { renderSettingsView } from './settings.js';
import { sync as gcalSync, hasValidToken, assignReviewItem, ignoreReviewItem } from './gcal.js';

const TABS = ['home', 'week', 'tasks', 'grades', 'settings'];

let state = storage.load();
let prefs = storage.loadPrefs();
let weekKey = weekStart(dayKey());   // the Monday of the week shown on the Week tab
let lastTab = null;

const view = document.getElementById('view');

// --- Saving ----------------------------------------------------------------

/** Save the current data and redraw. Call this after ANY change. */
function commit() {
  storage.save(state);
  render();
}

/** Swap in completely new data (after an import or reset). */
function replaceState(next) {
  state = next;
  storage.save(state);
  render();
}

/** Everything a tab needs to do its job. */
function ctx() {
  return { state, now: new Date(), commit, replaceState, rerender: render, syncNow };
}

// --- Tabs ------------------------------------------------------------------

function setTab(tab) {
  if (!TABS.includes(tab)) tab = 'home';
  prefs.tab = tab;
  storage.savePrefs(prefs);
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  closeSheet();
  render();
}

function render() {
  const tab = TABS.includes(prefs.tab) ? prefs.tab : 'home';
  const sameTab = tab === lastTab;
  const scrollY = window.scrollY;

  for (const btn of document.querySelectorAll('.tabbar .tab')) {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  }
  view.dataset.tab = tab;

  if (tab === 'home') renderHome();
  else if (tab === 'week') renderWeek();
  else if (tab === 'tasks') renderTasks();
  else if (tab === 'grades') renderGrades();
  else renderSettingsView(view, ctx());

  // Keep the scroll position when redrawing the same tab; jump to the top when switching.
  window.scrollTo(0, sameTab ? scrollY : 0);
  lastTab = tab;
}

// --- Home tab --------------------------------------------------------------

function renderHome() {
  const now = new Date();
  const today = dayKey(now);
  const name = state.settings.displayName?.trim();
  clear(view);

  view.append(h('header', { class: 'page-header home-header' },
    h('div', {},
      h('h1', { text: `${greetingFor(now)}${name ? `, ${name}` : ''}` }),
      h('p', { class: 'subtitle', text: formatLongDate(now) }))));

  // "Up Next" card
  const next = nextClass(state, now);
  if (next) {
    const sameDay = next.key === today;
    const label = next.isNow
      ? `Now · ${timeLeft(next.end - now)}`
      : `Up next · ${sameDay ? countdown(next.start - now) : formatDue(next.start, now)}`;
    view.append(h('button', {
      class: `card up-next colour-${next.course.colour}${next.isNow ? ' is-now' : ''}`, type: 'button',
      onclick: () => openCourseSheet(next.course),
    },
      h('span', { class: 'eyebrow', text: label }),
      h('span', { class: 'big', text: `${next.course.code} ${next.session.type}` }),
      h('span', { class: 'muted', text: next.course.name }),
      h('span', { class: 'detail', text: `${formatRange(next.session.start, next.session.end)} · ${locationText(next.session)}` })));
  } else {
    view.append(h('section', { class: 'card' },
      h('span', { class: 'eyebrow', text: 'Up next' }),
      h('p', { class: 'muted', text: state.courses.length ? 'No classes in the next two weeks.' : 'Add your courses in Settings to see your next class here.' })));
  }

  // "Due Soon"
  const soon = dueSoon(state.tasks, now, 72);
  view.append(h('section', { class: 'card' },
    h('h2', { text: 'Due soon' }),
    soon.length
      ? h('ul', { class: 'task-list' }, soon.map((t) => taskRow(state, t, { now, onToggle: toggleTask, onEdit: editTask })))
      : emptyState(state.tasks.length ? 'Nothing due in the next 3 days.' : 'No tasks yet – add one on the Tasks tab.')));

  // "Today"
  const todays = classesOn(state, today);
  const note = dayNote(state.settings, today);
  view.append(h('section', { class: 'card' },
    h('h2', { text: 'Today' }),
    note ? h('p', { class: 'hint', text: note }) : null,
    todays.length
      ? h('ul', { class: 'class-list' }, todays.map((item) => {
        const startMs = fromLocal(item.key, item.session.start);
        const endMs = fromLocal(item.key, item.session.end);
        const cls = endMs <= now ? ' past' : (startMs <= now ? ' current' : '');
        return h('li', {},
          h('button', { class: `class-row colour-${item.course.colour}${cls}`, type: 'button', onclick: () => openCourseSheet(item.course) },
            h('span', { class: 'class-time', text: formatRange(item.session.start, item.session.end) }),
            h('span', { class: 'class-main' },
              h('span', { class: 'class-title', text: `${item.course.code} · ${item.session.type}` }),
              h('span', { class: 'class-sub', text: locationText(item.session) }))));
      }))
      : emptyState(note ? 'Enjoy the day off.' : 'No classes today.')));
}

// --- Week tab --------------------------------------------------------------

function renderWeek() {
  renderWeekView(view, {
    state,
    now: new Date(),
    weekKey,
    setWeek: (key) => { weekKey = key; render(); },
    openCourse: (course) => openCourseSheet(course),
    openDay: (key) => openDaySheet(key),
    tasksDueOn: (key) => tasksDueOn(state, key).map((t) => ({ ...t, colour: courseById(state, t.courseId)?.colour || 'blue' })),
  });
}

// --- Tasks tab -------------------------------------------------------------

function renderTasks() {
  renderTasksView(view, {
    state,
    now: new Date(),
    filter: state.courses.some((c) => c.id === prefs.taskFilter) ? prefs.taskFilter : 'all',
    setFilter: (f) => { prefs.taskFilter = f; storage.savePrefs(prefs); render(); },
    onAdd: () => addTask(),
    onEdit: editTask,
    onToggle: toggleTask,
    onSync: () => syncNow(),
    onReview: () => openReviewSheet(),
  });
}

// --- Google Calendar -----------------------------------------------------------

let syncing = false;

/** Pull events from Google. interactive=false means "only if no pop-up is needed". */
async function syncNow({ interactive = true } = {}) {
  if (syncing) return;
  syncing = true;
  if (interactive) toast('Syncing…');
  try {
    const r = await gcalSync(state, { interactive });
    commit();
    const bits = [];
    if (r.added) bits.push(`${r.added} new`);
    if (r.updated) bits.push(`${r.updated} updated`);
    if (r.review) bits.push(`${r.review} to review`);
    toast(bits.length ? `Synced: ${bits.join(', ')}` : 'Synced – nothing new');
  } catch (err) {
    if (interactive) toast(err.message || 'Sync failed.', 4000);
    else console.info('Auto-sync skipped:', err.message);
  } finally {
    syncing = false;
  }
}

/** Calendar events that didn't match a course: assign one or ignore them. */
function openReviewSheet() {
  const items = state.gcal.review || [];
  const content = items.length
    ? h('ul', { class: 'review-list' }, items.map((item) => {
      const pick = h('select', {}, h('option', { value: '', text: 'Choose a course…' }),
        state.courses.map((c) => h('option', { value: c.id, text: c.code })));
      return h('li', { class: 'mini-card' },
        h('strong', { text: item.title }),
        h('span', { class: 'muted', text: formatDue(new Date(item.allDay ? fromLocal(item.start, '23:59') : item.start)) }),
        h('div', { class: 'row' },
          pick,
          h('div', { class: 'btn-row tight' },
            h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: () => {
              if (!pick.value) { toast('Pick a course first.'); return; }
              assignReviewItem(state, item.eventId, pick.value);
              commit(); toast('Task added'); openReviewSheet();
            } }, 'Add'),
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
              ignoreReviewItem(state, item.eventId);
              commit(); openReviewSheet();
            } }, 'Ignore'))));
    }))
    : emptyState('Nothing left to review.');
  openSheet('Review calendar events', [
    h('p', { class: 'hint', text: 'These events didn\'t mention a course. Add them as tasks or ignore them (ignored events stay hidden on future syncs).' }),
    content,
  ]);
}

function addTask(presets = {}) {
  if (!state.courses.length) { toast('Add a course in Settings first.'); return; }
  openTaskForm(state, null, {
    now: new Date(),
    presets,
    onSave: (task) => { state.tasks.push(task); commit(); toast('Task added'); },
    onDelete: () => {},
  });
}

function editTask(task) {
  openTaskForm(state, task, {
    now: new Date(),
    onSave: (saved) => {
      const i = state.tasks.findIndex((t) => t.id === saved.id);
      if (i >= 0) state.tasks[i] = saved; else state.tasks.push(saved);
      commit();
      toast('Task saved');
    },
    onDelete: (t) => {
      state.tasks = state.tasks.filter((x) => x.id !== t.id);
      state.studyBlocks = state.studyBlocks.filter((b) => b.taskId !== t.id);
      commit();
      toast('Task deleted');
    },
  });
}

function toggleTask(task) {
  const t = state.tasks.find((x) => x.id === task.id);
  if (!t) return;
  t.done = !t.done;
  commit();
  // If a sheet was open (course or day view), refresh it so the checkbox updates.
  if (openSheetRefresh) openSheetRefresh();
}

// --- Grades tab (placeholder until Stage 4) --------------------------------

function renderGrades() {
  clear(view);
  view.append(h('div', { class: 'page-header' }, h('h1', { text: 'Grades' })));
  view.append(h('section', { class: 'card' },
    h('p', { class: 'muted', text: 'Grade tracking arrives in Stage 4. For now, here are your targets:' }),
    h('ul', { class: 'list' }, state.courses.map((c) => h('li', { class: 'list-row static' },
      h('i', { class: `dot dot-lg colour-${c.colour}` }),
      h('span', { class: 'list-main' },
        h('span', { class: 'list-title', text: c.code }),
        h('span', { class: 'list-sub', text: `Target ${c.targetGrade}%` })))))));
}

// --- Sheets shared by several tabs ------------------------------------------

let openSheetRefresh = null;   // re-opens the current sheet after data changes

/** Course details: sessions, location, and upcoming tasks. */
function openCourseSheet(course) {
  const now = new Date();
  const fresh = courseById(state, course.id);
  if (!fresh) { closeSheet(); return; }
  const tasks = upcomingForCourse(state, fresh.id);

  const content = [
    h('div', { class: `course-banner colour-${fresh.colour}` },
      h('span', { class: 'big', text: fresh.code }),
      h('span', { text: fresh.name })),
    h('h3', { text: 'Class times' }),
    fresh.sessions.length
      ? h('ul', { class: 'plain-list' }, fresh.sessions.map((s) => h('li', {},
        h('strong', { text: `${s.type} · ${s.days.join(', ')}` }),
        h('span', { class: 'muted', text: ` · ${formatRange(s.start, s.end)}` }),
        h('br'),
        h('span', { class: 'muted', text: locationText(s) }))))
      : emptyState('No class times set.'),
    h('h3', { text: 'Upcoming tasks' }),
    tasks.length
      ? h('ul', { class: 'task-list' }, tasks.map((t) => taskRow(state, t, { now, showCourse: false, onToggle: toggleTask, onEdit: editTask })))
      : emptyState('Nothing upcoming for this course.'),
    h('button', { class: 'btn', type: 'button', onclick: () => addTask({ courseId: fresh.id }) }, '+ Add task'),
  ];
  openSheet(fresh.code, content, { onClose: () => { openSheetRefresh = null; } });
  openSheetRefresh = () => openCourseSheet(fresh);
}

/** One day: its classes and everything due that day. */
function openDaySheet(key) {
  const now = new Date();
  const classes = classesOn(state, key);
  const due = tasksDueOn(state, key);
  const note = dayNote(state.settings, key);
  const content = [
    note ? h('p', { class: 'hint', text: note }) : null,
    h('h3', { text: 'Classes' }),
    classes.length
      ? h('ul', { class: 'class-list' }, classes.map((item) => h('li', {},
        h('button', { class: `class-row colour-${item.course.colour}`, type: 'button', onclick: () => openCourseSheet(item.course) },
          h('span', { class: 'class-time', text: formatRange(item.session.start, item.session.end) }),
          h('span', { class: 'class-main' },
            h('span', { class: 'class-title', text: `${item.course.code} · ${item.session.type}` }),
            h('span', { class: 'class-sub', text: locationText(item.session) }))))))
      : emptyState('No classes.'),
    h('h3', { text: 'Due' }),
    due.length
      ? h('ul', { class: 'task-list' }, due.map((t) => taskRow(state, t, { now, onToggle: toggleTask, onEdit: editTask })))
      : emptyState('Nothing due.'),
    h('button', { class: 'btn', type: 'button', onclick: () => addTask({ dueKey: key }) }, '+ Add task due this day'),
  ];
  openSheet(`${DAYS_LONG[weekdayIndex(key)]}, ${formatKey(key)}`, content, { onClose: () => { openSheetRefresh = null; } });
  openSheetRefresh = () => openDaySheet(key);
}

// --- Start-up ---------------------------------------------------------------

function init() {
  // Tab bar buttons
  for (const btn of document.querySelectorAll('.tabbar .tab')) {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  }

  // Deep links like index.html#tasks, and the browser back button.
  const hashTab = location.hash.replace('#', '');
  if (TABS.includes(hashTab)) prefs.tab = hashTab;
  window.addEventListener('hashchange', () => {
    const t = location.hash.replace('#', '');
    if (TABS.includes(t) && t !== prefs.tab) setTab(t);
  });

  storage.save(state);   // first launch: write the defaults so a backup always has something in it
  render();

  // Keep countdowns fresh: redraw Home/Week every 30 s (unless a sheet is open).
  setInterval(() => {
    if (!isSheetOpen() && (prefs.tab === 'home' || prefs.tab === 'week')) render();
  }, 30 * 1000);

  // When the app comes back to the foreground, reload data (in case another tab changed it) and redraw.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      state = storage.load();
      weekKey = weekStart(dayKey());
      if (!isSheetOpen()) render();
    }
  });

  registerServiceWorker();

  // Auto-sync on open, but only when Google won't need to show a pop-up.
  if (state.settings.gcalConnected && hasValidToken() && navigator.onLine) {
    syncNow({ interactive: false });
  }
}

/** Turn on offline support. Only works over http(s), not when opening the file directly. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('./service-worker.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Update downloaded – close and reopen the app to use it.', 5000);
        }
      });
    });
  }).catch((err) => console.warn('Service worker not registered:', err));
}

init();
