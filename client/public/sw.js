/**
 * Finlys Service Worker — "Zawsze aktualne"
 *
 * Strategia:
 *  - API (/api/*):          sieć (bypass)
 *  - Nawigacja (HTML):      network-first → cache fallback (offline shell)
 *  - JS / CSS / fonts:      network-first → cache fallback
 *  - Obrazy / ikony:        cache-first → sieć
 *
 * Auto-update: gdy wykryje nową wersję SW → wysyła wiadomość do klientów
 * → aplikacja robi window.location.reload() bez pytania.
 */

const BUILD_TS = "__BUILD_TS__";          // zastępowane przy deploy (można ręcznie zmieniać)
const CACHE_SHELL   = `finlys-shell-${BUILD_TS}`;
const CACHE_ASSETS  = `finlys-assets-${BUILD_TS}`;
const CACHE_IMAGES  = `finlys-images-v1`;  // obrazy są content-hashed, cache-first

const SHELL_URLS = [
  "/",
  "/manifest.json",
];

// ── Instalacja ──────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {})
    )
  );
  // Przejdź od razu — nie czekaj na zamknięcie starych klientów
  self.skipWaiting();
});

// ── Aktywacja — usuń stare cache ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const KEEP = new Set([CACHE_SHELL, CACHE_ASSETS, CACHE_IMAGES]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !KEEP.has(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => {
      // Przejmij kontrolę nad wszystkimi otwartymi kartami
      self.clients.claim();
      // Powiadom klientów o nowej wersji
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: "SW_UPDATED" }));
      });
    })
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Tylko GET
  if (request.method !== "GET") return;

  // API — zawsze sieć, nigdy cache
  if (url.pathname.startsWith("/api/")) return;

  // Zewnętrzne domeny (fonts, CDN) — sieć
  if (url.origin !== location.origin) {
    event.respondWith(fetch(request).catch(() => new Response("", { status: 503 })));
    return;
  }

  // Obrazy i ikony — cache-first (content-hashed, rzadko się zmieniają)
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?|$)/.test(url.pathname)) {
    event.respondWith(cacheFirstImages(request));
    return;
  }

  // Reszta (HTML, JS, CSS, fonty lokalne) — network-first
  event.respondWith(networkFirst(request));
});

// ── Network-first ─────────────────────────────────────────────────────────────
async function networkFirst(request) {
  const cache = await caches.open(CACHE_ASSETS);
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      cache.put(request, networkRes.clone()).catch(() => {});
    }
    return networkRes;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fallback dla nawigacji — zwróć shell
    if (request.mode === "navigate") {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    return new Response("Brak połączenia z siecią", { status: 503 });
  }
}

// ── Cache-first dla obrazów ──────────────────────────────────────────────────
async function cacheFirstImages(request) {
  const cache = await caches.open(CACHE_IMAGES);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) cache.put(request, networkRes.clone()).catch(() => {});
    return networkRes;
  } catch {
    return new Response("", { status: 503 });
  }
}

// ── Wiadomości od aplikacji ──────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CHECK_UPDATE") {
    // Klient pyta czy jest nowa wersja — odpowiedz aktualnym BUILD_TS
    event.ports?.[0]?.postMessage({ type: "VERSION", version: BUILD_TS });
  }
});

// ── Category → icon / vibration / badge colour ───────────────────────────────
const CATEGORY_DEFAULTS = {
  message:  { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", vibrate: [150, 80, 150],           dir: "/notifications" },
  payment:  { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", vibrate: [200, 100, 200, 100, 200], dir: "/notifications" },
  contract: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", vibrate: [100, 50, 100],            dir: "/notifications" },
  security: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", vibrate: [300, 150, 300, 150, 300], dir: "/notifications" },
  system:   { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", vibrate: [100],                     dir: "/notifications" },
};

// ── Web Push — category-aware ─────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {
    title: "Finlys",
    body: "You have a new notification",
    icon: "/icons/icon-192.png",
    category: "system",
    priority: "normal",
    route: "/notifications",
    groupKey: null,
  };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}

  const cat = CATEGORY_DEFAULTS[data.category] || CATEGORY_DEFAULTS.system;
  // Support both `route` (new) and `url` (legacy) fields
  const targetUrl = data.route || data.url || cat.dir || "/notifications";

  // Silent for low priority system notices
  const silent = data.priority === "low" && data.category === "system";

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || cat.icon,
      badge: cat.badge,
      tag: data.groupKey || `finlys-${data.category}`,
      renotify: data.priority === "critical" || data.priority === "high",
      silent,
      data: { url: targetUrl, category: data.category, priority: data.priority },
      vibrate: silent ? [] : cat.vibrate,
      requireInteraction: data.priority === "critical",
    })
  );
});

// ── Notification click — route-aware ─────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.postMessage({ type: "PUSH_NAVIGATE", url: targetUrl });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
