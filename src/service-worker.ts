/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { files, version } from "$service-worker";

// Installability + fast repeat loads only. Pages, __data.json, /api, auth and
// SSE are never intercepted: they are per-user and live, caching them would
// leak stale or another user's data.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `cache-${version}`;
const STATIC = new Set(files);

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline — Marketing Tools</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#1c1917;background:#fff}main{text-align:center;padding:1rem}button{margin-top:1rem;padding:.5rem 1rem;border:0;border-radius:.5rem;background:#c2410c;color:#fff;font:inherit;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#0c0a09;color:#fafaf9}}</style></head><body><main><h1>You're offline</h1><p>Marketing Tools needs a connection. Reconnect and try again.</p><button onclick="location.reload()">Retry</button></main></body></html>`;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(files))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  if (url.pathname.startsWith("/_app/immutable/") || STATIC.has(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      ),
    );
  }
});
