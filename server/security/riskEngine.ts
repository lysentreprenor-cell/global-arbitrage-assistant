import type { Pool } from "pg";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: string[];
}

export async function assessRisk(
  userId: string,
  amount: number,
  recipientId: string,
  pool: Pool
): Promise<RiskAssessment> {
  let score = 0;
  const reasons: string[] = [];

  try {
    const [transferCountRes, prevTransferRes, failedRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM security_events
         WHERE user_id = $1 AND type = 'transfer'
           AND created_at > NOW() - INTERVAL '24 hours'`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM security_events
         WHERE user_id = $1 AND type = 'transfer'
           AND metadata->>'recipientId' = $2`,
        [userId, recipientId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM security_events
         WHERE user_id = $1 AND type = 'transfer_failed'
           AND created_at > NOW() - INTERVAL '24 hours'`,
        [userId]
      ),
    ]);

    const transferCount = Number(transferCountRes.rows[0]?.cnt ?? 0);
    const prevTransfers = Number(prevTransferRes.rows[0]?.cnt ?? 0);
    const failedCount = Number(failedRes.rows[0]?.cnt ?? 0);

    if (transferCount > 3) {
      score += 20;
      reasons.push(`Wiele transferów w ciągu 24h (${transferCount})`);
    }

    if (amount > 500) {
      score += 20;
      reasons.push(`Wysoka kwota (${amount.toFixed(2)})`);
    }

    if (prevTransfers === 0) {
      score += 15;
      reasons.push("Nowy odbiorca — pierwsza transakcja");
    }

    if (failedCount > 0) {
      score += 25;
      reasons.push(`Nieudane transfery dziś (${failedCount})`);
    }
  } catch {
    // Fail-safe: treat DB errors as medium risk to avoid silently passing high-risk transfers
    return { level: "medium", score: 25, reasons: ["Nie udało się ocenić ryzyka — traktowane jako podejrzane"] };
  }

  const level: RiskLevel = score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { level, score, reasons };
}
