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
  dayKey, weekStart, addDays, daysBetween, formatLongDate, greetingFor, countdown, timeLeft, formatDue,
  formatRange, formatKey, weekdayIndex, weekdayName, fromLocal, parts, DAYS_LONG,
} from './dates.js';
import { h, clear, openSheet, closeSheet, isSheetOpen, toast, emptyState } from './ui.js';
import { nextClass, classesOn, dayNote, locationText, renderWeekView } from './schedule.js';
import {
  renderTasksView, openTaskForm, dueSoon, tasksDueOn, taskRow, upcomingForCourse, courseById,
} from './tasks.js';
import { renderSettingsView } from './settings.js';
import { sync as gcalSync, hasValidToken, assignReviewItem, ignoreReviewItem } from './gcal.js';
import { planWeek, clearWeek, blocksOn } from './planner.js';
import { renderGradesView } from './grades.js';
import { parseSyllabus, taskFromDraft } from './syllabus.js';
import { TASK_TYPES } from './storage.js';

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

function inExamPeriod(now) {
  const s = state.settings;
  if (s.examModePreview) return true;
  const k = dayKey(now);
  return Boolean(s.examStart && s.examEnd && k >= s.examStart && k <= s.examEnd);
}

function renderHome() {
  const now = new Date();
  const today = dayKey(now);
  const name = state.settings.displayName?.trim();
  clear(view);

  view.append(h('header', { class: 'page-header home-header' },
    h('div', {},
      h('h1', { text: `${greetingFor(now)}${name ? `, ${name}` : ''}` }),
      h('p', { class: 'subtitle', text: formatLongDate(now) }))));

  // Exam mode (Stage 5): during the exam period the Home tab becomes an exam dashboard.
  if (inExamPeriod(now)) {
    renderExamMode(now);
    return;
  }

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

  // "Today" – classes and study blocks
  const todays = classesOn(state, today);
  const studyToday = blocksOn(state, today);
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
      : emptyState(note ? 'Enjoy the day off.' : 'No classes today.'),
    studyToday.length ? h('h3', { text: 'Study blocks' }) : null,
    studyToday.length ? h('ul', { class: 'class-list' }, studyToday.map((b) => {
      const task = state.tasks.find((t) => t.id === b.taskId);
      const course = task ? courseById(state, task.courseId) : null;
      return h('li', {},
        h('button', { class: `class-row study colour-${course?.colour || 'blue'}${b.done ? ' past' : ''}`, type: 'button', onclick: () => openStudyBlock(b) },
          h('span', { class: 'class-time', text: `${b.start}–${b.end}` }),
          h('span', { class: 'class-main' },
            h('span', { class: 'class-title', text: task ? task.title : 'Study' }),
            h('span', { class: 'class-sub', text: b.done ? 'Done ✓' : (course?.code || '') }))));
    })) : null));
}

/** Exam-period Home: a countdown per exam plus a day-by-day study split. */
function renderExamMode(now) {
  const today = dayKey(now);
  const exams = state.tasks
    .filter((t) => !t.done && (t.type === 'Final' || t.type === 'Midterm') && new Date(t.dueDate) >= now)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  view.append(h('section', { class: 'card exam-banner' },
    h('span', { class: 'eyebrow', text: 'Exam mode' }),
    h('p', { class: 'muted', text: state.settings.examModePreview ? 'Preview is on (turn it off in Settings).' : 'Good luck – you\'ve got this.' })));

  if (!exams.length) {
    view.append(h('section', { class: 'card' },
      h('h2', { text: 'Exams' }),
      emptyState('No upcoming exams found. Add your exams as tasks with type "Final" and they will show up here.')));
    return;
  }

  // Countdown cards.
  view.append(h('section', { class: 'card' },
    h('h2', { text: 'Countdown' }),
    h('ul', { class: 'exam-list' }, exams.map((t) => {
      const course = courseById(state, t.courseId);
      const days = daysBetween(today, dayKey(new Date(t.dueDate)));
      const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`;
      return h('li', {},
        h('button', { class: `class-row colour-${course?.colour || 'blue'}`, type: 'button', onclick: () => editTask(t) },
          h('span', { class: 'class-time exam-days', text: label }),
          h('span', { class: 'class-main' },
            h('span', { class: 'class-title', text: `${course?.code || ''} · ${t.title}` }),
            h('span', { class: 'class-sub', text: `${formatDue(new Date(t.dueDate), now)}${t.weight ? ` · ${t.weight}%` : ''}` }))));
    }))));

  // Day-by-day plan: split each day's study hours across exams still ahead,
  // giving more to heavier exams and to whichever is coming up soonest.
  const hoursPerDay = Number(state.settings.maxStudyHoursPerDay) || 3;
  const lastKey = dayKey(new Date(exams[exams.length - 1].dueDate));
  const span = Math.min(daysBetween(today, lastKey), 21);
  const plan = [];
  for (let i = 0; i <= span; i++) {
    const key = addDays(today, i);
    const ahead = exams.filter((t) => dayKey(new Date(t.dueDate)) >= key);
    if (!ahead.length) break;
    const scored = ahead.map((t) => {
      const d = Math.max(0.5, daysBetween(key, dayKey(new Date(t.dueDate))) + 0.5);
      return { t, score: (Number(t.weight) || 10) / d };
    });
    const total = scored.reduce((sum, x) => sum + x.score, 0);
    const split = scored
      .map((x) => ({ t: x.t, hours: Math.round((x.score / total) * hoursPerDay * 2) / 2 }))
      .filter((x) => x.hours > 0)
      .sort((a, b) => b.hours - a.hours);
    plan.push({ key, split, examToday: ahead.filter((t) => dayKey(new Date(t.dueDate)) === key) });
  }

  view.append(h('section', { class: 'card' },
    h('h2', { text: 'Study plan' }),
    h('p', { class: 'hint', text: `About ${hoursPerDay} h a day, weighted toward the nearest and heaviest exams. Change the hours in Settings.` }),
    h('ul', { class: 'plan-list' }, plan.map((d) => h('li', { class: `plan-day${d.key === today ? ' today' : ''}` },
      h('div', { class: 'plan-date' }, h('strong', { text: weekdayName(d.key) }), h('span', { class: 'muted', text: ` ${formatKey(d.key)}` })),
      h('div', { class: 'plan-items' },
        d.examToday.map((t) => h('span', { class: `pill colour-${courseById(state, t.courseId)?.colour || 'blue'}`, text: `EXAM · ${courseById(state, t.courseId)?.code || t.title}` })),
        d.split.map((x) => h('span', { class: 'plan-item' },
          h('i', { class: `dot colour-${courseById(state, x.t.courseId)?.colour || 'blue'}` }),
          ` ${courseById(state, x.t.courseId)?.code || x.t.title} · ${x.hours} h`))))))));
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
    onPlan: (weekKey) => planStudyWeek(weekKey),
    hasBlocksThisWeek: (weekKey) => state.studyBlocks.some((b) => b.date >= weekKey && b.date <= addDays(weekKey, 6)),
    extraBlocks: (key, yFor, hourPx) => renderStudyBlocks(key, yFor),
  });
}

// --- Study blocks (Stage 3) ----------------------------------------------------

/** Draw this day's study blocks as striped, outlined blocks on the Week grid. */
function renderStudyBlocks(key, yFor) {
  const out = [];
  for (const b of blocksOn(state, key)) {
    const startMin = Number(b.start.slice(0, 2)) * 60 + Number(b.start.slice(3));
    const endMin = Number(b.end.slice(0, 2)) * 60 + Number(b.end.slice(3));
    const top = yFor(startMin);
    const height = Math.max(yFor(endMin) - top, 16);
    const task = state.tasks.find((t) => t.id === b.taskId);
    const course = task ? courseById(state, task.courseId) : null;
    out.push(h('button', {
      class: `study-block colour-${course?.colour || 'blue'}${b.done ? ' done' : ''}`, type: 'button',
      style: { top: `${top}px`, height: `${height}px` },
      'aria-label': `Study ${task ? task.title : ''}`,
      onclick: () => openStudyBlock(b),
    }, h('span', { class: 'sb-title', text: task ? task.title : 'Study' })));
  }
  return out;
}

/** Generate study blocks for the week (or re-plan if some exist). */
function planStudyWeek(weekKey) {
  const hasBlocks = state.studyBlocks.some((b) => b.date >= weekKey && b.date <= addDays(weekKey, 6));
  if (hasBlocks) clearWeek(state, weekKey, new Date());
  const created = planWeek(state, weekKey, new Date());
  state.studyBlocks.push(...created);
  commit();
  if (!created.length) {
    toast(state.tasks.some((t) => !t.done) ? 'No free time to fill this week.' : 'No unfinished tasks to plan.', 3500);
  } else {
    toast(`Planned ${created.length} study block${created.length === 1 ? '' : 's'}.`);
  }
}

/** Tap a study block: mark done or delete. */
function openStudyBlock(block) {
  const task = state.tasks.find((t) => t.id === block.taskId);
  openSheet('Study block', [
    h('p', {}, h('strong', { text: task ? task.title : 'Study' })),
    h('p', { class: 'muted', text: `${formatKey(block.date)} · ${block.start}–${block.end}` }),
    task ? h('p', { class: 'hint', text: `${courseById(state, task.courseId)?.code || ''} · due ${formatDue(new Date(task.dueDate), new Date())}` }) : null,
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn-danger', type: 'button', onclick: () => {
        state.studyBlocks = state.studyBlocks.filter((b) => b.id !== block.id);
        closeSheet(); commit(); toast('Block removed');
      } }, 'Delete'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        const b = state.studyBlocks.find((x) => x.id === block.id);
        if (b) b.done = !b.done;
        closeSheet(); commit();
      } }, block.done ? 'Mark not done' : 'Mark done')),
  ]);
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
    onSyllabus: () => openSyllabusSheet(),
  });
}

// --- Syllabus import (Stage 5) ---------------------------------------------------

/** Paste a course outline, pick the course, preview the drafts, then save. */
function openSyllabusSheet() {
  if (!state.courses.length) { toast('Add a course in Settings first.'); return; }
  const courseSel = h('select', {}, state.courses.map((c) => h('option', { value: c.id, text: `${c.code} – ${c.name}` })));
  const yearSel = h('select', {}, [0, 1].map((i) => { const y = parts(new Date()).year + i; return h('option', { value: String(y), text: String(y) }); }));
  const textarea = h('textarea', { rows: 8, placeholder: 'Paste your course outline here, e.g.\nMidterm 1 – Oct 15 – 25%\nFinal exam – Dec 10 – 40%' });
  const preview = h('div', { class: 'stack' });
  let drafts = [];

  const drawPreview = () => {
    clear(preview);
    if (!drafts.length) { preview.append(emptyState('No dated lines found yet. Each line needs a date like "Oct 15".')); return; }
    preview.append(h('p', { class: 'hint', text: `${drafts.length} draft${drafts.length === 1 ? '' : 's'} found. Untick any you don't want, fix titles or weights, then save.` }));
    for (const d of drafts) {
      preview.append(h('div', { class: `mini-card${d.include ? '' : ' faded'}` },
        h('label', { class: 'switch-row' },
          h('input', { type: 'text', value: d.title, class: 'draft-title', oninput: (e) => { d.title = e.target.value; } }),
          h('input', { type: 'checkbox', checked: d.include, onchange: (e) => { d.include = e.target.checked; drawPreview(); } })),
        h('div', { class: 'row' },
          h('select', { onchange: (e) => { d.type = e.target.value; } }, TASK_TYPES.map((t) => h('option', { value: t, text: t, selected: t === d.type }))),
          h('input', { type: 'date', value: d.dateKey, onchange: (e) => { d.dateKey = e.target.value; } })),
        h('div', { class: 'row' },
          h('input', { type: 'number', min: 0, max: 100, step: 0.5, placeholder: 'Weight %', value: d.weight, oninput: (e) => { d.weight = Number(e.target.value) || 0; } }),
          h('input', { type: 'time', value: d.time, onchange: (e) => { d.time = e.target.value || '23:59'; } })),
        h('span', { class: 'hint small', text: `From: "${d.line}"` })));
    }
  };

  const form = h('div', { class: 'form' },
    h('div', { class: 'row' },
      h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Course' }), courseSel),
      h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Year for dates without one' }), yearSel)),
    h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Course outline text' }), textarea),
    h('button', { class: 'btn', type: 'button', onclick: () => {
      drafts = parseSyllabus(textarea.value, { defaultYear: Number(yearSel.value) });
      drawPreview();
    } }, 'Find dates & weights'),
    h('h3', { text: 'Preview' }),
    preview,
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        const chosen = drafts.filter((d) => d.include && d.dateKey);
        if (!chosen.length) { toast('Nothing to save yet.'); return; }
        for (const d of chosen) state.tasks.push(taskFromDraft(d, courseSel.value));
        closeSheet(); commit();
        toast(`Added ${chosen.length} task${chosen.length === 1 ? '' : 's'}`);
      } }, 'Save tasks')));
  drawPreview();
  openSheet('Import from syllabus', form);
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

// --- Grades tab (Stage 4) --------------------------------------------------

function renderGrades() {
  renderGradesView(view, { state, onEdit: editTask });
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
    h('h3', { text: 'Notes' }),
    notesSection(fresh),
  ];
  openSheet(fresh.code, content, { onClose: () => { openSheetRefresh = null; } });
  openSheetRefresh = () => openCourseSheet(fresh);
}

/** Quick notes for a course, newest first. */
function notesSection(course) {
  const notes = state.notes.filter((n) => n.courseId === course.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const input = h('textarea', { rows: 2, placeholder: 'Jot something down… (office hours, textbook chapters, reminders)' });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    state.notes.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), courseId: course.id, text, createdAt: new Date().toISOString() });
    commit();
    openSheetRefresh?.();
  };
  return h('div', { class: 'notes' },
    h('div', { class: 'note-add' }, input, h('button', { class: 'btn btn-small', type: 'button', onclick: add }, 'Add note')),
    notes.length
      ? h('ul', { class: 'note-list' }, notes.map((n) => h('li', { class: 'note' },
        h('p', { text: n.text }),
        h('div', { class: 'note-meta' },
          h('span', { class: 'muted small', text: formatDue(new Date(n.createdAt), new Date()).replace(/^Today, /, 'Today ') }),
          h('button', { class: 'link-btn', type: 'button', onclick: () => {
            state.notes = state.notes.filter((x) => x.id !== n.id); commit(); openSheetRefresh?.();
          } }, 'Delete')))))
      : emptyState('No notes yet.'));
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
