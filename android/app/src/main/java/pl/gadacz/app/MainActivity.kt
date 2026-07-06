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

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFF000000.toInt()); setPadding(24, 24, 24, 24)
        }

        val talk = bigBtn("🗣️\nDOTKNIJ I POWIEDZ", 0xFFFACC15.toInt(), 0xFF111111.toInt(), 3f) { onTalk() }
        status = TextView(this).apply {
            text = "Gotowy"; textSize = 19f; setTextColor(0xFFFFFFFF.toInt()); gravity = Gravity.CENTER; setPadding(0, 16, 0, 16)
        }
        val readScreen = bigBtn("👀 CO JEST NA EKRANIE", 0xFFE9D5FF.toInt(), 0xFF3B0764.toInt(), 1f) { readScreen() }
        val bgOn = bigBtn("🟢 WŁĄCZ PŁYWAJĄCY PRZYCISK\n(działa w każdej aplikacji)", 0xFFDCFCE7.toInt(), 0xFF052E16.toInt(), 1.4f) { enableOverlay() }
        val access = bigBtn("♿ WŁĄCZ STEROWANIE EKRANEM", 0xFFE0F2FE.toInt(), 0xFF082F49.toInt(), 1f) {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val repeat = bigBtn("🔁 POWTÓRZ", 0xFFDCFCE7.toInt(), 0xFF052E16.toInt(), 1f) { if (lastAnswer.isNotBlank()) speak(lastAnswer) else speak("Nie mam jeszcze odpowiedzi.") }
        val settings = bigBtn("⚙ USTAWIENIA", 0xFFE0F2FE.toInt(), 0xFF082F49.toInt(), 1f) { showSettings() }
        row.addView(repeat.also { (it.layoutParams as LinearLayout.LayoutParams).apply { width = 0; weight = 1f } })
        row.addView(settings.also { (it.layoutParams as LinearLayout.LayoutParams).apply { width = 0; weight = 1f } })

        transcript = TextView(this).apply { textSize = 16f; setTextColor(0xFFD6D3D1.toInt()); setPadding(0, 12, 0, 0) }
        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 2f); addView(transcript)
        }

        root.addView(talk); root.addView(status); root.addView(readScreen)
        root.addView(bgOn); root.addView(access); root.addView(row); root.addView(scroll)
        setContentView(root)

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
        Thread {
            try {
                val screen = GadaczAccessibilityService.instance?.readScreen()
                val resp = Brain.ask(this, text, history, screen)
                val say = resp.optString("say", "Nie zrozumiałem.")
                val action = resp.optString("action", "none")
                val args = resp.optJSONObject("args") ?: JSONObject()
                history.add("user" to text); history.add("assistant" to say)
                lastAnswer = say; appendLine("🗣️ $say")
                val spoken = Brain.execute(this, action, args, say) { s -> speak(s) }
                if (spoken.isNotBlank()) speak(spoken)
            } catch (e: Exception) { speak("Błąd połączenia. ${e.message}") }
        }.start()
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

    private fun speak(text: String) { setStatus("🔊 $text"); tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "g") }
    private fun setStatus(s: String) { runOnUiThread { status.text = s } }
    private fun appendLine(s: String) { runOnUiThread { transcript.text = "$s\n\n${transcript.text}" } }

    private fun showSettings() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 20, 40, 0) }
        val urlIn = EditText(this).apply { hint = "Adres serwera, np. https://twoj.repl.co"; setText(Brain.serverUrl(this@MainActivity)) }
        val keyIn = EditText(this).apply { hint = "Klucz Anthropic sk-ant-..."; setText(Brain.anthropicKey(this@MainActivity)) }
        val pinIn = EditText(this).apply { hint = "PIN aplikacji (np. 0905)"; inputType = android.text.InputType.TYPE_CLASS_NUMBER; setText(Brain.pin(this@MainActivity)) }
        box.addView(urlIn); box.addView(keyIn); box.addView(pinIn)
        AlertDialog.Builder(this).setTitle("Ustaw Gadacza").setView(box)
            .setPositiveButton("Zapisz") { _, _ ->
                Brain.prefs(this).edit()
                    .putString("server_url", urlIn.text.toString().trim())
                    .putString("anthropic_key", keyIn.text.toString().trim())
                    .putString("app_pin", pinIn.text.toString().trim()).apply()
                speak("Zapisane. Dotknij dużego przycisku i mów.")
            }.setNegativeButton("Anuluj", null).show()
    }

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }
}
