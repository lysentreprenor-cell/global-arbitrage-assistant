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
    private lateinit var personaBtn: Button
    private lateinit var payBtn: Button
    private lateinit var floatStalyBtn: Button
    private lateinit var floatDotykBtn: Button
    private val workBtns = HashMap<String, Button>()
    private val history = ArrayList<Pair<String, String>>()
    private var lastAnswer = ""

    private val speechLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val said = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (!said.isNullOrBlank()) handleCommand(said) else setStatus("Nic nie usłyszałem.")
    }

    // 🎬 Zgoda systemowa na nagrywanie ekranu → start usługi nagrywania.
    private val screenRecLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK && result.data != null) {
            val i = Intent(this, ScreenRecordService::class.java)
                .putExtra("code", result.resultCode).putExtra("data", result.data)
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
            speak("Nagrywam ekran z dźwiękiem z mikrofonu. Powiedz: zakończ nagrywanie — a zapiszę film w galerii, w folderze Gadacz.")
        } else speak("Nie dostałem zgody na nagrywanie ekranu.")
    }

    /** 🎬 Start/stop nagrywania ekranu — z Ustawień albo głosem. */
    fun toggleScreenRecording() {
        if (ScreenRecordService.running) {
            ScreenRecordService.requestStop()
            speak("Kończę nagrywanie. Film jest w galerii, w folderze Gadacz.")
            return
        }
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
        try { screenRecLauncher.launch(mpm.createScreenCaptureIntent()) }
        catch (_: Exception) { speak("Ten telefon nie pozwala nagrywać ekranu.") }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        installCrashCatcher()
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
        val readScreen = btn("👀  CO JEST NA EKRANIE (mądry opis)", 0xFFE9D5FF.toInt(), 0xFF3B0764.toInt(), 74) { readScreen() }
        val readPlain = btn("📄  PRZECZYTAJ NAPISY (za darmo)", 0xFFD9F99D.toInt(), 0xFF1A2E05.toInt(), 66) { readScreenPlainFree() }
        val bt = btn("📶  SPRAWDŹ BLUETOOTH", 0xFFBFDBFE.toInt(), 0xFF0C1E3A.toInt(), 66) {
            val s = Brain.bluetoothReport(this); lastAnswer = s; appendLine("📶 $s"); speak(s)
        }
        val tv = btn("📺  POŁĄCZ Z TELEWIZOREM", 0xFFC7D2FE.toInt(), 0xFF1E1B4B.toInt(), 66) {
            val s = Brain.castToTv(this); lastAnswer = s; appendLine("📺 $s"); speak(s)
        }
        val repeat = btn("🔁  POWTÓRZ", 0xFFDCFCE7.toInt(), 0xFF052E16.toInt(), 66) { if (lastAnswer.isNotBlank()) speak(lastAnswer) else speak("Nie mam jeszcze odpowiedzi.") }

        // 🎈 PANEL PŁYWAJĄCEGO PRZYCISKU — dwa kwadraciki (włącz/wyłącz na 1 stronie):
        //   Stały = nasłuch słowa „Gadacz" cały czas; Dotyk = przycisk, klikasz i mówisz.
        //   Dotknięcie WŁĄCZONEGO trybu = wyłączenie pływającego przycisku.
        fun sq(label: String, onClick: () -> Unit) = Button(this).apply {
            text = label; textSize = 15f; setTextColor(0xFFE5E5E5.toInt()); setBackgroundColor(0xFF1C1917.toInt()); isAllCaps = false
            layoutParams = LinearLayout.LayoutParams(0, dp(76), 1f).apply { marginStart = dp(3); marginEnd = dp(3) }
            setOnClickListener { onClick() }
        }
        fun rowOf(vararg bs: Button) = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }
            for (b in bs) addView(b)
        }
        val floatHeader = TextView(this).apply {
            text = "🎈 Pływający przycisk (dostęp w każdej apce):"
            textSize = 15f; setTextColor(0xFFA8A29E.toInt()); setPadding(0, dp(14), 0, 0)
        }
        floatStalyBtn = sq("🔴 Tryb stały\n(nasłuch)") { toggleFloat("staly") }
        floatDotykBtn = sq("👆 Na dotknięcie\n(klikasz)") { toggleFloat("dotyk") }

        // 🎚️ STOPIEŃ PRACY — trzy kwadraciki: taniej ↔ najlepiej.
        val workHeader = TextView(this).apply {
            text = "🎚️ Jak mocno ma pracować mądry mózg:"
            textSize = 15f; setTextColor(0xFFA8A29E.toInt()); setPadding(0, dp(14), 0, 0)
        }
        workBtns["easy"]   = sq("💚 Łatwy\n(taniej)")   { setWork("easy") }
        workBtns["normal"] = sq("⚖️ Normalny")          { setWork("normal") }
        workBtns["hard"]   = sq("🏆 Trudny\n(najlepiej)"){ setWork("hard") }

        // 💰/🆓 Tryb pracy: płatny (mądry mózg w chmurze) albo darmowy (telefon sam).
        payBtn = btn("", 0xFFFDE68A.toInt(), 0xFF3B2A06.toInt(), 66) { togglePaidMode() }
        refreshPayButton()
        // 🎭 TWARZE — ZWINIĘTE pod jeden przycisk (koniec przewijania). Dotknięcie
        // otwiera listę wyboru; podpis pokazuje włączoną twarz.
        personaBtn = btn("🎭  TWARZ GADACZA", 0xFFFDE68A.toInt(), 0xFF3B2A06.toInt(), 74) { showPersonaPicker() }
        // ⌨️ CZAT — pisanie z twarzami jak w komunikatorze (po cichu, bez głosu).
        val chatBtn = btn("⌨️  NAPISZ DO GADACZA (czat)", 0xFFBAE6FD.toInt(), 0xFF082F49.toInt(), 74) {
            startActivity(Intent(this, ChatActivity::class.java))
        }
        val settings = btn("⚙  USTAWIENIA", 0xFFE7E5E4.toInt(), 0xFF292524.toInt(), 74) { showSettingsHub() }

        transcript = TextView(this).apply { textSize = 16f; setTextColor(0xFFD6D3D1.toInt()); setPadding(0, dp(12), 0, 0) }

        col.addView(talk); col.addView(status); col.addView(readScreen); col.addView(readPlain); col.addView(bt); col.addView(tv); col.addView(repeat)
        col.addView(floatHeader); col.addView(rowOf(floatStalyBtn, floatDotykBtn))
        col.addView(workHeader); col.addView(rowOf(workBtns["easy"]!!, workBtns["normal"]!!, workBtns["hard"]!!))
        col.addView(payBtn); col.addView(personaBtn); col.addView(chatBtn); col.addView(settings); col.addView(transcript)
        setContentView(outer)

        // Podświetl aktualny stan paneli i twarz.
        refreshFloatButtons(); refreshWorkButtons(); refreshPersonaButtons()

        // 🎬 Głosowe „nagrywaj ekran" otwiera ten ekran z prośbą o start nagrywania
        // (zgodę systemową może pokazać tylko Aktywność, nie usługa w tle).
        if (intent?.getBooleanExtra("start_recording", false) == true) {
            intent.removeExtra("start_recording")
            toggleScreenRecording()
        }

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
            if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED) need.add(android.Manifest.permission.BLUETOOTH_CONNECT)
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

    // ── 🎭 SYSTEMY GADACZA — wspólna lista twarzy mieszka w Personas.kt (używa jej
    // też czat). Klucze MUSZĄ zgadzać się z serwerem (server/routes/assistant.ts).
    private val personas get() = Personas.list

    // Twarze działające BEZ internetu (reszta wymaga chmury) — musi zgadzać się z Brain.faceWorksOffline.
    private val offlineFaces get() = Personas.offline

    /** 🎭 ZWINIĘTA lista twarzy — jeden przycisk otwiera wybór. */
    private fun showPersonaPicker() {
        val cur = Brain.cachedPersona(this)
        val items = personas.map { (key, name, desc) ->
            val mark = if (key == cur) "✓ " else ""
            val net = if (key in offlineFaces) "działa też offline" else "wymaga internetu"
            "$mark$name  ($net)\n$desc"
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("🎭 Kim ma być Gadacz?")
            .setItems(items) { _, which ->
                val (key, name, _) = personas[which]
                selectPersona(key, name)
            }
            .setNegativeButton("Zamknij", null).show()
    }

    /** Zapisz wybór twarzy na serwerze i odśwież podpis przycisku. */
    private fun selectPersona(key: String, name: String) {
        // 🔀 TWARZ ZMIENIA SIĘ OD RAZU W TELEFONIE (bez czekania na serwer) — inaczej
        // nie dało się wskoczyć na Ogólny przy śpiącym serwerze, choć on działa offline.
        // Wysyłkę na serwer (dla www) robimy w tle, best-effort.
        Brain.prefs(this).edit().putString("persona_cache", key).apply()
        markActivePersona(key)
        val net = if (key in offlineFaces) " Ta twarz działa też bez internetu." else " Ta twarz wymaga internetu."
        speak("Przełączone. Od teraz jestem: ${name.substringAfter(" ")}.$net")
        Thread { try { Brain.setPersona(this, key) } catch (_: Exception) {} }.start()
    }

    /** Podpis na jednym przycisku twarzy: pokazuje włączoną twarz. */
    private fun markActivePersona(cur: String) {
        val name = personas.firstOrNull { it.first == cur }?.second ?: "Dla niewidomych"
        personaBtn.text = "🎭  TWARZ: $name"
    }

    private fun refreshPersonaButtons() {
        Thread {
            val cur = Brain.fetchPersona(this)
            runOnUiThread { markActivePersona(if (cur.isBlank()) Brain.cachedPersona(this) else cur) }
        }.start()
    }

    /** ⚙ Centrum ustawień — cały dawny panel z ekranu głównego w jednym miejscu. */
    private fun showSettingsHub() {
        val items = arrayOf(
            "🔌  POŁĄCZENIA (Claude · Replit · GitHub)",
            "✅  Co jeszcze zostało (gotowość)",
            "♿  Włącz sterowanie ekranem",
            "🔓  Odblokuj (jeśli szare) — 3 kropki",
            "📢  Czytaj powiadomienia na głos",
            "🔄  Sprawdź aktualizację (v${Updater.currentVersion(this)})",
            "🧠  Nauka (włącz/wyłącz · kopiuj · kasuj)",
            "🏫  Naucz się całego telefonu",
            "🔩  SILNIKI (mózg · ucho · oczy) — pobieranie i stan",
            "⏳  Czas rozmowy: ${convWaitLabel(Brain.convWaitSec(this))} — ile czekam na Twój głos",
            if (ScreenRecordService.running) "🎬  Nagrywanie ekranu: 🔴 TRWA — dotknij, by zakończyć"
            else "🎬  Nagrywaj ekran (film z dźwiękiem do galerii)",
            "🗣️  GŁOSY — wybierz i pobierz głos Gadacza",
        )
        AlertDialog.Builder(this)
            .setTitle("⚙ Ustawienia Gadacza")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> showConnections()
                    1 -> { val s = readinessSummary(false); appendLine("✅ $s"); speak(s) }
                    2 -> enableAccessibilityFlow()
                    3 -> {
                        speak("Naciśnij trzy kropki w prawym górnym rogu i wybierz: Zezwól na ustawienia z ograniczeniami. Potem wróć i włącz sterowanie ekranem.")
                        try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (_: Exception) {}
                    }
                    4 -> {
                        Brain.prefs(this).edit().putBoolean("read_notifications", true).apply()
                        speak("Włącz Gadacza na liście dostępu do powiadomień.")
                        try { startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")) } catch (_: Exception) {}
                    }
                    5 -> doUpdate(manual = true)
                    6 -> showLearning()
                    7 -> confirmLearnDevice()
                    8 -> showEngines()
                    9 -> showConvWaitPicker()
                    10 -> toggleScreenRecording()
                    11 -> showVoices()
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    // ── 🔩 SILNIKI GADACZA — jedno miejsce: co jest wgrane, co można pobrać i czy
    // telefon to udźwignie. Pobieranie jak z mózgiem: dotknij i czekaj na procenty.
    private fun showEngines() {
        val brain = LocalBrain.installedShort(this)
        val items = arrayOf(
            if (brain == "brak") "🧠  Mózg lokalny: BRAK — dotknij, by pobrać"
            else "🧠  Mózg lokalny: $brain — dotknij, by zmienić",
            if (VoskEar.available(this)) "👂  Ucho (nasłuch ciągły): WGRANE — dotknij, by pobrać na nowo"
            else "👂  Ucho (nasłuch ciągły): BRAK — dotknij, by pobrać",
            "🗣️  GŁOSY (Gosia · Darkman · MC Speech) — wybierz i pobierz",
            "👁️  Oczy do tekstu: WBUDOWANE — powiedz „przeczytaj kartkę”",
            "📏  Sprawdź, jaki mózg udźwignie ten telefon",
            "🔄  Sprawdź najnowsze silniki (największy mózg)",
            "🗑️  Usuń silniki (zwolnij miejsce)",
        )
        AlertDialog.Builder(this)
            .setTitle("🔩 Silniki Gadacza")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> confirmLocalBrain()
                    1 -> confirmEar()
                    2 -> showVoices()
                    3 -> speak("Oczy do tekstu są wbudowane i darmowe. Powiedz: przeczytaj kartkę — zrobię zdjęcie i przeczytam tekst na głos, bez internetu i bez wydawania środków. Działa na kartki, ulotki leków, paragony, pisma i etykiety.")
                    4 -> { val r = ramReport(); appendLine("📏 $r"); speak(r) }
                    5 -> checkNewestEngines()
                    6 -> showDeleteEngines()
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    // 🔄 SPRAWDŹ NAJNOWSZE SILNIKI — pyta serwer o aktualną listę mózgów do pobrania
    // i pokazuje ją z oznaczeniem NAJWIĘKSZEGO. Gdy dojdzie większy mózg (np. po
    // odblokowaniu tokenem), pojawi się tu sam, bez nowej wersji apki.
    private fun checkNewestEngines() {
        speak("Sprawdzam, jaki najnowszy i największy mózg jest teraz do pobrania.")
        setStatus("🔄 Sprawdzam najnowsze silniki…")
        Thread {
            val opts = LocalBrain.brainOptions(this)   // (nazwa, opis, url) — serwer podaje od najmniejszego
            runOnUiThread {
                setStatus("Gotowy")
                if (opts.isEmpty()) {
                    speak("Nie udało się sprawdzić — serwer śpi albo nie ma internetu. Uruchom serwer na Replit, naciśnij Run i spróbuj jeszcze raz.")
                    return@runOnUiThread
                }
                val installed = LocalBrain.installedShort(this)
                val items = opts.mapIndexed { i, t ->
                    val star = if (i == opts.size - 1) "  ⭐ NAJWIĘKSZY" else ""
                    "${t.first}$star\n${t.second}"
                }.toTypedArray()
                AlertDialog.Builder(this)
                    .setTitle("🔄 Najnowsze silniki (masz wgrany: $installed)")
                    .setItems(items) { _, which ->
                        val (name, _, url) = opts[which]
                        downloadBrain(url, name)
                    }
                    .setNegativeButton("Zamknij", null).show()
            }
        }.start()
    }

    // 🗑️ USUWANIE SILNIKÓW — zwalnia miejsce (mózg ~0,5–1,5 GB, głosy ~70 MB każdy,
    // ucho ~50 MB). Kasuje TYLKO pobrany plik silnika; ustawienia i rozmowy zostają.
    private fun showDeleteEngines() {
        val items = ArrayList<Pair<String, () -> Unit>>()
        if (LocalBrain.available(this)) items.add("🧠 Mózg lokalny (${LocalBrain.installedShort(this)})" to {
            LocalBrain.deleteBrain(this); speak("Usunąłem lokalny mózg. Zwolniłem miejsce.")
        })
        if (VoskEar.available(this)) items.add("👂 Ucho (nasłuch ciągły)" to {
            VoskEar.deleteEar(this); speak("Usunąłem ucho.")
        })
        voiceInfo.forEach { (k, n, _) ->
            if (PiperUsta.voiceInstalled(this, k)) items.add("🗣️ Głos: ${n.substringAfter(" ")}" to {
                PiperUsta.deleteVoice(this, k)
                if (!PiperUsta.available(this)) PiperUsta.setEnabled(this, false)
                speak("Usunąłem głos ${n.substringAfter(" ")}.")
            })
        }
        if (items.isEmpty()) { speak("Nie masz wgranych żadnych silników do usunięcia."); return }
        val labels = items.map { "🗑️ Usuń: ${it.first}" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("🗑️ Co usunąć? (zwalnia miejsce)")
            .setItems(labels) { _, i ->
                AlertDialog.Builder(this)
                    .setTitle("Na pewno usunąć?")
                    .setMessage("${items[i].first} zostanie skasowany z telefonu. W każdej chwili pobierzesz go na nowo w Silnikach.")
                    .setPositiveButton("Usuń") { _, _ -> Thread { items[i].second() }.start() }
                    .setNegativeButton("Anuluj", null).show()
            }
            .setNegativeButton("Zamknij", null).show()
    }

    // ── 🗣️ GŁOSY GADACZA — każdy do pobrania osobno (~70 MB), wybór jednym
    // dotknięciem. Wyłączone usta = głos systemowy Google, jak dotąd.
    private val voiceInfo = listOf(
        Triple("gosia",    "👩 Gosia",     "kobiecy, ciepły"),
        Triple("darkman",  "👨 Darkman",   "męski, głęboki"),
        Triple("mcspeech", "🎙️ MC Speech", "męski, wyraźny, spikerski"),
    )
    private fun showVoices() {
        val sel = PiperUsta.selectedVoice(this)
        val pOn = PiperUsta.enabled(this)
        val items = voiceInfo.map { (k, n, d) ->
            val inst = PiperUsta.voiceInstalled(this, k)
            when {
                inst && pOn && sel == k -> "✓ $n ($d) — TYM GŁOSEM MÓWIĘ"
                inst                    -> "$n ($d) — WGRANY, dotknij, by nim mówić"
                else                    -> "$n ($d) — dotknij, by pobrać (~70 MB)"
            }
        }.toMutableList()
        items.add((if (!pOn) "✓ " else "") + "🔈 Głos systemowy Google — dotknij, by przełączyć")
        AlertDialog.Builder(this)
            .setTitle("🗣️ Którym głosem mam mówić?")
            .setItems(items.toTypedArray()) { _, i ->
                if (i == voiceInfo.size) {
                    PiperUsta.setEnabled(this, false)
                    PiperUsta.stopNow()
                    speak("Przełączone na głos systemowy.")
                    return@setItems
                }
                val (k, n, _) = voiceInfo[i]
                if (PiperUsta.voiceInstalled(this, k)) {
                    PiperUsta.setSelectedVoice(this, k)
                    PiperUsta.setEnabled(this, true)
                    PiperUsta.stopNow()
                    speak("Cześć! Od teraz mówię głosem: ${n.substringAfter(" ")}. Jak Ci się podobam?")
                } else downloadVoice(k, n)
            }
            .setNegativeButton("Zamknij", null).show()
    }

    private fun downloadVoice(key: String, name: String) {
        speak("Pobieram głos ${name.substringAfter(" ")}, około siedemdziesiąt megabajtów. Powiedz przerwij, żeby zatrzymać.")
        Thread {
            PiperUsta.download(this, key,
                onProgress = { p -> setProgress("glos", "🗣️ Pobieram głos ${name.substringAfter(" ")}… $p%") },
                onDone = { ok, err -> runOnUiThread {
                    setProgress("glos", null)
                    speak(if (ok) "Gotowe! Od teraz mówię głosem: ${name.substringAfter(" ")}. Posłuchaj, jak brzmię — zmienisz mnie w każdej chwili w Ustawieniach, w Głosach."
                          else "Nie udało się pobrać głosu. $err")
                } })
        }.start()
    }

    /** 📏 Ile RAM ma telefon i który mózg realnie udźwignie — po ludzku. */
    private fun ramReport(): String {
        val am = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
        val mi = android.app.ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        val gb = Math.round(mi.totalMem.toDouble() / (1024L * 1024 * 1024) * 10) / 10.0
        val free = Math.round(mi.availMem.toDouble() / (1024L * 1024 * 1024) * 10) / 10.0
        val rada = when {
            gb >= 5.5 -> "Śmiało wgrywaj Średni mózg — będzie chodził wygodnie."
            gb >= 3.5 -> "Średni mózg da radę, ale przy pierwszej odpowiedzi zamknij inne aplikacje. Mały będzie zawsze pewny i szybki."
            else -> "Ten telefon pewnie udźwignie tylko Mały mózg — Średni by się dławił."
        }
        return "Telefon ma $gb gigabajta pamięci RAM, wolne teraz: $free. $rada"
    }

    // ⏳ CZAS ROZMOWY — jak długo po odpowiedzi Gadacz czeka na Twój kolejny głos,
    // zanim wróci do czuwania. Każdy wybiera po swojemu: od 5 sekund po „ciągle".
    private val convWaitChoices = listOf(5, 10, 15, 30, 60, 300, 600, 900, 1200, 3600, -1)
    private fun convWaitLabel(sec: Int): String = when (sec) {
        -1 -> "ciągle"
        in 1..59 -> "$sec sekund"
        60 -> "1 minuta"
        3600 -> "1 godzina"
        else -> "${sec / 60} minut"
    }
    private fun showConvWaitPicker() {
        val cur = Brain.convWaitSec(this)
        val items = convWaitChoices.map { s ->
            (if (s == cur) "✓ " else "") + convWaitLabel(s) + (if (s == -1) " — rozmowa nigdy sama się nie kończy" else "")
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("⏳ Ile mam czekać na Twój głos w rozmowie?")
            .setItems(items) { _, which ->
                val s = convWaitChoices[which]
                Brain.setConvWaitSec(this, s)
                speak(if (s == -1) "Ustawione: rozmowa trwa ciągle, dopóki sam jej nie zakończysz słowem koniec. Pamiętaj, że to zużywa więcej baterii."
                      else "Ustawione. W rozmowie poczekam na Ciebie ${convWaitLabel(s)}.")
            }
            .setNegativeButton("Zamknij", null).show()
    }

    // 👂 UCHO GADACZA — własny ciągły nasłuch (Vosk): tryb stały bez żadnych dziur.
    private fun confirmEar() {
        val has = VoskEar.available(this)
        AlertDialog.Builder(this)
            .setTitle(if (has) "👂 Ucho jest wgrane" else "👂 Pobrać ucho Gadacza?")
            .setMessage(if (has)
                "Ucho czuwa jednym ciągłym strumieniem — słowo „Gadacz” i „stop” łapie bez przerw. Możesz pobrać je na nowo, gdyby coś szwankowało."
            else
                "Ucho to własny silnik rozpoznawania mowy (około 50 megabajtów, działa bez internetu). W trybie stałym słucha CIĄGLE — bez dziur między sesjami — i pozwala pewniej wchodzić Gadaczowi w słowo. Pobrać?")
            .setPositiveButton(if (has) "Pobierz na nowo" else "Pobierz") { _, _ -> downloadEar() }
            .setNegativeButton("Nie teraz", null).show()
    }

    private fun downloadEar() {
        speak("Pobieram ucho Gadacza, około pięćdziesiąt megabajtów. Powiedz przerwij, żeby zatrzymać.")
        Thread {
            VoskEar.download(this,
                onProgress = { p -> setProgress("ucho", "👂 Pobieram ucho… $p%") },
                onDone = { ok, err -> runOnUiThread {
                    setProgress("ucho", null)
                    if (ok) {
                        speak("Gotowe! Ucho działa. W trybie stałym słucham teraz bez przerw.")
                        // Przeładuj usługę, żeby ucho od razu przejęło czuwanie.
                        if (Brain.prefs(this).getString("float_mode", "off") == "staly") {
                            stopService(Intent(this, GadaczOverlayService::class.java))
                            startService(Intent(this, GadaczOverlayService::class.java))
                        }
                    } else speak("Nie udało się pobrać ucha. $err")
                } })
        }.start()
    }

    /** 🤏 Pobierz lokalny mózg — WYBÓR silnika (mały/średni/duży) do rozmów offline. */
    private fun confirmLocalBrain() {
        val ready = LocalBrain.available(this)
        // 🏷️ Najpierw POWIEDZ, który mózg jest wgrany (rozpoznany po rozmiarze pliku).
        if (ready) speak("Masz wgrany mózg: ${LocalBrain.installedName(this)}.")
        setStatus("🧠 Sprawdzam dostępne silniki…")
        Thread {
            val opts = LocalBrain.brainOptions(this)   // (nazwa, opis, url) z serwera
            runOnUiThread {
                setStatus("Gotowy")
                if (opts.isEmpty()) {
                    if (ready) return@runOnUiThread   // masz mózg, serwer nie podał listy — nie pobieraj na nowo
                    downloadBrain(null, "domyślny")
                    return@runOnUiThread
                }
                val items = opts.map { "${it.first}\n${it.second}" }.toTypedArray()
                // 📏 Podpowiedź od telefonu: który mózg realnie udźwignie (po RAM).
                val am = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
                val mi = android.app.ActivityManager.MemoryInfo(); am.getMemoryInfo(mi)
                val gbRam = mi.totalMem.toDouble() / (1024L * 1024 * 1024)
                val rec = if (gbRam >= 3.5) "Średni" else "Mały"
                AlertDialog.Builder(this)
                    .setTitle(if (ready) "🧠 Masz: ${LocalBrain.installedName(this)}. Zmienić? (telefon poleca: $rec)"
                              else "🧠 Który silnik pobrać? (telefon poleca: $rec)")
                    .setItems(items) { _, which ->
                        val (name, _, url) = opts[which]
                        downloadBrain(url, name)
                    }
                    .setNegativeButton("Nie teraz", null).show()
            }
        }.start()
    }

    private fun downloadBrain(url: String?, name: String) {
        speak("Pobieram silnik $name. Daj mi kilka minut, najlepiej na Wi-Fi. Gdy sieć się zerwie, wznowię sam od tego samego miejsca. Powiedz przerwij, żeby zatrzymać.")
        Thread {
            LocalBrain.downloadModel(this, url,
                onProgress = { p -> setProgress("mozg", "🧠 Pobieram mózg $name… $p%") },
                onDone = { ok, err -> runOnUiThread {
                    setProgress("mozg", null)
                    speak(if (ok) "Gotowe! Silnik $name działa. W trybie darmowym odpowiem teraz na pytania nawet bez internetu."
                          else "Nie udało się pobrać. $err")
                } })
        }.start()
    }

    /** 🏫 Nauka całego telefonu: Gdacz otwiera po kolei aplikacje i pisze o nich ściągi. */
    private fun confirmLearnDevice() {
        if (GadaczAccessibilityService.instance == null) {
            speak("Najpierw włącz sterowanie ekranem w ustawieniach Gadacza, wtedy poznam telefon.")
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); return
        }
        val apps = Brain.learnableApps(this)
        AlertDialog.Builder(this)
            .setTitle("🏫 Nauczyć się całego telefonu?")
            .setMessage("Otworzę po kolei Twoje aplikacje (${apps.size.coerceAtMost(20)} z ${apps.size}) i napiszę o każdej ściągę — dzięki temu potem lepiej je obsłużę. Pomijam banki i płatności. To potrwa kilka minut i zużyje trochę środków na kluczu. W każdej chwili powiedz „przerwij”.")
            .setPositiveButton("Zaczynaj") { _, _ -> learnDevice(apps.take(20)) }
            .setNegativeButton("Nie teraz", null).show()
    }

    private fun learnDevice(apps: List<Pair<String, String>>) {
        Brain.deviceLearnCancel = false
        speak("Uczę się telefonu. Otworzę ${apps.size} aplikacji. Powiedz „przerwij”, żeby zatrzymać.")
        Thread {
            var done = 0
            for ((i, app) in apps.withIndex()) {
                if (Brain.deviceLearnCancel) break
                val (label, pkg) = app
                runOnUiThread { setStatus("🏫 ${i + 1}/${apps.size}: $label") }
                if (!Brain.launchPackage(this, pkg)) continue
                try { Thread.sleep(2600) } catch (_: Exception) {}   // daj się wczytać
                if (Brain.deviceLearnCancel) break
                if (Brain.learnCurrentApp(this, pkg)) done++
                try { Thread.sleep(400) } catch (_: Exception) {}
            }
            val d = done
            val stopped = Brain.deviceLearnCancel
            Brain.deviceLearnCancel = false
            runOnUiThread {
                setStatus("Gotowy")
                speak(if (stopped) "Przerwane. Zdążyłem poznać $d aplikacji." else "Gotowe. Poznałem $d aplikacji. Teraz będę je obsługiwał pewniej.")
            }
        }.start()
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

    /** 💰/🆓 Przełącznik trybu pracy + odświeżenie podpisu na przycisku. */
    private fun refreshPayButton() {
        val paid = Brain.paidMode(this)
        payBtn.text = if (paid) "💰  PRACUJĘ ZA OPŁATĄ (mądry mózg)" else "🆓  PRACUJĘ ZA DARMO (telefon sam)"
        payBtn.setBackgroundColor(if (paid) 0xFF3B2A06.toInt() else 0xFF052E16.toInt())
        payBtn.setTextColor(if (paid) 0xFFFDE68A.toInt() else 0xFFDCFCE7.toInt())
    }

    private fun togglePaidMode() {
        val nowPaid = !Brain.paidMode(this)
        Brain.setPaidMode(this, nowPaid)
        refreshPayButton()
        speak(if (nowPaid) "Tryb płatny włączony. Pytania idą do mądrego mózgu w chmurze."
              else "Tryb darmowy. Radzę sobie sam na telefonie — proste komendy, znane drogi i czytanie ekranu działają, nie wydaję ani grosza.")
    }

    /** 📄 Darmowe czytanie: telefon sam czyta napisy z ekranu — bez AI, zero kosztów. */
    private fun readScreenPlainFree() {
        val svc = GadaczAccessibilityService.instance
        if (svc == null) {
            speak("Aby czytać ekran, włącz Gadacza w Ustawieniach, Dostępność.")
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); return
        }
        val plain = svc.readScreenPlain()
        if (plain.isBlank()) speak("Nie widzę tekstu na tym ekranie.")
        else { lastAnswer = plain; appendLine("📄 $plain"); speak(plain) }
    }

    /** Overlay permission → start the always-on floating button. */
    private fun enableOverlay() { toggleFloat("dotyk") }

    /** 🎈 Włącz/wyłącz/przełącz pływający przycisk. Dotknięcie WŁĄCZONEGO trybu = wyłącz. */
    private fun toggleFloat(mode: String) {
        val cur = Brain.prefs(this).getString("float_mode", "off")
        // Ten sam tryb dotknięty drugi raz → wyłączamy.
        if (cur == mode) { setFloat("off"); return }
        // Włączenie wymaga zgody na rysowanie nad aplikacjami.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            speak("Zezwól Gadaczowi na wyświetlanie nad innymi aplikacjami, potem dotknij jeszcze raz.")
            try { startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) } catch (_: Exception) {}
            return
        }
        setFloat(mode)
    }

    private fun setFloat(mode: String) {
        Brain.prefs(this).edit().putString("float_mode", mode).putBoolean("wake_mode", mode == "staly").apply()
        val svc = Intent(this, GadaczOverlayService::class.java)
        try { stopService(svc) } catch (_: Exception) {}
        if (mode != "off") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc) else startService(svc)
            speak(if (mode == "staly") "Tryb stały włączony. Powiedz Gadacz raz, żeby zacząć — a potem rozmawiaj ze mną normalnie, nie musisz powtarzać."
                  else "Pływający przycisk włączony. Znajdziesz go w rogu ekranu — dotknij i mów.")
        } else speak("Pływający przycisk wyłączony.")
        refreshFloatButtons()
    }

    private fun refreshFloatButtons() {
        val mode = Brain.prefs(this).getString("float_mode", "off")
        fun paint(b: Button, on: Boolean, onBg: Int) {
            b.setBackgroundColor(if (on) onBg else 0xFF1C1917.toInt())
            b.setTextColor(if (on) 0xFF000000.toInt() else 0xFFE5E5E5.toInt())
        }
        paint(floatStalyBtn, mode == "staly", 0xFFF87171.toInt())
        paint(floatDotykBtn, mode == "dotyk", 0xFF86EFAC.toInt())
    }

    /** 🎚️ Ustaw stopień pracy mądrego mózgu. */
    private fun setWork(lvl: String) {
        Brain.setWorkLevel(this, lvl)
        speak(when (lvl) {
            "easy" -> "Tryb łatwy. Pracuję taniej, na prostszych modelach."
            "hard" -> "Tryb trudny. Najlepsze modele, nie oszczędzam."
            else   -> "Tryb normalny. Zrównoważona jakość i koszt."
        })
        refreshWorkButtons()
    }

    private fun refreshWorkButtons() {
        val cur = Brain.workLevel(this)
        val colors = mapOf("easy" to 0xFF86EFAC.toInt(), "normal" to 0xFFFDE68A.toInt(), "hard" to 0xFFFCA5A5.toInt())
        for ((k, b) in workBtns) {
            val on = k == cur
            b.setBackgroundColor(if (on) colors[k]!! else 0xFF1C1917.toInt())
            b.setTextColor(if (on) 0xFF000000.toInt() else 0xFFE5E5E5.toInt())
        }
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
        // 🔓 Android 8+ blokuje instalację, jeśli apka nie ma zgody „Instaluj nieznane
        // aplikacje". Bez tego instalator się otwiera i cofa („aktualizacja nie przechodzi").
        // Sprawdzamy PRZED pobraniem i prowadzimy użytkownika do włączenia zgody.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(this)
                .setTitle("Jednorazowa zgoda na instalację")
                .setMessage("Android wymaga, żebyś raz zezwolił Gadaczowi instalować aktualizacje. Zaraz otworzę ten ekran — włącz przełącznik „Zezwól z tego źródła”, cofnij się i dotknij Aktualizuj jeszcze raz.")
                .setPositiveButton("Otwórz ustawienia") { _, _ ->
                    speak("Włącz przełącznik zezwól z tego źródła, potem wróć i dotknij Aktualizuj jeszcze raz.")
                    try { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) }
                    catch (_: Exception) { try { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)) } catch (_: Exception) {} }
                }
                .setNegativeButton("Anuluj", null).show()
            return
        }
        speak("Pobieram aktualizację, chwileczkę.")
        Thread {
            Updater.downloadAndInstall(this,
                onProgress = { p -> setProgress("apk", "🔄 Pobieram aktualizację… $p%") },
                onError = { e -> runOnUiThread { setProgress("apk", null); speak("Błąd aktualizacji. $e Możesz też pobrać aplikację z przeglądarki — otwórz stronę github i plik Gadacz kropka apk.") } })
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

    private fun speak(text: String) {
        setStatus("🔊 $text")
        // 👄 Piękny głos offline, gdy wgrany i włączony — inaczej głos systemowy.
        if (PiperUsta.enabled(this)) { PiperUsta.stopNow(); if (PiperUsta.speak(this, text) {}) return }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "g")
    }
    // 📊 TABLICA POSTĘPÓW: każde pobieranie (mózg, ucho, usta, aktualizacja) ma
    // WŁASNĄ linijkę — gdy schodzą dwa naraz, widać oba postępy, jeden pod drugim.
    private var baseStatus = "Gotowy"
    private val progressLines = LinkedHashMap<String, String>()
    // ⏳ Kręciołek przy myśleniu — widać, że Gadacz PRACUJE, a nie wisi.
    private val thinkGlyphs = "アイウエオカキクケコサシスセソタチツテト日月火水木金人中大電脳0123456789"
    private val spinRnd = java.util.Random()
    private var spinTxt = "█"
    private var spinArmed = false
    private val spinTick = object : Runnable {
        override fun run() {
            if (baseStatus.contains("Myślę") || baseStatus.contains("Czytam ekran")) {
                val sb = StringBuilder()
                repeat(4) { sb.append(thinkGlyphs[spinRnd.nextInt(thinkGlyphs.length)]) }
                spinTxt = sb.toString()
                refreshStatus()
            }
            status.postDelayed(this, 120)
        }
    }
    private fun setStatus(s: String) {
        runOnUiThread {
            baseStatus = s
            if (!spinArmed) { spinArmed = true; status.postDelayed(spinTick, 280) }
            refreshStatus()
        }
    }
    private fun setProgress(key: String, text: String?) {
        runOnUiThread {
            if (text == null) progressLines.remove(key) else progressLines[key] = text
            refreshStatus()
        }
    }
    private fun refreshStatus() {
        val base = if (baseStatus.contains("Myślę") || baseStatus.contains("Czytam ekran"))
            "$spinTxt█ $baseStatus" else baseStatus
        val extra = progressLines.values.joinToString("\n")
        status.text = when {
            extra.isBlank() -> base
            baseStatus.isBlank() || baseStatus == "Gotowy" -> extra
            else -> base + "\n" + extra
        }
    }
    private fun appendLine(s: String) { runOnUiThread { transcript.text = "$s\n\n${transcript.text}" } }

    // ── 🔌 POŁĄCZENIA — jedno miejsce na wszystkie „kable" Gadacza do świata:
    // Claude (mądry mózg w chmurze), Replit (Twój serwer) i GitHub (aktualizacje).
    // Każde ze statusem, testem i podpinaniem — jak porządna integracja.
    private fun showConnections() {
        val claudeOk = Brain.anthropicKey(this).isNotBlank()
        val srv = Brain.serverUrl(this)
        val items = arrayOf(
            if (claudeOk) "🤖  Claude (mądry mózg): PODŁĄCZONY — dotknij, by zmienić klucz"
            else "🤖  Claude (mądry mózg): BRAK KLUCZA — dotknij i wklej klucz",
            if (srv.isNotBlank()) "☁️  Replit (Twój serwer): ${srv.removePrefix("https://").take(38)}"
            else "☁️  Replit (Twój serwer): BRAK ADRESU — dotknij i wpisz",
            "🩺  Sprawdź serwer (działa? śpi?)",
            "⏰  Obudź serwer (darmowy Replit zasypia)",
            "🐙  GitHub (aktualizacje i silniki): sprawdź połączenie",
            if (Brain.githubToken(this).isNotBlank()) "🖐️  Ręce Gadacza (token GitHub): PODŁĄCZONE — dotknij, by zmienić"
            else "🖐️  Ręce Gadacza (token GitHub): BRAK — pozwól mi zmieniać własny kod",
        )
        AlertDialog.Builder(this)
            .setTitle("🔌 Połączenia Gadacza")
            .setItems(items) { _, which ->
                when (which) {
                    0, 1 -> showSettings()
                    2 -> pingServer(wake = false)
                    3 -> pingServer(wake = true)
                    4 -> checkGithub()
                    5 -> showHandsToken()
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    /** 🖐️ Ręce Gadacza: token GitHub, dzięki któremu twarz Programowanie może
     *  czytać i wypychać WŁASNY kod (zawsze z Twoim potwierdzeniem przed pushem). */
    private fun showHandsToken() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 20, 40, 0) }
        val tokenIn = EditText(this).apply {
            hint = "Token GitHub (github_pat_… albo ghp_…)"
            setText(Brain.githubToken(this@MainActivity))
        }
        box.addView(tokenIn)
        AlertDialog.Builder(this)
            .setTitle("🖐️ Ręce Gadacza")
            .setMessage("Zrób token na github.com: Settings → Developer settings → Fine-grained tokens → tylko to repozytorium, uprawnienie Contents: Read and write. Wklej niżej. W czacie z Programowaniem zadziałają wtedy: „przeczytaj plik ŚCIEŻKA” i „wypchnij do ŚCIEŻKA” — push zawsze z Twoim potwierdzeniem.")
            .setView(box)
            .setPositiveButton("Zapisz") { _, _ ->
                Brain.setGithubToken(this, tokenIn.text.toString())
                speak(if (Brain.githubToken(this).isNotBlank()) "Mam ręce! Od teraz w czacie z twarzą Programowanie mogę czytać i wypychać własny kod — zawsze z Twoim potwierdzeniem." else "Token usunięty — ręce schowane.")
            }
            .setNegativeButton("Anuluj", null).show()
    }

    private fun pingServer(wake: Boolean) {
        setStatus(if (wake) "⏰ Budzę serwer…" else "🩺 Sprawdzam serwer…")
        if (wake) speak("Budzę serwer, daj mi pół minuty.")
        Thread {
            val r = Brain.serverReport(this, wake)
            runOnUiThread { setStatus("Gotowy"); appendLine("🩺 $r"); speak(r) }
        }.start()
    }

    private fun checkGithub() {
        setStatus("🐙 Sprawdzam GitHub…")
        Thread {
            val latest = Updater.checkLatest()
            val cur = Updater.currentVersion(this)
            val r = if (latest == null)
                "Nie mogę się połączyć z GitHubem. Sprawdź internet i spróbuj za chwilę."
            else if (latest == cur)
                "GitHub połączony. Masz najnowszą wersję: $cur. Stąd też pobierają się silniki."
            else
                "GitHub połączony. Jest nowsza wersja: $latest, Ty masz $cur — wejdź w Sprawdź aktualizację."
            runOnUiThread { setStatus("Gotowy"); appendLine("🐙 $r"); speak(r) }
        }.start()
    }

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

    /**
     * 🪤 ŁAPACZ BŁĘDÓW: gdy Gadacz się wywali (błąd programu), zapisujemy powód do
     * pliku. Przy następnym otwarciu pokazujemy go z przyciskiem „Kopiuj" — dzięki
     * temu widać, CO naprawdę pękło, zamiast zgadywać.
     */
    private fun installCrashCatcher() {
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val sw = java.io.StringWriter()
                e.printStackTrace(java.io.PrintWriter(sw))
                java.io.File(filesDir, "last_crash.txt").writeText("Gadacz padł:\n" + sw.toString().take(4000))
            } catch (_: Throwable) {}
            prev?.uncaughtException(t, e)
        }
        val f = java.io.File(filesDir, "last_crash.txt")
        if (f.exists()) {
            val txt = try { f.readText() } catch (_: Exception) { "" }
            try { f.delete() } catch (_: Exception) {}
            if (txt.isNotBlank()) window.decorView.post {
                AlertDialog.Builder(this)
                    .setTitle("⚠️ Gadacz się wcześniej wywalił")
                    .setMessage(txt.take(2500))
                    .setPositiveButton("Kopiuj błąd") { _, _ ->
                        try {
                            val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                            cm.setPrimaryClip(android.content.ClipData.newPlainText("crash", txt))
                            speak("Skopiowałem błąd. Wklej go w rozmowie, a naprawię przyczynę.")
                        } catch (_: Exception) {}
                    }
                    .setNegativeButton("Zamknij", null).show()
            }
        }
    }

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }
}
