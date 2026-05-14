/**
 * Centralized typed API client.
 * All server communication goes through here — no more raw fetch() calls scattered in components.
 * Add auth headers, request logging, or retry logic here in one place.
 */

import { getAccessToken } from "./authToken";

// ─── apiFetch — universal fetch with Bearer token + session cookie ─────────────

export async function apiFetch<T>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  const token = getAccessToken();

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : response.status === 401 || response.status === 403
          ? "Brak autoryzacji"
          : "Wystąpił błąd";

    throw new ApiError(message, response.status);
  }

  return data as T;
}

// ─── Base request helper ──────────────────────────────────────────────────────

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as any)?.message ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type AuthUserPayload = {
  id: string;
  name: string;
  handle: string;
  email: string;
  balance: number;
  pushNotifications: boolean;
  emailDigest: boolean;
  biometricLogin: boolean;
  hideBalances: boolean;
  appearance: string;
  phone?: string;
  address?: string;
  createdAt?: string;
};

export const authApi = {
  checkEmail: (email: string) =>
    request<{ exists: boolean }>("POST", "/api/auth/check-email", { email }),

  login: (email: string, password: string) =>
    request<AuthUserPayload>("POST", "/api/auth/login", { email, password }),

  register: (email: string, name: string, password: string) =>
    request<AuthUserPayload>("POST", "/api/auth/register", { email, name, password }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export type UpdateUserBody = Partial<{
  name: string;
  email: string;
  phone: string;
  address: string;
  balance: number;
  pushNotifications: boolean;
  emailDigest: boolean;
  biometricLogin: boolean;
  hideBalances: boolean;
  appearance: "black-gold" | "ice-silver" | "emerald-gold" | "royal-violet" | "obsidian-gold" | "arctic-platinum" | "graphite-emerald";
}>;

export const userApi = {
  get: (userId: string) =>
    request<AuthUserPayload>("GET", `/api/user/${userId}`),

  update: (userId: string, data: UpdateUserBody) =>
    request<AuthUserPayload>("PATCH", `/api/user/${userId}`, data),
};

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TransactionPayload = {
  id: string;
  userId: string;
  type: "send" | "receive" | "topup" | "payment";
  status: "pending" | "completed" | "failed";
  amount: number;
  title: string;
  subtitle: string;
  category?: string;
  date: string;
};

export type CreateTransactionBody = {
  userId: string;
  type: "send" | "receive" | "topup" | "payment";
  status?: "pending" | "completed" | "failed";
  amount: number;
  title: string;
  subtitle: string;
  category?: string;
};

export const transactionApi = {
  list: (userId: string) =>
    request<TransactionPayload[]>("GET", `/api/transactions/${userId}`),

  create: (body: CreateTransactionBody) =>
    request<TransactionPayload>("POST", "/api/transactions", body),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationPayload = {
  id: string;
  userId: string;
  type: "info" | "alert" | "success" | "transfer";
  title: string;
  message: string;
  read: boolean;
  date: string;
};

export const notificationApi = {
  list: (userId: string) =>
    request<NotificationPayload[]>("GET", `/api/notifications/${userId}`),

  create: (body: { userId: string; type: string; title: string; message: string; read?: boolean }) =>
    request<NotificationPayload>("POST", "/api/notifications", body),

  markRead: (notifId: string) =>
    request<{ success: boolean }>("PATCH", `/api/notifications/${notifId}/read`),

  markAllRead: (userId: string) =>
    request<{ success: boolean }>("PATCH", `/api/notifications/user/${userId}/read-all`),
};



// ─── Support ──────────────────────────────────────────────────────────────────

export type SupportMessagePayload = {
  id: string;
  ticketId: string;
  senderId: string;
  text: string;
  timestamp: string;
};

export type SupportTicketPayload = {
  id: string;
  userId: string;
  title: string;
  status: "open" | "pending" | "resolved" | "closed";
  updatedAt: string;
  messages: SupportMessagePayload[];
};

export const supportApi = {
  list: (userId: string) =>
    request<SupportTicketPayload[]>("GET", `/api/support/${userId}`),

  create: (body: { userId: string; title: string; message: string }) =>
    request<SupportTicketPayload>("POST", "/api/support", body),

  addMessage: (ticketId: string, body: { senderId: string; text: string }) =>
    request<SupportMessagePayload>("POST", `/api/support/${ticketId}/messages`, body),
};

// ─── Convenience re-export ────────────────────────────────────────────────────

export const api = {
  auth:         authApi,
  user:         userApi,
  transactions: transactionApi,
  notifications: notificationApi,
  support:      supportApi,
};

export default api;
