/**
 * tasks.js – assignments, quizzes, midterms, finals, and the Tasks tab.
 *
 * A "task" is anything with a due date. Each one belongs to a course, has a
 * weight (% of the final grade), can be marked done, and later gets a grade.
 */

import { dayKey, addDays, weekStart, fromLocal, formatDue, parts, toTime } from './dates.js';
import { h, clear, uid, openSheet, closeSheet, confirmDialog, field, select, emptyState } from './ui.js';
import { TASK_TYPES, EST_HOURS } from './storage.js';

const HOUR_MS = 60 * 60 * 1000;

export function courseById(state, id) {
  return state.courses.find((c) => c.id === id) || null;
}

function dueMs(task) {
  const ms = Date.parse(task.dueDate);
  return Number.isNaN(ms) ? Infinity : ms;
}

/** Sort helper: soonest due first. */
export function byDue(a, b) {
  return dueMs(a) - dueMs(b);
}

/**
 * Split tasks into the four groups shown on the Tasks tab.
 *  - Overdue:   past due and not done
 *  - This Week: due before next Monday 00:00 (Toronto)
 *  - Later:     everything else not done
 *  - Done:      done, most recently due first
 */
export function groupTasks(tasks, now = new Date()) {
  const nowMs = now.getTime();
  const nextMonday = fromLocal(addDays(weekStart(dayKey(now)), 7)).getTime();
  const groups = { overdue: [], thisWeek: [], later: [], done: [] };
  for (const t of tasks) {
    const due = dueMs(t);
    if (t.done) groups.done.push(t);
    else if (due < nowMs) groups.overdue.push(t);
    else if (due < nextMonday) groups.thisWeek.push(t);
    else groups.later.push(t);
  }
  groups.overdue.sort(byDue);
  groups.thisWeek.sort(byDue);
  groups.later.sort(byDue);
  groups.done.sort((a, b) => byDue(b, a));
  return groups;
}

/** Not-done tasks due within the next `hours` (overdue ones included), soonest first. */
export function dueSoon(tasks, now = new Date(), hours = 72) {
  const limit = now.getTime() + hours * HOUR_MS;
  return tasks.filter((t) => !t.done && dueMs(t) <= limit).sort(byDue);
}

/** True if due within 24 hours (or already overdue) and not done. */
export function isUrgent(task, now = new Date()) {
  return !task.done && dueMs(task) - now.getTime() < 24 * HOUR_MS;
}

export function isOverdue(task, now = new Date()) {
  return !task.done && dueMs(task) < now.getTime();
}

/** Not-done tasks for one course, soonest first. */
export function upcomingForCourse(state, courseId) {
  return state.tasks.filter((t) => t.courseId === courseId && !t.done).sort(byDue);
}

/** Not-done tasks due on a specific Toronto day. */
export function tasksDueOn(state, key) {
  return state.tasks.filter((t) => !t.done && dayKey(new Date(t.dueDate)) === key).sort(byDue);
}

/** Text like "Midterm · 25% · Due Thursday, 1:00 PM". */
export function taskMeta(task, now) {
  const bits = [task.type];
  if (task.weight) bits.push(`${task.weight}%`);
  bits.push(`Due ${formatDue(new Date(task.dueDate), now)}`);
  return bits.join(' · ');
}

// --- The add/edit form ----------------------------------------------------

/**
 * Open the task form in a sheet. Pass task = null to add a new one.
 * onSave(task) gets the finished task; onDelete(task) is called after a confirm.
 */
export function openTaskForm(state, task, { onSave, onDelete, now = new Date(), presets = {} }) {
  const editing = Boolean(task);
  // presets lets other screens pre-fill the course or due day (e.g. "+ Add task" inside a course).
  const draft = task ? { ...task } : {
    id: uid(), courseId: presets.courseId || state.courses[0]?.id || '', title: '', type: 'Assignment',
    dueDate: fromLocal(presets.dueKey || dayKey(now), '23:59').toISOString(), weight: 0, estHours: EST_HOURS.Assignment,
    done: false, grade: null, source: 'manual',
  };
  const dueParts = parts(new Date(draft.dueDate));

  const title = h('input', { type: 'text', required: true, placeholder: 'e.g. Midterm 1', value: draft.title, autocomplete: 'off' });
  const course = select(state.courses.map((c) => [c.id, `${c.code} – ${c.name}`]), draft.courseId);
  const type = select(TASK_TYPES, draft.type);
  const dueDate = h('input', { type: 'date', required: true, value: dueParts.dayKey });
  const dueTime = h('input', { type: 'time', required: true, value: toTime(dueParts.minutes) });
  const weight = h('input', { type: 'number', min: 0, max: 100, step: 0.5, inputmode: 'decimal', value: draft.weight ?? 0 });
  const estHours = h('input', { type: 'number', min: 0, max: 100, step: 0.5, inputmode: 'decimal', value: draft.estHours ?? EST_HOURS[draft.type] ?? 2 });
  const grade = h('input', { type: 'number', min: 0, max: 100, step: 0.5, inputmode: 'decimal', placeholder: 'Not graded yet', value: draft.grade ?? '' });

  // When the type changes and the hours estimate is still the default, follow it.
  type.addEventListener('change', () => {
    const wasDefault = Number(estHours.value) === (EST_HOURS[draft.type] ?? 2);
    draft.type = type.value;
    if (wasDefault) estHours.value = EST_HOURS[type.value] ?? 2;
  });

  const form = h('form', { class: 'form', onsubmit: (e) => {
    e.preventDefault();
    if (!title.value.trim()) { title.focus(); return; }
    const saved = {
      ...draft,
      title: title.value.trim(),
      courseId: course.value,
      type: type.value,
      dueDate: fromLocal(dueDate.value, dueTime.value || '23:59').toISOString(),
      weight: Number(weight.value) || 0,
      estHours: Number(estHours.value) || 0,
      grade: grade.value === '' ? null : Math.min(100, Math.max(0, Number(grade.value))),
    };
    closeSheet();
    onSave(saved);
  } },
    field('Title', title),
    field('Course', course),
    field('Type', type),
    h('div', { class: 'row' }, field('Due date', dueDate), field('Time', dueTime)),
    h('div', { class: 'row' },
      field('Weight (% of grade)', weight),
      field('Study hours', estHours, 'How long it needs. Used by the planner.')),
    editing ? field('Grade (%)', grade, 'Fill in once it is marked.') : null,
    h('div', { class: 'form-actions' },
      editing ? h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
        if (await confirmDialog(`Delete "${draft.title}"?`, { okLabel: 'Delete', danger: true })) {
          closeSheet();
          onDelete(draft);
        }
      } }, 'Delete') : null,
      h('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Save changes' : 'Add task')),
  );

  openSheet(editing ? 'Edit task' : 'New task', form);
  if (!editing) setTimeout(() => title.focus(), 50);
}

// --- The Tasks tab ---------------------------------------------------------

/** One row in a task list. Used by the Tasks tab and the Home tab. */
export function taskRow(state, task, { now, onToggle, onEdit, showCourse = true }) {
  const course = courseById(state, task.courseId);
  const classes = ['task-row'];
  if (task.done) classes.push('done');
  else if (isUrgent(task, now)) classes.push('urgent');
  return h('li', { class: classes.join(' ') },
    h('button', {
      class: 'check', type: 'button', 'aria-pressed': task.done ? 'true' : 'false',
      'aria-label': task.done ? 'Mark not done' : 'Mark done', onclick: () => onToggle(task),
    }),
    h('button', { class: 'task-main', type: 'button', onclick: () => onEdit(task) },
      h('span', { class: 'task-title', text: task.title }),
      h('span', { class: 'task-meta' },
        showCourse && course ? h('span', { class: `pill colour-${course.colour}`, text: course.code }) : null,
        showCourse && course ? ' · ' : null,
        taskMeta(task, now),
        task.grade != null ? ` · ${task.grade}%` : null)),
  );
}

/**
 * Draw the Tasks tab.
 * ctx = { state, now, filter, setFilter, onAdd, onEdit, onToggle }
 */
export function renderTasksView(root, ctx) {
  const { state, now, filter } = ctx;
  clear(root);

  root.append(h('div', { class: 'page-header' },
    h('h1', { text: 'Tasks' }),
    h('div', { class: 'btn-row tight' },
      state.settings.gcalConnected ? h('button', { class: 'btn btn-small', type: 'button', onclick: ctx.onSync }, 'Sync') : null,
      h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: ctx.onAdd }, '+ Add'))));

  // Calendar events that need a course assigned.
  const review = state.gcal?.review || [];
  if (review.length) {
    root.append(h('button', { class: 'card banner', type: 'button', onclick: ctx.onReview },
      h('strong', { text: `${review.length} calendar event${review.length === 1 ? '' : 's'} to review` }),
      h('span', { class: 'muted', text: 'Assign a course or ignore them ›' })));
  }

  // Filter chips: All, then one per course.
  root.append(h('div', { class: 'chips', role: 'tablist' },
    h('button', { class: `chip${filter === 'all' ? ' active' : ''}`, type: 'button', onclick: () => ctx.setFilter('all') }, 'All'),
    state.courses.map((c) => h('button', {
      class: `chip colour-${c.colour}${filter === c.id ? ' active' : ''}`, type: 'button',
      onclick: () => ctx.setFilter(c.id),
    }, c.code))));

  const visible = filter === 'all' ? state.tasks : state.tasks.filter((t) => t.courseId === filter);
  if (!state.tasks.length) {
    root.append(emptyState('No tasks yet – tap + Add to create one.'));
    return;
  }
  if (!visible.length) {
    root.append(emptyState('No tasks for this course yet.'));
    return;
  }

  const groups = groupTasks(visible, now);
  const sections = [
    ['Overdue', groups.overdue, 'overdue'],
    ['This week', groups.thisWeek, ''],
    ['Later', groups.later, ''],
    ['Done', groups.done, 'muted'],
  ];
  for (const [label, items, extra] of sections) {
    if (!items.length) continue;
    root.append(h('section', { class: `task-group ${extra}` },
      h('h2', { class: 'group-title' }, label, h('span', { class: 'count', text: String(items.length) })),
      h('ul', { class: 'task-list' }, items.map((t) => taskRow(state, t, {
        now, onToggle: ctx.onToggle, onEdit: ctx.onEdit,
      })))));
  }
}
