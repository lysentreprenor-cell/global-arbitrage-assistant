# Global Arbitrage Assistant

Full-stack web app combining a personal finance banking platform with an AI-powered resell opportunity scanner.

## Features

### Banking App (`/`)
- Account dashboard with balance, transactions, cards
- P2P transfers, contract invites, split bills
- Investment portfolio (live crypto/stock quotes via CoinGecko)
- Savings goals, recurring payments, loan flow
- KYC verification, 2FA, push notifications
- Admin dashboard

### RESELLASSIST (`/resell`)
- AI Market Scanner — finds arbitrage opportunities across global markets
- Real-time profit margin analysis (eBay USA/DE, Etsy, Amazon, Vinted)
- Product history with AI scoring
- Profit calculator (shipping, duty, platform fees)
- Legal compliance checklist
- AI-generated offer builder

## Tech Stack

- **Frontend**: React + TypeScript, Wouter, Tailwind CSS, shadcn/ui, Recharts
- **Backend**: Node.js + Express, PostgreSQL
- **Auth**: Cookie sessions with bcrypt
- **Real-time**: WebSockets

## Quick Start

```bash
npm install
npm run dev
```

App runs on port 3000.

## Android APK

The `mobile/` directory holds a Capacitor wrapper that opens the deployed server in a native Android app.

- GitHub Actions (`.github/workflows/android-apk.yml`) builds a debug APK on every push touching `mobile/`; download it from the run's **itemprise-apk** artifact.
- Set the server address via the repository variable `APP_SERVER_URL` (Settings → Secrets and variables → Actions → Variables), or the `server_url` input when running the workflow manually.
- Local build (requires Android SDK + JDK 21): `cd mobile && npm ci && APP_SERVER_URL=https://… npx cap sync android && cd android && ./gradlew assembleDebug`.
