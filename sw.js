/* Offline support: the whole game is cached on first visit and works with no
   connection after that. Bump VERSION when shipping changes. */
const VERSION = 'stress-3.1.0';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'src/rules.js', 'src/ai.js', 'src/solver.js', 'src/ai-worker.js', 'src/rivals.js', 'src/progress.js', 'src/data/puzzles.js',
  'src/storage.js', 'src/art.js', 'src/icons.js', 'src/sound.js', 'src/music.js', 'src/haptics.js', 'src/native.js', 'src/fx.js',
  'src/board-view.js', 'src/match.js', 'src/tutorial.js', 'src/screens.js', 'src/main.js',
  'assets/fonts/figtree-latin.woff2', 'assets/fonts/unbounded-latin.woff2',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache first, then the network; refresh the cache in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(cache => cache.match(req, { ignoreSearch: true }).then(hit => {
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit || cache.match('index.html'));
    return hit || fresh;
  })));
});
