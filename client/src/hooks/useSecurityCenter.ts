import { useCallback, useEffect, useState } from "react";

export type SecuritySummary = { score: number; level: "high" | "medium" | "low"; label: string; labelPl: string };
export type SecuritySettings = {
  biometricEnabled: boolean;
  biometricMethod?: string;
  twoFactorEnabled: boolean;
  hideBalance: boolean;
  loginAlerts: boolean;
  transferConfirmation: boolean;
  suspiciousLoginProtection: boolean;
  lastSecurityReviewAt?: string | null;
  pinEnabled?: boolean;
  pinConfigured?: boolean;
};
export type SecurityDevice = { id: string; device_name: string; device_key: string; last_seen_at: string; created_at: string };
export type SecuritySession = { id: string; expires_at: string; created_at: string };
export type SecurityEvent = { id: string; type: string; description: string; metadata: any; created_at: string };
export type DeviceSession = { id: string; device_fingerprint: string; user_agent: string; platform: string; created_at: string; last_seen_at: string };

async function api<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Błąd ${res.status}`);
  return data as T;
}

export function useSecurityCenter() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [devices, setDevices] = useState<SecurityDevice[]>([]);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [devCode, setDevCode] = useState("");

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await api<any>("/api/security-center");
      setSummary(data.summary);
      setSettings(data.settings);
      setDevices(data.devices || []);
      setSessions(data.sessions || []);
      setEvents(data.events || []);
      setDeviceSessions(data.deviceSessions || []);
    } catch (err: any) {
      setError(err?.message || "Błąd centrum bezpieczeństwa.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function updateSettings(next: SecuritySettings) {
    setSaving(true);
    try {
      await api("/api/security-center/settings", { method: "PUT", body: JSON.stringify(next) });
      setSettings(next);
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function send2FA(target?: string) {
    setSaving(true);
    setDevCode("");
    try {
      const data = await api<any>("/api/security-center/2fa/send", { method: "POST", body: JSON.stringify({ target }) });
      if (data.devCode) setDevCode(data.devCode);
      return data;
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function verify2FA(code: string, target?: string) {
    setSaving(true);
    try {
      await api("/api/security-center/2fa/verify", { method: "POST", body: JSON.stringify({ code, target }) });
      setDevCode("");
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function disable2FA() {
    setSaving(true);
    try {
      await api("/api/security-center/2fa/disable", { method: "POST" });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function trustCurrentDevice(deviceName?: string) {
    setSaving(true);
    try {
      await api("/api/security-center/devices/trust-current", { method: "POST", body: JSON.stringify({ deviceName: deviceName || navigator.userAgent.slice(0, 100) }) });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function removeDevice(deviceId: string) {
    setSaving(true);
    try {
      await api(`/api/security-center/devices/${deviceId}`, { method: "DELETE" });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function registerDevice(fingerprint?: string, platform?: string) {
    setSaving(true);
    try {
      await api("/api/security/register-device", {
        method: "POST",
        body: JSON.stringify({
          fingerprint: fingerprint || navigator.userAgent + navigator.language + screen.width,
          userAgent: navigator.userAgent,
          platform: platform || (navigator.userAgent.includes("Mobile") ? "mobile" : "web"),
        }),
      });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function removeDeviceSession(deviceId: string) {
    setSaving(true);
    try {
      await api(`/api/security/devices/${deviceId}`, { method: "DELETE" });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function revokeSession(sessionId: string) {
    setSaving(true);
    try {
      await api("/api/security-center/sessions/revoke", { method: "POST", body: JSON.stringify({ sessionId }) });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function revokeOtherSessions() {
    setSaving(true);
    try {
      await api("/api/security-center/sessions/revoke-others", { method: "POST" });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  async function markReviewed() {
    setSaving(true);
    try {
      await api("/api/security-center/review", { method: "POST" });
      await reload();
    } catch (err: any) { setError(err?.message); throw err; }
    finally { setSaving(false); }
  }

  return {
    loading, saving, error, summary, settings, devices, sessions, events, deviceSessions, devCode,
    reload, updateSettings, send2FA, verify2FA, disable2FA,
    trustCurrentDevice, removeDevice, registerDevice, removeDeviceSession,
    revokeSession, revokeOtherSessions, markReviewed,
  };
}
