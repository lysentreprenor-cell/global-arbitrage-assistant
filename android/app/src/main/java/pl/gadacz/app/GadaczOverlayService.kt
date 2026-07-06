package pl.gadacz.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import org.json.JSONObject
import java.util.Locale

/**
 * Always-on Gadacz: a floating microphone button that sits on top of EVERY app.
 * Tap it anywhere — inside Messenger, the bank, the home screen — speak a command,
 * and Gadacz acts. This is what makes Gadacz "work in the background": the button
 * outlives its own screen. A foreground-service notification keeps Android from
 * killing it.
 */
class GadaczOverlayService : Service(), TextToSpeech.OnInitListener {

    private lateinit var wm: WindowManager
    private var bubble: TextView? = null
    private lateinit var tts: TextToSpeech
    private var recognizer: SpeechRecognizer? = null
    private val history = ArrayList<Pair<String, String>>()
    private var busy = false
    // Wake-word: continuously listen; act only when speech starts with "Gadacz".
    private var wakeMode = false
    private var wakeRec: SpeechRecognizer? = null
    private var wakeStopping = false

    override fun onBind(intent: Intent?): IBinder? = null

    // START_NOT_STICKY: don't let Android auto-restart us after the app is killed or
    // data is cleared — a restart with no mic permission would crash-loop.
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    override fun onCreate() {
        super.onCreate()
        try {
            tts = TextToSpeech(this, this)
            // Foreground with a microphone-typed service needs RECORD_AUDIO. If it was
            // revoked (e.g. after "clear data"), don't crash — just stop cleanly.
            val micOk = checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!micOk) { stopSelf(); return }
            startForeground(1, buildNotification())
            addBubble()
        } catch (e: Exception) {
            try { stopSelf() } catch (_: Exception) {}
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) tts.language = Locale("pl", "PL")
    }

    private fun buildNotification(): Notification {
        val chanId = "gadacz"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(chanId, "Gadacz", NotificationManager.IMPORTANCE_LOW))
        }
        return Notification.Builder(this, chanId)
            .setContentTitle("Gadacz słucha")
            .setContentText("Dotknij pływającego przycisku i mów")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build()
    }

    // ── Floating button ──────────────────────────────────────────────────────
    private fun addBubble() {
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val b = TextView(this).apply {
            text = "🗣️"
            textSize = 30f
            setPadding(28, 20, 28, 24)
            setBackgroundColor(0xEE111111.toInt())
            setTextColor(0xFFFACC15.toInt())
        }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.END or Gravity.BOTTOM; x = 24; y = 160 }

        // tap = listen; long-press = toggle wake-word "Gadacz"; drag = reposition
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false; var downTime = 0L
        b.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; moved = false; downTime = System.currentTimeMillis(); true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downX).toInt(); val dy = (e.rawY - downY).toInt()
                    if (kotlin.math.abs(dx) > 12 || kotlin.math.abs(dy) > 12) moved = true
                    lp.x = startX - dx; lp.y = startY - dy; wm.updateViewLayout(b, lp); true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        if (System.currentTimeMillis() - downTime > 600) toggleWake() else startListening()
                    }
                    true
                }
                else -> false
            }
        }
        bubble = b
        try { wm.addView(b, lp) } catch (_: Exception) {}
        // Resume wake-word if it was on before.
        if (Brain.prefs(this).getBoolean("wake_mode", false)) { wakeMode = true; startWakeLoop() }
    }

    // ── Wake word "Gadacz" — continuous listening loop (opt-in; uses battery) ──
    private fun toggleWake() {
        wakeMode = !wakeMode
        Brain.prefs(this).edit().putBoolean("wake_mode", wakeMode).apply()
        if (wakeMode) { speak("Nasłuchuję. Powiedz Gadacz i polecenie."); startWakeLoop() }
        else { speak("Przestaję nasłuchiwać."); stopWakeLoop() }
    }
    private fun stopWakeLoop() { wakeStopping = true; try { wakeRec?.destroy() } catch (_: Exception) {}; wakeRec = null; setBubble("🗣️") }
    private fun startWakeLoop() {
        if (!wakeMode || busy) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { speak("Brak rozpoznawania mowy."); wakeMode = false; return }
        wakeStopping = false
        try { wakeRec?.destroy() } catch (_: Exception) {}
        setBubble("👂")
        wakeRec = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.lowercase() ?: ""
                    val i = text.indexOf("gadacz")
                    if (i >= 0) {
                        val cmd = text.substring(i + 6).trim().trimStart(',', '.', ' ')
                        if (cmd.isNotBlank()) { handle(cmd) ; return } // handle() restarts wake loop when done
                    }
                    restartWake(300)
                }
                override fun onError(error: Int) { restartWake(500) }
                override fun onReadyForSpeech(p0: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(p0: Float) {}
                override fun onBufferReceived(p0: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(p0: Bundle?) {}
                override fun onEvent(p0: Int, p1: Bundle?) {}
            })
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
        }
        try { wakeRec?.startListening(intent) } catch (_: Exception) { restartWake(800) }
    }
    private fun restartWake(delayMs: Long) {
        if (!wakeMode || wakeStopping || busy) { if (wakeMode && !busy) setBubble("👂") ; return }
        bubble?.postDelayed({ if (wakeMode && !busy) startWakeLoop() }, delayMs)
    }

    // ── Voice in (SpeechRecognizer works from a service, unlike the Activity flow) ──
    private fun startListening() {
        if (busy) return
        if (tts.isSpeaking) { tts.stop(); return }
        if (!Brain.isConfigured(this)) { speak("Najpierw otwórz Gadacza i podaj adres serwera oraz klucz."); return }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { speak("Brak rozpoznawania mowy na tym telefonie."); return }
        busy = true
        setBubble("🎤")
        recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    busy = false; setBubble("🗣️")
                    if (!text.isNullOrBlank()) handle(text)
                }
                override fun onError(error: Int) { busy = false; setBubble("🗣️"); if (error == SpeechRecognizer.ERROR_NO_MATCH) speak("Nie usłyszałem. Dotknij i powiedz jeszcze raz.") }
                override fun onReadyForSpeech(p0: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(p0: Float) {}
                override fun onBufferReceived(p0: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(p0: Bundle?) {}
                override fun onEvent(p0: Int, p1: Bundle?) {}
            })
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
        }
        try { recognizer?.startListening(intent) } catch (e: Exception) { busy = false; setBubble("🗣️"); speak("Błąd mikrofonu.") }
    }

    private fun handle(text: String) {
        setBubble("🧠")
        Thread {
            try {
                // Full task loop — Gadacz drives across screens until the goal is done.
                Brain.runTask(this, text, history) { s -> speak(s) }
            } catch (e: Exception) {
                speak("Błąd połączenia z serwerem.")
            } finally {
                setBubble(if (wakeMode) "👂" else "🗣️")
                // After a wake-word command, resume listening for the next "Gadacz".
                if (wakeMode) restartWake(1200)
            }
        }.start()
    }

    private fun speak(text: String) { tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "gadacz") }
    private fun setBubble(emoji: String) { bubble?.post { bubble?.text = emoji } }

    override fun onDestroy() {
        try { bubble?.let { wm.removeView(it) } } catch (_: Exception) {}
        try { wakeRec?.destroy() } catch (_: Exception) {}
        recognizer?.destroy(); tts.stop(); tts.shutdown()
        super.onDestroy()
    }
}
