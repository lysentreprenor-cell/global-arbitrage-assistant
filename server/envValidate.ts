const REQUIRED: string[] = ["DATABASE_URL"];
const OPTIONAL: string[] = [
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
];

let missing = false;
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing env: ${key}`);
    missing = true;
  }
}
if (missing) process.exit(1);

for (const key of OPTIONAL) {
  if (!process.env[key]) console.warn(`Missing env (optional): ${key}`);
}
if (!process.env.FIREBASE_DATABASE_URL && !process.env.VITE_FIREBASE_DATABASE_URL) {
  console.warn("Missing env (optional): FIREBASE_DATABASE_URL / VITE_FIREBASE_DATABASE_URL");
}
