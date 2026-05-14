import { useCallback, useMemo, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  getDisplayHandle,
  matchesUserQuery,
} from "@/lib/handleUtils";

export type SearchableUser = {
  id: string;
  name: string;
  handle: string;
  email?: string;
  phone?: string;
  initials?: string;
  color?: string;
  recent?: boolean;
  fromServer?: boolean;
};

function computeInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "US";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function mapUser(input: any, fromServer = false): SearchableUser {
  return {
    id: String(input?.id || ""),
    name: String(input?.name || "Unknown User"),
    handle: getDisplayHandle(input?.name, input?.handle, input?.id),
    email: input?.email || undefined,
    phone: input?.phone || undefined,
    initials: input?.initials || computeInitials(input?.name || "Unknown User"),
    color: input?.color || "bg-blue-500/20 text-blue-400",
    recent: Boolean(input?.recent),
    fromServer,
  };
}

function dedupeUsers(list: SearchableUser[]): SearchableUser[] {
  const seen = new Set<string>();
  const result: SearchableUser[] = [];

  for (const user of list) {
    const key =
      String(user.id || "") ||
      String(user.handle || "") ||
      String(user.email || "");

    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(user);
  }

  return result;
}

export function useUserSearch() {
  const currentUser = useCurrentUser();
  const [results, setResults] = useState<SearchableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    const q = String(query || "").trim();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (currentUser.userId) {
        params.set("excludeUserId", currentUser.userId);
      }

      const response = await fetch(`/api/users/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error("User search failed");
      }

      const data = await response.json();
      // Support both legacy array format and new { items: [] } format
      const rawList = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items.map((u: any) => ({
            id: u.id,
            name: u.displayName || u.name || "",
            handle: u.host ? `@${u.host}` : "",
            email: u.email,
            phone: u.phone,
          }))
        : [];
      setResults(dedupeUsers(rawList.map((item: any) => mapUser(item, true))));
    } catch (err: any) {
      setResults([]);
      setError(err?.message || "User search failed");
    } finally {
      setLoading(false);
    }
  }, [currentUser.userId]);

  const mergeWithLocalContacts = useCallback((localContacts: any[] = [], query: string) => {
    const localMapped = (localContacts || []).map((item) => mapUser(item, false));
    const localFiltered = localMapped.filter((item) => matchesUserQuery(item, query));
    const remoteFiltered = results.filter((item) => matchesUserQuery(item, query));

    return dedupeUsers([...remoteFiltered, ...localFiltered]);
  }, [results]);

  return useMemo(() => ({
    results,
    loading,
    error,
    search,
    mergeWithLocalContacts,
  }), [results, loading, error, search, mergeWithLocalContacts]);
}
