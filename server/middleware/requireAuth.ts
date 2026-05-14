import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      authUserId?: string;
      authUser?: {
        id: string;
        email?: string;
      };
    }
  }
}

type JwtPayload = {
  sub?: string;
  userId?: string;
  id?: string;
  email?: string;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  return token;
}

function getUserFromSession(req: Request): { id: string; email?: string } | null {
  const anyReq = req as Request & {
    user?: { id?: string; email?: string };
    session?: {
      user?: { id?: string; email?: string };
      userId?: string;
    };
  };

  if (anyReq.user?.id) {
    return {
      id: String(anyReq.user.id),
      email: anyReq.user.email,
    };
  }

  if (anyReq.session?.user?.id) {
    return {
      id: String(anyReq.session.user.id),
      email: anyReq.session.user.email,
    };
  }

  if (anyReq.session?.userId) {
    return {
      id: String(anyReq.session.userId),
    };
  }

  return null;
}

function getUserFromJwt(req: Request): { id: string; email?: string } | null {
  const token = getBearerToken(req);
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    const userId = decoded.sub || decoded.userId || decoded.id;
    if (!userId) return null;
    return { id: String(userId), email: decoded.email };
  } catch {
    return null;
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = getUserFromJwt(req) ?? getUserFromSession(req);

    if (!user?.id) {
      return res.status(401).json({ message: "Brak autoryzacji" });
    }

    req.authUserId = user.id;
    req.authUser = user;

    next();
  } catch (error) {
    console.error("requireAuth failed:", error);
    return res.status(401).json({ message: "Brak autoryzacji" });
  }
}
