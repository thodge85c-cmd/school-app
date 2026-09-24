# Grif Planner – build brief (v2)

This is your original prompt, tightened up and with the gaps filled in. All questions have been answered and recorded below.

---

## 1. Who this is for

- Me: first-year business student at the University of Guelph (Ontario), Fall 2026 term. Still learning to code, so explain what you're doing in plain language as you go.
- Device: iPhone, Safari, installed to the home screen as a PWA. Also usable on a laptop.
- Hosting: GitHub Pages, free tier.
  - GitHub username: `thodge85c-cmd` (confirmed)
  - Repo: `school-app` (confirmed; started empty)
  - Live URL will be `https://thodge85c-cmd.github.io/school-app/`
  - Work happens on branch `claude/uni-planner-web-app-r8zd9d`; GitHub Pages will serve from `main`, so each finished stage gets merged into `main` to go live.
- App name: **Grif Planner** (confirmed)

## 2. Facts the app needs (answers go here)

| Item | Value |
|---|---|
| First day of classes | Thu 10 Sep 2026 (confirmed) |
| Last day of classes | Fri 4 Dec 2026 (confirmed; also last day to drop a course) |
| Fall break (no classes) | Mon 12 Oct and Tue 13 Oct 2026 only (confirmed) |
| Make-up days | Thu 3 Dec follows the Tuesday timetable; Fri 4 Dec follows the Monday timetable (confirmed) |
| Exam period | Mon 7 Dec – Tue 22 Dec 2026, weekends included (confirmed) |
| Wake time | 07:30 (confirmed, same every day) |
| Bedtime | 23:30 (confirmed) |
| Target grade (all courses) | 50%, a pass (confirmed; editable per course) |
| Name for the greeting | "Good morning, Trent" (confirmed) |
| Style | clean, minimal, automatic light/dark mode (confirmed) |
| Week tab | 7 days, Settings toggle to hide weekends (confirmed) |
| Estimated hours per task | yes, defaults by type (confirmed) |

### Fall 2026 classes to preload

| Course | Session | Days | Time | Building / room |
|---|---|---|---|---|
| ECON*1050 Introductory Microeconomics | Lecture | Mon, Wed | 13:30–14:20 | War Memorial Hall, WMEM 103 |
| MCS*1000 Introductory Marketing | Seminar | Tue | 13:30–14:20 | MacNaughton, MACN 118 |
| MCS*1000 Introductory Marketing | Lecture | Tue | 19:00–20:50 | Alexander Hall, ALEX 200 |
| ACCT*1220 Intro Financial Accounting | Seminar | Wed | 15:30–16:20 | MacKinnon, MCKN 232 |
| ACCT*1220 Intro Financial Accounting | Lecture | Thu | 19:00–20:50 | Rozanski Hall, ROZH 101 |
| MGMT*1000 Introduction to Business | Seminar | Thu | 12:30–14:20 | MacDonald Hall, MAC 232 |
| MGMT*1000 Introduction to Business | Lecture | Thu | 14:30–15:50 | Rozanski Hall, ROZH 101 |

Course colours (confirmed): ECON blue, MCS orange, ACCT green, MGMT purple. Every course, session, and colour is editable in Settings so next semester can be set up without touching code.

## 3. How I want you to work

- Build in the stages below. After each stage: commit, push, stop, tell me how to test it on my computer and on my phone, and wait for my OK.
- Explain each stage in plain language before and after you build it.
- Comment the code so a beginner can follow it. Keep functions short and named for what they do.
- Never lose data: save to localStorage after every change.
- Handle empty states with a friendly line ("No tasks yet – add one").
- Every time app files change, bump the cache version in `service-worker.js` and tell me you did.

## 4. Tech rules

- Plain HTML, CSS and vanilla JavaScript with ES modules. No frameworks, no build step, no npm. Must run on GitHub Pages as-is.
- Only external script allowed: Google Identity Services (`https://accounts.google.com/gsi/client`) in Stage 2. Everything else is local.
- All paths relative (`./css/styles.css`, not `/css/styles.css`) because the site lives under `/school-app/`.
- Local testing: `python3 -m http.server 8000` in the repo folder, then open `http://localhost:8000`. Opening `index.html` directly from the file system will NOT work (ES modules and the service worker need a real server).
- Timezone: America/Toronto for all dates and times, using `Intl.DateTimeFormat`. Store instants as ISO strings.
- Mobile-first, iPhone widths 375–430 px, still fine on a laptop (max content width about 720 px, centred).
- Bottom tab bar with 5 tabs: Home, Week, Tasks, Grades, Settings. Tab state survives reloads.
- Respect iPhone safe areas: `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the tab bar and top of the page.
- Minimum 44 px tap targets. Use `100dvh` not `100vh` so Safari's toolbar doesn't cover the tab bar.
- Automatic light/dark via `prefers-color-scheme`. Colours defined once as CSS variables.
- Works offline after first load.
- IDs: `crypto.randomUUID()` with a fallback.
- No client secrets in the code, ever. A Google Client ID is fine.

## 5. File structure

```
/index.html
/manifest.json
/service-worker.js
/css/styles.css
/js/app.js          startup, tab routing, rendering each tab
/js/storage.js      load, save, export, import, migrations
/js/dates.js        Toronto-timezone date helpers (added: keeps the other files small)
/js/schedule.js     timetable logic (next class, today's classes, week grid)
/js/tasks.js        assignments and exams
/js/planner.js      study block generator
/js/grades.js       grade calculations + Guelph letter scale
/js/gcal.js         Google Calendar (Stage 2)
/js/syllabus.js     syllabus text parser (Stage 5)
/icons/             icon-192.png, icon-512.png, apple-touch-icon.png (180 px)
/README.md          beginner setup + deploy instructions
```

## 6. Data model

One localStorage key `uniPlanner.v1` holding a single JSON object:

```
{
  version: 1,
  courses: [{ id, code, name, colour, targetGrade,
              sessions: [{ id, type: "Lecture"|"Seminar"|"Lab",
                           days: ["Mon",...,"Sun"], start: "13:30", end: "14:20",
                           building, room }] }],
  tasks: [{ id, courseId, title,
            type: "Assignment"|"Quiz"|"Midterm"|"Final"|"Other",
            dueDate (ISO, with time; form defaults to 23:59),
            weight (% of course, may be 0), estHours (default by type, see Stage 3),
            done, grade (% or null),
            source: "manual"|"gcal"|"syllabus", gcalEventId (optional) }],
  notes: [{ id, courseId, text, createdAt }],
  studyBlocks: [{ id, taskId, date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", done }],
  gcal: { calendarIds: [], lastSync: ISO|null, ignoredEventIds: [], review: [{ eventId, title, start, end }] },
  settings: { termStart, termEnd, examStart, examEnd,
              breaks: [{ label, start, end }],
              scheduleOverrides: [{ date: "YYYY-MM-DD", followsDay: "Mon".."Sun", label }],
              wakeTime, bedTime, studyBlockMinutes (60), maxStudyHoursPerDay (3),
              displayName: "", showWeekend: true, gcalConnected: false }
}
```

- `version` lets `storage.js` migrate old data later.
- Export = download the whole object as `uni-planner-backup-YYYY-MM-DD.json`. Import = validate, then replace.

## 7. Stages

### Stage 1 – Core

**Home tab**
- Greeting by time of day plus today's date in words.
- "Up Next" card: next class today or the next class day, with course code, type, time, building/room, and a countdown ("in 45 min", "in 2 h 10 min", "tomorrow 13:30"). If a class is on right now, show "Now · 25 min left". No classes during breaks or outside term dates.
- "Due Soon": not-done tasks due in the next 72 hours, sorted by due date. Red if due within 24 hours. Overdue items appear first, labelled "Overdue".
- "Today": every class today with time and location. Past classes dimmed.

**Week tab**
- Calendar grid, 08:00–22:00, one column per day. Mon–Sun by default (toggle in Settings to hide weekends). Classes as coloured blocks with course code.
- Tap a block → sheet with course details, location, upcoming tasks for that course, and notes (Stage 5).
- Swipe or arrows to change week, "Today" button jumps back. Current time shown as a thin line on today.
- Due dates shown as small dots under the day heading; tap to list them.

**Tasks tab**
- Groups: Overdue (past due, not done), This Week (due before next Monday 00:00 Toronto time), Later, Done.
- Filter chips by course. Add / edit / delete via a simple form (title, course, type, due date + time, weight, est. hours). Checkbox marks done. Swipe or long-press is NOT required; a visible Edit button is fine.

**Settings tab**
- Courses: add/edit/delete courses and their sessions, colour picker from a fixed palette.
- Term dates, break days, make-up days (a date that follows another weekday's timetable), exam dates, wake/bed time, study block length, max study hours/day, display name, show weekend.
- Export data, Import data, "Reset all data" with a confirm step.
- An "About" line showing the app version / cache version so I can check updates arrived.

**Done when:** all four tabs work on localhost and on my phone, data survives a reload, export/import round-trips.

### Stage 2 – Google Calendar (read-only)

- Google Identity Services token client in the browser, no backend, scope `https://www.googleapis.com/auth/calendar.readonly`.
- Let me pick which calendars to pull from (checkbox list, saved in `gcal.calendarIds`).
- Pull events from today through `termEnd` (or `examEnd` if later).
- Match an event to a course if its title contains the course code in any common form (`ACCT*1220`, `ACCT 1220`, `ACCT1220`, `ACCT`) or the course name. Unmatched events go to a "Review" list where I can assign a course or ignore them (ignored IDs remembered).
- Import matched events as tasks with `source: "gcal"`. Use `gcalEventId` so re-sync updates existing tasks instead of duplicating. Don't overwrite `done`, `grade`, or `weight` that I set by hand.
- "Sync now" in Settings and on the Tasks tab. Auto-sync on open only if a valid token is cached; otherwise show a one-tap "Sync" prompt (browser tokens expire after about an hour and Google needs a tap to issue a new one, especially in an iPhone PWA).
- README: beginner steps for creating a Google Cloud project, enabling the Calendar API, OAuth consent screen in Testing mode with me as a test user, creating a Web client ID, and adding `https://thodge85c-cmd.github.io` and `http://localhost:8000` as authorized JavaScript origins.

### Stage 3 – Weekly planner

- "Plan my week" button on the Week tab fills free time in the visible week (never in the past) with study blocks.
- Free time = between wake and bed time, not during classes, 15 min buffer before and after each class, not overlapping existing blocks.
- Each unfinished task has a priority = weight ÷ days until due (days is fractional, minimum 0.25 so nothing divides by zero). Higher = sooner and heavier.
- Each task has `estHours` (defaults: Assignment 3, Quiz 1.5, Midterm 5, Final 8, Other 2; editable per task). Blocks are handed out to the highest-priority task until its estimate is covered, then the next one. Never schedule a block after the task's due date.
- Max 3 study hours per day by default (Settings). Block length from Settings (default 60 min).
- Study blocks look different from classes (striped/outlined) and can be tapped to mark done or delete.
- "Re-plan" clears not-done blocks in that week and regenerates. Done blocks stay.

### Stage 4 – Grades

- Per course: current average (weighted, graded tasks only), % of course completed (sum of weights of graded tasks), target grade, and letter grades using the Guelph scale:
  A+ 90–100 · A 85–89 · A- 80–84 · B+ 77–79 · B 73–76 · B- 70–72 · C+ 67–69 · C 63–66 · C- 60–62 · D+ 57–59 · D 53–56 · D- 50–52 · F below 50.
- "What do I need?": needed = (target − points earned so far) ÷ remaining weight × 100. Say plainly if it's impossible (needed > 100), already locked in (needed ≤ 0), or if nothing is graded yet. Warn if a course's weights don't add up to 100.
- Show the formula in plain words on the tab.

### Stage 5 – Extras

- **Syllabus import** (Tasks tab): paste a course outline, pick the course, parse lines that contain a date and a percentage (handle "Oct 15", "October 15", "15 Oct", "10/15", "2026-10-15", with or without a year; "25%" or "25 %"). Guess the type from keywords (midterm, final, quiz, assignment). Show an editable preview table; nothing saved until I tap Save. No AI, no API keys.
- **Notes**: quick notes per course inside the course sheet, newest first, delete button.
- **Exam mode**: turns on automatically between `examStart` and `examEnd` (and can be previewed from Settings). Home tab shows a countdown per exam and a day-by-day study plan splitting the remaining days across the exams, weighted by exam weight.

## 8. PWA

- `manifest.json`: name, short_name, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, theme/background colours, icons 192 and 512.
- iPhone meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `apple-touch-icon` 180 px.
- Service worker: pre-cache every app file with a versioned cache name (`uni-planner-v1`), delete old caches on activate, cache-first for app files, network-only for Google APIs. Tell me when to bump the version.

## 9. Deploy (walk me through when everything is done)

1. Merge the working branch into `main` and push.
2. GitHub → Settings → Pages → Deploy from branch → `main`, root folder.
3. Add the live URL to the Google Cloud authorized origins.
4. Open the URL in Safari on iPhone → Share → Add to Home Screen.
5. How to push updates later and force the phone to pick them up (bump cache version, reopen app twice).

## 10. Open questions

None. All answered on 24 Sep 2026.
