import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { storage } from "../storage";

export const authRouter = Router();

type AnyRecord = Record<string, any>;

function pickPasswordHash(user: AnyRecord): string | null {
  return (
    user.passwordHash ??
    user.password_hash ??
    user.hash ??
    user.password ??
    null
  );
}

function verifyPassword(password: string, stored: string): boolean {
  const str = String(stored);

  // scrypt format: "salt:derivedHex"
  if (str.includes(":")) {
    const [salt, hash] = str.split(":");
    if (!salt || !hash) return false;
    try {
      const derived = crypto.scryptSync(password, salt, 64).toString("hex");
      const a = Buffer.from(hash, "hex");
      const b = Buffer.from(derived, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // bcrypt format: starts with $2b$ or $2a$
  if (str.startsWith("$2b$") || str.startsWith("$2a$")) {
    // dynamic import to keep bcrypt optional
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bcrypt = require("bcryptjs");
      return bcrypt.compareSync(password, str);
    } catch {
      return false;
    }
  }

  // fallback: plain sha256 hex (legacy)
  const sha = crypto.createHash("sha256").update(password).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sha), Buffer.from(str));
}

async function findUserByEmailAny(email: string): Promise<AnyRecord | null> {
  const s = storage as AnyRecord;

  const methodNames = [
    "findUserByEmail",
    "getUserByEmail",
    "findUser",
    "getUserForLogin",
  ];

  for (const methodName of methodNames) {
    if (typeof s[methodName] === "function") {
      const result = await s[methodName](email);
      if (result) return result;
    }
  }

  return null;
}

authRouter.post("/mobile-login", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return res.status(400).json({ message: "Brak email lub hasła" });
    }

    const user = await findUserByEmailAny(email);

    if (!user) {
      return res.status(401).json({ message: "Nieprawidłowe dane logowania" });
    }

    const passwordHash = pickPasswordHash(user);

    if (!passwordHash) {
      return res.status(500).json({ message: "Brak hasha hasła użytkownika" });
    }

    const isValid = verifyPassword(password, passwordHash);

    if (!isValid) {
      return res.status(401).json({ message: "Nieprawidłowe dane logowania" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
      },
      secret,
      { expiresIn: "7d" }
    );

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? user.display_name ?? user.email,
        role: user.role ?? "user",
        handle: user.host ? `@${user.host}` : null,
      },
      accessToken,
    });
  } catch (error) {
    console.error("POST /api/auth/mobile-login failed:", error);
    return res.status(500).json({ message: "Nie udało się zalogować" });
  }
});
