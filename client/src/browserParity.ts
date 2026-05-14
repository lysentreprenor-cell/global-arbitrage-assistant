const PARITY_VERSION = "finlys-browser-parity-2026-04-17-01";
const VERSION_KEY = "__finlys_browser_parity_version__";
const RELOAD_KEY = "__finlys_browser_parity_reloaded__";

function getDisplayMode() {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as any).standalone === true;

  return standalone ? "standalone" : "browser";
}

// ── Czyszczenie starych cache (przy zmianie wersji parity) ───────────────────
async function clearOldCachesOnce() {
  try {
    const previous = localStorage.getItem(VERSION_KEY);
    if (previous === PARITY_VERSION) return;

    const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";

    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    localStorage.setItem(VERSION_KEY, PARITY_VERSION);

    // Wyczyść uszkodzone wartości localStorage (np. "undefined" jako user ID)
    const corruptedKeys = ["fintech_current_user"];
    for (const key of corruptedKeys) {
      const val = localStorage.getItem(key);
      if (val === "undefined" || val === "null" || val === "") {
        localStorage.removeItem(key);
      }
    }

    if (!alreadyReloaded) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      const url = new URL(window.location.href);
      url.searchParams.set("v", PARITY_VERSION);
      window.location.replace(url.toString());
      return;
    }

    sessionStorage.removeItem(RELOAD_KEY);
  } catch (err) {
    console.warn("browser parity cache cleanup warning:", err);
  }
}

// ── Polling wersji serwera — wykryj nowy deploy ─────────────────────────────
let _knownVersion: string | null = null;

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.version ?? null;
  } catch {
    return null;
  }
}

async function checkServerVersion() {
  const current = await fetchVersion();
  if (!current) return;
  if (_knownVersion === null) {
    _knownVersion = current;
    return;
  }
  if (_knownVersion !== current) {
    console.log("[Finlys] Nowa wersja serwera — odświeżanie...");
    window.location.reload();
  }
}

// ── Auto-reload gdy SW zaktualizuje się do nowej wersji ─────────────────────
function setupSwAutoUpdate() {
  if (!("serviceWorker" in navigator)) return;

  // Wiadomość od SW: nowa wersja aktywna → przeładuj
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_UPDATED") {
      console.log("[Finlys] Nowa wersja SW — odświeżanie...");
      window.location.reload();
    }
  });

  // Controller change = nowy SW przejął kontrolę → przeładuj
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const wasControlled = sessionStorage.getItem("__sw_controlled__") === "1";
    if (wasControlled) {
      console.log("[Finlys] SW controller zmieniony — odświeżanie...");
      window.location.reload();
    }
    sessionStorage.setItem("__sw_controlled__", "1");
  });

  // Sprawdź aktualizacje SW co 5 minut
  setInterval(() => {
    navigator.serviceWorker.ready.then((reg) => {
      reg.update().catch(() => {});
    });
    checkServerVersion();
  }, 5 * 60 * 1000);

  // Sprawdź natychmiast po powrocie do zakładki
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => {});
      });
      checkServerVersion();
    }
  });

  // Sprawdź wersję serwera przy starcie (ustaw baseline)
  checkServerVersion();
}

// ── Środowisko (standalone vs browser) ──────────────────────────────────────
function markEnvironment() {
  const mode = getDisplayMode();
  document.documentElement.dataset.displayMode = mode;
  document.body.dataset.displayMode = mode;
  document.body.dataset.runtime = mode;
  document.body.classList.add("browser-parity-ready");
}

// ── Flagi dostępu z serwera ──────────────────────────────────────────────────
async function syncAccessFlags() {
  try {
    const res = await fetch("/api/me/access", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    const data = await res.json().catch(() => ({}));
    const isAdmin = Boolean(data?.isAdmin);

    document.body.dataset.role = isAdmin ? "admin" : "user";
    document.body.dataset.canAccessAdminConsole = isAdmin ? "true" : "false";

    if (data?.permissions) {
      for (const [key, value] of Object.entries(data.permissions)) {
        document.body.dataset[key] = String(Boolean(value));
      }
    }
  } catch {
    document.body.dataset.role = "guest";
    document.body.dataset.canAccessAdminConsole = "false";
  }
}

// ── Normalizacja wysokości (fix mobilnych przeglądarek) ─────────────────────
function normalizeViewportHeight() {
  const setVh = () => {
    document.documentElement.style.setProperty(
      "--app-vh",
      `${window.innerHeight * 0.01}px`
    );
  };
  setVh();
  window.addEventListener("resize", setVh);
  window.addEventListener("orientationchange", setVh);
}

// ── Meta theme-color (ustaw tylko jeśli brak) ────────────────────────────────
function normalizeMetaTheme() {
  let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!theme) {
    theme = document.createElement("meta");
    theme.name = "theme-color";
    document.head.appendChild(theme);
    theme.content = "#0d0d0d";
  }
}

// ── Eksport głównej funkcji ──────────────────────────────────────────────────
export async function bootBrowserParity() {
  normalizeMetaTheme();
  normalizeViewportHeight();
  markEnvironment();
  setupSwAutoUpdate();
  await clearOldCachesOnce();
  await syncAccessFlags();
}
