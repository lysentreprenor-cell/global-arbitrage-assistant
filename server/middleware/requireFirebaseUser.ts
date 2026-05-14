import type { Request, Response, NextFunction } from "express";
import { adminAuth } from "../lib/firebaseAdmin";

declare global {
  namespace Express {
    interface Request {
      firebaseUser?: {
        uid: string;
        email?: string | null;
        phone_number?: string | null;
        name?: string | null;
      };
    }
  }
}

export async function requireFirebaseUser(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "AUTH_TOKEN_MISSING",
      });
    }

    const decoded = await adminAuth.verifyIdToken(token);

    req.firebaseUser = {
      uid: decoded.uid,
      email: decoded.email || null,
      phone_number: decoded.phone_number || null,
      name: decoded.name || null,
    };

    next();
  } catch (error) {
    console.error("[AUTH_FIREBASE_VERIFY_FAILED]", error);
    return res.status(401).json({
      ok: false,
      error: "AUTH_TOKEN_INVALID",
    });
  }
}
