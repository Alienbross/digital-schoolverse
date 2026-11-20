// Digital SchoolVerse service worker.
// Kept deliberately simple: it does not cache pages or data, so the
// portal can never serve a stale version. It exists so the app meets
// the installability requirements on browsers that ask for one, and
// so future offline work has a place to live.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass every request straight through to the network.
self.addEventListener("fetch", () => {
  return;
});
