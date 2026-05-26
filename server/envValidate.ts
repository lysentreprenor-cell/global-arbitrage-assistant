const OPTIONAL: string[] = [
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
];

for (const key of OPTIONAL) {
  if (!process.env[key]) console.warn(`Missing env (optional): ${key}`);
}
