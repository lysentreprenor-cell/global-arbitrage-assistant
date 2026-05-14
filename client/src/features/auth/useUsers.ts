import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string;
  createdAt: number;
  updatedAt: number;
}

interface UseUsersReturn {
  users: UserProfile[];
  loading: boolean;
}

export function useUsers(currentUid?: string | null): UseUsersReturn {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const usersRef = ref(realtimeDb, "users");

    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setUsers([]);
      } else {
        const all = Object.values(data) as UserProfile[];
        setUsers(currentUid ? all.filter((u) => u.uid !== currentUid) : all);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUid]);

  return { users, loading };
}
