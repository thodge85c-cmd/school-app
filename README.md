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
- **Stage 2:** Read-only Google Calendar sync.
- **Stage 3:** "Plan my week" study-block generator.
- **Stage 4:** Grades tab with "what do I need?" maths.
- **Stage 5:** Syllabus paste-to-tasks, per-course notes, exam mode.
