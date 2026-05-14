import { Router } from "express";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser";
import { adminFirestore } from "../lib/firebaseAdmin";

const router = Router();

function makeConversationId(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join("_");
}

router.use(requireFirebaseUser);

router.post("/send", async (req, res) => {
  try {
    const senderId = req.firebaseUser!.uid;
    const receiverId = String(req.body.receiverId || req.body.otherUserId || "").trim();
    const text = String(req.body.text || req.body.message || "").trim();

    if (!receiverId) {
      return res.status(400).json({ ok: false, error: "RECEIVER_MISSING" });
    }

    if (!text) {
      return res.status(400).json({ ok: false, error: "TEXT_EMPTY" });
    }

    if (receiverId === senderId) {
      return res.status(400).json({ ok: false, error: "SELF_MESSAGE_BLOCKED" });
    }

    const conversationId = makeConversationId(senderId, receiverId);
    const now = new Date();

    const conversationRef = adminFirestore.collection("conversations").doc(conversationId);

    await conversationRef.set(
      {
        id: conversationId,
        conversationId,
        participants: {
          [senderId]: true,
          [receiverId]: true,
        },
        participantIds: [senderId, receiverId].sort(),
        lastMessage: text,
        lastMessageAt: now.toISOString(),
        updatedAt: now.toISOString(),
        createdAt: now.toISOString(),
      },
      { merge: true }
    );

    await adminFirestore
      .collection("userConversations")
      .doc(senderId)
      .collection("conversations")
      .doc(conversationId)
      .set(
        {
          id: conversationId,
          conversationId,
          otherUserId: receiverId,
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );

    await adminFirestore
      .collection("userConversations")
      .doc(receiverId)
      .collection("conversations")
      .doc(conversationId)
      .set(
        {
          id: conversationId,
          conversationId,
          otherUserId: senderId,
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );

    const messageRef = await conversationRef.collection("messages").add({
      conversationId,
      senderId,
      receiverId,
      text,
      read: false,
      createdAt: now.toISOString(),
    });

    await messageRef.set(
      {
        id: messageRef.id,
      },
      { merge: true }
    );

    res.json({
      ok: true,
      conversationId,
      message: {
        id: messageRef.id,
        conversationId,
        senderId,
        receiverId,
        text,
        read: false,
        createdAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("[MESSAGE_SEND_API_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "MESSAGE_SEND_API_FAILED",
    });
  }
});

router.get("/conversation/:otherUserId", async (req, res) => {
  try {
    const uid = req.firebaseUser!.uid;
    const otherUserId = String(req.params.otherUserId || "").trim();

    if (!otherUserId) {
      return res.status(400).json({ ok: false, error: "OTHER_USER_MISSING" });
    }

    const conversationId = makeConversationId(uid, otherUserId);

    const snap = await adminFirestore
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const messages = snap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .reverse();

    res.json({
      ok: true,
      conversationId,
      messages,
    });
  } catch (error) {
    console.error("[MESSAGES_READ_API_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "MESSAGES_READ_API_FAILED",
    });
  }
});

router.get("/conversations", async (req, res) => {
  try {
    const uid = req.firebaseUser!.uid;

    const snap = await adminFirestore
      .collection("userConversations")
      .doc(uid)
      .collection("conversations")
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();

    const conversations = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      ok: true,
      conversations,
    });
  } catch (error) {
    console.error("[CONVERSATIONS_READ_API_FAILED]", error);
    res.status(500).json({
      ok: false,
      error: "CONVERSATIONS_READ_API_FAILED",
    });
  }
});

export default router;
