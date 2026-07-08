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
    // 💬 Tryb ROZMOWY: po skończeniu mówienia Gadacz sam otwiera mikrofon na kolejne
    // zdanie — bez dotykania przycisku. Cisza (brak mowy) zamyka rozmowę.
    private var convPending = false
    private val pendingSpeech = java.util.concurrent.atomic.AtomicInteger(0)
    private var uttSeq = 0
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
        if (status == TextToSpeech.SUCCESS) {
            tts.language = Locale("pl", "PL")
            // Wiemy, KIEDY Gadacz skończył mówić — wtedy (w trybie rozmowy) sam
            // otwieramy mikrofon na odpowiedź użytkownika.
            tts.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) { if (pendingSpeech.decrementAndGet() <= 0) maybeContinueConversation() }
                @Deprecated("api") override fun onError(id: String?) { if (pendingSpeech.decrementAndGet() <= 0) maybeContinueConversation() }
            })
        }
    }

    /** Po ostatnim wypowiedzianym zdaniu — jeśli trwa rozmowa — słuchaj dalej sam. */
    private fun maybeContinueConversation() {
        if (!convPending || busy) return
        bubble?.postDelayed({
            if (convPending && !busy) { convPending = false; startListening(auto = true) }
        }, 350)
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
        if (wakeMode) { speak("Nasłuchuję. Powiedz ${Brain.wakeWord(this)} i polecenie."); startWakeLoop() }
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
                    val word = Brain.wakeWord(this@GadaczOverlayService)
                    val i = text.indexOf(word)
                    if (i >= 0) {
                        val cmd = text.substring(i + word.length).trim().trimStart(',', '.', ' ')
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
    // auto=true → mikrofon otwarty przez TRYB ROZMOWY (po odpowiedzi), nie dotknięciem:
    // wtedy cisza kończy rozmowę po cichu (bez „nie usłyszałem") i wraca nasłuch słowa-klucza.
    private fun startListening(auto: Boolean = false) {
        if (busy) return
        // Dotknięcie w trakcie mówienia = PRZERWIJ i słuchaj od razu (jak przerywa się
        // człowiekowi) — zamiast wymagać drugiego dotknięcia.
        if (tts.isSpeaking) {
            if (auto) return
            try { tts.stop(); pendingSpeech.set(0) } catch (_: Exception) {}
        }
        if (!Brain.isConfigured(this)) { speak("Najpierw otwórz Gadacza i podaj adres serwera oraz klucz."); return }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { speak("Brak rozpoznawania mowy na tym telefonie."); return }
        // Pause the wake-word recognizer so two mics don't fight (it resumes after handle()).
        try { wakeRec?.cancel(); wakeRec?.destroy() } catch (_: Exception) {}; wakeRec = null
        busy = true
        setBubble("🎤")
        recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    busy = false; setBubble("🗣️")
                    if (!text.isNullOrBlank()) handle(text)
                    else if (auto) endConversation()
                }
                override fun onError(error: Int) {
                    busy = false; setBubble("🗣️")
                    if (auto) { endConversation(); return }  // cisza = koniec rozmowy, bez marudzenia
                    if (error == SpeechRecognizer.ERROR_NO_MATCH) speak("Nie usłyszałem. Dotknij i powiedz jeszcze raz.")
                }
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
            // Cierpliwość: nie ucinaj w pół zdania, gdy użytkownik zbiera myśli.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
        }
        try { recognizer?.startListening(intent) } catch (e: Exception) { busy = false; setBubble("🗣️"); speak("Błąd mikrofonu.") }
    }

    /** Cisza albo pożegnanie — rozmowa skończona; wraca zwykły czuwający stan. */
    private fun endConversation() {
        convPending = false
        if (wakeMode) restartWake(800)
    }

    private fun handle(text: String) {
        convPending = false  // nowe polecenie zamyka poprzednie okno rozmowy
        // Pożegnanie kończy rozmowę od razu — bez pytania serwera.
        val bye = text.lowercase().trim().trim('.', ',', '!')
        if (Regex("^(koniec|dość|dosyć|dziękuję|dzięki|nic|to wszystko|stop|cicho|do widzenia|na razie|dobranoc)$").matches(bye)) {
            speak("Dobrze, jestem w pobliżu.")
            if (wakeMode) restartWake(1500)
            return
        }
        setBubble("🧠")
        try { tts.stop(); pendingSpeech.set(0) } catch (_: Exception) {}   // clear old speech, then QUEUE step announcements
        Thread {
            try {
                // Full task loop — Gadacz drives across screens until the goal is done.
                Brain.runTask(this, text, history) { s -> speak(s) }
            } catch (e: Exception) {
                speak("Błąd połączenia z serwerem.")
            } finally {
                setBubble(if (wakeMode) "👂" else "🗣️")
                // 💬 Tryb rozmowy: gdy Gadacz skończy mówić odpowiedź, sam otworzy
                // mikrofon na Twoje kolejne zdanie (maybeContinueConversation).
                convPending = true
                if (pendingSpeech.get() <= 0) maybeContinueConversation()
            }
        }.start()
    }

    // QUEUE_ADD so step announcements ("Otwieram…", "Wpisuję…") play in sequence
    // instead of cutting each other off. handle() flushes once at the start.
    // Unikalne id + licznik: wiemy, kiedy OSTATNIE zdanie wybrzmiało → tryb rozmowy.
    private fun speak(text: String) {
        pendingSpeech.incrementAndGet()
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, "g${uttSeq++}")
    }
    private fun setBubble(emoji: String) { bubble?.post { bubble?.text = emoji } }

    override fun onDestroy() {
        try { bubble?.let { wm.removeView(it) } } catch (_: Exception) {}
        try { wakeRec?.destroy() } catch (_: Exception) {}
        recognizer?.destroy(); tts.stop(); tts.shutdown()
        super.onDestroy()
    }
}
