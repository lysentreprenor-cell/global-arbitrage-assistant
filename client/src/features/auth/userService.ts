import { ref, get, set, update } from "firebase/database";
import { User } from "firebase/auth";
import { realtimeDb } from "@/lib/firebase";

interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string;
  createdAt: number;
  updatedAt: number;
}

export async function saveUserProfile(user: User): Promise<void> {
  const userRef = ref(realtimeDb, `users/${user.uid}`);
  const snapshot = await get(userRef);

  const providerId = user.providerData[0]?.providerId ?? "unknown";
  const now = Date.now();

  if (snapshot.exists()) {
    await update(userRef, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      providerId,
      updatedAt: now,
    });
  } else {
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      providerId,
      createdAt: now,
      updatedAt: now,
    };
    await set(userRef, profile);
  }
}
