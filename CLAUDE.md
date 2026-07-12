# Zasady pracy w tym projekcie (dla Claude)

## Komunikacja z użytkownikiem
- **Zawsze odpowiadaj po polsku.**
- **Na końcu KAŻDEJ odpowiedzi po zmianach w kodzie dawaj gotowe polecenie do
  skopiowania do Shell na Replit** (jedna linia, w bloku kodu), plus przypomnienie
  o Stop i Run. Standardowe polecenie:
  `git fetch origin claude/teraz-YKMDA && git reset --hard origin/claude/teraz-YKMDA && npm install && npm run build`
- Użytkownik pracuje na telefonie z Replit w przeglądarce; nie używa Replit Agent.

## Git i środowisko
- Gałąź robocza: `claude/teraz-YKMDA` — commituj i wypychaj TYLKO na nią.
- **Kontener bywa cofany do starych migawek w trakcie pracy** — commituj i wypychaj
  po każdym skończonym kroku. Po każdej cofce: `git fetch` + `git merge --ff-only
  origin/claude/teraz-YKMDA` (stare nietrackowane kopie plików odkładaj do
  scratchpada, nie kasuj na ślepo).
- GitHub jest jedynym źródłem prawdy. `dist/` jest w repo — po zmianach buduj
  (`npm run build`) i commituj też świeży `dist`.
- `.replit` buduje przy Run (`npm run build && node dist/index.cjs`).

## Projekt
- Dwie części: bot handlowy Kraken (spot) oraz **Gadacz** — głosowy asystent dla
  osób niewidomych (zakładka web + natywna apka Android w `android/`).
- Wersjonowanie apki: `versionCode`/`versionName` w `android/app/build.gradle` —
  podbijaj przy każdej zmianie w `android/`.
- PIN aplikacji: 0905 (nagłówek `x-bot-pin`); trasy `/api/bot`, `/api/assistant`,
  `/api/memes` są za PIN-em.
- `firebase-admin` przypięty do v12 — kod używa API v12; NIE podnosić do 14 bez
  przepisania `server/lib/firebaseAdmin.ts` i miejsc użycia.
- Aplikacje bankowe: Gadacz nigdy nie wpisuje PIN-ów/haseł, przed płatnością czyta
  kwotę i odbiorcę i czeka na potwierdzenie, nie klika sam z własnej inicjatywy.
- Klucz Kraken bez uprawnienia Withdraw. Nie wznawiaj uśpionego deploymentu Replit.
