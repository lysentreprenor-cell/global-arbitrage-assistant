import { sendAccountActivatedEmail, sendRegistrationStartedEmail } from "./accountEmailFlow";

export function registerAccountEmailRoutes(app: any) {
  app.post("/api/auth/send-registration-email", async (req: any, res: any) => {
    try {
      const user = req.body?.user || req.body || {};
      await sendRegistrationStartedEmail(user);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error?.message || "Registration email failed" });
    }
  });

  app.post("/api/auth/send-activation-email", async (req: any, res: any) => {
    try {
      const user = req.body?.user || req.body || {};
      await sendAccountActivatedEmail(user);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error?.message || "Activation email failed" });
    }
  });
}
