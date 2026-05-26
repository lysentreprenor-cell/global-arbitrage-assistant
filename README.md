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
