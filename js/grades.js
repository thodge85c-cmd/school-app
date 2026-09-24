/**
 * grades.js – grade maths and the Grades tab.
 *
 * Every task has a weight (% of the final grade) and, once marked, a grade
 * (%). From those we work out where you stand and what you need.
 */

import { h, clear, emptyState } from './ui.js';
import { courseById } from './tasks.js';

/** The University of Guelph undergraduate grading scale. */
export const GUELPH_SCALE = [
  [90, 'A+'], [85, 'A'], [80, 'A-'], [77, 'B+'], [73, 'B'], [70, 'B-'],
  [67, 'C+'], [63, 'C'], [60, 'C-'], [57, 'D+'], [53, 'D'], [50, 'D-'], [0, 'F'],
];

export function letterGrade(pct) {
  if (pct == null || Number.isNaN(pct)) return '';
  for (const [min, letter] of GUELPH_SCALE) if (pct >= min) return letter;
  return 'F';
}

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Where you stand in one course.
 *
 *  earned      = Σ (grade × weight) ÷ 100 over graded tasks  → points banked out of 100
 *  gradedWeight= Σ weight over graded tasks                  → % of the course finished
 *  average     = earned ÷ gradedWeight × 100                 → your current average
 *  remaining   = weight not yet graded (including any % not entered as tasks)
 *  needed      = (target − earned) ÷ remaining × 100         → average needed on the rest
 */
export function courseStats(course, tasks) {
  const mine = tasks.filter((t) => t.courseId === course.id);
  const graded = mine.filter((t) => t.grade != null && Number(t.weight) > 0);
  const ungraded = mine.filter((t) => t.grade == null && Number(t.weight) > 0);
  const earned = graded.reduce((sum, t) => sum + (Number(t.grade) * Number(t.weight)) / 100, 0);
  const gradedWeight = graded.reduce((sum, t) => sum + Number(t.weight), 0);
  const knownRemaining = ungraded.reduce((sum, t) => sum + Number(t.weight), 0);
  const totalWeight = gradedWeight + knownRemaining;
  const unaccounted = Math.max(0, 100 - totalWeight);
  const remaining = knownRemaining + unaccounted;
  const target = Number(course.targetGrade) || 0;
  const average = gradedWeight > 0 ? (earned / gradedWeight) * 100 : null;

  let status; let needed = null; let message;
  if (!graded.length) {
    status = 'none';
    message = 'Nothing graded yet. Add grades to your tasks as you get them back.';
  } else if (remaining <= 0) {
    status = 'final';
    message = `All done. Your final grade works out to ${r1(earned)}% (${letterGrade(earned)}).`;
  } else {
    needed = ((target - earned) / remaining) * 100;
    if (needed <= 0) {
      status = 'locked';
      message = `Your ${target}% target is locked in – you've already banked ${r1(earned)} points.`;
    } else if (needed > 100) {
      status = 'impossible';
      message = `Even 100% on the remaining ${r1(remaining)}% would give ${r1(earned + remaining)}% – the ${target}% target is out of reach. Consider adjusting it.`;
    } else {
      status = 'ok';
      message = `You need an average of ${r1(needed)}% (${letterGrade(needed)}) on the remaining ${r1(remaining)}% to finish at ${target}%.`;
    }
  }

  return { course, graded, ungraded, earned, gradedWeight, remaining, unaccounted, totalWeight, target, average, needed, status, message };
}

// --- The Grades tab ------------------------------------------------------------

/** Draw the Grades tab. ctx = { state, onEdit(task) } */
export function renderGradesView(root, ctx) {
  const { state } = ctx;
  clear(root);
  root.append(h('div', { class: 'page-header' }, h('h1', { text: 'Grades' })));

  if (!state.courses.length) {
    root.append(emptyState('No courses yet – add them in Settings.'));
    return;
  }

  for (const course of state.courses) {
    const st = courseStats(course, state.tasks);
    const avgText = st.average == null ? '–' : `${r1(st.average)}%`;
    root.append(h('section', { class: `card grade-card colour-${course.colour}` },
      h('div', { class: 'grade-head' },
        h('div', {},
          h('span', { class: 'eyebrow', text: course.code }),
          h('span', { class: 'muted', text: course.name })),
        h('div', { class: 'grade-avg' },
          h('span', { class: 'big', text: avgText }),
          h('span', { class: 'letter', text: letterGrade(st.average) }))),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(r1(st.gradedWeight)), 'aria-valuemin': '0', 'aria-valuemax': '100' },
        h('div', { class: 'progress-fill', style: { width: `${Math.min(100, st.gradedWeight)}%` } })),
      h('p', { class: 'hint', text: `${r1(st.gradedWeight)}% of the course graded · target ${st.target}% (${letterGrade(st.target)})` }),
      h('p', { class: `need need-${st.status}` }, h('strong', { text: 'What do I need? ' }), st.message),
      st.unaccounted > 0 && st.graded.length
        ? h('p', { class: 'hint warn', text: `Heads up: your tasks for this course only add up to ${r1(st.totalWeight)}%. The missing ${r1(st.unaccounted)}% is assumed to be work you haven't entered yet.` })
        : null,
      st.graded.length
        ? h('ul', { class: 'plain-list graded-list' }, st.graded.map((t) => h('li', {},
          h('button', { class: 'graded-row', type: 'button', onclick: () => ctx.onEdit(t) },
            h('span', { class: 'graded-title', text: t.title }),
            h('span', { class: 'muted', text: `${t.weight}% of grade` }),
            h('span', { class: 'graded-mark', text: `${t.grade}% ${letterGrade(t.grade)}` })))))
        : null,
    ));
  }

  root.append(h('section', { class: 'card' },
    h('h2', { text: 'How this is calculated' }),
    h('p', { class: 'muted small' }, 'Each graded task contributes its grade × its weight. ',
      'Your ', h('strong', { text: 'current average' }), ' is those points divided by the weight graded so far – it only counts work that has been marked. '),
    h('p', { class: 'muted small' }, h('strong', { text: 'What do I need' }), ' takes your target, subtracts the points you have already banked, and divides by the weight still to come. ',
      'If that number is 0 or less, the target is locked in. If it is over 100, the target is out of reach.'),
    h('p', { class: 'muted small' }, 'Letters use the Guelph scale: A+ 90, A 85, A- 80, B+ 77, B 73, B- 70, C+ 67, C 63, C- 60, D+ 57, D 53, D- 50, F below 50.'),
    h('p', { class: 'muted small' }, 'Add or change grades by tapping a task and filling in the Grade box.')));
}
