# Finlys

Wielowalutowa aplikacja bankowa z modułem umów (escrow), działająca jako PWA.

- **Klient** — React 19 + Vite, wouter, TanStack Query, Tailwind + shadcn/ui
- **Serwer** — Express 5, PostgreSQL (Drizzle ORM), Firebase Auth + Realtime Database, Stripe
- **PWA** — manifest, service worker, powiadomienia push, instalacja z przeglądarki

## Uruchomienie lokalne

```bash
npm install --legacy-peer-deps
npm run dev          # serwer + klient na porcie 5000
```

Sam klient, bez backendu:

```bash
npm run dev:client   # Vite na porcie 5000
```

Wymagane zmienne środowiskowe (klient czyta wyłącznie prefiks `VITE_`):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_URL
```

Sekrety serwera (`DATABASE_URL`, `STRIPE_SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT`, …)
nigdy nie trafiają do klienta — patrz `server/envValidate.ts`.

## Skrypty

| polecenie | co robi |
|---|---|
| `npm run dev` | serwer deweloperski (Express + Vite middleware) |
| `npm run dev:client` | sam klient |
| `npm run build` | build produkcyjny → `dist/public` (klient) + `dist/index.cjs` (serwer) |
| `npm start` | uruchomienie builda produkcyjnego |
| `npm run check` | TypeScript |

## Struktura

```
client/          aplikacja webowa (Vite root)
  src/design/    system projektowy Meridian — czytaj przed zmianami w UI
  src/pages/     ekrany
  src/lib/       store, API, localStorage (localStore.ts = wszystkie klucze)
server/          Express: routing, auth, płatności, powiadomienia
shared/          schemat bazy współdzielony przez klienta i serwer
script/build.ts  build produkcyjny
```

## Interfejs

UI podlega systemowi projektowemu **Meridian** — tokeny, motywy i biblioteka
komponentów w `client/src/design/`. Przed dodaniem czegokolwiek do UI przeczytaj
[`client/src/design/README.md`](client/src/design/README.md). Zasada nadrzędna:
brak nowych kolorów, rozmiarów pisma i odstępów w ekranach — wszystko pochodzi
z tokenów.

## Wdrożenie

Replit, cel `autoscale`. Build: `npm run build`, start: `node dist/index.cjs`
(konfiguracja w `.replit`).

## O nazwach

Projekt nosił wcześniej nazwy **ItemPrise** i **rest-express**; ślady zostały
w kluczach `localStorage` (prefiksy `itemprise_`, `fintech_`, `finlys_`).
Te klucze **celowo nie zostały ujednolicone** — wskazują na dane, które są już
w przeglądarkach użytkowników, a zmiana nazwy klucza nie przenosi danych, tylko
je porzuca. Wszystkie definicje kluczy zebrane są w `client/src/lib/localStore.ts`.
