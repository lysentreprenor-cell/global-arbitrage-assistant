import { Router } from "express";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser";
import { adminAuth, adminFirestore } from "../lib/firebaseAdmin";

const router = Router();

function publicUserFromAuth(user: any) {
  return {
    uid: user.uid,
    id: user.uid,
    email: user.email || null,
    displayName: user.displayName || user.email || user.phoneNumber || "User",
    phoneNumber: user.phoneNumber || null,
    photoURL: user.photoURL || null,
    source: "firebase-auth",
  };
}

function normalizeSearch(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function upsertUserFromToken(firebaseUser: any) {
  const uid = firebaseUser.uid;

  const authUser = await adminAuth.getUser(uid).catch(() => null);

  const payload = {
    uid,
    id: uid,
    email: firebaseUser.email || authUser?.email || null,
    displayName:
      firebaseUser.name ||
      authUser?.displayName ||
      firebaseUser.email ||
      authUser?.email ||
      firebaseUser.phone_number ||
      authUser?.phoneNumber ||
      "User",
    phoneNumber: firebaseUser.phone_number || authUser?.phoneNumber || null,
    photoURL: authUser?.photoURL || null,
    searchable:
      [
        uid,
        firebaseUser.email,
        authUser?.email,
        firebaseUser.name,
        authUser?.displayName,
        firebaseUser.phone_number,
        authUser?.phoneNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    lastSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await adminFirestore.collection("users").doc(uid).set(payload, { merge: true });

  return payload;
}

router.use(requireFirebaseUser);

router.post("/me", async (req, res) => {
  try {
    const user = await upsertUserFromToken(req.firebaseUser);

    res.json({
      ok: true,
      user,
    });
  } catch (error) {
    console.error("[USERS_ME_SYNC_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "USERS_ME_SYNC_FAILED",
    });
  }
});

router.get("/me", async (req, res) => {
  try {
    const uid = req.firebaseUser!.uid;
    const snap = await adminFirestore.collection("users").doc(uid).get();

    if (!snap.exists) {
      const user = await upsertUserFromToken(req.firebaseUser);
      return res.json({ ok: true, user });
    }

    res.json({
      ok: true,
      user: snap.data(),
    });
  } catch (error) {
    console.error("[USERS_ME_READ_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "USERS_ME_READ_FAILED",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const currentUid = req.firebaseUser!.uid;

    await upsertUserFromToken(req.firebaseUser);

    const firestoreSnap = await adminFirestore
      .collection("users")
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();

    const fromFirestore = firestoreSnap.docs.map((doc) => ({
      id: doc.id,
      uid: doc.id,
      ...doc.data(),
      source: "firestore",
    }));

    let fromAuth: any[] = [];

    try {
      const authUsers = await adminAuth.listUsers(200);
      fromAuth = authUsers.users.map(publicUserFromAuth);
    } catch (error) {
      console.error("[AUTH_LIST_USERS_FAILED]", error);
    }

    const map = new Map<string, any>();

    for (const user of fromAuth) {
      if (user.uid && user.uid !== currentUid) {
        map.set(user.uid, user);
      }
    }

    for (const user of fromFirestore) {
      if (user.uid && user.uid !== currentUid) {
        map.set(user.uid, {
          ...(map.get(user.uid) || {}),
          ...user,
        });
      }
    }

    const users = Array.from(map.values()).sort((a, b) => {
      return String(a.displayName || a.email || "").localeCompare(
        String(b.displayName || b.email || "")
      );
    });

    res.json({
      ok: true,
      users,
    });
  } catch (error) {
    console.error("[USERS_LIST_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "USERS_LIST_FAILED",
    });
  }
});

router.get("/search", async (req, res) => {
  try {
    const currentUid = req.firebaseUser!.uid;
    const q = normalizeSearch(req.query.q);

    await upsertUserFromToken(req.firebaseUser);

    const authUsers = await adminAuth.listUsers(300);
    const users = authUsers.users
      .map(publicUserFromAuth)
      .filter((user) => user.uid !== currentUid)
      .filter((user) => {
        if (!q) return true;

        const haystack = normalizeSearch(
          [
            user.uid,
            user.email,
            user.displayName,
            user.phoneNumber,
          ].join(" ")
        );

        return haystack.includes(q);
      })
      .slice(0, 100);

    res.json({
      ok: true,
      users,
    });
  } catch (error) {
    console.error("[USERS_SEARCH_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "USERS_SEARCH_FAILED",
    });
  }
});

export default router;
