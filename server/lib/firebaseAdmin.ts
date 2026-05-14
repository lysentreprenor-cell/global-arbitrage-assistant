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

const existingApps = admin.apps;

if (!existingApps.length) {
  const serviceAccount = parseServiceAccount();

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  } else {
    admin.initializeApp();
  }
}

export const firebaseAdmin = admin;
export const adminAuth = admin.auth();
export const adminFirestore = admin.firestore();

console.info("[FIREBASE_ADMIN_READY]", {
  projectId: admin.app().options.projectId || "from-service-account",
  hasAdminAuth: Boolean(adminAuth),
  hasAdminFirestore: Boolean(adminFirestore),
});


export function getAdminDb() {
  return adminFirestore;
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
