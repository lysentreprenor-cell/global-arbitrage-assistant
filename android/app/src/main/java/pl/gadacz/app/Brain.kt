package pl.gadacz.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.content.pm.PackageManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Shared brain: talks to the user's own server (/api/assistant/ask) and turns the
 * returned {say, action, args} into real phone actions. Used by both the main
 * screen and the always-on floating button, so behaviour is identical everywhere.
 */
object Brain {
    private val http = OkHttpClient.Builder()
        .callTimeout(70, TimeUnit.SECONDS).readTimeout(70, TimeUnit.SECONDS).build()

    /** Użytkownik chce PRZERWAĆ trwające zadanie (dotknięcie przycisku w trakcie). */
    @Volatile var cancelRequested = false

    fun prefs(ctx: Context) = ctx.getSharedPreferences("gadacz", Context.MODE_PRIVATE)

    /**
     * 🎙️ Głos Gadacza. Telefon ma zwykle KILKA polskich głosów (Google TTS) — domyślny
     * bywa drewniany jak stara Ivona. Wybieramy KOBIECY, SIECIOWY (najładniejszy):
     * u Google'a polski głos „oda" jest kobiecy, a wersje "network" brzmią jak człowiek.
     * Użytkownik może przełączać głosy komendą „zmień głos" — wybór zapamiętujemy.
     */
    fun applyVoice(ctx: Context, tts: android.speech.tts.TextToSpeech) {
        try {
            tts.language = java.util.Locale("pl", "PL")
            val pl = tts.voices?.filter { it.locale.language == "pl" }?.sortedBy { it.name } ?: return
            if (pl.isEmpty()) return
            val saved = prefs(ctx).getString("voice_name", "") ?: ""
            val v = pl.firstOrNull { it.name == saved }
                ?: pl.firstOrNull { it.name.contains("oda") && it.name.contains("network") }
                ?: pl.firstOrNull { it.name.contains("oda") }
                ?: pl.firstOrNull { it.name.contains("network") }
                ?: pl.first()
            tts.voice = v
            tts.setPitch(1.03f)        // odrobinę wyżej — cieplej, mniej maszynowo
            tts.setSpeechRate(1.0f)
        } catch (_: Exception) { /* zostaje domyślny */ }
    }

    /** Przełącz na następny polski głos i zapamiętaj. Zwraca zdanie do wypowiedzenia NOWYM głosem. */
    fun nextVoice(ctx: Context, tts: android.speech.tts.TextToSpeech): String {
        return try {
            val pl = tts.voices?.filter { it.locale.language == "pl" }?.sortedBy { it.name } ?: emptyList()
            if (pl.size < 2) return "Ten telefon ma tylko jeden polski głos. Doinstaluj głosy w ustawieniach syntezatora Google."
            val cur = tts.voice?.name ?: ""
            val idx = pl.indexOfFirst { it.name == cur }
            val nxt = pl[(idx + 1 + pl.size) % pl.size]
            prefs(ctx).edit().putString("voice_name", nxt.name).apply()
            tts.voice = nxt
            "Mówię teraz tym głosem. Podoba się? Jak nie, powiedz jeszcze raz: zmień głos."
        } catch (_: Exception) { "Nie udało się zmienić głosu." }
    }
    fun serverUrl(ctx: Context) = prefs(ctx).getString("server_url", "") ?: ""
    fun anthropicKey(ctx: Context) = prefs(ctx).getString("anthropic_key", "") ?: ""
    fun pin(ctx: Context) = prefs(ctx).getString("app_pin", "") ?: ""
    fun wakeWord(ctx: Context) = (prefs(ctx).getString("wake_word", "") ?: "").lowercase().trim().ifBlank { "gadacz" }
    fun isConfigured(ctx: Context) = serverUrl(ctx).isNotBlank() && anthropicKey(ctx).isNotBlank()

    /** Ask the server. history = list of role→content pairs. Blocking (call off main thread). */
    fun ask(ctx: Context, question: String, history: List<Pair<String, String>>, screenDump: String? = null, imageBase64: String? = null): JSONObject {
        val msgs = JSONArray()
        history.takeLast(12).forEach { (role, content) ->
            msgs.put(JSONObject().put("role", role).put("content", content))
        }
        val body = JSONObject().apply {
            put("anthropicKey", anthropicKey(ctx))
            put("question", if (screenDump != null) "EKRAN: $screenDump\n\nPolecenie: $question" else question)
            put("history", msgs)
            put("clientTime", SimpleDateFormat("EEEE, d MMMM yyyy, HH:mm", Locale("pl", "PL")).format(Date()))
            // 📸 Zrzut ekranu — AI widzi ekran naprawdę, nie tylko listę napisów.
            if (imageBase64 != null) { put("imageBase64", imageBase64); put("mediaType", "image/jpeg") }
        }
        val req = Request.Builder()
            .url(serverUrl(ctx).trimEnd('/') + "/api/assistant/ask")
            .header("x-bot-pin", pin(ctx))   // app PIN — required when the server is locked
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { r -> return JSONObject(r.body?.string() ?: "{}") }
    }

    /**
     * Run a whole task, not just one screen. Loops: read screen → ask AI for the
     * next single step → do it → re-read → repeat, until the AI says it's done
     * (next=false) or a safety cap. This is what makes Gadacz drive the WHOLE
     * phone across many screens, not just the current one. Call off the main thread.
     */
    fun runTask(ctx: Context, goal: String, history: ArrayList<Pair<String, String>>, speak: (String) -> Unit) {
        // Keep conversation memory bounded — a long multi-step task must not grow it forever.
        while (history.size > 16) history.removeAt(0)
        var step = 0
        // 🗺️ Plan zadania: przy złożonym zadaniu AI w 1. kroku układa plan (2-5 etapów).
        // Trzymamy go i doklejamy do każdego kolejnego pytania, żeby AI nie gubiło drogi
        // w połowie — proste zadania planu nie mają i kończą się jednym strzałem.
        var plan = ""
        // Porażka kroku (nie znalazł przycisku, pole nie przyjęło tekstu) MUSI wrócić
        // do AI — inaczej AI nie wie, że krok nie wyszedł, błądzi i porzuca zadanie.
        var lastError = ""
        cancelRequested = false
        while (step < if (plan.isBlank()) 14 else 20) {
            if (cancelRequested) { cancelRequested = false; speak("Dobrze, przerywam zadanie."); return }
            val svcNow = GadaczAccessibilityService.instance
            val screen = svcNow?.readScreen()
            // 📸 Oko: przy pracy na ekranie doklejamy zrzut — AI widzi ikony i układ.
            val shot = svcNow?.screenshotBase64()
            val question = buildString {
                append(goal)
                if (plan.isNotBlank()) append("\n\nPLAN ZADANIA (trzymaj się go): $plan\nWykonano już kroków: $step. Sprawdź na EKRANIE, który etap jest zrobiony, i wykonaj następny.")
                if (lastError.isNotBlank()) append("\n\nUWAGA: poprzedni krok NIE WYSZEDŁ: $lastError Spróbuj INACZEJ — inny dokładny napis z EKRANU, scroll żeby odsłonić element, paste zamiast type, albo inna droga do celu. Nie przerywaj zadania.")
            }
            val resp = try { ask(ctx, question, history, screen, shot) } catch (e: Exception) { speak("Błąd połączenia z serwerem."); return }
            lastError = ""
            val say = resp.optString("say", "")
            val action = resp.optString("action", "none")
            val args = resp.optJSONObject("args") ?: JSONObject()
            val next = resp.optBoolean("next", false)
            val newPlan = resp.optString("plan", "")
            if (newPlan.isNotBlank() && plan.isBlank()) { plan = newPlan; speak("Plan: $plan") }
            history.add("user" to goal); history.add("assistant" to say)
            // Speak intermediate steps only briefly (keep it snappy); full result spoken at the end.
            if (say.isNotBlank() && next) speak(say)
            val spoken = execute(ctx, action, args, say) { s -> speak(s) }
            // Rozpoznaj porażkę kroku po komunikacie — poleci do AI w następnym pytaniu.
            if (spoken.startsWith("Nie znalazłem") || spoken.startsWith("Nie ma pola") ||
                spoken.startsWith("Nie udało") || spoken.startsWith("To pole nie") ||
                spoken.startsWith("Nie mam czego")) lastError = spoken
            // Akcje JEDNORAZOWE robią się w całości za jednym razem (budzik, minutnik,
            // telefon, SMS, latarka, głośność, SOS, otwarcie ustawień, pytania...). Po nich
            // KOŃCZYMY — nawet gdy AI błędnie poprosi o kolejny krok — inaczej budzik
            // ustawiałby się 4 razy, bo ekran się nie zmienia i AI próbuje w kółko.
            val terminal = action in setOf(
                "none", "alarm", "timer", "call", "sms", "save_contact", "flashlight",
                "volume", "quick_settings", "notifications", "settings", "status",
                "read_notifications", "sos", "emergency_call", "app_action",
                "maps", "search", "open", "youtube", "navigate",
                "remember", "recall", "forget_all"
            )
            if (!next || terminal) { if (spoken.isNotBlank()) speak(spoken); return }
            // Adaptive settle — wait only as long as each action needs, so it's fast.
            val settle = when (action) {
                "open_app", "open" -> 1900L
                "tap", "tap_at", "enter" -> 850L
                "long_press" -> 1000L
                "scroll" -> 450L
                "type", "write" -> 400L
                "back", "home", "recents" -> 650L
                else -> 800L
            }
            try { Thread.sleep(settle) } catch (_: Exception) {}
            step++
        }
        speak(if (plan.isBlank()) "Zrobiłem kilka kroków. Powiedz, co dalej."
              else "Wyczerpałem kroki planu. Powiedz, co dalej, albo dokończ ostatni etap ręcznie.")
    }

    /**
     * Execute an action. Returns a spoken confirmation/erratum string.
     * `speak` lets the caller stream a follow-up (e.g. screen summary) asynchronously.
     */
    fun execute(ctx: Context, action: String, args: JSONObject, say: String, speak: (String) -> Unit): String {
        val svc = GadaczAccessibilityService.instance
        when (action) {
            "call" -> dial(ctx, args.optString("who"))?.let { return it }
            "sms" -> sms(ctx, args.optString("who"), args.optString("text"))
            "maps" -> web(ctx, "https://www.google.com/maps/search/?api=1&query=" + Uri.encode(args.optString("query")))
            "youtube" -> web(ctx, "https://www.youtube.com/results?search_query=" + Uri.encode(args.optString("query")))
            "search" -> web(ctx, "https://www.google.com/search?q=" + Uri.encode(args.optString("query")))
            "open" -> web(ctx, args.optString("url"))
            "open_app" -> openApp(ctx, args.optString("name"))?.let { learnFail(ctx); return it }
            "read_screen" -> { readScreenAsync(ctx, speak); return "" }
            "tap" -> { if (svc?.tapByText(args.optString("text"), args.optString("pos")) != true) { learnFail(ctx); return "Nie znalazłem na ekranie: ${args.optString("text")}." } }
            "tap_at" -> { if (svc?.tapAt(args.optDouble("x", -1.0), args.optDouble("y", -1.0)) != true) { learnFail(ctx); return "Nie mogę dotknąć tego miejsca." } }
            "long_press" -> { if (svc?.longPressByText(args.optString("text"), args.optString("pos")) != true) { learnFail(ctx); return "Nie znalazłem na ekranie: ${args.optString("text")}." } }
            "enter" -> { if (svc?.pressEnter() != true) { learnFail(ctx); return "Nie mam czego zatwierdzić." } }
            "paste" -> { if (svc?.pasteFocused() != true) { learnFail(ctx); return "Nie udało się wkleić. Dotknij pola, żeby zamigał kursor, i powiedz: wklej." } }
            "type" -> {
                if (svc?.typeText(args.optString("text")) != true) {
                    // Droga 2: ⌨️ klawiatura Gadacza — pisze tam, gdzie dostępność nie sięga.
                    when (svc?.typeViaIme(args.optString("text"))) {
                        "ok" -> return "Wpisuję przez klawiaturę Gadacza."
                        "disabled" -> {
                            try {
                                ctx.startActivity(Intent(android.provider.Settings.ACTION_INPUT_METHOD_SETTINGS)
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            } catch (_: Exception) {}
                            return "To pole wymaga klawiatury Gadacza. Otworzyłem ustawienia — włącz Gadacz Klawiatura, raz na zawsze, i powtórz polecenie."
                        }
                    }
                    // Droga 3: schowek + instrukcja, zamiast bezradnego „nie da się".
                    try {
                        val cb = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        cb.setPrimaryClip(android.content.ClipData.newPlainText("Gadacz", args.optString("text")))
                        learnFail(ctx)
                        return "To pole nie daje się obsłużyć. Skopiowałem tekst do schowka — przytrzymaj pole palcem i wybierz Wklej."
                    } catch (_: Exception) { learnFail(ctx); return "Nie ma pola do wpisania." }
                }
            }
            "write" -> {
                // Write the composed text into the focused field; if none, copy to clipboard.
                val text = args.optString("text")
                if (svc?.typeText(text) != true) {
                    val cb = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cb.setPrimaryClip(android.content.ClipData.newPlainText("Gadacz", text))
                    return "$say. Skopiowałem do schowka — wklej, gdzie chcesz."
                }
            }
            "back" -> svc?.goBack()
            "home" -> svc?.goHome()
            "recents" -> svc?.recents()
            "scroll" -> svc?.scroll(args.optString("dir", "down"))
            "app_action" -> return appAction(ctx, args)
            // ── System control ──────────────────────────────────────────────
            "flashlight" -> return flashlight(ctx, args.optString("on") != "false")
            "volume" -> return volume(ctx, args.optString("dir"))
            "quick_settings" -> { svc?.openQuickSettings() ?: return "Włącz sterowanie ekranem, żeby otworzyć szybkie ustawienia." }
            "notifications" -> { svc?.openNotifications() ?: return "Włącz sterowanie ekranem." }
            "settings" -> return openSettings(ctx, args.optString("what"))
            "alarm" -> return setAlarm(ctx, args.optInt("hour", -1), args.optInt("minute", 0), args.optString("message"), speak)
            "timer" -> return setTimer(ctx, args.optInt("seconds", 0))
            "status" -> return phoneStatus(ctx, args.optString("what"))
            "read_notifications" -> return toggleNotifications(ctx, args.optString("on") != "false")
            "sos" -> return sos(ctx)
            "emergency_call" -> { web(ctx, ""); ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "Otwieram numer alarmowy 112. Dotknij zielonej słuchawki, aby zadzwonić." }
            else -> {}
        }
        return say
    }

    /** Emergency: text the saved contact with a live location link (opens SMS to confirm send). */
    private fun sos(ctx: Context): String {
        val num = (prefs(ctx).getString("sos_number", "") ?: "").replace(Regex("[^\\d+]"), "")
        val loc = lastLocation(ctx)
        val where = if (loc != null) " Jestem tu: https://maps.google.com/?q=${loc.first},${loc.second}" else " Nie mam lokalizacji."
        val msg = "POMOCY! Potrzebuję pomocy.$where"
        if (num.length < 7) {
            ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return "Nie masz zapisanego kontaktu alarmowego. Otwieram 112 — dotknij słuchawki. Kontakt alarmowy ustawisz w ustawieniach Gadacza."
        }
        ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$num")).putExtra("sms_body", msg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "Otwieram wiadomość SOS z Twoją lokalizacją. Dotknij wyślij, żeby wezwać pomoc. Mogę też zadzwonić na 112."
    }
    private fun lastLocation(ctx: Context): Pair<Double, Double>? {
        return try {
            if (ctx.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
                && ctx.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) return null
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            val provs = lm.getProviders(true)
            var best: android.location.Location? = null
            for (p in provs) { val l = lm.getLastKnownLocation(p) ?: continue; if (best == null || l.accuracy < best!!.accuracy) best = l }
            best?.let { Pair(it.latitude, it.longitude) }
        } catch (e: Exception) { null }
    }

    /**
     * Ustaw budzik z WERYFIKACJĄ — nie wierzymy zegarowi na słowo.
     *
     * 1) Cichy strzał (SKIP_UI) — standard Androida.
     * 2) Po 2,5 s pytamy SYSTEM (AlarmManager.nextAlarmClock), czy najbliższy budzik
     *    dzwoni o żądanej godzinie. To jest prawda objawiona — nie zgadywanie.
     * 3) Jeśli NIE: otwieramy zegar widocznie i — tylko gdy na ekranie WIDAĆ właściwą
     *    godzinę — dotykamy „Zapisz". Gdy godziny nie widać, NIE klikamy na ślepo
     *    (żeby nie zapisać budzika na 06:00) — mówimy, co zrobić.
     * 4) Na końcu znów pytamy system i mówimy użytkownikowi PRAWDĘ: jest albo nie ma.
     */
    private fun alarmConfirmed(ctx: Context, hour: Int, minute: Int): Boolean = try {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
        val nxt = am.nextAlarmClock
        if (nxt == null) false else {
            val c = java.util.Calendar.getInstance().apply { timeInMillis = nxt.triggerTime }
            c.get(java.util.Calendar.HOUR_OF_DAY) == hour && c.get(java.util.Calendar.MINUTE) == minute
        }
    } catch (_: Exception) { false }

    private fun setAlarm(ctx: Context, hour: Int, minute: Int, message: String, speak: (String) -> Unit): String {
        if (hour < 0 || hour > 23) return "Powiedz godzinę, na przykład: ustaw budzik na siódmą."
        val hhmm = "${"%02d".format(hour)}:${"%02d".format(minute)}"
        val hh = "%02d".format(hour)
        fun fire(skipUi: Boolean) = ctx.startActivity(Intent(android.provider.AlarmClock.ACTION_SET_ALARM).apply {
            putExtra(android.provider.AlarmClock.EXTRA_HOUR, hour)
            putExtra(android.provider.AlarmClock.EXTRA_MINUTES, minute)
            if (message.isNotBlank()) putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, message)
            putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, skipUi)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        return try {
            fire(true)  // najpierw po cichu
            Thread {
                try {
                    Thread.sleep(2500)
                    if (alarmConfirmed(ctx, hour, minute)) { speak("Sprawdziłem — budzik na $hhmm jest ustawiony."); return@Thread }
                    // Cichy tryb zawiódł → widocznie, ale z głową.
                    fire(false)
                    Thread.sleep(2000)
                    val svc = GadaczAccessibilityService.instance
                    if (svc == null) { speak("Otworzyłem zegar. Sprawdź godzinę i dotknij Zapisz."); return@Thread }
                    var saved = false
                    for (attempt in 0 until 3) {
                        val dump = svc.readScreen()
                        // Klikamy Zapisz TYLKO gdy edytor pokazuje żądaną godzinę.
                        if (dump.contains(hh)) {
                            saved = listOf("Zapisz", "Save", "Gotowe", "Done", "OK")
                                .any { GadaczAccessibilityService.instance?.tapByText(it) == true }
                            if (saved) break
                        }
                        Thread.sleep(900)
                    }
                    Thread.sleep(1200)
                    if (alarmConfirmed(ctx, hour, minute)) speak("Budzik na $hhmm zapisany. Sprawdziłem — zadzwoni.")
                    else {
                        learnFail(ctx)
                        speak(if (saved) "Zapisałem, ale nie mogę potwierdzić budzika na $hhmm — możliwe, że wcześniejszy budzik dzwoni pierwszy. Sprawdź w zegarze."
                              else "Zegar nie przyjął godziny $hhmm. Na ekranie jest edytor — ustaw godzinę i dotknij Zapisz.")
                    }
                } catch (_: Exception) {}
            }.start()
            "Ustawiam budzik na $hhmm."
        } catch (e: Exception) { "Nie udało się ustawić budzika. Powiedz, jaki masz telefon, to poprawię." }
    }
    private fun setTimer(ctx: Context, seconds: Int): String {
        if (seconds <= 0) return "Powiedz na ile, na przykład: minutnik na dziesięć minut."
        val svc = GadaczAccessibilityService.instance
        return try {
            ctx.startActivity(Intent(android.provider.AlarmClock.ACTION_SET_TIMER).apply {
                putExtra(android.provider.AlarmClock.EXTRA_LENGTH, seconds)
                // Jak przy budziku: ZAWSZE widocznie, bo cichy tryb bywa ignorowany.
                putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, false)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            val m = seconds / 60; val s = seconds % 60
            val czas = "${if (m > 0) "$m minut " else ""}${if (s > 0) "$s sekund" else ""}".trim()
            if (svc == null) {
                "Otwieram minutnik na $czas. Dotknij Start."
            } else {
                Thread {
                    try {
                        var started = false
                        for (attempt in 0 until 4) {
                            Thread.sleep(if (attempt == 0) 1600L else 800L)
                            started = listOf("Start", "Rozpocznij", "Uruchom", "Włącz")
                                .any { GadaczAccessibilityService.instance?.tapByText(it) == true }
                            if (started) break
                        }
                        if (!started) learnFail(ctx)
                    } catch (_: Exception) {}
                }.start()
                "Włączam minutnik na $czas."
            }
        } catch (e: Exception) { "Nie udało się ustawić minutnika." }
    }
    private fun phoneStatus(ctx: Context, what: String): String {
        val w = what.lowercase()
        return try {
            when {
                w.contains("bater") -> {
                    val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
                    val lvl = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
                    val charging = bm.isCharging
                    "Bateria $lvl procent${if (charging) ", ładuje się" else ""}."
                }
                w.contains("wifi") || w.contains("wi-fi") || w.contains("internet") || w.contains("sieć") -> {
                    val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
                    val net = cm.activeNetwork; val caps = net?.let { cm.getNetworkCapabilities(it) }
                    when {
                        caps == null -> "Brak połączenia z internetem."
                        caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "Połączony przez WiFi."
                        caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "Połączony przez dane komórkowe."
                        else -> "Połączony z internetem."
                    }
                }
                w.contains("miejsc") || w.contains("pamię") -> {
                    val stat = android.os.StatFs(ctx.filesDir.path)
                    val freeGb = stat.availableBytes / (1024.0 * 1024 * 1024)
                    "Wolnego miejsca około ${"%.1f".format(freeGb)} gigabajta."
                }
                else -> "Powiedz: ile baterii, czy mam WiFi, albo ile miejsca."
            }
        } catch (e: Exception) { "Nie mogę sprawdzić tej informacji." }
    }
    private fun toggleNotifications(ctx: Context, on: Boolean): String {
        Brain.prefs(ctx).edit().putBoolean("read_notifications", on).apply()
        // Ensure access is granted; if not, open the grant screen.
        val enabled = android.provider.Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")?.contains(ctx.packageName) == true
        return if (on && !enabled) {
            ctx.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            "Włącz Gadacza na liście, żeby czytał powiadomienia."
        } else if (on) "Będę czytał powiadomienia na głos." else "Przestaję czytać powiadomienia."
    }

    /** Torch on/off via CameraManager (no extra permission on most phones). */
    private fun flashlight(ctx: Context, on: Boolean): String {
        return try {
            val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
            val id = cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
                ?: return "Ten telefon nie ma latarki."
            cm.setTorchMode(id, on)
            if (on) "Latarka włączona." else "Latarka wyłączona."
        } catch (e: Exception) { "Nie udało się z latarką." }
    }

    private fun volume(ctx: Context, dir: String): String {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
        val flag = android.media.AudioManager.FLAG_SHOW_UI
        return when {
            dir == "up" || dir.contains("głoś") || dir.contains("wię") -> { am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.ADJUST_RAISE, flag); "Głośniej." }
            dir == "down" || dir.contains("cisz") || dir.contains("mniej") -> { am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.ADJUST_LOWER, flag); "Ciszej." }
            dir == "mute" || dir.contains("wycisz") -> { am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.ADJUST_MUTE, flag); "Wyciszone." }
            dir == "max" -> { am.setStreamVolume(android.media.AudioManager.STREAM_MUSIC, am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC), flag); "Maksymalna głośność." }
            else -> "Powiedz: głośniej, ciszej albo wycisz."
        }
    }

    /** Open a system settings screen/panel; accessibility can then flip the switch. */
    private fun openSettings(ctx: Context, what: String): String {
        val w = what.lowercase()
        val action = when {
            w.contains("wifi") || w.contains("wi-fi") -> if (android.os.Build.VERSION.SDK_INT >= 29) android.provider.Settings.Panel.ACTION_WIFI else android.provider.Settings.ACTION_WIFI_SETTINGS
            w.contains("bluetooth") -> android.provider.Settings.ACTION_BLUETOOTH_SETTINGS
            w.contains("dane") || w.contains("internet") || w.contains("sieć") -> if (android.os.Build.VERSION.SDK_INT >= 29) android.provider.Settings.Panel.ACTION_INTERNET_CONNECTIVITY else android.provider.Settings.ACTION_WIRELESS_SETTINGS
            w.contains("lokaliz") || w.contains("gps") -> android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS
            w.contains("dźwięk") || w.contains("głoś") -> android.provider.Settings.ACTION_SOUND_SETTINGS
            w.contains("ekran") || w.contains("jasn") || w.contains("wyświetl") -> android.provider.Settings.ACTION_DISPLAY_SETTINGS
            w.contains("bater") -> android.provider.Settings.ACTION_BATTERY_SAVER_SETTINGS
            w.contains("samolot") -> android.provider.Settings.ACTION_AIRPLANE_MODE_SETTINGS
            w.contains("aplikac") -> android.provider.Settings.ACTION_APPLICATION_SETTINGS
            else -> android.provider.Settings.ACTION_SETTINGS
        }
        return try {
            ctx.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            "Otwieram ustawienia. Powiedz „kliknij” i nazwę przełącznika, żeby go włączyć."
        } catch (e: Exception) { "Nie mogę otworzyć tych ustawień." }
    }

    /** Server-backed info/controls: BTC, weather, bot status, wallet, stop, sweep. */
    private fun appAction(ctx: Context, args: JSONObject): String {
        val base = serverUrl(ctx).trimEnd('/')
        fun get(path: String): JSONObject = http.newCall(Request.Builder().url(base + path).header("x-bot-pin", pin(ctx)).build())
            .execute().use { JSONObject(it.body?.string() ?: "{}") }
        fun post(path: String) = http.newCall(Request.Builder().url(base + path).header("x-bot-pin", pin(ctx))
            .post("".toRequestBody("application/json".toMediaType())).build()).execute().close()
        return try {
            when (args.optString("do")) {
                "btc" -> get("/api/assistant/info?do=btc").optString("say", "Brak danych.")
                "weather" -> {
                    val c = if (args.optString("city").isNotBlank()) "&city=" + Uri.encode(args.optString("city")) else ""
                    get("/api/assistant/info?do=weather$c").optString("say", "Brak pogody.")
                }
                "bot_status" -> { val s = get("/api/bot/status"); "Bot: ${s.optDouble("sessionPnl", 0.0)} dolara, ${s.optJSONArray("positions")?.length() ?: 0} pozycji." }
                "wallet" -> { val w = get("/api/bot/wallet"); "W portfelu około ${w.optDouble("totalCrypto", 0.0)} ${w.optString("valuedIn", "USD")} w krypto." }
                "bot_stop" -> { post("/api/bot/stop"); "Bot zatrzymany." }
                "sweep_dust" -> { post("/api/bot/sweep-dust"); "Wymiatam kurz z portfela." }
                else -> "Nie znam tej funkcji."
            }
        } catch (e: Exception) { "Nie udało się połączyć z serwerem." }
    }

    /**
     * Tell the server the LAST action failed on the real screen, so it learns from reality
     * (marks that phrasing [nieudane] in the journal). Fire-and-forget, off the caller's path.
     */
    private fun learnFail(ctx: Context) {
        Thread {
            try {
                val base = serverUrl(ctx).trimEnd('/')
                val body = JSONObject().put("ok", false)
                http.newCall(Request.Builder().url("$base/api/assistant/log/last-outcome")
                    .header("x-bot-pin", pin(ctx))
                    .post(body.toString().toRequestBody("application/json".toMediaType())).build())
                    .execute().close()
            } catch (_: Exception) { /* learning is best-effort */ }
        }.start()
    }

    /** Read the live screen, send it back to the AI for a blind-friendly summary, speak it. */
    private fun readScreenAsync(ctx: Context, speak: (String) -> Unit) {
        val dump = GadaczAccessibilityService.instance?.readScreen()
        if (dump == null) { speak("Nie mam dostępu do ekranu. Włącz Gadacza w Dostępności."); return }
        Thread {
            try {
                val resp = ask(ctx, "Streść mi ten ekran krótko i jasno.", emptyList(), dump)
                speak(resp.optString("say", dump.take(400)))
            } catch (e: Exception) { speak(dump.take(400)) }
        }.start()
    }

    private fun dial(ctx: Context, who: String): String? {
        val num = who.filter { it.isDigit() || it == '+' }
        if (num.length < 7) return "Nie znam numeru do: $who."
        ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$num")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return null
    }
    private fun sms(ctx: Context, who: String, text: String) {
        val num = who.filter { it.isDigit() || it == '+' }
        ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$num"))
            .putExtra("sms_body", text).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    private fun web(ctx: Context, url: String) {
        if (url.startsWith("http")) ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    /** Open ANY installed app by fuzzy spoken name. */
    private fun openApp(ctx: Context, name: String): String? {
        val pm = ctx.packageManager
        val q = name.trim().lowercase()
        if (q.isBlank()) return "Nie wiem, którą aplikację otworzyć."
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        // best match: exact label, then contains, then app whose label words overlap
        val scored = apps.mapNotNull { app ->
            val label = pm.getApplicationLabel(app).toString()
            val l = label.lowercase()
            val score = when {
                l == q -> 3
                l.contains(q) || q.contains(l) -> 2
                q.split(" ").any { it.length > 2 && l.contains(it) } -> 1
                else -> 0
            }
            if (score > 0 && pm.getLaunchIntentForPackage(app.packageName) != null) Triple(score, label, app.packageName) else null
        }.sortedByDescending { it.first }
        val hit = scored.firstOrNull() ?: return "Nie znalazłem aplikacji: $name."
        ctx.startActivity(pm.getLaunchIntentForPackage(hit.third)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return null
    }
}
