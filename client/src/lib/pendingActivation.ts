const KEY = "pending_activation_user";

export function savePendingActivationUser(user: any) {
  try {
    localStorage.setItem(KEY, JSON.stringify(user || null));
  } catch {}
}

export function getPendingActivationUser() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingActivationUser() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
