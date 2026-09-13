# 🗣️ Gadacz — aplikacja Android (Etap 2)

Głosowy asystent sterujący telefonem i **ekranem** dowolnej aplikacji, dla osób
niewidomych. Mózg (AI) działa na Twoim serwerze Replit — telefon słucha, mówi i
wykonuje. Sterowanie ekranem odbywa się przez **usługę dostępności** — jedyną
furtkę, jaką Android daje aplikacji do kontroli innych aplikacji (tak działa
TalkBack).

## Jak zdobyć plik APK bez komputera

1. Wejdź na GitHub repozytorium → zakładka **Actions**
2. Wybierz **„Zbuduj Gadacz APK"** → **Run workflow** (gałąź `claude/teraz-YKMDA`)
3. Poczekaj ~5 minut, aż zrobi się zielony ptaszek
4. Wejdź w zakończony przebieg → sekcja **Artifacts** → pobierz **Gadacz-APK**
5. Rozpakuj ZIP → w środku `app-debug.apk`

## Instalacja na telefonie

1. Przenieś `app-debug.apk` na telefon (albo pobierz bezpośrednio z GitHub w telefonie)
2. Otwórz plik → zezwól na „instalację z nieznanych źródeł" gdy telefon zapyta
3. Zainstaluj, otwórz **Gadacz**
4. Przy pierwszym uruchomieniu podaj:
   - **Adres serwera** — Twój adres Replit (ten `...repl.co`)
   - **Klucz Anthropic** — `sk-ant-...` (ten sam co w aplikacji)
5. Włącz sterowanie ekranem: **Ustawienia → Dostępność → Gadacz → Włącz**
   (Gadacz sam otworzy ten ekran przy pierwszej próbie sterowania)

## Co potrafi

- Rozmowa po polsku, opis zdjęć, czytanie tekstu
- Dzwonienie, SMS, mapy, YouTube, wyszukiwanie, otwieranie aplikacji
- **„Co jest na ekranie?"** — czyta zawartość dowolnej aplikacji
- **„Kliknij Wyślij", „wpisz cześć", „cofnij", „przewiń"** — steruje ekranem
- **„Otwórz Messenger"** — uruchamia zainstalowane aplikacje po nazwie

## Uwaga

To wersja **debugowa** (0.1) — pierwszy działający szkielet. Kolejne wersje będą
dokładać zręczność sterowania (łańcuchy kroków: „napisz do mamy na Messengerze").
