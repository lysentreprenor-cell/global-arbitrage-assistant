package pl.gadacz.app

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Gadacz — one giant button. Speak a command → sent to the user's own server
 * (/api/assistant/ask) → the AI returns {say, action, args} → Gadacz speaks and
 * executes, using the accessibility service for on-screen actions.
 *
 * SERVER_URL + ANTHROPIC_KEY are set once on first run (typed or pasted). The
 * brain stays on the user's Replit; the phone only listens, speaks and acts.
 */
class MainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var tts: TextToSpeech
    private lateinit var status: TextView
    private lateinit var transcript: TextView
    private val http = OkHttpClient.Builder()
        .callTimeout(70, TimeUnit.SECONDS).readTimeout(70, TimeUnit.SECONDS).build()
    private val history = ArrayList<Pair<String, String>>() // role, content
    private var lastAnswer = ""

    private val prefs by lazy { getSharedPreferences("gadacz", MODE_PRIVATE) }
    private fun serverUrl() = prefs.getString("server_url", "") ?: ""
    private fun anthropicKey() = prefs.getString("anthropic_key", "") ?: ""

    private val speechLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val said = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (!said.isNullOrBlank()) handleCommand(said) else setStatus("Nic nie usłyszałem. Dotknij i powiedz jeszcze raz.")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this, this)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF000000.toInt())
            setPadding(24, 24, 24, 24)
        }

        val talk = Button(this).apply {
            text = "🗣️\nDOTKNIJ I POWIEDZ"
            textSize = 26f
            setTextColor(0xFFFACC15.toInt())
            setBackgroundColor(0xFF111111.toInt())
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 3f)
            setOnClickListener { onTalk() }
        }
        status = TextView(this).apply {
            text = "Gotowy"
            textSize = 20f; setTextColor(0xFFFFFFFF.toInt()); gravity = Gravity.CENTER
            setPadding(0, 20, 0, 20)
        }
        val repeat = Button(this).apply {
            text = "🔁 POWTÓRZ"
            textSize = 20f; setTextColor(0xFFDCFCE7.toInt()); setBackgroundColor(0xFF052E16.toInt())
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
            setOnClickListener { if (lastAnswer.isNotBlank()) speak(lastAnswer) else speak("Nie mam jeszcze odpowiedzi.") }
        }
        val settingsBtn = Button(this).apply {
            text = "⚙ USTAW SERWER I KLUCZ"
            textSize = 16f; setTextColor(0xFFE0F2FE.toInt()); setBackgroundColor(0xFF082F49.toInt())
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
            setOnClickListener { showSettings() }
        }
        transcript = TextView(this).apply {
            textSize = 17f; setTextColor(0xFFD6D3D1.toInt()); setPadding(0, 16, 0, 0)
        }
        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 2f)
            addView(transcript)
        }

        root.addView(talk); root.addView(status); root.addView(repeat)
        root.addView(settingsBtn); root.addView(scroll)
        setContentView(root)

        if (serverUrl().isBlank() || anthropicKey().isBlank()) showSettings()
    }

    override fun onInit(statusCode: Int) {
        if (statusCode == TextToSpeech.SUCCESS) tts.language = Locale("pl", "PL")
    }

    private fun onTalk() {
        if (tts.isSpeaking) { tts.stop(); setStatus("Gotowy"); return }
        if (GadaczAccessibilityService.instance == null) {
            speak("Aby sterować ekranem, włącz Gadacza w Ustawieniach, Dostępność. Otwieram ustawienia.")
            startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))
            return
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Mów…")
        }
        setStatus("🎤 Słucham…")
        try { speechLauncher.launch(intent) } catch (e: Exception) { setStatus("Brak rozpoznawania mowy: ${e.message}") }
    }

    private fun handleCommand(text: String) {
        appendLine("👤 $text")
        setStatus("🧠 Myślę…")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val resp = askServer(text, null)
                val say = resp.optString("say", "Nie zrozumiałem.")
                val action = resp.optString("action", "none")
                val args = resp.optJSONObject("args") ?: JSONObject()
                withContext(Dispatchers.Main) {
                    history.add("user" to text); history.add("assistant" to say)
                    lastAnswer = say
                    appendLine("🗣️ $say")
                    executeAction(action, args, say)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { speak("Błąd połączenia. ${e.message}") }
            }
        }
    }

    private fun askServer(question: String, screenDump: String?): JSONObject {
        val msgs = JSONArray()
        history.takeLast(8).forEach { (role, content) ->
            msgs.put(JSONObject().put("role", role).put("content", content))
        }
        val body = JSONObject().apply {
            put("anthropicKey", anthropicKey())
            put("question", if (screenDump != null) "EKRAN: $screenDump\n\nPolecenie: $question" else question)
            put("history", msgs)
            put("clientTime", java.text.SimpleDateFormat("EEEE, d MMMM yyyy, HH:mm", Locale("pl", "PL")).format(java.util.Date()))
        }
        val req = Request.Builder()
            .url(serverUrl().trimEnd('/') + "/api/assistant/ask")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { r ->
            val txt = r.body?.string() ?: "{}"
            return JSONObject(txt)
        }
    }

    private fun executeAction(action: String, args: JSONObject, say: String) {
        val svc = GadaczAccessibilityService.instance
        when (action) {
            "call"  -> { speak(say); dial(args.optString("who")) }
            "sms"   -> { speak(say); sms(args.optString("who"), args.optString("text")) }
            "maps"  -> { speak(say); web("https://www.google.com/maps/search/?api=1&query=" + Uri.encode(args.optString("query"))) }
            "youtube" -> { speak(say); web("https://www.youtube.com/results?search_query=" + Uri.encode(args.optString("query"))) }
            "search" -> { speak(say); web("https://www.google.com/search?q=" + Uri.encode(args.optString("query"))) }
            "open"  -> { speak(say); web(args.optString("url")) }
            "open_app" -> { speak(say); openApp(args.optString("name")) }
            "read_screen" -> readScreenAndSummarize()
            "tap"   -> { val ok = svc?.tapByText(args.optString("text")) ?: false; speak(if (ok) say else "Nie znalazłem na ekranie: ${args.optString("text")}") }
            "type"  -> { val ok = svc?.typeText(args.optString("text")) ?: false; speak(if (ok) say else "Nie ma pola do wpisania.") }
            "back"  -> { svc?.goBack(); speak(say.ifBlank { "Cofam." }) }
            "home"  -> { svc?.goHome(); speak(say.ifBlank { "Ekran główny." }) }
            "scroll" -> { svc?.scroll(args.optString("dir") != "up"); speak(say.ifBlank { "Przewijam." }) }
            else -> speak(say)
        }
    }

    /** Read the current screen, send it back to the AI to summarize for the user. */
    private fun readScreenAndSummarize() {
        val dump = GadaczAccessibilityService.instance?.readScreen()
        if (dump == null) { speak("Nie mam dostępu do ekranu. Włącz Gadacza w Dostępności."); return }
        setStatus("🧠 Czytam ekran…")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val resp = askServer("Streść mi ten ekran.", dump)
                val say = resp.optString("say", dump.take(400))
                withContext(Dispatchers.Main) { lastAnswer = say; appendLine("🗣️ $say"); speak(say) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { speak(dump.take(400)) }
            }
        }
    }

    // ── System-app launchers ─────────────────────────────────────────────────
    private fun dial(who: String) {
        val num = who.filter { it.isDigit() || it == '+' }
        if (num.length >= 7) startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$num")))
        else speak("Nie znam numeru do: $who.")
    }
    private fun sms(who: String, text: String) {
        val num = who.filter { it.isDigit() || it == '+' }
        val i = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$num")).apply { putExtra("sms_body", text) }
        startActivity(i)
    }
    private fun web(url: String) {
        if (url.startsWith("http")) startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
    private fun openApp(name: String) {
        val pm = packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        val hit = apps.firstOrNull {
            pm.getApplicationLabel(it).toString().lowercase().contains(name.lowercase())
        }
        val launch = hit?.let { pm.getLaunchIntentForPackage(it.packageName) }
        if (launch != null) startActivity(launch) else speak("Nie znalazłem aplikacji: $name.")
    }

    private fun speak(text: String) {
        setStatus("🔊 $text")
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "gadacz")
    }
    private fun setStatus(s: String) { runOnUiThread { status.text = s } }
    private fun appendLine(s: String) { runOnUiThread { transcript.text = "$s\n\n${transcript.text}" } }

    // ── First-run settings: server URL + Anthropic key ───────────────────────
    private fun showSettings() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 40, 40, 40) }
        val urlIn = android.widget.EditText(this).apply { hint = "Adres serwera, np. https://twoj.repl.co"; setText(serverUrl()) }
        val keyIn = android.widget.EditText(this).apply { hint = "Klucz Anthropic sk-ant-..."; setText(anthropicKey()) }
        box.addView(urlIn); box.addView(keyIn)
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Ustaw Gadacza")
            .setView(box)
            .setPositiveButton("Zapisz") { _, _ ->
                prefs.edit().putString("server_url", urlIn.text.toString().trim())
                    .putString("anthropic_key", keyIn.text.toString().trim()).apply()
                speak("Zapisane. Dotknij dużego przycisku i mów.")
            }
            .setNegativeButton("Anuluj", null)
            .show()
    }

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }
}
