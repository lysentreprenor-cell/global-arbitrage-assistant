import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

async function getVapidKey(): Promise<string> {
  const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
  const { key } = await res.json();
  return key;
}

async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    // Already subscribed — ensure it's registered on server
    await sendSubToServer(existingSub);
    return;
  }

  const vapidKey = await getVapidKey();
  if (!vapidKey) return;

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await sendSubToServer(sub);
}

async function sendSubToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return;
  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
  });
}

export function usePushNotifications(isAuthenticated: boolean) {
  const [, setLocation] = useLocation();
  const subscribed = useRef(false);

  // Subscribe when user first logs in
  useEffect(() => {
    if (!isAuthenticated || subscribed.current) return;
    subscribed.current = true;
    subscribeToPush().catch(() => {});
  }, [isAuthenticated]);

  // Listen for PUSH_NAVIGATE messages from the service worker (when user clicks notification)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_NAVIGATE" && event.data?.url) {
        setLocation(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [setLocation]);
}
