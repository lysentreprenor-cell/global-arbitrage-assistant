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

        val talk = btn("🗣️  DOTKNIJ I POWIEDZ", 0xFFFACC15.toInt(), 0xFF111111.toInt(), 190) { onTalk() }
        status = TextView(this).apply {
            text = "Gotowy"; textSize = 19f; setTextColor(0xFFFFFFFF.toInt()); gravity = Gravity.CENTER; setPadding(0, dp(10), 0, dp(10))
        }
        // Settings FIRST after the talk button — always visible, impossible to miss.
        val settings = btn("⚙  USTAWIENIA (adres i klucz)", 0xFFFDE68A.toInt(), 0xFF422006.toInt(), 74) { showSettings() }
        val readScreen = btn("👀  CO JEST NA EKRANIE", 0xFFE9D5FF.toInt(), 0xFF3B0764.toInt(), 74) { readScreen() }
        val bgOn = btn("🟢  WŁĄCZ PŁYWAJĄCY PRZYCISK", 0xFFDCFCE7.toInt(), 0xFF052E16.toInt(), 74) { enableOverlay() }
        val access = btn("♿  WŁĄCZ STEROWANIE EKRANEM", 0xFFE0F2FE.toInt(), 0xFF082F49.toInt(), 74) { enableAccessibilityFlow() }
        val unblock = btn("🔓  ODBLOKUJ (jeśli szare) — 3 kropki", 0xFFFEF3C7.toInt(), 0xFF451A03.toInt(), 66) {
            speak("Naciśnij trzy kropki w prawym górnym rogu i wybierz: Zezwól na ustawienia z ograniczeniami. Potem wróć i włącz sterowanie ekranem.")
            try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (_: Exception) {}
        }
        val notif = btn("📢  CZYTAJ POWIADOMIENIA NA GŁOS", 0xFFFCE7F3.toInt(), 0xFF500724.toInt(), 74) {
            Brain.prefs(this).edit().putBoolean("read_notifications", true).apply()
            speak("Włącz Gadacza na liście dostępu do powiadomień.")
            try { startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")) } catch (_: Exception) {}
        }
        val repeat = btn("🔁  POWTÓRZ", 0xFFDCFCE7.toInt(), 0xFF052E16.toInt(), 66) { if (lastAnswer.isNotBlank()) speak(lastAnswer) else speak("Nie mam jeszcze odpowiedzi.") }
        val update = btn("🔄  SPRAWDŹ AKTUALIZACJĘ (v${Updater.currentVersion(this)})", 0xFFCFFAFE.toInt(), 0xFF083344.toInt(), 66) { doUpdate(manual = true) }

        transcript = TextView(this).apply { textSize = 16f; setTextColor(0xFFD6D3D1.toInt()); setPadding(0, dp(12), 0, 0) }

        col.addView(talk); col.addView(status); col.addView(settings); col.addView(readScreen)
        col.addView(bgOn); col.addView(access); col.addView(unblock); col.addView(notif); col.addView(repeat); col.addView(update); col.addView(transcript)
        setContentView(outer)

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
    }

    private fun bigBtn(label: String, fg: Int, bg: Int, weight: Float, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label; textSize = if (weight >= 2) 24f else 17f; setTextColor(fg); setBackgroundColor(bg)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, weight)
            setOnClickListener { onClick() }
        }

    override fun onInit(code: Int) { if (code == TextToSpeech.SUCCESS) tts.language = Locale("pl", "PL") }

    private fun onTalk() {
        if (tts.isSpeaking) { tts.stop(); setStatus("Gotowy"); return }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Mów…")
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
