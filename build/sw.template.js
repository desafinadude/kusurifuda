/* Kusurifuda service worker — precaches the whole game so it plays offline.
   Version is a hash of the app files, so any change ships a fresh cache. */
const VERSION = "__VERSION__";
// the live game and the beta (/beta/) share an origin, so their caches are named apart and never cleared by each other
const BETA = /\/beta\/$/.test(self.registration.scope);
const PFX = BETA ? "kusurifuda-beta-" : "kusurifuda-";
const CACHE = PFX + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache, so a new version never stores stale copies of the old files
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PFX) && k !== CACHE && (BETA || !k.startsWith("kusurifuda-beta-"))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // the live game's worker leaves the beta's pages and files to the beta's own worker
  if (!BETA && req.url.startsWith(self.registration.scope + "beta/")) return;
  if (req.mode === "navigate") {
    // app shell: cached index, refreshed in the background when online
    e.respondWith(caches.match("./", { ignoreSearch: true }).then((hit) => hit || fetch(req)).catch(() => caches.match("./")));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
