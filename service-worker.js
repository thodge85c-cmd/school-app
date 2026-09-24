/**
 * service-worker.js – makes the app work offline.
 *
 * The first time the app loads, this file saves a copy of every app file in
 * the browser's cache. After that, the app is served from the cache first, so
 * it opens instantly and works with no signal.
 *
 * HOW UPDATES WORK: the browser only notices a change when THIS file changes.
 * So every time you push an update to the app, bump CACHE_VERSION below
 * (v1 → v2 → v3 …). Old caches are deleted automatically.
 */

const CACHE_VERSION = 'v3';
const CACHE_NAME = `grif-planner-${CACHE_VERSION}`;

// Every file the app needs to run offline. Add new files here as the app grows.
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/dates.js',
  './js/ui.js',
  './js/storage.js',
  './js/schedule.js',
  './js/tasks.js',
  './js/settings.js',
  './js/gcal.js',
  './js/planner.js',
  './js/grades.js',
  './js/syllabus.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

// Install: download and cache every file in the list.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// Activate: delete caches left over from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Fetch: serve our own files from the cache; anything else (Google APIs later) goes to the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // network only for other sites

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        // Offline and not cached: for page loads, fall back to the app shell.
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    }),
  );
});
