import fs from "fs";
import path from "path";
import { pool } from "../pool";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const MAX_BACKUPS = 30;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
}

function rotateOldBackups(prefix: string) {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > MAX_BACKUPS) {
      files.slice(MAX_BACKUPS).forEach(({ name }) => {
        fs.unlinkSync(path.join(BACKUP_DIR, name));
      });
    }
  } catch (_) {}
}

const ORDER_COL: Record<string, string> = {
  transactions: "date",
};

export async function backupTable(
  tableName: string,
  label = tableName,
): Promise<{ file: string; rows: number }> {
  ensureBackupDir();

  const ts = timestamp();
  const fileName = `${label}_${ts}.jsonl`;
  const filePath = path.join(BACKUP_DIR, fileName);

  const orderCol = ORDER_COL[tableName] ?? "created_at";
  const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${orderCol}`);
  const rows = result.rows;

  const content = rows.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(filePath, content, "utf-8");

  rotateOldBackups(label + "_");

  return { file: filePath, rows: rows.length };
}

export async function runStartupBackup(): Promise<void> {
  try {
    const [users, txns] = await Promise.all([
      backupTable("app_users", "app_users"),
      backupTable("transactions", "transactions"),
    ]);
    console.log(
      `[backup] Startup backup complete — users: ${users.rows} rows → ${path.basename(users.file)} | transactions: ${txns.rows} rows → ${path.basename(txns.file)}`,
    );
  } catch (err) {
    console.error("[backup] Startup backup FAILED:", err);
  }
}

export async function runManualBackup(): Promise<{
  users: { file: string; rows: number };
  transactions: { file: string; rows: number };
}> {
  const [users, txns] = await Promise.all([
    backupTable("app_users", "app_users"),
    backupTable("transactions", "transactions"),
  ]);
  return { users, transactions: txns };
}
