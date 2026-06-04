import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const router = express.Router();
const KEY_FILE  = path.resolve(process.cwd(), ".bot_key");
const ALL_KEYS_FILE = path.resolve(process.cwd(), "all_keys.enc");

function getEncKey(): Buffer {
  if (fs.existsSync(KEY_FILE)) return Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });
  return key;
}

function encryptAllKeys(keys: Record<string, Record<string, string>>): void {
  try {
    const encKey = getEncKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
    const payload = JSON.stringify(keys);
    const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.writeFileSync(ALL_KEYS_FILE, JSON.stringify({
      iv: iv.toString("hex"), enc: enc.toString("hex"), tag: tag.toString("hex"),
    }), { mode: 0o600 });
  } catch { /* ignore */ }
}

function decryptAllKeys(): Record<string, Record<string, string>> | null {
  try {
    if (!fs.existsSync(ALL_KEYS_FILE)) return null;
    const encKey = getEncKey();
    const { iv, enc, tag } = JSON.parse(fs.readFileSync(ALL_KEYS_FILE, "utf8"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(enc, "hex")), decipher.final()]);
    return JSON.parse(dec.toString("utf8"));
  } catch { return null; }
}

// POST /api/keys/sync — save all keys encrypted on server
router.post("/", (req, res) => {
  const keys = req.body;
  if (!keys || typeof keys !== "object") return res.status(400).json({ error: "Invalid keys" });
  encryptAllKeys(keys);
  res.json({ ok: true });
});

// GET /api/keys/sync — load all saved keys
router.get("/", (_req, res) => {
  const keys = decryptAllKeys();
  if (!keys) return res.json({ ok: false, keys: null });
  res.json({ ok: true, keys });
});

export default router;
