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
    // ⏳ Do KIEDY (zegar telefonu) rozmowa toleruje ciszę — ustawiane z wyboru
    // użytkownika (Ustawienia → czas rozmowy). Long.MAX_VALUE = „ciągle".
    private var convUntil = 0L
    private fun convDeadline(): Long {
        val s = Brain.convWaitSec(this)
        return if (s < 0) Long.MAX_VALUE else android.os.SystemClock.elapsedRealtime() + s * 1000L
    }
    private val pendingSpeech = java.util.concurrent.atomic.AtomicInteger(0)
    private var uttSeq = 0
    @Volatile private var taskRunning = false   // trwa zadanie — dotknięcie je przerywa
    // Wake-word: continuously listen; act only when speech starts with "Gadacz".
    private var wakeMode = false
    private var wakeRec: SpeechRecognizer? = null
    private var wakeStopping = false
    private var wakeErrors = 0   // narastający odstęp przy kolejnych błędach — mniej baterii

    override fun onBind(intent: Intent?): IBinder? = null

    // START_NOT_STICKY: don't let Android auto-restart us after the app is killed or
    // data is cleared — a restart with no mic permission would crash-loop.
    // 🔁 START_STICKY: gdy Android ubije usługę (pamięć/bateria), SAM ją wznowi —
    // Gadacz wraca do życia bez dotykania telefonu. Kluczowe dla ciągłej pracy.
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

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
            askIgnoreBatteryOptimizations()   // raz: żeby system nie usypiał Gadacza
            // 🛟 Lustro pamięci — kopia faktów w telefonie; przywraca po utracie na serwerze.
            Brain.syncMemoryMirror(this) { n -> speak("Przywróciłem $n faktów z kopii w telefonie.") }
            // 🔔 Piętro 4: silnik zdarzeń — co minutę reguły (przypomnienia, bateria).
            val rulesTick = object : Runnable {
                override fun run() {
                    try { Brain.tickRules(this@GadaczOverlayService).forEach { speak(it) } } catch (_: Exception) {}
                    bubble?.postDelayed(this, 60_000)
                }
            }
            bubble?.postDelayed(rulesTick, 60_000)
        } catch (e: Exception) {
            try { stopSelf() } catch (_: Exception) {}
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            Brain.applyVoice(this, tts)   // kobiecy, sieciowy głos zamiast „starej Ivony"
            // Wiemy, KIEDY Gadacz skończył mówić — wtedy (w trybie rozmowy) sam
            // otwieramy mikrofon na odpowiedź użytkownika.
            tts.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                override fun onStart(id: String?) {
                    // 🗡️ Gdy Gadacz ZACZYNA mówić — włącz strażnika przerwania: można
                    // mu wejść w słowo, jak człowiekowi (tryb stały, rozmowa, zadania).
                    if (wakeMode || convPending || taskRunning) bubble?.post { startGuard() }
                }
                override fun onDone(id: String?) { if (pendingSpeech.decrementAndGet() <= 0) { duckStop(); bubble?.post { afterSpeech() }; maybeContinueConversation() } }
                @Deprecated("api") override fun onError(id: String?) { if (pendingSpeech.decrementAndGet() <= 0) { duckStop(); bubble?.post { afterSpeech() }; maybeContinueConversation() } }
            })
        }
    }

    /** Po ostatnim wypowiedzianym zdaniu — jeśli trwa rozmowa — słuchaj dalej sam. */
    private fun maybeContinueConversation() {
        if (!convPending || busy) return
        bubble?.postDelayed({
            if (convPending && !busy) { convPending = false; startListening(auto = true) }
        }, 150)   // mikrofon otwiera się niemal od razu po ostatnim słowie Gadacza
    }

    private fun buildNotification(): Notification {
        val chanId = "gadacz"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(chanId, "Gadacz", NotificationManager.IMPORTANCE_LOW))
        }
        // Dotknięcie powiadomienia otwiera Gadacza — a samo powiadomienie (kanał LOW,
        // ongoing) trzyma usługę żywą i daje Androidowi znak „to ma działać cały czas".
        val tapOpen = try {
            android.app.PendingIntent.getActivity(this, 0,
                Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                android.app.PendingIntent.FLAG_IMMUTABLE)
        } catch (_: Exception) { null }
        return Notification.Builder(this, chanId)
            .setContentTitle("Gadacz działa")
            .setContentText("Jestem w pobliżu — dotknij przycisku albo powiedz Gadacz")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .also { if (tapOpen != null) it.setContentIntent(tapOpen) }
            .build()
    }

    /** 🔋 Poproś RAZ o zwolnienie z oszczędzania baterii — inaczej system usypia
     *  usługę po chwili bez ekranu i Gadacz „gaśnie". Prosimy delikatnie, raz. */
    private fun askIgnoreBatteryOptimizations() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
            if (Brain.prefs(this).getBoolean("batt_asked", false)) return
            val pm = getSystemService(POWER_SERVICE) as android.os.PowerManager
            if (pm.isIgnoringBatteryOptimizations(packageName)) return
            Brain.prefs(this).edit().putBoolean("batt_asked", true).apply()
            val i = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(android.net.Uri.parse("package:$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(i)
        } catch (_: Exception) {}
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

        // 👁️ ŚWIADOMOŚĆ EKRANU: gdy na wierzch wejdzie nowa aplikacja, Gadacz mówi jej
        // nazwę — dzięki temu osoba niewidoma cały czas WIE, gdzie jest. Opt-in
        // (pref „watch_screen"), i nigdy nie przerywa: milczy, gdy pracuje albo mówi.
        GadaczAccessibilityService.onScreenChange = { pkg ->
            if (Brain.prefs(this).getBoolean("watch_screen", false) && !busy && !taskRunning
                && !tts.isSpeaking && pendingSpeech.get() <= 0) {
                val name = Brain.appLabel(this, pkg)
                if (name.isNotBlank()) speak("Otworzyłeś: $name.")
            }
        }
    }

    // ── 🗡️ STRAŻNIK PRZERWANIA — słucha, GDY GADACZ MÓWI, żeby dało się mu wejść
    // w słowo jak człowiekowi. Mikrofon słyszy wtedy też WŁASNY głos Gadacza, więc
    // strażnik reaguje WYŁĄCZNIE na: „stop / cicho / zamilcz / dość" (ucina mowę
    // i słucha) oraz „Gadacz + polecenie" (ucina i od razu wykonuje). Zwykłe słowa
    // ignoruje — inaczej echo odpowiedzi udawałoby polecenia. Działa też na
    // wynikach CZĘŚCIOWYCH — reaguje w pół słowa, bez czekania na koniec zdania.
    private var guardRec: SpeechRecognizer? = null
    @Volatile private var bargeDone = false
    private fun startGuard() {
        if (busy || guardRec != null) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return
        // Strażnik PRZEJMUJE mikrofon od czuwania na czas mówienia/zadania —
        // dwa rozpoznawacze naraz walczą o mikrofon. Czuwanie wraca w afterSpeech().
        try { wakeRec?.cancel(); wakeRec?.destroy() } catch (_: Exception) {}; wakeRec = null
        bargeDone = false
        guardRec = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                    if (!handleBargeIn(text)) restartGuardSoon()
                }
                override fun onPartialResults(p: Bundle?) {
                    val text = p?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                    handleBargeIn(text)
                }
                override fun onError(error: Int) { restartGuardSoon() }
                override fun onReadyForSpeech(p0: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(p0: Float) {}
                override fun onBufferReceived(p0: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(p0: Int, p1: Bundle?) {}
            })
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        try { guardRec?.startListening(intent) } catch (_: Exception) { stopGuard() }
    }
    private fun stopGuard() { try { guardRec?.destroy() } catch (_: Exception) {}; guardRec = null }
    private fun restartGuardSoon() {
        stopGuard()
        // Wznów strażnika, póki jest czego pilnować: Gadacz mówi ALBO trwa zadanie
        // (w zadaniu głosowe „stop" musi działać cały czas, nie tylko przy mowie).
        bubble?.postDelayed({ if ((tts.isSpeaking || pendingSpeech.get() > 0 || taskRunning) && !busy) startGuard() }, 150)
    }
    /** Po WYBRZMIENIU ostatniego zdania: strażnik schodzi z posterunku, a gdy nie
     *  trwa rozmowa ani zadanie — czuwanie na słowo „Gadacz" wraca na swoje miejsce. */
    private fun afterSpeech() {
        if (taskRunning) return   // zadanie trwa — strażnik pilnuje dalej (głosowe „stop")
        stopGuard()
        if (wakeMode && !convPending && !busy) restartWake(250)
    }
    /** true = przerwanie obsłużone (mowa ucięta; mikrofon otwarty albo zadanie przerwane). */
    private fun handleBargeIn(text: String): Boolean {
        if (text.isBlank() || bargeDone) return bargeDone
        val n = normPl(text)
        val cmd = findWakeCommand(text)
        val stop = Regex("\\b(stop|cicho|zamilcz|dosc|dosyc)\\b").containsMatchIn(n)
        if (cmd == null && !stop) return false
        bargeDone = true
        stopGuard()
        try { tts.stop() } catch (_: Exception) {}
        pendingSpeech.set(0); duckStop()
        // ⏹ W TRAKCIE ZADANIA: głosowe „stop" przerywa je natychmiast — bez szukania
        // przycisku palcem. Nowe polecenie podasz za chwilę (stary wątek musi zgasnąć).
        if (taskRunning) {
            Brain.cancelRequested = true
            speak("Już przerywam." + if (cmd != null && cmd.isNotBlank()) " Powiedz za chwilę jeszcze raz, co mam zrobić." else "")
            return true
        }
        if (cmd != null && cmd.isNotBlank()) {
            handle(cmd)   // „Gadacz, zrób X" w trakcie mowy = ucina i robi X
        } else {
            // Samo „stop"/„Gadacz" — ucina mowę i od razu słucha, co powiesz.
            convPending = true; convUntil = convDeadline()
            bubble?.postDelayed({ if (!busy && !taskRunning) startListening(auto = true) }, 200)
        }
        return true
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
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                    wakeErrors = 0
                    val cmd = findWakeCommand(text)
                    if (cmd != null) {
                        if (cmd.isNotBlank()) { handle(cmd); return } // handle() restarts wake loop when done
                        // Samo „Gadacz" bez polecenia — odpowiedz i CZEKAJ na polecenie
                        // (mikrofon otworzy się sam po „Słucham?" — tryb rozmowy).
                        speak("Słucham?")
                        convPending = true
                        convUntil = convDeadline()   // po „Słucham?" też rozmawiaj naturalnie, bez „Gadacz"
                        return
                    }
                    restartWake(300)
                }
                override fun onError(error: Int) {
                    // 🗡️ CISZA to nie błąd: „nikt nic nie mówił" (NO_MATCH/TIMEOUT) to
                    // normalny rytm czuwania — wracaj do słuchania NATYCHMIAST, żeby
                    // tryb stały nie miał głuchych dziur. Narastający odstęp (do 4s)
                    // zostaje tylko przy PRAWDZIWYCH błędach (sieć, zajęty mikrofon).
                    val cisza = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                    if (cisza) { wakeErrors = 0; restartWake(350); return }
                    wakeErrors = (wakeErrors + 1).coerceAtMost(3)
                    restartWake((500L shl wakeErrors).coerceAtMost(4000L))
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
        }
        try { wakeRec?.startListening(intent) } catch (_: Exception) { restartWake(800) }
    }
    private fun restartWake(delayMs: Long) {
        // Nie wznawiaj nasłuchu słowa-klucza, gdy TRWA zadanie — inaczej rozpoznawacz
        // łapie własną mowę Gadacza jako polecenia. Audyt 10.07.
        if (!wakeMode || wakeStopping || busy || taskRunning) { if (wakeMode && !busy && !taskRunning) setBubble("👂") ; return }
        bubble?.postDelayed({ if (wakeMode && !busy && !taskRunning) startWakeLoop() }, delayMs)
    }

    /**
     * Wyrozumiałe łapanie słowa-klucza: bez polskich znaków i wielkości liter,
     * z odmianą („Gadaczu", „Gadacza" też budzi). Zwraca polecenie PO słowie,
     * "" gdy padło samo słowo, null gdy słowa nie było.
     */
    private fun normPl(s: String): String {
        val map = mapOf('ą' to 'a', 'ć' to 'c', 'ę' to 'e', 'ł' to 'l', 'ń' to 'n',
            'ó' to 'o', 'ś' to 's', 'ź' to 'z', 'ż' to 'z')
        return s.lowercase().map { map[it] ?: it }.joinToString("")
    }
    private fun findWakeCommand(text: String): String? {
        val n = normPl(text)
        val w = normPl(Brain.wakeWord(this))
        val stem = if (w.length >= 5) w.dropLast(1) else w   // „gadac" łapie gadaczu/gadacza
        var i = n.indexOf(w)
        if (i < 0) i = n.indexOf(stem)
        if (i < 0) return null
        var end = i + stem.length
        while (end < n.length && !n[end].isWhitespace() && n[end] !in ",.!?") end++   // dokończ odmienione słowo
        return text.substring(minOf(end, text.length)).trim().trimStart(',', '.', ' ')
    }

    // ── Voice in (SpeechRecognizer works from a service, unlike the Activity flow) ──
    // auto=true → mikrofon otwarty przez TRYB ROZMOWY (po odpowiedzi), nie dotknięciem:
    // wtedy cisza kończy rozmowę po cichu (bez „nie usłyszałem") i wraca nasłuch słowa-klucza.
    private fun startListening(auto: Boolean = false) {
        // Dotknięcie w TRAKCIE zadania = „stop, przerwij" — użytkownik musi mieć
        // hamulec, gdy Gadacz klika coś nie tak.
        if (taskRunning) { if (!auto) { Brain.cancelRequested = true; try { tts.stop() } catch (_: Exception) {}; pendingSpeech.set(0); duckStop(); speak("Przerywam.") }; return }
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
        stopGuard()   // strażnik przerwania też oddaje mikrofon
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

    /**
     * Cisza w trakcie rozmowy. Jak z człowiekiem — pauza NIE kończy rozmowy:
     * słuchamy dalej, aż minie CZAS wybrany przez użytkownika w Ustawieniach
     * (5 sekund do godziny albo „ciągle"). Dopiero wtedy wracamy do czuwania.
     */
    private fun endConversation() {
        if (convPending && android.os.SystemClock.elapsedRealtime() < convUntil) {
            bubble?.postDelayed({ if (convPending && !busy && !taskRunning) startListening(auto = true) }, 150)
            return
        }
        convPending = false
        if (wakeMode) restartWake(500)
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
        // „Zmień głos" załatwiamy na miejscu — bez serwera (musi mówić NOWYM głosem).
        if (Regex("^(zmień|zmien) (głos|glos)( .*)?$").matches(bye) || bye == "inny głos" || bye == "inny glos") {
            speak(Brain.nextVoice(this, tts))
            convPending = true
            return
        }
        setBubble("🧠")
        try { tts.stop(); pendingSpeech.set(0) } catch (_: Exception) {}   // clear old speech, then QUEUE step announcements
        taskRunning = true
        startGuard()   // 🗡️ od PIERWSZEJ sekundy zadania głosowe „stop" działa
        Thread {
            try {
                // Full task loop — Gadacz drives across screens until the goal is done.
                Brain.runTask(this, text, history) { s -> speak(s) }
            } catch (e: Exception) {
                speak("Błąd połączenia z serwerem.")
            } finally {
                taskRunning = false
                // Bezpiecznik przyciszenia: po zadaniu muzyka MUSI wrócić, nawet gdy
                // licznik mowy utknął (TTS nie odpalił utterance). Audyt 10.07.
                if (pendingSpeech.get() <= 0) { pendingSpeech.set(0); duckStop() }
                setBubble(if (wakeMode) "👂" else "🗣️")
                // 💬 Tryb rozmowy: po odpowiedzi Gadacz sam otwiera mikrofon i słucha
                // dalej — możesz mówić naturalnie, bez powtarzania „Gadacz". Cisza jest
                // tolerowana przez czas wybrany w Ustawieniach (convUntil).
                convPending = true
                convUntil = convDeadline()
                if (pendingSpeech.get() <= 0) maybeContinueConversation()
            }
        }.start()
    }

    // 🔉 PRZYCISZANIE: gdy Gadacz mówi, muzyka/film (YouTube, Spotify) cichnie samo
    // (audio focus z opcją "duck"), a po ostatnim zdaniu wraca do pełnej głośności.
    private var focusReq: android.media.AudioFocusRequest? = null
    private fun duckStart() {
        try {
            val am = getSystemService(AUDIO_SERVICE) as android.media.AudioManager
            if (Build.VERSION.SDK_INT >= 26) {
                if (focusReq == null) focusReq = android.media.AudioFocusRequest
                    .Builder(android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ASSISTANT).build())
                    .build()
                am.requestAudioFocus(focusReq!!)
            } else @Suppress("DEPRECATION") am.requestAudioFocus(
                null, android.media.AudioManager.STREAM_MUSIC,
                android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        } catch (_: Exception) {}
    }
    private fun duckStop() {
        try {
            val am = getSystemService(AUDIO_SERVICE) as android.media.AudioManager
            if (Build.VERSION.SDK_INT >= 26) focusReq?.let { am.abandonAudioFocusRequest(it) }
            else @Suppress("DEPRECATION") am.abandonAudioFocus(null)
        } catch (_: Exception) {}
    }

    // QUEUE_ADD so step announcements ("Otwieram…", "Wpisuję…") play in sequence
    // instead of cutting each other off. handle() flushes once at the start.
    // Unikalne id + licznik: wiemy, kiedy OSTATNIE zdanie wybrzmiało → tryb rozmowy.
    private fun speak(text: String) {
        if (pendingSpeech.incrementAndGet() == 1) duckStart()
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, "g${uttSeq++}")
    }
    private fun setBubble(emoji: String) { bubble?.post { bubble?.text = emoji } }

    override fun onDestroy() {
        GadaczAccessibilityService.onScreenChange = null   // koniec świadomości ekranu
        try { bubble?.let { wm.removeView(it) } } catch (_: Exception) {}
        try { wakeRec?.destroy() } catch (_: Exception) {}
        try { guardRec?.destroy() } catch (_: Exception) {}
        recognizer?.destroy(); tts.stop(); tts.shutdown()
        super.onDestroy()
    }
}
