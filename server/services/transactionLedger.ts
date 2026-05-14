import { Pool } from "pg";
import { adminFirestore } from "../lib/firebaseAdmin";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type CreateTransactionInput = {
  senderFirebaseUid: string;
  receiverFirebaseUid?: string | null;
  amount: number;
  currency?: string;
  type?: string;
  status?: string;
  title?: string;
  description?: string;
  contractId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function upsertUserLink(input: {
  firebaseUid: string;
  email?: string | null;
  displayName?: string | null;
  phone?: string | null;
}) {
  const result = await pool.query(
    `
      INSERT INTO user_links (
        firebase_uid,
        email,
        display_name,
        phone,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (firebase_uid)
      DO UPDATE SET
        email = COALESCE(EXCLUDED.email, user_links.email),
        display_name = COALESCE(EXCLUDED.display_name, user_links.display_name),
        phone = COALESCE(EXCLUDED.phone, user_links.phone),
        updated_at = NOW()
      RETURNING *
    `,
    [
      input.firebaseUid,
      input.email || null,
      input.displayName || null,
      input.phone || null,
    ]
  );

  return result.rows[0];
}

export async function createTransaction(input: CreateTransactionInput) {
  const result = await pool.query(
    `
      INSERT INTO transactions (
        sender_firebase_uid,
        receiver_firebase_uid,
        sender_id,
        receiver_id,
        from_user_id,
        to_user_id,
        amount,
        currency,
        type,
        status,
        title,
        description,
        contract_id,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2,
        $1, $2,
        $1, $2,
        $3, $4, $5, $6, $7, $8, $9, $10,
        NOW(), NOW()
      )
      RETURNING *
    `,
    [
      input.senderFirebaseUid,
      input.receiverFirebaseUid || null,
      input.amount,
      input.currency || "NOK",
      input.type || "transfer",
      input.status || "pending",
      input.title || null,
      input.description || null,
      input.contractId || null,
      JSON.stringify(input.metadata || {}),
    ]
  );

  const tx = result.rows[0];
  await mirrorTransactionToFirestore(tx);

  return tx;
}

export async function listUserTransactions(firebaseUid: string) {
  const result = await pool.query(
    `
      SELECT *
      FROM transactions
      WHERE sender_firebase_uid = $1
         OR receiver_firebase_uid = $1
         OR sender_id = $1
         OR receiver_id = $1
         OR from_user_id = $1
         OR to_user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [firebaseUid]
  );

  return result.rows;
}

export async function updateTransactionStatus(input: {
  transactionId: string;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await pool.query(
    `
      UPDATE transactions
      SET
        status = $2,
        metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      input.transactionId,
      input.status,
      JSON.stringify(input.metadata || {}),
    ]
  );

  const tx = result.rows[0];

  if (tx) {
    await mirrorTransactionToFirestore(tx);
  }

  return tx;
}

export async function mirrorTransactionToFirestore(tx: any) {
  try {
    const publicTx = {
      id: tx.id,
      amount: Number(tx.amount || 0),
      currency: tx.currency || "NOK",
      type: tx.type || "transfer",
      status: tx.status || "pending",
      title: tx.title || null,
      description: tx.description || null,
      contractId: tx.contract_id || null,
      senderFirebaseUid: tx.sender_firebase_uid || tx.sender_id || tx.from_user_id || null,
      receiverFirebaseUid: tx.receiver_firebase_uid || tx.receiver_id || tx.to_user_id || null,
      createdAt: tx.created_at ? new Date(tx.created_at).toISOString() : new Date().toISOString(),
      updatedAt: tx.updated_at ? new Date(tx.updated_at).toISOString() : new Date().toISOString(),
    };

    const users = [
      publicTx.senderFirebaseUid,
      publicTx.receiverFirebaseUid,
    ].filter(Boolean);

    for (const uid of users) {
      await adminFirestore
        .collection("transactionViews")
        .doc(String(uid))
        .collection("items")
        .doc(String(tx.id))
        .set(publicTx, { merge: true });
    }
  } catch (error) {
    console.error("[FIRESTORE_TRANSACTION_MIRROR_FAILED]", error);
  }
}
