/**
 * settings.js – the Settings tab.
 *
 * Everything here writes straight into state.settings / state.courses and
 * then calls ctx.commit(), which saves to localStorage and redraws.
 * Nothing is ever left unsaved.
 */

import { DAYS, dayKey } from './dates.js';
import { h, clear, uid, openSheet, closeSheet, confirmDialog, field, select, toast, emptyState } from './ui.js';
import { COLOURS, SESSION_TYPES, APP_VERSION, exportJSON, parseImport, reset } from './storage.js';
import { getClientId, getToken, listCalendars, clearToken } from './gcal.js';
import { formatDue } from './dates.js';

/** Draw the Settings tab. ctx = { state, now, commit, replaceState, rerender } */
export function renderSettingsView(root, ctx) {
  clear(root);
  root.append(h('div', { class: 'page-header' }, h('h1', { text: 'Settings' })));
  root.append(coursesSection(ctx));
  root.append(termSection(ctx));
  root.append(dailySection(ctx));
  root.append(gcalSection(ctx));
  root.append(dataSection(ctx));
  root.append(aboutSection(ctx));
}

// --- Courses ---------------------------------------------------------------

function coursesSection(ctx) {
  const { state } = ctx;
  const list = state.courses.length
    ? h('ul', { class: 'list' }, state.courses.map((c) => h('li', {},
      h('button', { class: 'list-row', type: 'button', onclick: () => openCourseEditor(ctx, c) },
        h('i', { class: `dot dot-lg colour-${c.colour}` }),
        h('span', { class: 'list-main' },
          h('span', { class: 'list-title', text: c.code || '(no code)' }),
          h('span', { class: 'list-sub', text: `${c.name || ''}${c.name ? ' · ' : ''}${c.sessions.length} session${c.sessions.length === 1 ? '' : 's'} · target ${c.targetGrade}%` })),
        h('span', { class: 'chevron', text: '›' })))))
    : emptyState('No courses yet – add one below.');

  return h('section', { class: 'card' },
    h('h2', { text: 'Courses' }),
    h('p', { class: 'hint', text: 'Tap a course to edit its name, colour, and class times.' }),
    list,
    h('button', { class: 'btn', type: 'button', onclick: () => openCourseEditor(ctx, null) }, '+ Add course'));
}

/** Sheet for adding/editing one course and its sessions. Works on a copy; Save writes it back. */
function openCourseEditor(ctx, course) {
  const { state } = ctx;
  const editing = Boolean(course);
  const used = new Set(state.courses.map((c) => c.colour));
  const draft = course
    ? JSON.parse(JSON.stringify(course))
    : { id: uid(), code: '', name: '', colour: COLOURS.find((c) => !used.has(c)) || 'blue', targetGrade: 50, sessions: [] };

  const code = h('input', { type: 'text', placeholder: 'e.g. ECON*1050', value: draft.code, autocapitalize: 'characters', autocomplete: 'off' });
  const name = h('input', { type: 'text', placeholder: 'e.g. Introductory Microeconomics', value: draft.name, autocomplete: 'off' });
  const target = h('input', { type: 'number', min: 0, max: 100, step: 1, inputmode: 'numeric', value: draft.targetGrade ?? 50 });

  // Colour swatches behave like radio buttons.
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' });
  const drawSwatches = () => {
    clear(swatches);
    for (const c of COLOURS) {
      swatches.append(h('button', {
        class: `swatch colour-${c}${draft.colour === c ? ' selected' : ''}`, type: 'button', role: 'radio',
        'aria-checked': draft.colour === c ? 'true' : 'false', 'aria-label': c,
        onclick: () => { draft.colour = c; drawSwatches(); },
      }));
    }
  };
  drawSwatches();

  // Sessions are edited inline; each row keeps references to its inputs.
  const sessionsBox = h('div', { class: 'sessions' });
  const drawSessions = () => {
    clear(sessionsBox);
    if (!draft.sessions.length) sessionsBox.append(emptyState('No class times yet.'));
    draft.sessions.forEach((s, i) => {
      s.days = s.days || [];
      const dayToggles = h('div', { class: 'day-toggles' }, DAYS.map((d) => h('button', {
        class: `day-toggle${s.days.includes(d) ? ' on' : ''}`, type: 'button', 'aria-pressed': s.days.includes(d) ? 'true' : 'false',
        onclick: (e) => {
          if (s.days.includes(d)) s.days = s.days.filter((x) => x !== d); else s.days.push(d);
          e.currentTarget.classList.toggle('on', s.days.includes(d));
          e.currentTarget.setAttribute('aria-pressed', s.days.includes(d) ? 'true' : 'false');
        },
      }, d)));
      sessionsBox.append(h('div', { class: 'session-card' },
        h('div', { class: 'row' },
          field('Type', select(SESSION_TYPES, s.type || 'Lecture', { onchange: (e) => { s.type = e.target.value; } })),
          h('button', { class: 'btn btn-danger btn-small session-remove', type: 'button', onclick: () => { draft.sessions.splice(i, 1); drawSessions(); } }, 'Remove')),
        field('Days', dayToggles),
        h('div', { class: 'row' },
          field('Starts', h('input', { type: 'time', value: s.start || '09:00', onchange: (e) => { s.start = e.target.value; } })),
          field('Ends', h('input', { type: 'time', value: s.end || '10:00', onchange: (e) => { s.end = e.target.value; } }))),
        h('div', { class: 'row' },
          field('Building', h('input', { type: 'text', placeholder: 'Rozanski Hall', value: s.building || '', oninput: (e) => { s.building = e.target.value; } })),
          field('Room', h('input', { type: 'text', placeholder: 'ROZH 101', value: s.room || '', oninput: (e) => { s.room = e.target.value; } }))),
      ));
    });
  };
  drawSessions();

  const form = h('form', { class: 'form', onsubmit: (e) => {
    e.preventDefault();
    if (!code.value.trim()) { code.focus(); toast('Give the course a code first.'); return; }
    draft.code = code.value.trim();
    draft.name = name.value.trim();
    draft.targetGrade = Math.min(100, Math.max(0, Number(target.value) || 0));
    for (const s of draft.sessions) if (!s.id) s.id = uid();
    const idx = state.courses.findIndex((c) => c.id === draft.id);
    if (idx >= 0) state.courses[idx] = draft; else state.courses.push(draft);
    closeSheet();
    ctx.commit();
    toast(editing ? 'Course saved' : 'Course added');
  } },
    field('Course code', code),
    field('Course name', name),
    field('Colour', swatches),
    field('Target grade (%)', target, 'Used on the Grades tab. 50 is a pass at Guelph.'),
    h('h3', { text: 'Class times' }),
    sessionsBox,
    h('button', { class: 'btn', type: 'button', onclick: () => {
      draft.sessions.push({ id: uid(), type: 'Lecture', days: [], start: '09:00', end: '09:50', building: '', room: '' });
      drawSessions();
    } }, '+ Add class time'),
    h('div', { class: 'form-actions' },
      editing ? h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
        const n = state.tasks.filter((t) => t.courseId === draft.id).length;
        const msg = n ? `Delete ${draft.code} and its ${n} task${n === 1 ? '' : 's'}?` : `Delete ${draft.code}?`;
        if (!(await confirmDialog(msg, { okLabel: 'Delete', danger: true }))) return;
        state.courses = state.courses.filter((c) => c.id !== draft.id);
        state.tasks = state.tasks.filter((t) => t.courseId !== draft.id);
        state.notes = state.notes.filter((n2) => n2.courseId !== draft.id);
        const remaining = new Set(state.tasks.map((t) => t.id));
        state.studyBlocks = state.studyBlocks.filter((b) => remaining.has(b.taskId));
        closeSheet();
        ctx.commit();
        toast('Course deleted');
      } }, 'Delete') : null,
      h('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Save changes' : 'Add course')),
  );
  openSheet(editing ? 'Edit course' : 'New course', form);
}

// --- Term dates --------------------------------------------------------------

/** A date input wired straight to a settings field. */
function boundDate(ctx, key) {
  return h('input', { type: 'date', value: ctx.state.settings[key] || '', onchange: (e) => {
    ctx.state.settings[key] = e.target.value; ctx.commit();
  } });
}

function termSection(ctx) {
  const s = ctx.state.settings;

  const breaks = h('div', { class: 'stack' },
    s.breaks.length ? null : emptyState('No break days.'),
    s.breaks.map((b) => h('div', { class: 'mini-card' },
      h('div', { class: 'row' },
        field('Label', h('input', { type: 'text', value: b.label || '', placeholder: 'Thanksgiving', onchange: (e) => { b.label = e.target.value; ctx.commit(); } })),
        h('button', { class: 'btn btn-danger btn-small session-remove', type: 'button', onclick: () => { s.breaks = s.breaks.filter((x) => x !== b); ctx.commit(); } }, 'Remove')),
      h('div', { class: 'row' },
        field('First day off', h('input', { type: 'date', value: b.start || '', onchange: (e) => { b.start = e.target.value; if (!b.end || b.end < b.start) b.end = b.start; ctx.commit(); } })),
        field('Last day off', h('input', { type: 'date', value: b.end || '', onchange: (e) => { b.end = e.target.value; ctx.commit(); } }))))),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
      s.breaks.push({ id: uid(), label: '', start: '', end: '' }); ctx.commit();
    } }, '+ Add break'));

  const overrides = h('div', { class: 'stack' },
    s.scheduleOverrides.length ? null : emptyState('No make-up days.'),
    s.scheduleOverrides.map((o) => h('div', { class: 'mini-card' },
      h('div', { class: 'row' },
        field('Date', h('input', { type: 'date', value: o.date || '', onchange: (e) => { o.date = e.target.value; ctx.commit(); } })),
        field('Follows', select(DAYS.map((d) => [d, `${d} timetable`]), o.followsDay || 'Mon', { onchange: (e) => { o.followsDay = e.target.value; o.label = `Runs on a ${e.target.value} timetable`; ctx.commit(); } }))),
      h('button', { class: 'btn btn-danger btn-small', type: 'button', onclick: () => { s.scheduleOverrides = s.scheduleOverrides.filter((x) => x !== o); ctx.commit(); } }, 'Remove'))),
    h('button', { class: 'btn btn-small', type: 'button', onclick: () => {
      s.scheduleOverrides.push({ id: uid(), date: '', followsDay: 'Mon', label: 'Runs on a Mon timetable' }); ctx.commit();
    } }, '+ Add make-up day'));

  return h('section', { class: 'card' },
    h('h2', { text: 'Term dates' }),
    h('div', { class: 'row' }, field('First day of classes', boundDate(ctx, 'termStart')), field('Last day of classes', boundDate(ctx, 'termEnd'))),
    h('div', { class: 'row' }, field('Exams start', boundDate(ctx, 'examStart')), field('Exams end', boundDate(ctx, 'examEnd'))),
    h('h3', { text: 'Break days' }),
    h('p', { class: 'hint', text: 'Days with no classes at all.' }),
    breaks,
    h('h3', { text: 'Make-up days' }),
    h('p', { class: 'hint', text: "Days that run on a different weekday's timetable (Guelph does this after a holiday)." }),
    overrides);
}

// --- Daily routine -----------------------------------------------------------

function dailySection(ctx) {
  const s = ctx.state.settings;
  const bound = (key, input, transform = (v) => v) => {
    input.addEventListener('change', (e) => { s[key] = transform(e.target.value); ctx.commit(); });
    return input;
  };
  return h('section', { class: 'card' },
    h('h2', { text: 'You' }),
    field('Your name (for the greeting)', bound('displayName', h('input', { type: 'text', value: s.displayName || '', placeholder: 'Optional', autocomplete: 'given-name' }))),
    h('div', { class: 'row' },
      field('Wake time', bound('wakeTime', h('input', { type: 'time', value: s.wakeTime || '07:30' }))),
      field('Bedtime', bound('bedTime', h('input', { type: 'time', value: s.bedTime || '23:30' })))),
    h('p', { class: 'hint', text: 'Study blocks (Stage 3) are only planned between these times.' }),
    h('div', { class: 'row' },
      field('Study block length', bound('studyBlockMinutes', select([['30', '30 min'], ['45', '45 min'], ['60', '60 min'], ['90', '90 min'], ['120', '2 hours']], String(s.studyBlockMinutes || 60)), Number)),
      field('Max study hours per day', bound('maxStudyHoursPerDay', h('input', { type: 'number', min: 0.5, max: 12, step: 0.5, inputmode: 'decimal', value: s.maxStudyHoursPerDay ?? 3 }), Number))),
    h('label', { class: 'switch-row' },
      h('span', { text: 'Show Saturday and Sunday on the Week tab' }),
      h('input', { type: 'checkbox', role: 'switch', checked: s.showWeekend !== false, onchange: (e) => { s.showWeekend = e.target.checked; ctx.commit(); } })),
    h('label', { class: 'switch-row' },
      h('span', {}, 'Preview exam mode on Home', h('br'), h('span', { class: 'hint', text: 'Turns on by itself during the exam period.' })),
      h('input', { type: 'checkbox', role: 'switch', checked: Boolean(s.examModePreview), onchange: (e) => { s.examModePreview = e.target.checked; ctx.commit(); } })));
}

// --- Google Calendar ---------------------------------------------------------

function gcalSection(ctx) {
  const { state } = ctx;
  const g = state.gcal;
  const s = state.settings;
  const connected = s.gcalConnected;

  const clientIdInput = h('input', {
    type: 'text', value: s.gcalClientId || '', placeholder: '1234567890-abc.apps.googleusercontent.com',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: false,
    onchange: (e) => { s.gcalClientId = e.target.value.trim(); ctx.commit(); },
  });

  /** Sign in (pop-up) and fetch the list of calendars to choose from. */
  const connect = async () => {
    try {
      const token = await getToken(state, { interactive: true });
      const cals = await listCalendars(token);
      g.calendars = cals;                       // remembered so the checkboxes work offline
      if (!g.calendarIds.length) g.calendarIds = cals.filter((c) => c.primary).map((c) => c.id);
      s.gcalConnected = true;
      ctx.commit();
      toast('Connected to Google Calendar');
    } catch (err) {
      toast(err.message || 'Could not connect.', 4000);
    }
  };

  const disconnect = async () => {
    if (!(await confirmDialog('Disconnect Google Calendar? Tasks already imported are kept.', { okLabel: 'Disconnect', danger: true }))) return;
    clearToken();
    s.gcalConnected = false;
    g.calendars = [];
    g.calendarIds = [];
    g.review = [];
    ctx.commit();
  };

  const calendarList = (g.calendars || []).length
    ? h('div', { class: 'stack' }, (g.calendars || []).map((c) => h('label', { class: 'switch-row' },
      h('span', { text: c.name }),
      h('input', { type: 'checkbox', role: 'switch', checked: g.calendarIds.includes(c.id), onchange: (e) => {
        g.calendarIds = e.target.checked ? [...g.calendarIds, c.id] : g.calendarIds.filter((id) => id !== c.id);
        ctx.commit();
      } }))))
    : null;

  return h('section', { class: 'card' },
    h('h2', { text: 'Google Calendar' }),
    h('p', { class: 'hint', text: 'Read-only. Events that mention a course (like "ACCT midterm") become tasks. Nothing is ever written to your calendar.' }),
    getClientId(state) ? null : field('Google Client ID', clientIdInput, 'One-time setup – the README explains how to get this.'),
    getClientId(state) && !connected ? h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: connect }, 'Connect Google Calendar')) : null,
    connected ? [
      h('h3', { text: 'Calendars to sync' }),
      calendarList || h('p', { class: 'hint', text: 'Tap "Refresh calendars" to load your list.' }),
      h('p', { class: 'hint', text: g.lastSync ? `Last synced ${formatDue(new Date(g.lastSync), ctx.now)}` : 'Not synced yet.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => ctx.syncNow() }, 'Sync now'),
        h('button', { class: 'btn', type: 'button', onclick: connect }, 'Refresh calendars'),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: disconnect }, 'Disconnect')),
      s.gcalClientId ? field('Google Client ID', clientIdInput) : null,
    ] : null);
}

// --- Backup / restore --------------------------------------------------------

function dataSection(ctx) {
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = parseImport(await file.text());
      const ok = await confirmDialog(
        `Replace everything with this backup? It has ${data.courses.length} courses and ${data.tasks.length} tasks.`,
        { okLabel: 'Replace', danger: true });
      if (!ok) return;
      ctx.replaceState(data);
      toast('Backup restored');
    } catch (err) {
      toast(err.message || 'Could not read that file.');
    }
  } });

  return h('section', { class: 'card' },
    h('h2', { text: 'Your data' }),
    h('p', { class: 'hint', text: 'Everything is stored on this device only. Export a backup now and then, especially before switching phones.' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => { exportJSON(ctx.state, dayKey(ctx.now)); toast('Backup file created'); } }, 'Export backup'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, 'Import backup'),
      fileInput),
    h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
      const ok = await confirmDialog('Delete ALL courses, tasks and settings on this device and start over? This cannot be undone.', { okLabel: 'Reset everything', danger: true });
      if (!ok) return;
      ctx.replaceState(reset());
      toast('All data reset');
    } }, 'Reset all data'));
}

// --- About -------------------------------------------------------------------

function aboutSection() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const offline = Boolean(navigator.serviceWorker?.controller);
  return h('section', { class: 'card about' },
    h('h2', { text: 'About' }),
    h('p', {}, h('strong', { text: `Grif Planner v${APP_VERSION}` })),
    h('p', { class: 'hint', text: `${standalone ? 'Installed as an app' : 'Running in the browser'} · ${offline ? 'Ready to work offline' : 'Offline cache not ready yet'}` }));
}
