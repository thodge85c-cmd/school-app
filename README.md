# Grif Planner

A small web app for organising university life: timetable, assignments, study
planning and grades. Built for the iPhone home screen, hosted free on GitHub
Pages, and written in plain HTML, CSS and JavaScript so there is nothing to
install or build.

Live site (once GitHub Pages is turned on): <https://thodge85c-cmd.github.io/school-app/>

## What's in the box

| File / folder | What it does |
|---|---|
| `index.html` | The one page the whole app runs in. Holds the bottom tab bar. |
| `css/styles.css` | All the styling. Colours are variables at the top; dark mode swaps them. |
| `js/app.js` | Start-up, tab switching, the Home tab, and the pop-up course/day sheets. |
| `js/dates.js` | Date helpers. Everything is calculated in the America/Toronto timezone. |
| `js/storage.js` | Loads and saves your data (one `localStorage` key), plus export/import/reset. |
| `js/schedule.js` | Timetable logic (what's on today, what's next) and the Week tab grid. |
| `js/tasks.js` | Assignments/exams: grouping, the add/edit form, the Tasks tab. |
| `js/settings.js` | The Settings tab: courses, term dates, your routine, backups. |
| `js/gcal.js` | Google Calendar read-only sync and course matching. |
| `js/planner.js` | The study-block generator behind "Plan my week". |
| `js/grades.js` | Grade maths, Guelph letter scale, and the Grades tab. |
| `js/syllabus.js` | Turns pasted course outlines into draft tasks. |
| `js/ui.js` | Small helpers for building the screen, bottom sheets, confirm boxes, toasts. |
| `service-worker.js` | Caches the app so it opens offline. Has the cache version number. |
| `manifest.json` | Tells the phone the app's name, icon and colours when installed. |
| `icons/` | App icons (192, 512, maskable 512, and the 180 px iPhone icon). |
| `BRIEF.md` | The full plan for the app, stage by stage. |

Your data never leaves your phone. It is stored in the browser's `localStorage`
under the key `uniPlanner.v1`. Use **Settings → Export backup** now and then.

## Running it on your computer

Because the app uses JavaScript modules and a service worker, it has to be
served by a web server, not opened as a file. Python comes with one:

```bash
cd school-app
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser. Press `Ctrl+C` in the
terminal to stop the server.

Tip: in Chrome, open DevTools (`F12` or `Cmd+Option+I`), click the little
phone icon ("Toggle device toolbar") and pick *iPhone 14 Pro* to see the
mobile layout. Dark mode: DevTools → three-dot menu → More tools → Rendering
→ "Emulate CSS prefers-color-scheme".

## Testing on your iPhone before it's online

Your phone and computer must be on the same Wi-Fi.

1. Find your computer's local address: on a Mac, System Settings → Wi-Fi →
   Details; on Windows, run `ipconfig` and look for "IPv4 Address". It looks
   like `192.168.1.23`.
2. Start the server as above.
3. On the iPhone, open Safari and go to `http://192.168.1.23:8000` (use your
   address).

Offline mode and "Add to Home Screen" only fully work over HTTPS, which you
get for free once the site is on GitHub Pages.

## Google Calendar sync (Stage 2)

The app can read your Google Calendar and turn events into tasks. It only
ever *reads*. To make this work you need a free "Client ID" from Google, a
one-time job that takes about ten minutes. The Client ID is safe to be
public; there is no secret involved.

### 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with the Google
   account whose calendar you use.
2. At the top, click the project dropdown → **New project**. Name it
   `Grif Planner` and click **Create**. Make sure it is selected afterwards.

### 2. Turn on the Calendar API

1. Menu (☰) → **APIs & Services** → **Library**.
2. Search for **Google Calendar API**, open it, click **Enable**.

### 3. Set up the consent screen (what the pop-up says)

1. **APIs & Services** → **OAuth consent screen** (Google sometimes calls this
   "Google Auth Platform" → "Branding").
2. Choose **External**, then **Create**.
3. App name: `Grif Planner`. User support email: your email. Developer
   contact: your email. Save and continue through the remaining steps; you
   don't need to add scopes here.
4. Find **Audience** (or "Test users") and add your own Gmail address as a
   test user. Leave the app in **Testing** mode. In testing mode only the
   test users you list can sign in, which is exactly what you want.

### 4. Create the Client ID

1. **APIs & Services** → **Credentials** → **Create credentials** →
   **OAuth client ID**.
2. Application type: **Web application**. Name: `Grif Planner web`.
3. Under **Authorized JavaScript origins** click **Add URI** for each of:
   - `http://localhost:8000`
   - `https://thodge85c-cmd.github.io`
4. Leave "Authorized redirect URIs" empty. Click **Create**.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

### 5. Put the Client ID in the app

Either of these works:

- **Easiest:** open the app → Settings → Google Calendar → paste it into the
  "Google Client ID" box.
- **Permanent:** open `js/gcal.js` and paste it between the quotes on the line
  `export const CLIENT_ID = '';`, then push the update.

### 6. Connect and sync

1. Settings → **Connect Google Calendar**. A Google pop-up asks you to allow
   read-only calendar access. Approve it. (While the app is in Testing mode
   Google shows a "this app isn't verified" warning; click *Continue*.)
2. Tick the calendars you want to pull from, then tap **Sync now**.
3. Events whose title mentions a course code (`ACCT*1220`, `ACCT 1220`,
   `ACCT`) or course name become tasks. Anything else appears under
   **Tasks → calendar events to review**, where you assign a course or ignore it.
4. Re-syncing updates titles and dates of imported tasks but keeps anything
   you set by hand (done, grade, weight).

Google's sign-in token lasts about an hour. The app auto-syncs when you open
it if the token is still fresh; otherwise tap **Sync** on the Tasks tab. On
an iPhone home-screen app the sign-in opens in a small Safari window and
returns to the app when done.

## Study planner (Stage 3)

On the Week tab, tap **Plan my week**. The app finds your free time (between
wake and bed time, skipping classes plus a 15-minute buffer) and fills it
with study blocks for your unfinished tasks. Heavier and sooner tasks get
time first, up to each task's "Study hours" estimate. Nothing is scheduled
after a task's due date, and no more than the daily maximum (Settings, default
3 hours). Study blocks appear striped and dashed so they look different from
classes. Tap one to mark it done or delete it. **Re-plan week** clears the
unfinished blocks and starts over; done blocks stay.

## Grades (Stage 4)

Tap a task and fill in the **Grade** box as marks come back. The Grades tab
then shows, per course, your weighted average so far, how much of the course
is graded, and a "What do I need?" line telling you the average required on
the remaining work to hit your target, or whether the target is already
locked in or out of reach. Letters follow the Guelph scale. The formula is
explained in plain words at the bottom of the tab.

## Syllabus import, notes, exam mode (Stage 5)

- **Syllabus import:** on the Tasks tab tap 📄, pick the course, paste your
  course outline, and tap *Find dates & weights*. Every line containing a
  date (e.g. "Midterm – Oct 15 – 25%") becomes a draft you can edit or untick
  before saving. Nothing is saved until you tap *Save tasks*.
- **Notes:** open any course (tap a class block or a class on Home) and use
  the Notes section at the bottom. Newest first.
- **Exam mode:** between the exam start and end dates in Settings, the Home
  tab switches to a countdown for each exam (tasks of type Final or Midterm)
  and a day-by-day study split. You can preview it any time with the toggle
  in Settings.

## Pushing an update

1. Edit the files.
2. Open `service-worker.js` and change `CACHE_VERSION` (for example `v1` → `v2`).
   This is how installed phones learn there is a new version.
3. Commit and push to the `main` branch. GitHub Pages updates within a minute or two.
4. On the phone, close the app fully and open it twice: the first open downloads
   the update in the background, the second open uses it.

## Deploying to GitHub Pages

1. On GitHub, open the repository → **Settings** → **Pages**.
2. Under "Build and deployment", choose **Deploy from a branch**, pick `main`
   and `/ (root)`, and click Save.
3. Wait a minute, then open <https://thodge85c-cmd.github.io/school-app/>.
4. On the iPhone: open that address in Safari → tap **Share** → **Add to Home
   Screen** → Add. It now opens like a normal app, full screen, and works offline.

## Roadmap

- **Stage 1 (done):** Home, Week, Tasks and Settings tabs; offline; backups.
- **Stage 2 (done):** Read-only Google Calendar sync.
- **Stage 3 (done):** "Plan my week" study-block generator.
- **Stage 4 (done):** Grades tab with "what do I need?" maths.
- **Stage 5 (done):** Syllabus paste-to-tasks, per-course notes, exam mode.
