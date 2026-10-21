/* Kusurifuda service worker — precaches the whole game so it plays offline.
   Version is a hash of the app files, so any change ships a fresh cache. */
const VERSION = "__VERSION__";
const CACHE = "kusurifuda-" + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache, so a new version never stores stale copies of the old files
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kusurifuda-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
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
