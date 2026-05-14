import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { isAdminEmail as isAdminEmailFromRealAuth, type AppRequest, ADMIN_EMAIL } from "./realAuth";

export { ADMIN_EMAIL };

export function normalizeEmail(email?: string | null): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  return isAdminEmailFromRealAuth(email);
}

function getUserIdFromBearer(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as Record<string, any>;
    const id = decoded.sub || decoded.userId || decoded.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the calling user from the request.
 * Priority: cookie session → JWT Bearer token
 * The x-user-id header fallback has been removed — it was a security hole
 * that allowed any caller to impersonate another user.
 */
export async function resolveRequestUser(req: Request) {
  const appReq = req as AppRequest;
  if (appReq.user?.id) {
    return { id: appReq.user.id, email: appReq.user.email ?? null, name: appReq.user.displayName ?? null };
  }

  const bearerId = getUserIdFromBearer(req);
  if (bearerId) {
    const dbUser = await storage.getUser(bearerId);
    if (dbUser) return { id: dbUser.id, email: dbUser.email ?? null, name: dbUser.name ?? null };
  }

  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await resolveRequestUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  (req as any).resolvedUser = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await resolveRequestUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!isAdminEmail(user.email)) return res.status(403).json({ error: "Forbidden — admin only" });
  (req as any).resolvedUser = user;
  next();
}
