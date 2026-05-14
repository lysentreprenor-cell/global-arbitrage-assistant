const FP_KEY = "finlys_device_fp";

export async function getDeviceFingerprint(): Promise<string> {
  try {
    const stored = localStorage.getItem(FP_KEY);
    if (stored && stored.length === 64) return stored;

    // Stable inputs only: UA, screen dimensions, timezone name, language
    const raw = [
      navigator.userAgent,
      String(screen.width),
      String(screen.height),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
    ].join("|");

    const encoded = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fp = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    localStorage.setItem(FP_KEY, fp);
    return fp;
  } catch {
    const fallback = btoa(
      navigator.userAgent + navigator.language + screen.width + screen.height
    ).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64).padEnd(64, "0");
    try { localStorage.setItem(FP_KEY, fallback); } catch {}
    return fallback;
  }
}

export async function registerDevice(): Promise<void> {
  try {
    const fingerprint = await getDeviceFingerprint();
    const platform = /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "web";
    await fetch("/api/security/register-device", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fingerprint,
        userAgent: navigator.userAgent,
        platform,
      }),
    });
  } catch {
    // Fire-and-forget — failures are silent
  }
}
