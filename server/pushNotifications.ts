import webpush from "web-push";
import { pool } from "./pool";

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT     || "mailto:admin@finlys.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export { VAPID_PUBLIC };

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(userId: string, sub: PushSubscriptionData) {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await pool.query(
    `DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`,
    [userId, endpoint]
  );
}

export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    route?: string;
    category?: string;
    priority?: string;
    groupKey?: string;
  }
) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1`,
    [userId]
  );
  const payloadStr = JSON.stringify(payload);
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payloadStr,
        { TTL: 60 }
      );
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await pool.query(
          `DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`,
          [userId, row.endpoint]
        );
      }
    }
  }
}
