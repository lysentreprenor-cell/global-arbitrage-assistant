import admin from "firebase-admin";

function parseServiceAccount() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    console.error("[FIREBASE_ADMIN_PARSE_FAILED]", error);
    return null;
  }
}

const databaseURL =
  process.env.FIREBASE_DATABASE_URL ||
  process.env.VITE_FIREBASE_DATABASE_URL ||
  undefined;

const existingApps = admin.apps;

if (!existingApps.length) {
  const serviceAccount = parseServiceAccount();

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      databaseURL,
    });
  } else {
    admin.initializeApp({ databaseURL });
  }
}

export const firebaseAdmin = admin;
export const adminAuth = admin.auth();
export const adminFirestore = admin.firestore();

console.info("[FIREBASE_ADMIN_READY]", {
  projectId: admin.app().options.projectId || "from-service-account",
  hasAdminAuth: Boolean(adminAuth),
  hasAdminFirestore: Boolean(adminFirestore),
  hasRealtimeDb: Boolean(databaseURL),
});

// Realtime Database handle. Every `getAdminDb()` call site uses the RTDB API
// (`.ref(...)`) and writes to the same paths the web client reads through
// `firebase/database`, so this must not return Firestore. Returns null when no
// database URL is configured — all call sites guard on that.
let _rtdb: admin.database.Database | null | undefined;

export function getAdminDb(): admin.database.Database | null {
  if (_rtdb !== undefined) return _rtdb;
  if (!databaseURL) {
    console.warn(
      "[FIREBASE_ADMIN] FIREBASE_DATABASE_URL not set — Realtime Database features disabled.",
    );
    _rtdb = null;
    return _rtdb;
  }
  try {
    _rtdb = admin.database();
  } catch (error) {
    console.error("[FIREBASE_ADMIN_DATABASE_FAILED]", error);
    _rtdb = null;
  }
  return _rtdb;
}

export function getAdminFirestore() {
  return adminFirestore;
}

export function getAdminAuth() {
  return adminAuth;
}

export function getFirebaseAdmin() {
  return firebaseAdmin;
}
