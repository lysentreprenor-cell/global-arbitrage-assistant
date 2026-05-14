import { Router } from "express";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser";
import {
  createTransaction,
  listUserTransactions,
  upsertUserLink,
} from "../services/transactionLedger";

const router = Router();

router.use(requireFirebaseUser);

router.get("/", async (req, res) => {
  try {
    const uid = req.firebaseUser!.uid;
    const transactions = await listUserTransactions(uid);

    res.json({
      ok: true,
      transactions,
    });
  } catch (error) {
    console.error("[TRANSACTIONS_LIST_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "TRANSACTIONS_LIST_FAILED",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const uid = req.firebaseUser!.uid;

    await upsertUserLink({
      firebaseUid: uid,
      email: req.firebaseUser!.email || null,
      displayName: req.firebaseUser!.name || null,
      phone: req.firebaseUser!.phone_number || null,
    });

    const amount = Number(req.body.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_AMOUNT",
      });
    }

    const tx = await createTransaction({
      senderFirebaseUid: uid,
      receiverFirebaseUid: req.body.receiverFirebaseUid || req.body.receiverId || null,
      amount,
      currency: req.body.currency || "NOK",
      type: req.body.type || "transfer",
      status: req.body.status || "pending",
      title: req.body.title || null,
      description: req.body.description || null,
      contractId: req.body.contractId || null,
      metadata: req.body.metadata || {},
    });

    res.json({
      ok: true,
      transaction: tx,
    });
  } catch (error) {
    console.error("[TRANSACTION_CREATE_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "TRANSACTION_CREATE_FAILED",
    });
  }
});

export default router;
