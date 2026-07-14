package pl.gadacz.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.util.Locale

/**
 * Gadacz — setup + a big talk button. The real always-on control lives in
 * GadaczOverlayService (floating button over every app). This screen configures
 * the server/key, enables the two permissions (Accessibility + Overlay), starts
 * the background service, and offers direct talk / read-screen.
 */
class MainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var tts: TextToSpeech
    private lateinit var status: TextView
    private lateinit var transcript: TextView
    private val personaBtns = HashMap<String, Button>()
    private val history = ArrayList<Pair<String, String>>()
    private var lastAnswer = ""

    private val speechLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val said = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (!said.isNullOrBlank()) handleCommand(said) else setStatus("Nic nie usłyszałem.")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this, this)

        // Everything lives in a ScrollView so NO button is ever cut off, on any screen.
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFF000000.toInt()); setPadding(24, 24, 24, 24)
        }
        val outer = ScrollView(this).apply { setBackgroundColor(0xFF000000.toInt()); addView(col) }

        // Fixed-height buttons (dp→px), never zero-height.
        fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
        fun btn(label: String, fg: Int, bg: Int, h: Int, onClick: () -> Unit) = Button(this).apply {
            text = label; textSize = 18f; setTextColor(fg); setBackgroundColor(bg); isAllCaps = false
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(h)).apply { topMargin = dp(8) }
            setOnClickListener { onClick() }
        }

        // 🧹 CZYSTY EKRAN GŁÓWNY: gadanie, czytanie ekranu, powtórz, wybór SYSTEMU
        // i jedno wejście do USTAWIEŃ. Cała reszta dawnego panelu mieszka w Ustawieniach.
        val talk = btn("🗣️  DOTKNIJ I POWIEDZ", 0xFFFACC15.toInt(), 0xFF111111.toInt(), 190) { onTalk() }
        status = TextView(this).apply {
            text = "Gotowy"; textSize = 19f; setTextColor(0xFFFFFFFF.toInt()); gravity = Gravity.CENTER; setPadding(0, dp(10), 0, dp(10))
        }
        val readScreen = btn("👀  CO JEST NA EKRANIE", 0xFFE9D5FF.toInt(), 0xFF3B0764.toInt(), 74) { readScreen() }
        val repeat = btn("🔁  POWTÓRZ", 0xFFDCFCE7.toInt(), 0xFF052E16.toInt(), 66) { if (lastAnswer.isNotBlank()) speak(lastAnswer) else speak("Nie mam jeszcze odpowiedzi.") }
        // 🎭 SYSTEMY — każdy jako OSOBNY duży przycisk (jak POWTÓRZ), żadnych ukrytych
        // list. Włączony system jest podświetlony i podpisany „WŁĄCZONY".
        val personaHeader = TextView(this).apply {
            text = "🎭 SYSTEM GADACZA — kim ma być:"
            textSize = 15f; setTextColor(0xFFA8A29E.toInt()); setPadding(0, dp(14), 0, 0)
        }
        for ((key, name, _) in personas) {
            personaBtns[key] = btn(name, 0xFFE7E5E4.toInt(), 0xFF1C1917.toInt(), 62) { selectPersona(key, name) }
        }
        val settings = btn("⚙  USTAWIENIA", 0xFFE7E5E4.toInt(), 0xFF292524.toInt(), 74) { showSettingsHub() }

        transcript = TextView(this).apply { textSize = 16f; setTextColor(0xFFD6D3D1.toInt()); setPadding(0, dp(12), 0, 0) }

        col.addView(talk); col.addView(status); col.addView(readScreen); col.addView(repeat)
        col.addView(personaHeader)
        for ((key, _, _) in personas) col.addView(personaBtns[key])
        col.addView(settings); col.addView(transcript)
        setContentView(outer)

        // Podświetl system, który jest teraz wybrany (pobierane z serwera).
        refreshPersonaButtons()

        // Silent auto-check: if a newer version is published, offer it (no nagging if up to date).
        Thread {
            val latest = Updater.checkLatest()
            if (latest != null && latest != Updater.currentVersion(this)) {
                runOnUiThread { promptUpdate(latest) }
            }
        }.start()

        // Ask for mic (and location for SOS) up front.
        try {
            val need = ArrayList<String>()
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) need.add(android.Manifest.permission.RECORD_AUDIO)
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) need.add(android.Manifest.permission.ACCESS_FINE_LOCATION)
            if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1)
        } catch (_: Exception) {}

        if (!Brain.isConfigured(this)) showSettings()
        else status.postDelayed({ val s = readinessSummary(true); status.text = s; speak(s) }, 1200)

        // 🛟 Lustro pamięci: odśwież kopię w telefonie, a gdy serwer stracił dane — przywróć je.
        Brain.syncMemoryMirror(this) { n ->
            runOnUiThread { speak("Uwaga: serwer stracił pamięć. Przywróciłem $n faktów z kopii w telefonie.") }
        }
    }

    private fun bigBtn(label: String, fg: Int, bg: Int, weight: Float, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label; textSize = if (weight >= 2) 24f else 17f; setTextColor(fg); setBackgroundColor(bg)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, weight)
            setOnClickListener { onClick() }
        }

    override fun onInit(code: Int) { if (code == TextToSpeech.SUCCESS) Brain.applyVoice(this, tts) }

    private fun onTalk() {
        if (tts.isSpeaking) { tts.stop(); setStatus("Gotowy"); return }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Mów…")
            // Cierpliwość: nie ucinaj w pół zdania, gdy użytkownik zbiera myśli.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
        }
        setStatus("🎤 Słucham…")
        try { speechLauncher.launch(intent) } catch (e: Exception) { setStatus("Brak rozpoznawania mowy.") }
    }

    private fun handleCommand(text: String) {
        appendLine("👤 $text"); setStatus("🧠 Myślę…")
        try { tts.stop() } catch (_: Exception) {}   // flush old speech, then queue step announcements
        Thread {
            try {
                // Full multi-step task loop — drives across screens toward the goal.
                Brain.runTask(this, text, history) { s ->
                    lastAnswer = s; appendLine("🗣️ $s")
                    runOnUiThread { status.text = "🔊 $s" }
                    tts.speak(s, TextToSpeech.QUEUE_ADD, null, "g")   // ADD so steps don't cut each other
                }
            } catch (e: Exception) { speak("Błąd połączenia. ${e.message}") }
        }.start()
    }

    // ── 🎭 SYSTEMY GADACZA — wybieralne osobowości. Klucze MUSZĄ zgadzać się z serwerem
    // (server/routes/assistant.ts, PERSONAS). Wybór zapisuje się na serwerze, więc
    // strona www i telefon zawsze widzą ten sam tryb.
    private val personas = listOf(
        Triple("niewidomi",  "🦯 Dla niewidomych", "Tryb podstawowy — ten, który trenujemy"),
        Triple("prawnik",    "🧑‍⚖️ Prawnik",        "Prawo prostym językiem, pisma i odwołania"),
        Triple("lekarz",     "🩺 Lekarz",          "Zdrowie i leki — nie zastępuje lekarza"),
        Triple("zartownis",  "😂 Żartowniś",       "Żarty, anegdoty i dobry humor"),
        Triple("bajerant",   "😎 Bajerant",        "Rozmowy z dziewczynami — z klasą"),
        Triple("sprzedawca", "💼 Sprzedawca",      "Oferty, negocjacje, odpowiedzi klientom"),
    )

    /** Dotknięcie przycisku systemu: zapisz wybór na serwerze i podświetl. */
    private fun selectPersona(key: String, name: String) {
        setStatus("🎭 Przełączam…")
        Thread {
            val ok = Brain.setPersona(this, key)
            runOnUiThread {
                if (ok) { speak("Przełączone. Od teraz jestem: ${name.substringAfter(" ")}."); markActivePersona(key) }
                else speak("Nie udało się przełączyć. Sprawdź połączenie z serwerem i czy jest zaktualizowany.")
            }
        }.start()
    }

    /** Podświetl WŁĄCZONY system, wygaś pozostałe. */
    private fun markActivePersona(cur: String) {
        for ((key, name, _) in personas) {
            val b = personaBtns[key] ?: continue
            if (key == cur) {
                b.text = "✓ $name — WŁĄCZONY"
                b.setBackgroundColor(0xFF3B2A06.toInt()); b.setTextColor(0xFFFDE68A.toInt())
            } else {
                b.text = name
                b.setBackgroundColor(0xFF1C1917.toInt()); b.setTextColor(0xFFE7E5E4.toInt())
            }
        }
    }

    private fun refreshPersonaButtons() {
        Thread {
            val cur = Brain.fetchPersona(this)
            runOnUiThread { markActivePersona(if (cur.isBlank()) "niewidomi" else cur) }
        }.start()
    }

    /** ⚙ Centrum ustawień — cały dawny panel z ekranu głównego w jednym miejscu. */
    private fun showSettingsHub() {
        val items = arrayOf(
            "🔑  Adres serwera i klucz",
            "✅  Co jeszcze zostało (gotowość)",
            "🟢  Włącz pływający przycisk",
            "♿  Włącz sterowanie ekranem",
            "🔓  Odblokuj (jeśli szare) — 3 kropki",
            "📢  Czytaj powiadomienia na głos",
            "🔄  Sprawdź aktualizację (v${Updater.currentVersion(this)})",
            "🧠  Nauka (włącz/wyłącz · kopiuj · kasuj)",
        )
        AlertDialog.Builder(this)
            .setTitle("⚙ Ustawienia Gadacza")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> showSettings()
                    1 -> { val s = readinessSummary(false); appendLine("✅ $s"); speak(s) }
                    2 -> enableOverlay()
                    3 -> enableAccessibilityFlow()
                    4 -> {
                        speak("Naciśnij trzy kropki w prawym górnym rogu i wybierz: Zezwól na ustawienia z ograniczeniami. Potem wróć i włącz sterowanie ekranem.")
                        try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (_: Exception) {}
                    }
                    5 -> {
                        Brain.prefs(this).edit().putBoolean("read_notifications", true).apply()
                        speak("Włącz Gadacza na liście dostępu do powiadomień.")
                        try { startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")) } catch (_: Exception) {}
                    }
                    6 -> doUpdate(manual = true)
                    7 -> showLearning()
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    // One clear readiness check — tells the user exactly what's still needed, so setup
    // is a short guided list, not endless fiddling. Essential vs optional is spelled out.
    private fun readinessSummary(spokenIntro: Boolean): String {
        val mic = checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val acc = isAccessibilityOn()
        val cfg = Brain.isConfigured(this)
        val essentialLeft = ArrayList<String>()
        if (!cfg) essentialLeft.add("adres serwera i klucz — kliknij Ustawienia")
        if (!mic) essentialLeft.add("mikrofon")
        val optionalLeft = ArrayList<String>()
        if (!acc) optionalLeft.add("sterowanie ekranem")
        val notif = try { Settings.Secure.getString(contentResolver, "enabled_notification_listeners")?.contains(packageName) == true } catch (e: Exception) { false }
        if (!notif) optionalLeft.add("czytanie powiadomień")
        return if (essentialLeft.isEmpty() && optionalLeft.isEmpty()) "Wszystko gotowe. Gadacz działa w pełni."
        else buildString {
            if (essentialLeft.isEmpty()) append("Gadacz działa. ") else append("Do działania brakuje: ${essentialLeft.joinToString(", ")}. ")
            if (optionalLeft.isNotEmpty()) append("Dodatkowo (opcjonalnie) możesz włączyć: ${optionalLeft.joinToString(", ")}.")
        }
    }

    private fun isAccessibilityOn(): Boolean = try {
        Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)?.contains(packageName) == true
    } catch (e: Exception) { false }

    private fun enableAccessibilityFlow() {
        if (isAccessibilityOn()) { speak("Sterowanie ekranem jest już włączone."); return }
        speak("Wejdź w Zainstalowane aplikacje, dotknij Gadacz i włącz suwak. Jeśli suwak jest szary, użyj przycisku Odblokuj poniżej.")
        try { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) } catch (_: Exception) {}
    }

    private fun readScreen() {
        if (GadaczAccessibilityService.instance == null) {
            speak("Aby czytać ekran, włącz Gadacza w Ustawieniach, Dostępność.")
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); return
        }
        setStatus("👀 Czytam ekran…")
        Brain.execute(this, "read_screen", JSONObject(), "") { s -> lastAnswer = s; appendLine("🗣️ $s"); speak(s) }
    }

    /** Overlay permission → start the always-on floating button. */
    private fun enableOverlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            speak("Zezwól Gadaczowi na wyświetlanie nad innymi aplikacjami.")
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        val svc = Intent(this, GadaczOverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc) else startService(svc)
        speak("Pływający przycisk włączony. Znajdziesz go w rogu ekranu, w każdej aplikacji.")
    }

    // ── Auto-update ──────────────────────────────────────────────────────────
    private fun doUpdate(manual: Boolean) {
        setStatus("🔄 Sprawdzam aktualizację…")
        Thread {
            val latest = Updater.checkLatest()
            val cur = Updater.currentVersion(this)
            if (latest == null) { runOnUiThread { if (manual) speak("Nie mogę sprawdzić aktualizacji.") ; setStatus("Gotowy") }; return@Thread }
            if (latest == cur) { runOnUiThread { if (manual) speak("Masz najnowszą wersję."); setStatus("Gotowy") }; return@Thread }
            runOnUiThread { promptUpdate(latest) }
        }.start()
    }
    private fun promptUpdate(latest: String) {
        AlertDialog.Builder(this)
            .setTitle("Nowa wersja Gadacza: $latest")
            .setMessage("Pobrać i zainstalować teraz? Ustawienia zostaną zachowane.")
            .setPositiveButton("Aktualizuj") { _, _ -> startDownload() }
            .setNegativeButton("Później", null).show()
    }
    private fun startDownload() {
        speak("Pobieram aktualizację, chwileczkę.")
        Thread {
            Updater.downloadAndInstall(this,
                onProgress = { p -> runOnUiThread { setStatus("⬇️ Pobieram… $p%") } },
                onError = { e -> runOnUiThread { setStatus("Gotowy"); speak("Błąd aktualizacji. $e") } })
        }.start()
    }

    /**
     * 🧠 Panel nauki w SEKCJACH — każda dziedzina wiedzy Gadacza ma własny włącznik,
     * kopiowanie i kasowanie. Właściciel widzi i kontroluje, czego Gadacz się uczy.
     */
    private fun showLearning() {
        val rec = Brain.learnRecipesOn(this)
        val jr = Brain.learnJournalOn(this)
        val items = arrayOf(
            "➕  Dodaj wiedzę (wklej lub wpisz tekst)",
            "🧭  Obsługa aplikacji (przepisy dróg) — nauka: ${if (rec) "WŁĄCZONA" else "WYŁĄCZONA"}",
            "🗣  Rozumienie Ciebie (dziennik komend) — nauka: ${if (jr) "WŁĄCZONA" else "WYŁĄCZONA"}",
            "📌  Pamięć faktów (zapamiętaj, że…)",
            "📋  Skopiuj WSZYSTKO do schowka",
        )
        AlertDialog.Builder(this)
            .setTitle("Nauka Gadacza — sekcje")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> addKnowledgeDialog()
                    1 -> sectionDialog(
                        "🧭 Obsługa aplikacji", "Udane drogi zadań — jak krok po kroku obsłużyć aplikacje.",
                        "learn_recipes", rec, "/api/assistant/recipes", "recipes", "/api/assistant/recipes/clear")
                    2 -> sectionDialog(
                        "🗣 Rozumienie Ciebie", "Jak mówisz i co wtedy działa; także nieudane kliknięcia (uczą ostrożności).",
                        "learn_journal", jr, "/api/assistant/log", "log", "/api/assistant/log/clear")
                    3 -> sectionDialog(
                        "📌 Pamięć faktów", "Rzeczy, które kazałeś zapamiętać. Zapisuje się tylko na Twoje wyraźne „zapamiętaj”.",
                        null, true, "/api/assistant/memory", "memory", "/api/assistant/memory/clear")
                    4 -> {
                        setStatus("📋 Pobieram wszystko…")
                        Thread {
                            val data = Brain.fetchLearnedData(this)
                            runOnUiThread {
                                if (data.isBlank()) { speak("Nie mogę połączyć się z serwerem. Sprawdź adres, PIN i czy serwer działa."); return@runOnUiThread }
                                copyToClipboard("Gadacz — cała nauka", data)
                            }
                        }.start()
                    }
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    /**
     * ➕ Szybka nauka: wklej (albo wpisz) cały blok wiedzy — notatki, instrukcje, fakty.
     * Serwer potnie go na osobne fakty (linia = fakt) i doda do pamięci Gadacza.
     */
    private fun addKnowledgeDialog() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 20, 40, 0) }
        val input = EditText(this).apply {
            hint = "Wklej tu wiedzę. Każda linia lub zdanie stanie się osobnym faktem, np.:\nMoja siostra ma na imię Anna.\nLeki biorę o 8 i o 20.\nKod do klatki to 1234."
            minLines = 6
            gravity = Gravity.TOP
        }
        val paste = Button(this).apply {
            text = "📋 Wklej ze schowka"
            isAllCaps = false
            setOnClickListener {
                try {
                    val cb = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    val t = cb.primaryClip?.getItemAt(0)?.coerceToText(this@MainActivity)?.toString() ?: ""
                    if (t.isNotBlank()) input.setText(t) else speak("Schowek jest pusty.")
                } catch (_: Exception) { speak("Nie udało się wkleić.") }
            }
        }
        box.addView(input); box.addView(paste)
        AlertDialog.Builder(this)
            .setTitle("➕ Dodaj wiedzę Gadaczowi")
            .setView(box)
            .setPositiveButton("Dodaj") { _, _ ->
                val text = input.text.toString().trim()
                if (text.isBlank()) { speak("Nic nie wpisałeś."); return@setPositiveButton }
                setStatus("➕ Dodaję wiedzę…")
                Thread {
                    val added = Brain.addKnowledge(this, text)
                    runOnUiThread {
                        speak(when {
                            added < 0 -> "Nie udało się dodać. Sprawdź połączenie z serwerem i czy jest zaktualizowany."
                            added == 0 -> "Wszystko to już znałem — nic nowego nie doszło."
                            else -> "Dodane. Nauczyłem się $added nowych rzeczy i będę z nich korzystał."
                        })
                    }
                }.start()
            }
            .setNegativeButton("Anuluj", null).show()
    }

    /** Jedna sekcja nauki: (włącznik) / kopiuj / kasuj. prefKey=null → sekcja bez włącznika. */
    private fun sectionDialog(title: String, desc: String, prefKey: String?, on: Boolean,
                              path: String, key: String, clearPath: String) {
        val opts = ArrayList<String>()
        if (prefKey != null) opts.add(if (on) "⏸  Wyłącz naukę tej sekcji" else "▶️  Włącz naukę tej sekcji")
        opts.add("📋  Skopiuj do schowka")
        opts.add("🗑  Skasuj (zacznij od zera)")
        val toggleShift = if (prefKey != null) 1 else 0
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(desc)
            .setItems(opts.toTypedArray()) { _, which ->
                when (which) {
                    0 -> if (prefKey != null) {
                        Brain.prefs(this).edit().putBoolean(prefKey, !on).apply()
                        speak(if (!on) "Nauka tej sekcji włączona." else "Nauka tej sekcji wyłączona. Korzystam z tego, co już umiem, ale nowego nie zapisuję.")
                    } else copySection(title, path, key)
                    toggleShift -> copySection(title, path, key)
                    toggleShift + 1 -> {
                        AlertDialog.Builder(this)
                            .setTitle("Skasować: $title?")
                            .setMessage("Ta sekcja wróci do zera. Pozostałe sekcje zostają nietknięte.")
                            .setPositiveButton("Kasuj") { _, _ ->
                                Thread {
                                    val ok = Brain.clearSection(this, clearPath)
                                    runOnUiThread { speak(if (ok) "Skasowane. Ta sekcja zaczyna od zera." else "Nie udało się skasować. Sprawdź połączenie z serwerem.") }
                                }.start()
                            }
                            .setNegativeButton("Anuluj", null).show()
                    }
                }
            }
            .setNegativeButton("Wróć", null).show()
    }

    private fun copySection(title: String, path: String, key: String) {
        setStatus("📋 Pobieram…")
        Thread {
            val data = Brain.fetchSection(this, path, key)
            runOnUiThread {
                if (data.isBlank()) speak("Ta sekcja jest pusta albo serwer jej jeszcze nie zna. Zaktualizuj serwer w Replicie.")
                else copyToClipboard("Gadacz — $title", data)
            }
        }.start()
    }

    private fun copyToClipboard(label: String, data: String) {
        try {
            val cb = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cb.setPrimaryClip(android.content.ClipData.newPlainText(label, data))
            speak("Skopiowane do schowka. Wklej, gdzie chcesz.")
        } catch (_: Exception) { speak("Nie udało się skopiować.") }
    }

    private fun speak(text: String) { setStatus("🔊 $text"); tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "g") }
    private fun setStatus(s: String) { runOnUiThread { status.text = s } }
    private fun appendLine(s: String) { runOnUiThread { transcript.text = "$s\n\n${transcript.text}" } }

    private fun showSettings() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 20, 40, 0) }
        val urlIn = EditText(this).apply { hint = "Adres serwera, np. https://twoj.repl.co"; setText(Brain.serverUrl(this@MainActivity)) }
        val keyIn = EditText(this).apply { hint = "Klucz Anthropic sk-ant-..."; setText(Brain.anthropicKey(this@MainActivity)) }
        val pinIn = EditText(this).apply { hint = "PIN aplikacji (np. 0905)"; inputType = android.text.InputType.TYPE_CLASS_NUMBER; setText(Brain.pin(this@MainActivity)) }
        val wakeIn = EditText(this).apply { hint = "Słowo-budzik (domyślnie Gadacz, np. Neo)"; setText(Brain.wakeWord(this@MainActivity)) }
        val sosIn = EditText(this).apply { hint = "Kontakt alarmowy — numer SOS"; inputType = android.text.InputType.TYPE_CLASS_PHONE; setText(Brain.prefs(this@MainActivity).getString("sos_number", "")) }
        box.addView(urlIn); box.addView(keyIn); box.addView(pinIn); box.addView(wakeIn); box.addView(sosIn)
        AlertDialog.Builder(this).setTitle("Ustaw Gadacza").setView(box)
            .setPositiveButton("Zapisz") { _, _ ->
                Brain.prefs(this).edit()
                    .putString("server_url", urlIn.text.toString().trim())
                    .putString("anthropic_key", keyIn.text.toString().trim())
                    .putString("app_pin", pinIn.text.toString().trim())
                    .putString("wake_word", wakeIn.text.toString().trim())
                    .putString("sos_number", sosIn.text.toString().trim()).apply()
                speak("Zapisane. Dotknij dużego przycisku i mów.")
            }.setNegativeButton("Anuluj", null).show()
    }

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }
}
