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

    /** 🆘 Zadanie utknęło i CZEKA na pomoc człowieka. Po „gotowe, jedź dalej" wznawiamy. */
    @Volatile private var pendingHelpGoal: String? = null

    /** 🏫 Przerwanie „nauki całego telefonu" (długa wyprawa po aplikacjach). */
    @Volatile var deviceLearnCancel = false

    /**
     * 💰/🆓 TRYB PRACY. Płatny = pytania idą do mądrego mózgu w chmurze (klucz
     * Anthropic). Darmowy = telefon radzi sobie SAM: odruchy, autopilot, darmowe
     * czytanie ekranu i (jeśli wgrany) lokalny mózg — zero groszy z klucza.
     * Przełączany przyciskiem i głosem; gdy skończą się środki na kluczu,
     * Gadacz przechodzi na darmowy SAM i mówi o tym.
     */
    /** 🎚️ Stopień pracy chmury: "easy" (taniej) / "normal" / "hard" (najlepszy). */
    fun workLevel(ctx: Context): String = prefs(ctx).getString("work_level", "normal") ?: "normal"
    fun setWorkLevel(ctx: Context, lvl: String) { prefs(ctx).edit().putString("work_level", lvl).apply() }

    fun paidMode(ctx: Context): Boolean = prefs(ctx).getBoolean("paid_mode", true)
    fun setPaidMode(ctx: Context, on: Boolean) { prefs(ctx).edit().putBoolean("paid_mode", on).apply() }

    /** ⏳ Ile sekund Gadacz czeka na Twój głos w rozmowie, zanim wróci do czuwania.
     *  -1 = CIĄGLE (nigdy sam nie kończy rozmowy). Domyślnie 15 sekund. */
    fun convWaitSec(ctx: Context): Int = prefs(ctx).getInt("conv_wait_sec", 15)
    fun setConvWaitSec(ctx: Context, sec: Int) { prefs(ctx).edit().putInt("conv_wait_sec", sec).apply() }

    /**
     * 📶 Czym można sterować przez Bluetooth — wylicza SPAROWANE urządzenia i mówi,
     * co Gadacz z każdym potrafi. Smart-dom (żarówki, gniazdka) chodzi zwykle po
     * Wi-Fi/Zigbee, nie po Bluetooth — o tym też uczciwie informujemy.
     * Zwraca gotowy tekst do przeczytania na głos.
     */
    fun bluetoothReport(ctx: Context): String {
        val mgr = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? android.bluetooth.BluetoothManager
        val adapter = mgr?.adapter ?: return "To urządzenie nie ma Bluetooth albo nie mam do niego dostępu."
        // Android 12+ wymaga zgody BLUETOOTH_CONNECT, żeby czytać listę urządzeń.
        if (android.os.Build.VERSION.SDK_INT >= 31 &&
            ctx.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            return "Potrzebuję zgody na Bluetooth. Otwórz ustawienia Gadacza i zezwól na Bluetooth, potem powiedz jeszcze raz: sprawdź Bluetooth."
        }
        if (!adapter.isEnabled) return "Bluetooth jest wyłączony. Włącz go w ustawieniach telefonu i powiedz jeszcze raz: sprawdź Bluetooth."
        val bonded = try { adapter.bondedDevices?.toList() ?: emptyList() } catch (_: Exception) { emptyList() }
        if (bonded.isEmpty()) return "Bluetooth jest włączony, ale nie masz jeszcze żadnego sparowanego urządzenia. Sparuj je raz w ustawieniach telefonu, a potem będę nimi zarządzał."
        val sb = StringBuilder("Masz ${bonded.size} sparowanych urządzeń Bluetooth. ")
        for (d in bonded.take(12)) {
            val name = try { d.name } catch (_: Exception) { null } ?: "urządzenie bez nazwy"
            val kind = try { d.bluetoothClass?.majorDeviceClass } catch (_: Exception) { null }
            val opis = when (kind) {
                android.bluetooth.BluetoothClass.Device.Major.AUDIO_VIDEO -> "głośnik lub słuchawki — mogę połączyć i sterować dźwiękiem"
                android.bluetooth.BluetoothClass.Device.Major.WEARABLE -> "opaska lub zegarek — mogę połączyć"
                android.bluetooth.BluetoothClass.Device.Major.HEALTH -> "urządzenie zdrowotne, np. ciśnieniomierz — mogę połączyć i odczytać"
                android.bluetooth.BluetoothClass.Device.Major.PHONE -> "telefon"
                android.bluetooth.BluetoothClass.Device.Major.COMPUTER -> "komputer"
                android.bluetooth.BluetoothClass.Device.Major.PERIPHERAL -> "klawiatura, myszka lub pilot"
                else -> "mogę spróbować połączyć"
            }
            sb.append("$name: $opis. ")
        }
        sb.append("Żeby połączyć, powiedz na przykład: połącz z ").append(
            (try { bonded.first().name } catch (_: Exception) { null }) ?: "głośnikiem").append(". ")
        sb.append("Uwaga: żarówki i gniazdka smart zwykle nie chodzą po Bluetooth, tylko przez swoją aplikację — nimi steruję otwierając tę aplikację.")
        return sb.toString()
    }

    /** 📶 Połącz z sparowanym urządzeniem po fragmencie nazwy (otwiera ustawienia BT). */
    /**
     * 📺 POŁĄCZ Z TV — otwiera systemowe przesyłanie ekranu (Chromecast / Smart View /
     * Miracast) i mówi, w co dotknąć. Telewizor musi być w tej samej sieci Wi-Fi,
     * a najprościej i najpewniej działa kabel USB-C do HDMI.
     */
    fun castToTv(ctx: Context): String {
        val tryOpen = { action: String ->
            try { ctx.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (_: Exception) { false }
        }
        val ok = tryOpen("android.settings.CAST_SETTINGS") ||
            tryOpen("android.settings.WIFI_DISPLAY_SETTINGS") ||
            tryOpen(android.provider.Settings.ACTION_SETTINGS)
        return if (ok)
            "Otwieram przesyłanie ekranu. Wybierz swój telewizor z listy — musi być włączony i w tej samej sieci Wi-Fi. Jeśli telewizora nie ma na liście, najpewniej zadziała kabel z telefonu do gniazda HDMI w telewizorze."
        else
            "Nie mogę otworzyć przesyłania ekranu na tym telefonie. Wejdź w ustawienia telefonu i poszukaj: Przesyłaj ekran, Smart View albo Ekran bezprzewodowy. Zawsze zadziała kabel USB-C do HDMI."
    }

    fun bluetoothConnect(ctx: Context, namePart: String): String {
        // Realne łączenie profili audio jest zależne od producenta; najpewniej i
        // najbezpieczniej: otwórz ekran Bluetooth, gdzie jednym dotknięciem łączysz.
        try { ctx.startActivity(Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        return "Otwieram ustawienia Bluetooth. Dotknij „$namePart” na liście, żeby połączyć — albo powiedz mi, co widzisz, to pokieruję."
    }

    /**
     * 🏫 Aplikacje, których Gadacz może się bezpiecznie nauczyć: dające się uruchomić,
     * BEZ banków/płatności i bez siebie samego. Zwraca pary (nazwa, pakiet).
     */
    fun learnableApps(ctx: Context): List<Pair<String, String>> {
        val pm = ctx.packageManager
        val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val bankHints = listOf("bank", "revolut", "vipps", "paypal", "santander", "mbank",
            "pekao", "pko", "millennium", "alior", "getin", "blik", "ing", "payu", "przelewy")
        return pm.queryIntentActivities(main, 0).mapNotNull { ri ->
            val pkg = ri.activityInfo?.packageName ?: return@mapNotNull null
            if (pkg == ctx.packageName) return@mapNotNull null
            val lp = pkg.lowercase()
            if (bankHints.any { lp.contains(it) }) return@mapNotNull null
            val label = ri.loadLabel(pm)?.toString()?.trim() ?: return@mapNotNull null
            if (label.isBlank()) null else label to pkg
        }.distinctBy { it.second }.sortedBy { it.first.lowercase() }
    }

    /** Przyjazna nazwa aplikacji po pakiecie (dla świadomości ekranu). */
    fun appLabel(ctx: Context, pkg: String): String = try {
        val pm = ctx.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) { "" }

    /** Otwórz aplikację po pakiecie (do nauki urządzenia). true = udało się. */
    fun launchPackage(ctx: Context, pkg: String): Boolean = try {
        ctx.packageManager.getLaunchIntentForPackage(pkg)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { ctx.startActivity(it); true } ?: false
    } catch (_: Exception) { false }

    /** Poznaj JEDNĄ otwartą aplikację (odczyt ekranu + zrzut → serwer pisze ściągę). */
    fun learnCurrentApp(ctx: Context, pkg: String): Boolean = try {
        val svc = GadaczAccessibilityService.instance ?: return false
        val screen = svc.readScreen()
        val shot = svc.screenshotBase64()
        val body = JSONObject().apply {
            put("anthropicKey", anthropicKey(ctx)); put("pkg", pkg)
            put("name", pkg.substringAfterLast(".")); put("screen", screen); put("deep", false)
            if (shot != null) { put("imageBase64", shot); put("mediaType", "image/jpeg") }
        }
        http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/learn-app")
            .header("x-bot-pin", pin(ctx))
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
            .execute().use { it.isSuccessful }
    } catch (_: Exception) { false }

    fun prefs(ctx: Context) = ctx.getSharedPreferences("gadacz", Context.MODE_PRIVATE)

    // 🏢 PIĘTRA — telefon czyta ustawienia z serwera (cache 60 s) i respektuje włączniki.
    @Volatile private var floorsCache: JSONObject? = null
    @Volatile private var floorsAt = 0L
    private fun floors(ctx: Context): JSONObject {
        val now = System.currentTimeMillis()
        floorsCache?.let { if (now - floorsAt < 60_000) return it }
        return try {
            val r = http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/floors")
                .header("x-bot-pin", pin(ctx)).build()).execute().use { JSONObject(it.body?.string() ?: "{}") }
            (r.optJSONObject("floors") ?: JSONObject()).also { floorsCache = it; floorsAt = now }
        } catch (_: Exception) { floorsCache ?: JSONObject() }
    }
    /** Czy piętro włączone? Brak połączenia/klucza = domyślnie TAK (nie blokujemy w ciemno). */
    fun floorOn(ctx: Context, key: String): Boolean = floors(ctx).optBoolean(key, true)

    // 🚫 ZABLOKOWANE APLIKACJE — Gadacz nie tyka ekranu w tych apkach (cache 60 s).
    @Volatile private var blockedCache: List<String>? = null
    @Volatile private var blockedAt = 0L
    private fun blockedApps(ctx: Context): List<String> {
        val now = System.currentTimeMillis()
        blockedCache?.let { if (now - blockedAt < 60_000) return it }
        return try {
            val r = http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/blockedapps")
                .header("x-bot-pin", pin(ctx)).build()).execute().use { JSONObject(it.body?.string() ?: "{}") }
            val arr = r.optJSONArray("blocked") ?: JSONArray()
            val list = (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.optString("match")?.lowercase()?.ifBlank { null } }
            list.also { blockedCache = it; blockedAt = now }
        } catch (_: Exception) { blockedCache ?: emptyList() }
    }
    /** Czy aplikacja na wierzchu jest zablokowana? (dla akcji ekranowych) */
    fun currentAppBlocked(ctx: Context): Boolean {
        val pkg = GadaczAccessibilityService.instance?.currentPackage()?.lowercase() ?: return false
        if (pkg.isBlank()) return false
        return blockedApps(ctx).any { pkg.contains(it) }
    }

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

    /**
     * 🩺 POŁĄCZENIE Z SERWEREM (Replit): czy żyje, jak szybko odpowiada.
     * wake=true → pukamy kilka razy z rzędu, żeby uśpiony serwer zdążył wstać.
     * Zwraca gotowy tekst do przeczytania na głos — zawsze uczciwy.
     */
    fun serverReport(ctx: Context, wake: Boolean): String {
        val base = serverUrl(ctx).trimEnd('/')
        if (base.isBlank()) return "Nie masz ustawionego adresu serwera. Wejdź w Ustawienia, Połączenia, i wpisz adres z Replit."
        val tries = if (wake) 6 else 1
        for (i in 1..tries) {
            val t0 = System.currentTimeMillis()
            try {
                http.newCall(Request.Builder().url("$base/api/assistant/persona").header("x-bot-pin", pin(ctx)).build())
                    .execute().use { r ->
                        if (r.isSuccessful) {
                            val s = (System.currentTimeMillis() - t0) / 1000
                            return if (s < 2) "Serwer działa i odpowiada od ręki. Wszystko gra."
                            else "Serwer działa, odpowiedział po $s sekundach."
                        }
                        if (r.code == 401) return "Serwer działa, ale prosi o PIN aplikacji. Sprawdź PIN w Ustawieniach."
                    }
            } catch (_: Exception) {}
            if (i < tries) try { Thread.sleep(4000) } catch (_: Exception) {}
        }
        return if (wake)
            "Nie udało się dobudzić serwera. Darmowy Replit wstaje dopiero, gdy otworzysz go w przeglądarce i naciśniesz Run."
        else
            "Serwer nie odpowiada — pewnie śpi. Powiedz: obudź serwer, a spróbuję go dobudzić. Jak się nie uda, otwórz Replit i naciśnij Run."
    }
    fun pin(ctx: Context) = prefs(ctx).getString("app_pin", "") ?: ""
    fun wakeWord(ctx: Context) = (prefs(ctx).getString("wake_word", "") ?: "").lowercase().trim().ifBlank { "gadacz" }
    /**
     * 🧠 Nauka w SEKCJACH — osobne włączniki (stary wspólny "learning_enabled" służy
     * jako domyślna wartość, więc dawne ustawienie użytkownika przeżywa aktualizację):
     *  - przepisy  = nauka OBSŁUGI APLIKACJI (udane drogi zadań)
     *  - dziennik  = nauka UŻYTKOWNIKA (jak mówisz → co działa; porażki kliknięć)
     * Pamięć faktów nie ma włącznika — zapisuje się tylko na wyraźne „zapamiętaj".
     */
    fun learnRecipesOn(ctx: Context) = prefs(ctx).getBoolean("learn_recipes", prefs(ctx).getBoolean("learning_enabled", true))
    fun learnJournalOn(ctx: Context) = prefs(ctx).getBoolean("learn_journal", prefs(ctx).getBoolean("learning_enabled", true))

    /** Pobierz jedną sekcję nauki z serwera jako czytelny JSON ("" gdy niedostępna). */
    fun fetchSection(ctx: Context, path: String, key: String): String {
        return try {
            http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + path).header("x-bot-pin", pin(ctx)).build())
                .execute().use { r ->
                    val body = r.body?.string() ?: return ""
                    if (!r.isSuccessful) return ""
                    val data = JSONObject(body).opt(key) ?: return ""
                    JSONObject().put(key, data).toString(2)
                }
        } catch (_: Exception) { "" }
    }

    /**
     * 🛟 LUSTRO PAMIĘCI — polisa na wypadek utraty danych na serwerze (Replit potrafi
     * przywrócić stary „checkpoint" i skasować pliki). Telefon trzyma kopię faktów:
     *  - serwer MA pamięć → odśwież kopię w telefonie,
     *  - serwer PUSTY, a telefon ma kopię → wgraj ją z powrotem (samo-przywracanie).
     * Wołane przy każdym starcie aplikacji i pływającego przycisku.
     */
    fun syncMemoryMirror(ctx: Context, onRestored: (Int) -> Unit = {}) {
        Thread {
            try {
                val base = serverUrl(ctx).trimEnd('/')
                if (base.isBlank()) return@Thread
                val resp = http.newCall(Request.Builder().url("$base/api/assistant/memory")
                    .header("x-bot-pin", pin(ctx)).build())
                    .execute().use { r -> if (!r.isSuccessful) return@Thread else r.body?.string() ?: return@Thread }
                val arr = JSONObject(resp).optJSONArray("memory") ?: return@Thread
                val p = prefs(ctx)
                if (arr.length() > 0) {
                    p.edit().putString("memory_mirror", arr.toString()).apply()
                } else {
                    val mirror = p.getString("memory_mirror", "") ?: ""
                    if (mirror.isNotBlank()) {
                        val facts = JSONArray(mirror)
                        if (facts.length() > 0) {
                            val text = buildString { for (i in 0 until facts.length()) appendLine(facts.optString(i)) }
                            val n = addKnowledge(ctx, text)
                            if (n > 0) onRestored(n)
                        }
                    }
                }
            } catch (_: Exception) { /* polisa jest best-effort */ }
        }.start()
    }

    /** ➕ Wyślij wklejoną WIEDZĘ na serwer — tnie ją tam na fakty. Zwraca ile dodano (-1 = błąd). */
    fun addKnowledge(ctx: Context, text: String): Int = try {
        val body = JSONObject().put("text", text)
        http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/memory/bulk")
            .header("x-bot-pin", pin(ctx))
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
            .execute().use { r ->
                if (!r.isSuccessful) -1
                else JSONObject(r.body?.string() ?: "{}").optInt("added", -1)
            }
    } catch (_: Exception) { -1 }

    /** 🎭 Który SYSTEM (osobowość) jest wybrany na serwerze. "" = nie udało się pobrać. */
    fun fetchPersona(ctx: Context): String = try {
        http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/persona")
            .header("x-bot-pin", pin(ctx)).build())
            .execute().use { r ->
                val p = if (!r.isSuccessful) "" else JSONObject(r.body?.string() ?: "{}").optString("persona", "")
                if (p.isNotBlank()) prefs(ctx).edit().putString("persona_cache", p).apply()  // zapamiętaj — offline też będziemy wiedzieć
                p
            }
    } catch (_: Exception) { "" }

    /** 🎭 Ostatnio znana twarz (z pamięci telefonu) — działa też bez internetu. */
    fun cachedPersona(ctx: Context): String = prefs(ctx).getString("persona_cache", "niewidomi") ?: "niewidomi"

    /** 🆓 Czy AKTYWNA twarz umie działać BEZ internetu? Tylko Ogólny i Dla niewidomych —
     *  reszta (Prawnik, Lekarz...) potrzebuje mądrego mózgu z chmury. */
    fun faceWorksOffline(ctx: Context): Boolean = cachedPersona(ctx) in setOf("niewidomi", "ogolny", "auto")

    /**
     * 🔀 AUTO-PRZEŁĄCZANIE TWARZY: gdy fachowiec (Prawnik, Programista...) potrzebuje
     * internetu, a sieci nie ma — Gadacz SAM przeskakuje na Ogólny (działa offline),
     * żeby nie zamilknąć. Zapamiętuje poprzednią twarz i wraca do niej, gdy sieć
     * wróci. true = przełączył się teraz.
     */
    fun autoOfflineSwitch(ctx: Context, speak: (String) -> Unit): Boolean {
        if (faceWorksOffline(ctx)) return false
        val prev = cachedPersona(ctx)
        prefs(ctx).edit().putString("face_offline_backup", prev)
            .putString("persona_cache", "ogolny").apply()
        speak("Nie ma internetu, a twarz ${prev} go potrzebuje. Przełączam się na Ogólny, żeby działać dalej — wrócę do niej, gdy sieć wróci.")
        return true
    }

    /** 🔙 Sieć wróciła — wróć do twarzy sprzed auto-przełączenia (jeśli była). */
    fun restoreFaceIfNeeded(ctx: Context, speak: (String) -> Unit) {
        val back = prefs(ctx).getString("face_offline_backup", "") ?: ""
        if (back.isBlank()) return
        prefs(ctx).edit().putString("persona_cache", back).remove("face_offline_backup").apply()
        Thread { try { setPersona(ctx, back) } catch (_: Exception) {} }.start()
        speak("Internet wrócił — wracam do twarzy: $back.")
    }

    /** 🎭 Ustaw SYSTEM (osobowość) na serwerze — telefon i strona www widzą to samo. */
    fun setPersona(ctx: Context, key: String): Boolean = try {
        val body = JSONObject().put("persona", key)
        http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/persona")
            .header("x-bot-pin", pin(ctx))
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
            .execute().use { it.isSuccessful }
    } catch (_: Exception) { false }

    // ── 🗂 ROZMOWY Z TWARZAMI — auto-zapis każdej wymiany zdań na serwerze,
    // projekty „na stałe" i wracanie do nich po nazwie. Wszystko głosem.

    /** Dopisz wymianę zdań do bieżącej rozmowy aktywnej twarzy (w tle, bez hałasu). */
    // 🗂 ROZMOWY MIESZKAJĄ NA TELEFONIE (stabilny dysk) — serwer to tylko kopia dla
    // strony www. Dzięki temu restart Replita NIGDY nie kasuje Twoich rozmów.
    private fun convFile(ctx: Context) = java.io.File(ctx.filesDir, "gadacz_convs.json")
    private fun convLoadAll(ctx: Context): org.json.JSONArray = try {
        val f = convFile(ctx); if (!f.exists()) org.json.JSONArray() else org.json.JSONArray(f.readText())
    } catch (_: Exception) { org.json.JSONArray() }
    private fun convSaveAll(ctx: Context, arr: org.json.JSONArray) { try { convFile(ctx).writeText(arr.toString()) } catch (_: Exception) {} }
    /** Projekty na stałe zostają ZAWSZE; zwykłe czaty: 25 najnowszych na twarz i w oknie dni. */
    private fun convPrune(ctx: Context, arr: org.json.JSONArray): org.json.JSONArray {
        val days = prefs(ctx).getInt("conv_keep_days", 0)
        val cutoff = if (days > 0) System.currentTimeMillis() - days * 86400000L else 0L
        val keep = org.json.JSONArray()
        val perPersona = HashMap<String, Int>()
        val items = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.sortedByDescending { it.optLong("updated") }
        for (o in items) {
            if (o.optBoolean("permanent")) { keep.put(o); continue }
            if (cutoff > 0 && o.optLong("updated") < cutoff) continue
            val p = o.optString("persona"); val c = (perPersona[p] ?: 0) + 1; perPersona[p] = c
            if (c <= 25) keep.put(o)
        }
        return keep
    }

    fun convAppend(ctx: Context, user: String, assistant: String) {
        try {
            val persona = cachedPersona(ctx)
            val arr = convLoadAll(ctx)
            var conv = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
                .firstOrNull { it.optString("persona") == persona && it.optBoolean("open") }
            val now = System.currentTimeMillis()
            if (conv == null) {
                conv = JSONObject().put("id", now.toString() + "_" + arr.length()).put("persona", persona)
                    .put("title", user.take(60).ifBlank { "rozmowa" }).put("permanent", false)
                    .put("open", true).put("updated", now).put("messages", org.json.JSONArray())
                arr.put(conv)
            }
            val msgs = conv.optJSONArray("messages") ?: org.json.JSONArray().also { conv.put("messages", it) }
            if (user.isNotBlank()) msgs.put(JSONObject().put("role", "user").put("text", user.take(2000)))
            if (assistant.isNotBlank()) msgs.put(JSONObject().put("role", "assistant").put("text", assistant.take(4000)))
            while (msgs.length() > 400) msgs.remove(0)
            conv.put("updated", now)
            convSaveAll(ctx, convPrune(ctx, arr))
        } catch (_: Exception) {}
        // Kopia na serwer (dla www) — best-effort, brak sieci nic nie psuje.
        try {
            val body = JSONObject().put("persona", cachedPersona(ctx)).put("user", user.take(2000)).put("assistant", assistant.take(4000))
            http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/conversation/append")
                .header("x-bot-pin", pin(ctx)).post(body.toString().toRequestBody("application/json".toMediaType())).build())
                .execute().use { }
        } catch (_: Exception) {}
    }

    /** Zamknij bieżącą rozmowę twarzy — następne zdania trafią do świeżej. */
    fun convNew(ctx: Context): Boolean {
        try {
            val persona = cachedPersona(ctx)
            val arr = convLoadAll(ctx)
            (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.filter { it.optString("persona") == persona }.forEach { it.put("open", false) }
            convSaveAll(ctx, arr)
        } catch (_: Exception) {}
        try {
            val body = JSONObject().put("persona", cachedPersona(ctx))
            http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/conversation/new")
                .header("x-bot-pin", pin(ctx)).post(body.toString().toRequestBody("application/json".toMediaType())).build())
                .execute().use { }
        } catch (_: Exception) {}
        return true
    }

    /** Zapisz ostatnią rozmowę twarzy NA STAŁE (projekt). Zwraca nazwę albo null. */
    fun convKeep(ctx: Context, title: String?): String? {
        var result: String? = null
        try {
            val persona = cachedPersona(ctx)
            val arr = convLoadAll(ctx)
            val best = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
                .filter { it.optString("persona") == persona }.maxByOrNull { it.optLong("updated") }
            if (best != null) {
                best.put("permanent", true)
                if (!title.isNullOrBlank()) best.put("title", title.take(60))
                convSaveAll(ctx, arr)
                result = best.optString("title").ifBlank { null }
            }
        } catch (_: Exception) {}
        try {
            val body = JSONObject().put("persona", cachedPersona(ctx)).put("title", title ?: "")
            http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/conversation/keep")
                .header("x-bot-pin", pin(ctx)).post(body.toString().toRequestBody("application/json".toMediaType())).build())
                .execute().use { }
        } catch (_: Exception) {}
        return result
    }

    /** Lista rozmów aktywnej twarzy: (tytuł, czy na stałe), od najnowszej — z TELEFONU. */
    fun convList(ctx: Context): List<Pair<String, Boolean>> = try {
        val persona = cachedPersona(ctx)
        val arr = convLoadAll(ctx)
        (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
            .filter { it.optString("persona") == persona }
            .sortedByDescending { it.optLong("updated") }
            .map { it.optString("title") to it.optBoolean("permanent") }
    } catch (_: Exception) { emptyList() }

    /** Wczytaj rozmowę/projekt po nazwie (z TELEFONU): (tytuł, wiadomości). null = brak. */
    fun convLoad(ctx: Context, q: String): Pair<String, List<Pair<String, String>>>? = try {
        val persona = cachedPersona(ctx)
        val nq = normPl(q).trim()
        val arr = convLoadAll(ctx)
        val pool = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }.filter { it.optString("persona") == persona }
        val hit = pool.firstOrNull { normPl(it.optString("title")).trim() == nq }
            ?: pool.filter { normPl(it.optString("title")).contains(nq) }.maxByOrNull { it.optLong("updated") }
        if (hit == null) null else {
            pool.forEach { it.put("open", false) }
            hit.put("open", true)
            convSaveAll(ctx, arr)
            val msgs = hit.optJSONArray("messages") ?: org.json.JSONArray()
            val listMsgs = (0 until msgs.length()).mapNotNull { i ->
                val m = msgs.optJSONObject(i) ?: return@mapNotNull null
                m.optString("role") to m.optString("text")
            }
            hit.optString("title").ifBlank { "rozmowa" } to listMsgs.takeLast(24)
        }
    } catch (_: Exception) { null }

    /** 🎭 NARADA — pytanie do WSZYSTKICH twarzy naraz. Lista (etykieta, odpowiedź). */
    fun roundtable(ctx: Context, question: String, history: List<Pair<String, String>>): List<Pair<String, String>> = try {
        val msgs = org.json.JSONArray()
        history.takeLast(6).forEach { (role, content) ->
            msgs.put(JSONObject().put("role", role).put("content", content))
        }
        val body = JSONObject()
            .put("question", question)
            .put("history", msgs)
            .put("anthropicKey", anthropicKey(ctx))
        http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/roundtable")
            .header("x-bot-pin", pin(ctx))
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
            .execute().use { r ->
                val o = JSONObject(r.body?.string() ?: "{}")
                if (!r.isSuccessful) return listOf("Błąd" to o.optString("error", "Narada się nie udała."))
                val arr = o.optJSONArray("answers") ?: return emptyList()
                (0 until arr.length()).mapNotNull { i ->
                    val a = arr.optJSONObject(i) ?: return@mapNotNull null
                    a.optString("label") to a.optString("answer")
                }
            }
    } catch (_: Exception) { listOf("Błąd" to "Nie mam połączenia z serwerem.") }

    // ── 🖐️ RĘCE GADACZA — czytanie i zapisywanie własnego kodu (przez serwer → GitHub).
    fun githubToken(ctx: Context): String = prefs(ctx).getString("github_token", "") ?: ""
    fun setGithubToken(ctx: Context, t: String) { prefs(ctx).edit().putString("github_token", t.trim()).apply() }

    /** Przeczytaj plik z WŁASNEGO repo. Zwraca treść/listę folderu albo komunikat błędu. */
    fun selfRead(ctx: Context, path: String): Pair<Boolean, String> = try {
        http.newCall(Request.Builder()
            .url(serverUrl(ctx).trimEnd('/') + "/api/assistant/self-code?path=" + java.net.URLEncoder.encode(path, "UTF-8"))
            .header("x-bot-pin", pin(ctx)).header("x-github-token", githubToken(ctx)).build())
            .execute().use { r ->
                val o = JSONObject(r.body?.string() ?: "{}")
                when {
                    !r.isSuccessful -> false to o.optString("error", "Błąd serwera ${r.code}.")
                    o.has("dir") -> {
                        val arr = o.optJSONArray("dir")
                        val names = (0 until (arr?.length() ?: 0)).joinToString("\n") { arr!!.optString(it) }
                        true to "To folder. Zawartość:\n$names"
                    }
                    else -> true to o.optString("content", "")
                }
            }
    } catch (_: Exception) { false to "Nie mogę połączyć się z serwerem." }

    /** Zapisz plik do WŁASNEGO repo (commit na gałąź roboczą). Zwraca komunikat. */
    fun selfWrite(ctx: Context, path: String, content: String, message: String): Pair<Boolean, String> = try {
        val body = JSONObject().put("path", path).put("content", content).put("message", message)
        http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/self-code")
            .header("x-bot-pin", pin(ctx)).header("x-github-token", githubToken(ctx))
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
            .execute().use { r ->
                val o = JSONObject(r.body?.string() ?: "{}")
                if (!r.isSuccessful) false to o.optString("error", "Błąd serwera ${r.code}.")
                else true to "Wypchnięte! Commit ${o.optString("commit")}. Robot GitHuba buduje około pięciu minut."
            }
    } catch (_: Exception) { false to "Nie mogę połączyć się z serwerem." }

    /**
     * 🤖 SAMODZIELNY PROGRAMISTA — dajesz zadanie, Gadacz sam czyta pliki, zmienia je
     * i commituje, bez pytania o pozwolenia. Pętla trwa, więc długi czas oczekiwania.
     */
    fun selfAgent(ctx: Context, task: String): Pair<Boolean, String> = try {
        val body = JSONObject().put("task", task).put("anthropicKey", anthropicKey(ctx))
        val client = okhttp3.OkHttpClient.Builder()
            .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(300, java.util.concurrent.TimeUnit.SECONDS)
            .callTimeout(0, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        client.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/self-agent")
            .header("x-bot-pin", pin(ctx)).header("x-github-token", githubToken(ctx))
            .post(body.toString().toRequestBody("application/json".toMediaType())).build())
            .execute().use { r ->
                val o = JSONObject(r.body?.string() ?: "{}")
                if (!r.isSuccessful) false to o.optString("error", "Błąd serwera ${r.code}.")
                else {
                    val changed = o.optJSONArray("changed")
                    val files = if (changed != null && changed.length() > 0)
                        " Zmienione pliki: " + (0 until changed.length()).joinToString(", ") { changed.optString(it) } +
                        ". Robot GitHuba buduje około pięciu minut." else ""
                    true to (o.optString("summary", "Gotowe.") + files)
                }
            }
    } catch (_: Exception) { false to "Nie mogę połączyć się z serwerem albo zadanie trwało za długo." }

    /** ⏳ Ile dni żyją zwykłe czaty (0 = bez limitu) — trzymane w TELEFONIE. */
    fun convKeepDays(ctx: Context): Int = prefs(ctx).getInt("conv_keep_days", 0)

    fun convSetKeepDays(ctx: Context, days: Int): Boolean {
        prefs(ctx).edit().putInt("conv_keep_days", days).apply()
        try {
            val body = JSONObject().put("keepDays", days)
            http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/conversation/config")
                .header("x-bot-pin", pin(ctx)).post(body.toString().toRequestBody("application/json".toMediaType())).build())
                .execute().use { }
        } catch (_: Exception) {}
        return true
    }

    /**
     * 🗂 Odruchy ROZMÓW — wołane z runTask, bo tylko tam mamy dostęp do pamięci
     * rozmowy (history) telefonu. true = obsłużone, AI nie jest budzone.
     */
    fun convReflex(ctx: Context, raw: String, history: ArrayList<Pair<String, String>>, speak: (String) -> Unit): Boolean {
        val n = normPl(raw).trim()
        if (Regex("^(nowa rozmowa|zacznij nowa rozmowe|zaczynamy od nowa|nowy temat)$").matches(n)) {
            history.clear()
            Thread { convNew(ctx) }.start()
            speak("Dobrze, zaczynam nową rozmowę. Poprzednia jest zapisana — możesz do niej wrócić.")
            return true
        }
        Regex("^zapisz (te |ta )?(rozmowe|projekt)( na stale)?( jako (.+))?$").find(n)?.let { m ->
            val title = m.groupValues[5].trim().ifBlank { null }
            val saved = convKeep(ctx, title)
            speak(if (saved != null) "Zapisane na stałe jako: $saved. Powiedz kiedyś: wczytaj projekt $saved — i wrócimy dokładnie tu, gdzie skończyliśmy."
                  else "Nie udało się zapisać. Sprawdź połączenie z serwerem i czy jest zaktualizowany.")
            return true
        }
        Regex("^(wczytaj|otworz|wroc do|przywroc) (rozmowe|rozmowy|projekt|projektu)( o nazwie)? (.+)$").find(n)?.let { m ->
            val q = m.groupValues[4].trim()
            val loaded = convLoad(ctx, q)
            if (loaded == null) { speak("Nie znalazłem rozmowy o nazwie: $q. Powiedz: jakie mam projekty — to przeczytam listę."); return true }
            val (title, msgs) = loaded
            history.clear()
            msgs.takeLast(12).forEach { history.add(it) }
            val last = msgs.lastOrNull { it.first == "assistant" }?.second?.take(200)
            speak("Wczytałem: $title." + (last?.let { " Ostatnio mówiłem: $it" } ?: "") + " Kontynuujemy.")
            return true
        }
        if (Regex("^(jakie mam|wymien|lista|pokaz)( moje| zapisane)? (rozmowy|projekty)$").matches(n)) {
            val list = convList(ctx)
            if (list.isEmpty()) { speak("Ta twarz nie ma jeszcze zapisanych rozmów. Rozmowy zapisują się same — a duże projekty utrwalisz mówiąc: zapisz projekt na stałe."); return true }
            val txt = list.take(10).joinToString(". ") { (t, perm) -> if (perm) "$t — na stałe" else t }
            speak("Masz ${list.size} rozmów. Najnowsze: $txt. Powiedz: wczytaj projekt i nazwa — żeby wrócić.")
            return true
        }
        Regex("^(usun|skasuj) (rozmowe|projekt)( o nazwie)? (.+)$").find(n)?.let { m ->
            val q = m.groupValues[4].trim()
            val ok = try {
                val body = JSONObject().put("q", q)
                http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/conversation/delete")
                    .header("x-bot-pin", pin(ctx))
                    .post(body.toString().toRequestBody("application/json".toMediaType())).build())
                    .execute().use { it.isSuccessful }
            } catch (_: Exception) { false }
            speak(if (ok) "Usunąłem rozmowę: $q." else "Nie znalazłem rozmowy o nazwie: $q.")
            return true
        }
        return false
    }

    /** Wyczyść jedną sekcję nauki na serwerze. */
    fun clearSection(ctx: Context, clearPath: String): Boolean = try {
        http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + clearPath).header("x-bot-pin", pin(ctx))
            .post("".toRequestBody("application/json".toMediaType())).build())
            .execute().use { it.isSuccessful }
    } catch (_: Exception) { false }

    /**
     * Pobierz WSZYSTKIE nauczone dane z serwera (pamięć, dziennik, przepisy) jako czytelny
     * JSON. Każda część osobno i odpornie — gdy serwer nie zna jeszcze któregoś adresu
     * (stary kod przed git pull), bierzemy to, co jest, zamiast wywalać całość.
     */
    fun fetchLearnedData(ctx: Context): String {
        val base = serverUrl(ctx).trimEnd('/')
        fun part(path: String, key: String): Any? = try {
            http.newCall(Request.Builder().url(base + path).header("x-bot-pin", pin(ctx)).build())
                .execute().use { r ->
                    val body = r.body?.string() ?: return null
                    if (!r.isSuccessful) return null
                    JSONObject(body).opt(key)
                }
        } catch (_: Exception) { null }
        val mem = part("/api/assistant/memory", "memory")
        val log = part("/api/assistant/log", "log")
        val rec = part("/api/assistant/recipes", "recipes")
        if (mem == null && log == null && rec == null) return ""
        return try {
            JSONObject()
                .put("pamięć_faktów", mem ?: "(niedostępne)")
                .put("dziennik_nauki", log ?: "(niedostępne)")
                .put("przepisy_dróg", rec ?: "(niedostępne — serwer wymaga aktualizacji: git pull)")
                .toString(2)
        } catch (_: Exception) { "" }
    }

    /** Skasuj nauczone dane (dziennik + przepisy). Pamięci faktów celowo NIE rusza. */
    fun clearLearnedData(ctx: Context): Boolean {
        val base = serverUrl(ctx).trimEnd('/')
        fun post(path: String) = try {
            http.newCall(Request.Builder().url(base + path).header("x-bot-pin", pin(ctx))
                .post("".toRequestBody("application/json".toMediaType())).build()).execute().close(); true
        } catch (_: Exception) { false }
        val a = post("/api/assistant/log/clear")
        val b = post("/api/assistant/recipes/clear")
        return a && b
    }
    fun isConfigured(ctx: Context) = serverUrl(ctx).isNotBlank() && anthropicKey(ctx).isNotBlank()

    // ─── ⚡ PIĘTRO 1: ODRUCHY ────────────────────────────────────────────────
    // Proste, jednoznaczne polecenia wykonywane BEZ pytania AI: natychmiast (~0,2 s),
    // za darmo i bez internetu. Zasada żelazna: odruch strzela tylko przy pewności —
    // wszystko wątpliwe przepuszczamy do mózgu. Nietrafiony odruch niczego nie psuje.

    private fun normPl(s: String): String {
        val map = mapOf('ą' to 'a', 'ć' to 'c', 'ę' to 'e', 'ł' to 'l', 'ń' to 'n',
            'ó' to 'o', 'ś' to 's', 'ź' to 'z', 'ż' to 'z')
        return s.lowercase().map { map[it] ?: it }.joinToString("")
            .replace(Regex("[!?.,;]"), " ").replace(Regex("\\s+"), " ").trim()
    }

    private val NUM_WORDS = mapOf(
        "jeden" to 1, "dwa" to 2, "trzy" to 3, "cztery" to 4, "piec" to 5, "szesc" to 6,
        "siedem" to 7, "osiem" to 8, "dziewiec" to 9, "dziesiec" to 10, "jedenascie" to 11, "dwanascie" to 12)

    // Godziny słowami (rdzenie odmiany: „siódma/siódmej/siódmą" → "siodm").
    private val HOUR_WORDS = listOf(
        "dwunast" to 12, "jedenast" to 11, "dziesiat" to 10, "dziewiat" to 9, "osm" to 8,
        "siodm" to 7, "szost" to 6, "piat" to 5, "czwart" to 4, "trzeci" to 3, "drug" to 2, "pierwsz" to 1)

    private fun fixPm(n: String, h: Int, m: Int): Pair<Int, Int> =
        if ((n.contains("wieczor") || n.contains("po poludniu")) && h in 1..11) (h + 12) to m else h to m

    // Nazwy dni zawierają rdzenie godzin (czwart-ek=4, piąt-ek=5) — bez tego „obudź w
    // czwartek" ustawiał budzik na 04:00. Gdy w zdaniu jest dzień, nie zgadujemy godziny
    // ze słów-rdzeni. Audyt 10.07.
    private fun hasWeekday(n: String) =
        Regex("poniedzia|wtorek|srod|czwartek|piatek|sobot|niedziel").containsMatchIn(n)

    /** „na 7:30" / „na 9" / „na dziewiątą" / „wpół do ósmej" → (godzina, minuty). null=niejasne. */
    private fun parseTimePl(n: String): Pair<Int, Int>? {
        // „za X godzin/minut" to czas trwania, nie godzina zegarowa — oddaj do AI.
        if (Regex("\\bza \\d").containsMatchIn(n) || n.contains("za godzin") || n.contains("za pol")) return null
        if (n.contains("wpol do")) {
            val tail = n.substringAfter("wpol do")
            Regex("\\b(\\d{1,2})\\b").find(tail)?.let { val h = it.groupValues[1].toInt(); if (h in 1..24) return fixPm(n, if (h == 1) 12 else h - 1, 30) }
            for ((stem, h) in HOUR_WORDS) if (tail.contains(stem)) return fixPm(n, if (h == 1) 12 else h - 1, 30)
            return null
        }
        Regex("(\\d{1,2})[:.](\\d{2})").find(n)?.let {
            val h = it.groupValues[1].toInt(); val m = it.groupValues[2].toInt()
            if (h in 0..23 && m in 0..59) return fixPm(n, h, m)
        }
        Regex("\\b(\\d{1,2})\\b").find(n)?.let { val h = it.groupValues[1].toInt(); if (h in 0..23) return fixPm(n, h, 0) }
        // Słowa-godziny TYLKO gdy w zdaniu NIE ma nazwy dnia (inaczej „czwartek"→4).
        if (!hasWeekday(n)) for ((stem, h) in HOUR_WORDS) if (n.contains(stem)) return fixPm(n, h, 0)
        return null
    }

    /** „5 minut" / „30 sekund" / „pół godziny" / „kwadrans" → sekundy (0 = nie wiem). */
    private fun parseDurationPl(n: String): Int {
        fun num(s: String) = s.take(6).toIntOrNull() ?: 0   // max 6 cyfr, bez wyjątku. Audyt 10.07.
        if (n.contains("poltorej godziny")) return 5400
        if (n.contains("pol godziny")) return 1800
        if (n.contains("kwadrans")) return 900
        Regex("(\\d+)\\s*godzin").find(n)?.let { return num(it.groupValues[1]) * 3600 + (Regex("godzin\\D+(\\d+)\\s*min").find(n)?.let { m -> num(m.groupValues[1]) * 60 } ?: 0) }
        if (n.contains("godzin")) return 3600
        Regex("(\\d+)\\s*min").find(n)?.let { return num(it.groupValues[1]) * 60 }
        Regex("(\\d+)\\s*sek").find(n)?.let { return num(it.groupValues[1]) }
        for ((w, v) in mapOf("pietnascie" to 15, "dwadziescia" to 20, "dziesiec" to 10, "piec" to 5,
            "cztery" to 4, "trzy" to 3, "dwie" to 2, "jedna" to 1))
            if (n.contains("$w minut")) return v * 60
        return 0
    }

    // ─── 🔔 PIĘTRO 4: ZDARZENIA — reguły „gdy X → powiedz Y" ────────────────
    private fun loadRules(ctx: Context): JSONArray =
        try { JSONArray(prefs(ctx).getString("rules", "[]") ?: "[]") } catch (_: Exception) { JSONArray() }
    private fun saveRules(ctx: Context, r: JSONArray) { prefs(ctx).edit().putString("rules", r.toString()).apply() }
    private fun addTimeRule(ctx: Context, hh: Int, mm: Int, text: String) {
        val r = loadRules(ctx)
        r.put(JSONObject().put("type", "time").put("h", hh).put("m", mm).put("text", text))
        saveRules(ctx, r)
    }

    /** Silnik zdarzeń — wołany co minutę przez pływający przycisk. Zwraca komunikaty. */
    fun tickRules(ctx: Context): List<String> {
        val out = ArrayList<String>()
        val cal = java.util.Calendar.getInstance()
        val hh = cal.get(java.util.Calendar.HOUR_OF_DAY); val mm = cal.get(java.util.Calendar.MINUTE)
        val today = SimpleDateFormat("yyyyMMdd", Locale.US).format(Date())
        val p = prefs(ctx)
        val rules = loadRules(ctx)
        for (i in 0 until rules.length()) {
            val r = rules.optJSONObject(i) ?: continue
            if (r.optString("type") == "time" && r.optInt("h") == hh && r.optInt("m") == mm) {
                // Klucz po TREŚCI+godzinie, nie indeksie — inaczej nowe przypomnienie na
                // zwolnionym indeksie dziedziczyło „już odpalone" i milczało. Audyt 10.07.
                val key = "rf_${today}_${r.optInt("h")}_${r.optInt("m")}_${r.optString("text").hashCode()}"
                if (!p.getBoolean(key, false)) {
                    p.edit().putBoolean(key, true).apply()
                    out.add("Przypomnienie: ${r.optString("text")}.")
                }
            }
        }
        // 👥 Piętro 9: OPIEKUN — długi brak aktywności → propozycja powiadomienia bliskiej osoby.
        // (Każde użycie Gadacza odświeża znacznik; tu tylko sprawdzamy ciszę.)
        try {
            val last = p.getLong("last_active", System.currentTimeMillis())
            val sos = p.getString("sos_number", "") ?: ""
            val quietH = (System.currentTimeMillis() - last) / 3_600_000
            if (sos.length >= 7 && quietH >= 24 && !p.getBoolean("guardian_warned", false)) {
                p.edit().putBoolean("guardian_warned", true).apply()
                out.add("Nie korzystałeś ze mnie od doby. Powiedz »wszystko dobrze«, albo powiem »napisz do opiekuna«, żebym wysłał wiadomość, że u Ciebie cisza.")
            }
        } catch (_: Exception) {}
        // Czujnik baterii — ostrzeż raz przy każdym zejściu poniżej progu.
        if (p.getBoolean("rule_battery", true)) {
            try {
                val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
                val lvl = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
                if (lvl in 0..100) {   // -1 / śmieciowy odczyt nie może zafałszować progu. Audyt 10.07.
                    val was = p.getInt("last_batt", 100)
                    if (lvl <= 15 && was > 15 && !bm.isCharging) out.add("Uwaga: bateria $lvl procent. Podłącz ładowarkę.")
                    p.edit().putInt("last_batt", lvl).apply()
                }
            } catch (_: Exception) {}
        }
        return out
    }

    // ─── 🛡️ PIĘTRO 5: STRAŻNIK — groźne przyciski wymagają potwierdzenia ────
    @Volatile private var pendingDangerTap: String? = null
    private val DANGER = listOf("zaplac", "kup teraz", "zamow", "przelej", "pieniadze",
        "usun", "skasuj", "przelew", "platnosc", "pay", "buy", "delete", "wyslij do wszystkich",
        // Publikacja ogłoszenia = punkt bez odwrotu → tylko po „potwierdzam".
        "wystaw", "opublikuj", "dodaj ogloszenie", "zakoncz i dodaj", "publikuj")
    fun isDanger(label: String): Boolean {
        val l = normPl(label)
        return l.isNotBlank() && DANGER.any { l.contains(it) }
    }

    // ─── 🤏 PIĘTRO 6 (lite): rozumienie niedbałej mowy bez sieci ────────────
    // „no zadzwoń no do tej... mamy" — wycinamy słowa-wypełniacze i próbujemy
    // odruchów jeszcze raz. Fundament pod pełny lokalny mózg w przyszłości.
    private val FILLERS = setOf("no", "prosze", "moze", "mi", "mnie", "zaraz", "ten", "ta", "to", "te",
        "tej", "tego", "hej", "ej", "kochany", "szybko", "w koncu", "a", "i")
    private fun stripFillers(n: String): String =
        n.split(" ").filter { it !in FILLERS }.joinToString(" ").trim()

    /** Rdzeń kręgowy Gadacza. true = obsłużone odruchem (AI nie jest budzone). */
    fun reflex(ctx: Context, raw: String, speak: (String) -> Unit): Boolean {
        val n0 = normPl(raw)
        if (n0.isBlank()) return false
        // 👥 Opiekun: każde polecenie = znak życia; kasuje ostrzeżenie o ciszy.
        prefs(ctx).edit().putLong("last_active", System.currentTimeMillis()).putBoolean("guardian_warned", false).apply()
        if (n0 == "wszystko dobrze" || n0 == "wszystko w porzadku" || n0 == "zyje") { speak("Cieszę się. Jestem w pobliżu."); return true }
        if (n0 == "napisz do opiekuna" || n0 == "powiadom opiekuna") { speak(sos(ctx)); return true }
        if (reflexCore(ctx, n0, raw, speak)) return true
        val n1 = stripFillers(n0)          // 🤏 druga próba: bez wypełniaczy
        return n1 != n0 && n1.isNotBlank() && reflexCore(ctx, n1, raw, speak)
    }

    private fun reflexCore(ctx: Context, n: String, raw: String, speak: (String) -> Unit): Boolean {
        val svc = GadaczAccessibilityService.instance
        fun done(s: String): Boolean { if (s.isNotBlank()) speak(s); return true }

        // 🚨 SOS — zero zwłoki, offline. Ale TYLKO wołanie o pomoc, nie prośba „pomocy
        // z telefonem": „pomocy, nie umiem wysłać zdjęcia" nie wzywa pogotowia. Audyt 10.07.
        val isHelpWithPhone = Regex("(jak |nie (umiem|wiem|moge|potrafie)|pomoz mi|z (tym|obsluga)|wyslac|zrobic|ustawic|wlaczyc)").containsMatchIn(n)
        if (floorOn(ctx, "sos") && (n == "sos" || n == "ratunku" || n == "pomocy" || n == "wezwij pomoc" || n == "potrzebuje pomocy" || Regex("^(sos|ratunku)\\b").containsMatchIn(n)) && !isHelpWithPhone)
            return done(sos(ctx))

        // 💰/🆓 PRZEŁĄCZNIK TRYBU PRACY — głosem, bez szukania przycisku.
        if (Regex("^(pracuj|dzialaj) za oplata$|^(wlacz )?tryb platny$").matches(n)) {
            setPaidMode(ctx, true)
            return done("Tryb płatny włączony. Pytania idą do mądrego mózgu w chmurze.")
        }
        if (Regex("^(pracuj|dzialaj) za darmo$|^(wlacz )?tryb darmowy$|^bez klucza$").matches(n)) {
            setPaidMode(ctx, false)
            return done("Tryb darmowy włączony. Radzę sobie sam na telefonie — nie wydaję ani grosza." +
                if (LocalBrain.available(ctx)) " Mam lokalny mózg, więc na proste pytania też odpowiem."
                else " Nie masz wgranego lokalnego mózgu, więc zrobię tylko proste komendy i znane drogi.")
        }

        // 👁️ ŚWIADOMOŚĆ EKRANU — Gadacz mówi, gdy zmienia się aplikacja na wierzchu.
        if (Regex("^(obserwuj|sledz|pilnuj)( moj)? ekran$|^(wlacz )?swiadomosc ekranu$").matches(n)) {
            prefs(ctx).edit().putBoolean("watch_screen", true).apply()
            return done("Dobrze. Będę mówił, kiedy otworzysz nową aplikację.")
        }
        if (Regex("^(przestan|nie) (obserwowac|sledzic|pilnowac)( ekran(u)?)?$|^cisza na ekran$|^wylacz swiadomosc ekranu$").matches(n)) {
            prefs(ctx).edit().putBoolean("watch_screen", false).apply()
            return done("Dobrze, przestaję mówić o zmianach ekranu.")
        }

        // ⏹ PRZERWIJ — zatrzymaj naukę telefonu i/lub bieżące zadanie.
        if (n == "przerwij" || n == "przerwij nauke" || n == "stop nauka" || n == "zatrzymaj") {
            deviceLearnCancel = true; cancelRequested = true; LocalBrain.downloadCancel = true; VoskEar.downloadCancel = true; PiperUsta.downloadCancel = true; Updater.downloadCancel = true; LlamaCpp.downloadCancel = true
            return done("Dobrze, przerywam.")
        }

        // 🆘 WZNOWIENIE po pomocy: użytkownik pomógł (palcem/podpowiedzią) i mówi
        // „jedź dalej" → wracamy do przerwanego zadania OD BIEŻĄCEGO ekranu (AI sam
        // rozpozna, co już zrobione). Bez pomocy zadania: to zwykłe „dalej".
        if (Regex("^(jedz|jed[zź] dalej|dalej|kontynuuj|gotowe jedz dalej|zrobione jedz dalej|mozesz dalej|dokoncz)$").matches(n)) {
            val g = pendingHelpGoal
            if (g != null) {
                pendingHelpGoal = null
                speak("Dobrze, jadę dalej.")
                Thread { runTask(ctx, g, ArrayList(), speak) }.start()
                return true
            }
        }

        // 🎬 NAGRYWANIE EKRANU — start/stop głosem. Zgodę systemową pokazuje
        // ekran główny Gadacza (usługa w tle nie może o nią poprosić).
        if (Regex("^(nagrywaj|nagraj|zacznij nagrywac) ekran(u)?$").matches(n)) {
            if (ScreenRecordService.running) return done("Już nagrywam ekran. Powiedz: zakończ nagrywanie — żeby zapisać film.")
            ctx.startActivity(Intent(ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("start_recording", true))
            return done("Otwieram zgodę na nagrywanie — potwierdź na ekranie.")
        }
        if (Regex("^(zakoncz|zatrzymaj|skoncz|stop) nagrywani(e|a)( ekranu)?$").matches(n)) {
            return if (ScreenRecordService.running) {
                ScreenRecordService.requestStop()
                done("Zapisane. Film jest w galerii, w folderze Gadacz.")
            } else done("Nie nagrywam teraz ekranu.")
        }

        // 🩺 SERWER (Replit): sprawdzanie i budzenie — głosem, bez przeglądarki.
        if (Regex("^(sprawdz|zbadaj) serwer(a)?$|^czy serwer (dziala|zyje|odpowiada)$|^jak serwer$").matches(n))
            return done(serverReport(ctx, false))
        if (Regex("^(obudz|wybudz|dobudz|uruchom) serwer(a)?$").matches(n)) {
            speak("Budzę serwer, daj mi pół minuty.")
            return done(serverReport(ctx, true))
        }

        // 📺 TELEWIZOR: przesyłanie EKRANU telefonu na TV (Chromecast / Smart View).
        // Telewizor łączy się przez przesyłanie ekranu, nie przez Bluetooth — otwieramy
        // właściwy ekran systemu i mówimy, w co dotknąć.
        if (Regex("^(polacz|lacz|podlacz)( sie)?( z)?( do)? (telewizor|telewizorem|telewizora|tv|telewizja)( .*)?$").matches(n)
            || Regex("^(pokaz|wyswietl|przeslij|rzuc)( ekran)?( na)? (telewizor|telewizorze|tv|telewizji)$").matches(n)
            || n == "tv" || n == "telewizor") {
            return done(castToTv(ctx))
        }

        // 📶 BLUETOOTH: czym można sterować + łączenie ze sparowanym urządzeniem.
        if (Regex("^(sprawdz|pokaz|co (mam|jest)( sparowane)?|czym (moge|mozna) sterowac)( przez)? bluetooth$").matches(n)
            || n == "bluetooth" || n == "sprawdz bluetooth" || n == "urzadzenia bluetooth") {
            return done(bluetoothReport(ctx))
        }
        Regex("^(polacz|lacz)( sie)?( z)? (.+)$").find(n)?.let { m ->
            val target = m.groupValues[4].trim()
            // Tylko sprzęt BT — nie porywamy „połącz z mamą" (to dzwonienie).
            if (Regex("bluetooth|glosnik|sluchawk|opask|zegarek|cisnieniomierz|waga").containsMatchIn(target))
                return done(bluetoothConnect(ctx, target.replace("bluetooth", "").trim().ifBlank { "urządzeniem" }))
        }

        // 👁️ DARMOWE OCZY DO TEKSTU: „przeczytaj kartkę" → zdjęcie → tekst czyta SAM
        // telefon (ML Kit, offline, 0 zł). Ulotki leków, paragony, pisma, etykiety.
        if (Regex("^(przeczytaj|odczytaj|czytaj)( mi)?( te| ta| ten| to)? ?(kartke|dokument|ulotke|paragon|pismo|list|etykiete|recepte|gazete|ksiazke|napis na czyms)( .*)?$").matches(n)) {
            ctx.startActivity(Intent(ctx, CameraCaptureActivity::class.java)
                .putExtra("mode", "ocr").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return done("")
        }

        // 📄 Piętro 1: DARMOWE czytanie ekranu — telefon sam czyta napisy, bez AI
        // (zero kosztów). Mądry OPIS ekranu („co jest na ekranie") dalej robi AI.
        if (Regex("^(przeczytaj|odczytaj|czytaj)( mi)?( caly)?( wszystkie)?( napisy( z)?)? ekran(u)?$").matches(n)) {
            if (svc == null) return done("Żeby czytać ekran, włącz sterowanie ekranem w ustawieniach Gadacza.")
            val plain = svc.readScreenPlain()
            return done(if (plain.isBlank()) "Nie widzę tekstu na tym ekranie." else plain)
        }

        // 🔎 GDZIE JEST X — oko za darmo: mówi położenie elementu (góra/dół, lewo/prawo).
        Regex("^gdzie( na ekranie)? (jest|mam|znajde) (.+)$").find(n)?.let { m ->
            val s2 = svc ?: return done("Włącz sterowanie ekranem, żebym mógł spojrzeć.")
            return done(s2.whereIs(m.groupValues[3]) ?: "Nie widzę na ekranie niczego z napisem: ${m.groupValues[3]}. Przewiń i zapytaj jeszcze raz.")
        }

        // 📖 CZYTAJ WSZYSTKO — darmowe czytanie CAŁEJ treści: czyta, przewija, czyta
        // dalej, aż do końca albo „przerwij". Artykuły, przepisy, długie rozmowy — 0 zł.
        if (Regex("^(czytaj|przeczytaj) (wszystko|caly (artykul|tekst)|cala (strone|rozmowe)|do konca)$").matches(n)) {
            val s2 = svc ?: return done("Włącz sterowanie ekranem, żebym mógł czytać.")
            speak("Czytam całość. Dotknij mnie, żeby przerwać.")
            val seen = HashSet<String>()
            var pusteRundy = 0
            for (i in 0 until 15) {   // maks ~15 ekranów — bezpiecznik przed nieskończonością
                if (cancelRequested) { cancelRequested = false; return done("Dobrze, koniec czytania.") }
                val fresh = s2.readScreenPlainList().filter { seen.add(normPl(it)) }
                if (fresh.isEmpty()) { pusteRundy++; if (pusteRundy >= 2) break } else {
                    pusteRundy = 0
                    speak(fresh.joinToString(". "))
                }
                s2.scroll("down")
                try { Thread.sleep(1200) } catch (_: Exception) {}
            }
            return done("To już koniec treści.")
        }

        // 👁️ Piętro 11: OCZY NA ŚWIAT — aparat opisuje otoczenie / czyta tekst.
        if (floorOn(ctx, "oczy")) {
            if (Regex("^(co (jest )?przede mna|co widzisz przede|opisz (co widzisz|otoczenie|obraz)|co to jest|co mam przed soba|rozejrzyj sie)$").matches(n)) {
                ctx.startActivity(Intent(ctx, CameraCaptureActivity::class.java).putExtra("mode", "describe").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true
            }
            if (Regex("^przeczytaj (to|kartke|ulotke|tekst|co tu pisze|z kartki)$").matches(n) || n == "przeczytaj z aparatu") {
                ctx.startActivity(Intent(ctx, CameraCaptureActivity::class.java).putExtra("mode", "read").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true
            }
            // 📹 Kamerka do rozmów: przedni aparat sprawdza, czy dobrze widać twarz.
            if (Regex("^(czy dobrze mnie widac|jak (wygladam|mnie widac)|czy mnie widac|sprawdz (kamerke|jak wygladam)|czy jestem w kadrze)$").matches(n)) {
                ctx.startActivity(Intent(ctx, CameraCaptureActivity::class.java).putExtra("mode", "selfie").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true
            }
        }

        // 📋 Piętro 16: PORANNY RAPORT — jedno polecenie, pełny obraz dnia.
        if (floorOn(ctx, "poranny_raport") && Regex("^(poranny raport|raport dnia|co (mnie )?dzis czeka|streszcz dzien|co nowego|podsumuj dzien)$").matches(n)) {
            Thread { morningReport(ctx, speak) }.start(); return true
        }

        // 🎓 Piętro 18: NAUCZYCIEL — Gadacz tłumaczy krok po kroku (flaga do promptu).
        if (Regex("^(naucz mnie|wytlumacz mi jak|pokaz mi jak|jak sie robi|jak obslugiwac) .+").containsMatchIn(n)) {
            prefs(ctx).edit().putBoolean("teach_mode", true).apply()   // zdejmowane po odpowiedzi w ask()
        }

        // 🛡️ Potwierdzenie groźnego przycisku wstrzymanego przez strażnika
        if (n == "potwierdzam" || n == "potwierdz" || n == "tak potwierdzam") {
            pendingDangerTap?.let { lbl ->
                pendingDangerTap = null
                return done(if (GadaczAccessibilityService.instance?.tapByText(lbl) == true)
                    "Kliknięte: $lbl." else "Nie widzę już przycisku $lbl.")
            }
        }
        if (n == "nie potwierdzam" || n == "anuluj" || n == "rezygnuje") {
            if (pendingDangerTap != null) { pendingDangerTap = null; return done("Dobrze, nie klikam.") }
        }

        // 🔔 Przypomnienia głosem: „przypominaj mi o lekach o 8"
        if (floorOn(ctx, "zdarzenia")) Regex("^przypom(nij|inaj)( mi)? o (.+) o (.+)$").find(n)?.let { m ->
            val hm = parseTimePl(m.groupValues[4]) ?: return@let
            val co = m.groupValues[3].trim()
            addTimeRule(ctx, hm.first, hm.second, co)
            return done("Dobrze. Codziennie o ${"%02d".format(hm.first)}:${"%02d".format(hm.second)} przypomnę o: $co.")
        }
        if (Regex("^jakie mam przypomnienia$").matches(n)) {
            val r = loadRules(ctx)
            if (r.length() == 0) return done("Nie masz żadnych przypomnień. Powiedz na przykład: przypominaj mi o lekach o ósmej.")
            val list = (0 until r.length()).mapNotNull { r.optJSONObject(it) }
                .joinToString(". ") { "o ${"%02d".format(it.optInt("h"))}:${"%02d".format(it.optInt("m"))} — ${it.optString("text")}" }
            return done("Przypomnienia: $list.")
        }
        if (Regex("^(usun|skasuj) (wszystkie )?przypomnienia$").matches(n)) { saveRules(ctx, JSONArray()); return done("Przypomnienia usunięte.") }
        if (n == "nie mow o baterii") { prefs(ctx).edit().putBoolean("rule_battery", false).apply(); return done("Dobrze, nie będę mówił o baterii.") }
        if (Regex("^mow( mi)? gdy bateria( bedzie)? slaba$").matches(n)) { prefs(ctx).edit().putBoolean("rule_battery", true).apply(); return done("Będę ostrzegał przy słabej baterii.") }

        // 🤖📱🧭 SAMONAUKA CAŁEJ APKI: „poznaj całą aplikację" / „co ona potrafi" — Gadacz
        // BEZPIECZNIE przechodzi po dolnych zakładkach (tylko przełączają widok, nic nie
        // wysyłają), czyta każdą sekcję i AI pisze ściągę „co apka potrafi i jak działać".
        if (Regex("^(poznaj cala aplikacje|co (ta|ona) aplikacja (potrafi|moze)|co (ona|ta apka) (potrafi|moze)|zbadaj cala aplikacje|co umie ta aplikacja)$").matches(n)) {
            val pkg = svc?.currentPackage() ?: ""
            if (svc == null) return done("Włącz sterowanie ekranem, żebym mógł poznać aplikację.")
            if (pkg.isBlank() || pkg == "pl.gadacz.app") return done("Otwórz najpierw aplikację, którą mam poznać.")
            // 🏦 Bezpieczeństwo: w apkach bankowych/płatniczych NIE klikamy po zakładkach.
            if (listOf("bank", "revolut", "vipps", "paypal", "santander", "mbank", "pekao", "pko", "millennium").any { pkg.lowercase().contains(it) })
                return done("To aplikacja bankowa — dla bezpieczeństwa nie klikam po niej sam. Opisz mi ją słowami, jeśli chcesz.")
            speak("Poznaję całą aplikację, przejdę po zakładkach. Chwileczkę…")
            Thread {
                try {
                    val sb = StringBuilder()
                    sb.append("=== Ekran główny ===\n").append(svc.readScreen()).append("\n")
                    val shot = svc.screenshotBase64()
                    val tabs = svc.bottomTabs()
                    for (tab in tabs.take(5)) {
                        if (svc.tapByText(tab)) {
                            Thread.sleep(1100)
                            sb.append("=== Zakładka: $tab ===\n").append(svc.readScreen()).append("\n")
                        }
                    }
                    val body = JSONObject().apply {
                        put("anthropicKey", anthropicKey(ctx)); put("pkg", pkg)
                        put("name", pkg.substringAfterLast(".")); put("screen", sb.toString())
                        put("deep", true)
                        if (shot != null) { put("imageBase64", shot); put("mediaType", "image/jpeg") }
                    }
                    val r = http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/learn-app")
                        .header("x-bot-pin", pin(ctx))
                        .post(body.toString().toRequestBody("application/json".toMediaType())).build())
                        .execute().use { JSONObject(it.body?.string() ?: "{}") }
                    val guide = r.optString("guide", "")
                    speak(if (guide.isNotBlank()) "Poznałem tę aplikację. Oto co potrafi: $guide" else r.optString("say", "Nie udało się poznać aplikacji."))
                } catch (_: Exception) { speak("Nie udało się połączyć z serwerem.") }
            }.start()
            return true
        }

        // 🤖📱 SAMONAUKA: „poznaj tę aplikację" — Gadacz SAM patrzy na ekran (odczyt + zrzut),
        // AI pisze z tego ściągę i zapisuje jako ekspercką. Bez pisania instrukcji przez Ciebie.
        if (Regex("^(poznaj (te )?aplikacje|naucz sie sam (tej )?aplikacji|zbadaj (te )?aplikacje|poznaj apke)$").matches(n)) {
            val pkg = svc?.currentPackage() ?: ""
            if (pkg.isBlank() || pkg == "pl.gadacz.app") return done("Otwórz najpierw aplikację, którą mam poznać, i powiedz to będąc w niej.")
            speak("Poznaję tę aplikację, chwileczkę…")
            Thread {
                try {
                    val screen = svc?.readScreen() ?: ""
                    val shot = svc?.screenshotBase64()
                    val body = JSONObject().apply {
                        put("anthropicKey", anthropicKey(ctx)); put("pkg", pkg)
                        put("name", pkg.substringAfterLast(".")); put("screen", screen)
                        if (shot != null) { put("imageBase64", shot); put("mediaType", "image/jpeg") }
                    }
                    val r = http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/learn-app")
                        .header("x-bot-pin", pin(ctx))
                        .post(body.toString().toRequestBody("application/json".toMediaType())).build())
                        .execute().use { JSONObject(it.body?.string() ?: "{}") }
                    speak(r.optString("say", r.optString("error", "Nie udało się poznać aplikacji.")))
                } catch (_: Exception) { speak("Nie udało się połączyć z serwerem.") }
            }.start()
            return true
        }

        // 📢 MEMY Z EKRANU: „zapisz tego mema" — zrzut tego, co widać, leci do biblioteki
        // w zakładce Reklama. Dla osoby niewidomej to jedyny sposób „złapania" mema.
        if (Regex("^zapisz (tego |ten )?mema?$").matches(n)) {
            val shot = svc?.screenshotBase64() ?: return done("Nie mam dostępu do ekranu. Włącz Gadacza w Dostępności.")
            speak("Zapisuję mema…")
            Thread {
                try {
                    val body = JSONObject().put("imageBase64", shot).put("mediaType", "image/jpeg")
                        .put("name", "mem z telefonu").put("source", "telefon")
                    val r = http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/memes")
                        .header("x-bot-pin", pin(ctx))
                        .post(body.toString().toRequestBody("application/json".toMediaType())).build())
                        .execute().use { JSONObject(it.body?.string() ?: "{}") }
                    speak(if (r.optBoolean("ok")) "Zapisałem mema w zakładce Reklama. Masz już ${r.optInt("count")} memów."
                          else r.optString("error", "Nie udało się zapisać mema."))
                } catch (_: Exception) { speak("Nie udało się połączyć z serwerem.") }
            }.start()
            return true
        }

        // 📢♻️ MEM Z MEMA: „przerób tego mema" — AI ogląda ekran, rozumie żart, wymyśla
        // nowy tekst, Gadacz maluje go na obrazku (biały napis z czarną obwódką) i odkłada
        // gotową przeróbkę do biblioteki w zakładce Reklama.
        if (Regex("^(przerob|zremiksuj) (tego |ten )?mema?$|^zrob (nowego )?mema z (tego|ekranu)$").matches(n)) {
            val shot = svc?.screenshotBase64() ?: return done("Nie mam dostępu do ekranu. Włącz Gadacza w Dostępności.")
            speak("Przerabiam mema, chwileczkę…")
            Thread {
                try {
                    val payload = JSONObject().put("anthropicKey", anthropicKey(ctx))
                        .put("imageBase64", shot).put("mediaType", "image/jpeg")
                    val r = http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/memes/remix")
                        .header("x-bot-pin", pin(ctx))
                        .post(payload.toString().toRequestBody("application/json".toMediaType())).build())
                        .execute().use { JSONObject(it.body?.string() ?: "{}") }
                    val teksty = r.optJSONArray("teksty")
                    if (teksty == null || teksty.length() == 0) { speak(r.optString("error", "Nie wymyśliłem nowego tekstu.")); return@Thread }
                    val t = teksty.getJSONObject(0)
                    val gora = t.optString("gora"); val dol = t.optString("dol")
                    val nowy = drawMemeOnBase64(shot, gora, dol) ?: shot
                    val save = JSONObject().put("imageBase64", nowy).put("mediaType", "image/jpeg")
                        .put("name", gora.ifBlank { "przeróbka" }).put("caption", listOf(gora, dol).filter { it.isNotBlank() }.joinToString(" / "))
                        .put("source", "telefon")
                    http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/memes")
                        .header("x-bot-pin", pin(ctx))
                        .post(save.toString().toRequestBody("application/json".toMediaType())).build()).execute().close()
                    speak("Przerobiłem mema i zapisałem w zakładce Reklama. Nowy tekst: $gora." +
                          if (dol.isNotBlank()) " Na dole: $dol." else "")
                } catch (_: Exception) { speak("Nie udało się przerobić mema.") }
            }.start()
            return true
        }

        // 📱➕ Uczenie aplikacji z jej WNĘTRZA: „naucz się tej aplikacji, że wyślij jest
        // strzałką na dole". Gadacz czyta pakiet apki na wierzchu i zapisuje ściągę.
        Regex("^(naucz sie (tej )?aplikacji|zapamietaj (te )?aplikacje)[,: ]+(.+)$").find(n)?.let { m ->
            val pkg = svc?.currentPackage() ?: ""
            if (pkg.isBlank() || pkg == "pl.gadacz.app") return done("Otwórz najpierw aplikację, której mam się nauczyć, i powiedz to będąc w niej.")
            // instrukcję bierzemy z ORYGINAŁU (polskie znaki), nie z uproszczonego n
            val instr = Regex("^.*?(aplikacji|aplikacje)[,: ]+", RegexOption.IGNORE_CASE).replace(raw.trim(), "").trim()
            if (instr.length < 4) return done("Powiedz, jak obsługiwać tę aplikację, po dwukropku.")
            Thread {
                try {
                    val body = JSONObject().put("match", pkg).put("name", pkg.substringAfterLast(".")).put("guide", instr)
                    http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/appguides")
                        .header("x-bot-pin", pin(ctx))
                        .post(body.toString().toRequestBody("application/json".toMediaType())).build()).execute().close()
                    speak("Zapamiętałem, jak obsługiwać tę aplikację. Od teraz będę wiedział.")
                } catch (_: Exception) { speak("Nie udało się zapisać. Sprawdź połączenie z serwerem.") }
            }.start()
            return true
        }

        // 🔧 Piętro 19: samonaprawa — Gadacz mówi, w czym się najczęściej myli.
        if (Regex("^(gdzie sie mylisz|co poprawic|sprawdz sie|jak ci idzie|w czym sie mylisz)$").matches(n)) {
            Thread {
                try {
                    val r = http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/selfcheck")
                        .header("x-bot-pin", pin(ctx)).build()).execute().use { JSONObject(it.body?.string() ?: "{}") }
                    speak(r.optString("say", "Nie mogę się teraz sprawdzić."))
                } catch (_: Exception) { speak("Nie mogę połączyć się z serwerem.") }
            }.start()
            return true
        }

        // 🔮 Piętro 8: podpowiedź z Twojego rytmu dnia
        if (Regex("^(co teraz|zaproponuj cos|co zwykle robie( o tej porze)?|co o tej porze)$").matches(n)) {
            Thread {
                try {
                    val hr = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
                    val r = http.newCall(Request.Builder()
                        .url(serverUrl(ctx).trimEnd('/') + "/api/assistant/suggest?hour=$hr")
                        .header("x-bot-pin", pin(ctx)).build())
                        .execute().use { JSONObject(it.body?.string() ?: "{}") }
                    speak(r.optString("say", "Jeszcze się uczę Twojego rytmu dnia."))
                } catch (_: Exception) { speak("Nie mogę połączyć się z serwerem.") }
            }.start()
            return true
        }

        // 🚪 GNIAZDA na piętra przyszłości (sprzęt/rozbudowa) — uczciwa odpowiedź zamiast ciszy.
        if (Regex("^(sterowanie domem|wlacz swiatlo w|zgas swiatlo w|inteligentny dom)").containsMatchIn(n))
            return done("Sterowanie domem to piętro, które zbudujemy, gdy podłączysz inteligentne urządzenia. Na razie tego nie mam.")
        if (Regex("^(zadzwon i (umow|zapytaj)|odbierz za mnie|porozmawiaj przez telefon)").containsMatchIn(n))
            return done("Rozmawianie przez telefon za Ciebie to piętro na przyszłość — telefon na to jeszcze nie pozwala. Mogę wybrać numer, resztę powiedz sam.")
        if (Regex("^(jak (bije |mam )?serce|jaki mam puls|jak spalem|zmierz puls)").containsMatchIn(n))
            return done("Zdrowie odczytam, gdy sparujesz opaskę albo zegarek. To piętro czeka na sprzęt.")

        // Sprzęt: latarka, głośność, panele
        if (floorOn(ctx, "latarka_glosnosc") && n.contains("latark")) return done(flashlight(ctx, !Regex("zgas|wylacz").containsMatchIn(n)))
        if (Regex("^(zrob )?glosniej( troche)?$").matches(n)) return done(volume(ctx, "up"))
        if (Regex("^(zrob )?ciszej( troche)?$").matches(n)) return done(volume(ctx, "down"))
        if (Regex("^wycisz( telefon| dzwiek)?$").matches(n)) return done(volume(ctx, "mute"))
        if (n == "na maksa" || n == "maksymalna glosnosc" || n == "najglosniej") return done(volume(ctx, "max"))
        if (Regex("szybkie ustawienia|kafelki").containsMatchIn(n))
            return done(if (svc != null) { svc.openQuickSettings(); "Szybkie ustawienia." } else "Włącz sterowanie ekranem.")
        if (Regex("^(pokaz|otworz) powiadomienia$").matches(n))
            return done(if (svc != null) { svc.openNotifications(); "Powiadomienia." } else "Włącz sterowanie ekranem.")

        // Godzina i data — telefon wie sam, bez sieci.
        if (Regex("^(ktora( jest)?( teraz)? godzina|godzina|ktora teraz)$").matches(n) || n.startsWith("ktora godzina"))
            return done("Jest " + SimpleDateFormat("HH:mm", Locale("pl", "PL")).format(Date()) + ".")
        if (Regex("jaki (dzis|dzisiaj)( jest)? dzien|jaka (jest )?data|ktorego (dzis|dzisiaj)").containsMatchIn(n))
            return done("Dziś jest " + SimpleDateFormat("EEEE, d MMMM yyyy", Locale("pl", "PL")).format(Date()) + ".")

        // Stan telefonu
        if (Regex("ile (mam )?baterii|stan baterii|poziom baterii").containsMatchIn(n)) return done(phoneStatus(ctx, "bateria"))
        if (Regex("czy mam (wifi|internet|siec|zasieg)|jaki mam internet").containsMatchIn(n)) return done(phoneStatus(ctx, "wifi"))
        if (Regex("ile (mam )?(wolnego )?miejsca").containsMatchIn(n)) return done(phoneStatus(ctx, "miejsce"))

        // Ekran: czytanie i nawigacja
        if (Regex("co (jest|widac|widzisz) na ekranie|przeczytaj ekran|co widze").containsMatchIn(n)) { readScreenAsync(ctx, speak); return true }
        if (n == "cofnij" || n == "wstecz") return done(if (svc != null) { svc.goBack(); "Cofam." } else "Włącz sterowanie ekranem.")
        if (n == "ekran glowny" || n == "pulpit" || n == "wroc na pulpit") return done(if (svc != null) { svc.goHome(); "Pulpit." } else "Włącz sterowanie ekranem.")
        if (n == "ostatnie aplikacje" || n == "ostatnie") return done(if (svc != null) { svc.recents(); "Ostatnie aplikacje." } else "Włącz sterowanie ekranem.")
        Regex("^przewin( w| do)? ?(dol|gore|gora|lewo|prawo)( .*)?$").find(n)?.let {
            if (svc == null) return done("Włącz sterowanie ekranem.")
            val dir = when (it.groupValues[2]) { "gore", "gora" -> "up"; "lewo" -> "left"; "prawo" -> "right"; else -> "down" }
            svc.scroll(dir); return done("Przewijam.")
        }

        // 🔢 TRYB NUMERKÓW — sterowanie KAŻDYM ekranem bez rozumienia (Ty jesteś mózgiem).
        if (floorOn(ctx, "numerki")) {
            if (Regex("^(numerki|ponumeruj( ekran)?|pokaz numery|jakie sa numery)$").matches(n))
                return done(svc?.listNumbered() ?: "Włącz sterowanie ekranem.")
            Regex("^(kliknij |dotknij )?(numer )?(\\d{1,2}|jeden|dwa|trzy|cztery|piec|szesc|siedem|osiem|dziewiec|dziesiec|jedenascie|dwanascie)$").find(n)?.let { m ->
                if (svc?.hasNumbered() == true) {
                    val tok = m.groupValues[3]
                    val num = tok.toIntOrNull() ?: NUM_WORDS[tok] ?: 0
                    return if (num > 0 && svc.tapNumber(num)) done("Klikam $num.") else done("Nie ma takiego numeru. Powiedz: numerki.")
                }
            }
        }

        // Budzik i minutnik — rozbiór czasu zwykłym kodem
        if (floorOn(ctx, "budziki") && (n.contains("budzik") || n.contains("obudz mnie"))) {
            val hm = parseTimePl(n) ?: return false   // niejasna godzina → mózg
            return done(setAlarm(ctx, hm.first, hm.second, "", speak))
        }
        if (n.contains("minutnik") || n.contains("czasomierz")) {
            val secs = parseDurationPl(n)
            return if (secs > 0) done(setTimer(ctx, secs)) else false
        }

        // Telefon na podyktowany numer / numer alarmowy
        Regex("^zadzwon (na |pod |do )?([\\d ]{3,15})$").find(n)?.let {
            val num = it.groupValues[2].replace(" ", "")
            if (num.length >= 3) {
                ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$num")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return done("Wybieram $num. Dotknij zielonej słuchawki.")
            }
        }
        if (Regex("zadzwon na (pogotowie|policje|straz|numer alarmowy|sto dwanascie)").containsMatchIn(n)) {
            ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return done("Otwieram numer alarmowy sto dwanaście. Dotknij słuchawki.")
        }

        // Otwieranie aplikacji — z bezpiecznikami na dwuznaczności („włącz muzykę" ≠ apka)
        if (floorOn(ctx, "otwieranie_apek")) Regex("^(otworz|uruchom|odpal|wlacz|wejdz w)\\s+(.{2,40})$").find(n)?.let { m ->
            val nameN = m.groupValues[2]
            val banned = listOf("latark", "muzyk", "piosenk", "film", "czuwanie", "nasluch", "budzik", "minutnik",
                "wifi", "wi fi", "bluetooth", "swiatlo", "glos", "tryb", "dane", "lokalizacj", "powiadomieni",
                "sterowanie", "czytanie", "nagrywanie")
            if (banned.none { nameN.contains(it) }) {
                // nazwa z ORYGINALNĄ pisownią — polskie znaki ważne przy dopasowaniu etykiet
                val rawName = raw.trim().replace(
                    Regex("^(otwórz|otworz|uruchom|odpal|włącz|wlacz|wejdź w|wejdz w)\\s+", RegexOption.IGNORE_CASE), "")
                    .trim(' ', '.', '!')
                if (openApp(ctx, rawName) == null) return done("Otwieram $rawName.")
            }
        }
        return false
    }

    // ─── 🧭 PIĘTRO 2: AUTOPILOT PRZEPISÓW ───────────────────────────────────
    // Zadanie prawie identyczne z już UDANYM (przepis, podobieństwo ≥ 0,75) i złożone
    // wyłącznie z bezpiecznych kroków nawigacyjnych → jedzie BEZ AI, po pamięci mięśniowej.
    // Kroki z pisaniem treści (type/write) wymagają myślenia — zostają przy AI.
    private val AUTOPILOT_SAFE = setOf("open_app", "tap", "scroll", "back", "home", "recents", "enter")

    private fun tryAutopilot(ctx: Context, goal: String, speak: (String) -> Unit): Boolean {
        val svc = GadaczAccessibilityService.instance
        return try {
            val base = serverUrl(ctx).trimEnd('/')
            val resp = http.newCall(Request.Builder()
                .url("$base/api/assistant/recipe/match?goal=" + Uri.encode(goal))
                .header("x-bot-pin", pin(ctx)).build())
                .execute().use { r -> if (!r.isSuccessful) return false; JSONObject(r.body?.string() ?: "{}") }
            if (!resp.optBoolean("found", false) || resp.optDouble("score", 0.0) < 0.75) return false
            val arr = resp.optJSONArray("steps") ?: return false
            val steps = ArrayList<Pair<String, String>>()
            for (i in 0 until arr.length()) {
                val s = arr.optString(i)
                val action = s.substringBefore(":").trim()
                if (action !in AUTOPILOT_SAFE) return false   // przepis wymaga myślenia → AI
                steps.add(action to s.substringAfter(":", "").trim())
            }
            if (steps.isEmpty()) return false
            if (steps.any { it.first != "open_app" } && svc == null) return false
            speak("Znam tę drogę — robię z pamięci.")
            for ((action, arg) in steps) {
                if (cancelRequested) { cancelRequested = false; speak("Przerwane."); return true }
                // 🛡️ Strażnik obowiązuje też na autopilocie.
                if (action == "tap" && isDanger(arg)) {
                    pendingDangerTap = arg
                    speak("To ważny przycisk: $arg. Powiedz: potwierdzam — a kliknę.")
                    return true
                }
                val ok = when (action) {
                    "open_app" -> openApp(ctx, arg) == null
                    "tap" -> svc?.tapByText(arg) == true
                    "scroll" -> { svc?.scroll(arg.ifBlank { "down" }); true }
                    "back" -> { svc?.goBack(); true }
                    "home" -> { svc?.goHome(); true }
                    "recents" -> { svc?.recents(); true }
                    "enter" -> svc?.pressEnter() == true
                    else -> false
                }
                if (!ok) { speak("Ekran się zmienił — włączam myślenie."); return false }
                Thread.sleep(when (action) { "open_app" -> 1900L; "tap", "enter" -> 850L; "scroll" -> 450L; else -> 650L })
            }
            speak("Zrobione, po znanej drodze.")
            true
        } catch (_: Exception) { false }
    }

    /** 🗺️ Poproś AI TYLKO o plan (numerowane kroki) — bez wykonywania żadnej akcji.
     *  Czytamy pole "plan", a gdy puste — "say". Cokolwiek innego (action) IGNORUJEMY,
     *  więc ta rozmowa nigdy nic nie kliknie. Zwraca pusty tekst, gdy się nie uda. */
    private fun planOnly(ctx: Context, prompt: String, history: List<Pair<String, String>>, screen: String?, shot: String?): String = try {
        val r = ask(ctx, prompt, history, screen, shot)
        if (r.optString("error", "").isBlank()) restoreFaceIfNeeded(ctx) {}
        r.optString("plan", "").ifBlank { r.optString("say", "") }.trim()
    } catch (_: Exception) { "" }

    /** Ask the server. history = list of role→content pairs. Blocking (call off main thread). */
    fun ask(ctx: Context, question: String, history: List<Pair<String, String>>, screenDump: String? = null, imageBase64: String? = null): JSONObject {
        val msgs = JSONArray()
        history.takeLast(12).forEach { (role, content) ->
            msgs.put(JSONObject().put("role", role).put("content", content))
        }
        // 🎓 Tryb nauczyciela: jednorazowy znacznik doklejany do pytania.
        val teach = prefs(ctx).getBoolean("teach_mode", false)
        if (teach) prefs(ctx).edit().putBoolean("teach_mode", false).apply()
        val body = JSONObject().apply {
            put("anthropicKey", anthropicKey(ctx))
            put("question", (if (teach) "[NAUCZ] " else "") +
                if (screenDump != null) "EKRAN: $screenDump\n\nPolecenie: $question" else question)
            put("history", msgs)
            put("clientTime", SimpleDateFormat("EEEE, d MMMM yyyy, HH:mm", Locale("pl", "PL")).format(Date()))
            put("learn", learnJournalOn(ctx))   // 🧠 serwer nie zapisuje dziennika, gdy ta sekcja wyłączona
            put("work", workLevel(ctx))          // 🎚️ stopień pracy: easy / normal / hard → dobór modeli
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
        cancelRequested = false   // wyzeruj u SAMEJ góry — stare „anuluj" nie może zabić nowego zadania. Audyt 10.07.
        // 🗂 Odruchy rozmów (nowa rozmowa, zapisz projekt, wczytaj...) — tu, bo mają
        // dostęp do pamięci rozmowy telefonu (history).
        if (convReflex(ctx, goal, history, speak)) return
        // ⚡ Piętro 1: ODRUCHY — jednoznaczne komendy bez AI (natychmiast, 0 zł, offline).
        if (reflex(ctx, goal, speak)) return
        // 🧭 Piętro 2: AUTOPILOT — znana droga z przepisów bez AI; przy zgrzycie spada niżej.
        if (floorOn(ctx, "autopilot") && tryAutopilot(ctx, goal, speak)) return
        // 🆓 TRYB DARMOWY: chmury nie budzimy. Odruchy i autopilot już próbowały,
        // więc zostaje lokalny mózg — ale TYLKO gdy aktywna twarz umie działać offline
        // (Ogólny / Dla niewidomych). Twarze fachowców (Prawnik, Lekarz...) potrzebują
        // mądrego mózgu z chmury, więc uczciwie o tym mówimy.
        if (!paidMode(ctx)) {
            // 🔀 Fachowiec bez sieci → SAM przeskocz na Ogólny (zamiast prosić usera).
            autoOfflineSwitch(ctx, speak)
            // ✍️ Najpierw NOWY, stabilny silnik pisania (llama.cpp); dopiero potem stary mózg.
            val local = try { LlamaCpp.answer(ctx, goal) ?: LocalBrain.answer(ctx, goal) } catch (_: Throwable) { null }
            speak(local ?: (if (LocalBrain.available(ctx))
                "Lokalny mózg nie zna odpowiedzi. Powiedz: pracuj za opłatą — a zapytam mądrego mózgu w chmurze."
            else
                "Nie mam wgranego lokalnego mózgu. Pobierz go w ustawieniach, albo powiedz: pracuj za opłatą."))
            return
        }
        // 🧠 Piętro 3: AI — pełne rozumienie (poniżej).
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
        // 🧭 Silnik nauki obsługi telefonu: zbieramy kroki, które ZADZIAŁAŁY.
        // Udane zadanie → przepis leci na serwer → następnym razem AI dostaje mapę.
        val steps = ArrayList<String>()
        var stuckStreak = 0   // ile razy z rzędu krok nie wyszedł (do wołania o pomoc)
        var replanned = false // czy STRATEG ułożył już plan OD NOWA po utknięciu (raz)
        // 🎯 MISJA: długie zadania (ogłoszenia, wieloekranowe formularze) dostają więcej
        // kroków — zwykłe zadania kończą się w kilku, ale wystawienie ogłoszenia to 20-40
        // kroków przez wiele ekranów, więc nie poddawaj się za wcześnie.
        val isMission = Regex("ogloszeni|sprzeda|wystaw|olx|allegro|vinted|formularz|zarejestruj|konto|wypelnij")
            .containsMatchIn(normPl(goal))
        // 🗺️ PLAN Z GÓRY (STRATEG): przy złożonej PRACY W APLIKACJI prosimy najmocniejszy
        //   silnik o numerowany plan ZANIM zaczniemy klikać — Gadacz trzyma kurs przez wiele
        //   ekranów i nie gubi się w połowie. Plan tylko CZYTAMY (żadnej akcji). Serwer sam
        //   kieruje to zapytanie do STRATEGA (Opus), bo w pytaniu nie ma jeszcze planu.
        //   Nie robimy tego dla pytań/pisania ani gdy sterowanie ekranem jest wyłączone.
        val complexGoal = isMission ||
            Regex("\\b(potem|nastepnie|a potem|pozniej|oraz|zaloz|zaloguj|wypelnij|wyslij|dodaj|ustaw)\\b").containsMatchIn(normPl(goal)) ||
            normPl(goal).split(Regex("\\s+")).size >= 7
        val svcReady = GadaczAccessibilityService.instance != null
        val looksQuestion = goal.contains("?") ||
            Regex("^(jak|co|czy|kto|gdzie|kiedy|dlaczego|czemu|ile|jaki|jaka|jakie|opowie|powiedz|wytlumacz|wyjasnij|policz|przetlumacz|napisz|uloz|stworz|wymysl)\\b").containsMatchIn(normPl(goal))
        if (complexGoal && svcReady && !looksQuestion) {
            val scr = GadaczAccessibilityService.instance?.readScreen()
            val p = planOnly(ctx, "[PLAN] Ułóż krótki numerowany plan (2-6 kroków), jak wykonać to zadanie na telefonie krok po kroku. NIE wykonuj teraz żadnej akcji — podaj sam plan. Zadanie: $goal", history, scr, null)
            if (p.isNotBlank()) { plan = p; speak("Plan: $plan") }
        }
        val stepCap = if (isMission) 45 else if (plan.isBlank()) 14 else 22
        while (step < stepCap) {
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
            val resp = try {
                val r = ask(ctx, question, history, screen, shot)
                // 🔙 Sieć działa (odpowiedź przyszła) → wróć do twarzy sprzed auto-skoku.
                if (r.optString("error", "").isBlank()) restoreFaceIfNeeded(ctx, speak)
                r
            } catch (e: Exception) {
                // 🤏 Piętro 6: serwer/sieć padły → SAM przeskocz na Ogólny i ratuj lokalnym
                // mózgiem (fachowca wróci, gdy sieć wróci).
                autoOfflineSwitch(ctx, speak)
                // ✍️ Najpierw NOWY, stabilny silnik pisania (llama.cpp); dopiero potem stary mózg.
            val local = try { LlamaCpp.answer(ctx, goal) ?: LocalBrain.answer(ctx, goal) } catch (_: Throwable) { null }
                speak(local ?: "Nie ma połączenia z internetem. Wgraj lokalny mózg w ustawieniach, a będę działał offline.")
                return
            }
            // 🔇 KONIEC MILCZENIA: serwer zgłosił błąd → resp nie ma "say" i Gadacz
            // potrafił zamilknąć bez słowa. Teraz zawsze MÓWI, co jest nie tak.
            val srvErr = resp.optString("error", "")
            if (srvErr.isNotBlank()) {
                // 🆓 AUTOMAT: skończyły się środki → Gadacz SAM przechodzi na tryb
                // darmowy (odruchy, autopilot, lokalny mózg) i mówi, jak wrócić.
                if (srvErr.contains("credit", true) || srvErr.contains("billing", true)) {
                    setPaidMode(ctx, false)
                    // ✍️ Najpierw NOWY, stabilny silnik pisania (llama.cpp); dopiero potem stary mózg.
            val local = try { LlamaCpp.answer(ctx, goal) ?: LocalBrain.answer(ctx, goal) } catch (_: Throwable) { null }
                    speak("Skończyły się środki na kluczu, więc przechodzę na darmowy tryb — proste komendy i znane drogi działają dalej za darmo. Doładuj konto Anthropic i powiedz: pracuj za opłatą, żeby wrócić." +
                        (local?.let { " A na Twoje pytanie lokalny mózg odpowiada: $it" } ?: ""))
                    return
                }
                speak(when {
                    srvErr.contains("PIN", true) -> "Serwer prosi o PIN aplikacji. Wejdź w Ustawienia Gadacza, wpisz PIN i spróbuj znowu."
                    srvErr.contains("Brak klucza", true) -> srvErr
                    else -> "Serwer zgłosił błąd: $srvErr"
                })
                return
            }
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
            // 🛡️ Strażnik wstrzymał kliknięcie — kończymy zadanie, czekamy na „potwierdzam".
            if (spoken.startsWith("To ważny przycisk")) { speak(spoken); return }
            // Rozpoznaj porażkę kroku po komunikacie — poleci do AI w następnym pytaniu.
            if (spoken.startsWith("Nie znalazłem") || spoken.startsWith("Nie ma pola") ||
                spoken.startsWith("Nie udało") || spoken.startsWith("To pole nie") ||
                spoken.startsWith("Nie mam czego")) lastError = spoken
            // 🆘 MISTRZOWSKIE WOŁANIE O POMOC: gdy AI utyka drugi raz z rzędu, nie błądź
            // dalej po omacku — powiedz KONKRETNIE co próbujesz, CO widać i CZEGO trzeba,
            // po czym zatrzymaj się i czekaj na pomoc (głosem albo palcem → „jedź dalej").
            if (lastError.isNotBlank()) {
                stuckStreak++
                if (stuckStreak >= 2) {
                    // 🔁 ZANIM poprosisz człowieka: STRATEG raz układa plan OD NOWA, patrząc na
                    //   bieżący ekran — może istnieje inna droga do celu (serwer kieruje to do
                    //   Opusa, bo w pytaniu jest „NIE WYSZEDŁ"/brak planu).
                    if (!replanned) {
                        replanned = true
                        val np = planOnly(ctx, "[PLAN] Dotychczasowy sposób nie działa na tym ekranie. Patrząc na EKRAN, ułóż INNY plan (2-5 kroków) do celu OD TEGO miejsca. NIE wykonuj akcji — podaj sam plan. Cel: $goal", history, screen, shot)
                        if (np.isNotBlank()) {
                            plan = np; speak("Ten sposób nie działa — zmieniam plan. $plan")
                            lastError = ""; stuckStreak = 0; step++
                            continue
                        }
                    }
                    val szukam = args.optString("text", args.optString("name", "")).ifBlank { "właściwego elementu" }
                    val widac = GadaczAccessibilityService.instance?.visibleButtons() ?: emptyList()
                    val coWidac = if (widac.isEmpty()) "nie widzę żadnych przycisków" else "widzę: " + widac.joinToString(", ")
                    pendingHelpGoal = goal
                    speak("Utknąłem. Szukam „$szukam”, ale $coWidac. Pomóż mi: powiedz, w co mam dotknąć, albo zrób ten krok palcem i powiedz „jedź dalej” — a resztę dokończę i zapamiętam.")
                    return
                }
            } else stuckStreak = 0
            // Udany krok wchodzi do przepisu (z najważniejszym argumentem).
            if (lastError.isBlank() && action != "none") {
                val arg = args.optString("text", args.optString("name", args.optString("dir", "")))
                steps.add(if (arg.isBlank()) action else "$action: $arg")
            }
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
            if (!next || terminal) {
                if (spoken.isNotBlank()) speak(spoken)
                // 🔇 Gwarancja głosu: nawet gdy AI odda pustą odpowiedź, Gadacz nie milczy.
                else if (say.isBlank()) speak("Nie mam na to odpowiedzi. Powiedz to proszę inaczej.")
                // 🧭 Wielokrokowe zadanie skończone BEZ porażki → zapamiętaj drogę.
                val looksFailed = lastError.isNotBlank() ||
                    Regex("utkn|nie udało|nie mogę|nie znalaz|nie ma pola", RegexOption.IGNORE_CASE)
                        .containsMatchIn("$say $spoken")
                if (!looksFailed && steps.size >= 2) saveRecipe(ctx, goal, steps)
                // 🗂 AUTO-ZAPIS rozmowy: każda dokończona wymiana zdań ląduje w rozmowie
                // aktywnej twarzy na serwerze — sama, w tle, bez proszenia.
                val finalAnswer = (if (spoken.isNotBlank()) spoken else say).take(4000)
                if (finalAnswer.isNotBlank()) Thread { convAppend(ctx, goal, finalAnswer) }.start()
                return
            }
            // Adaptive settle — wait only as long as each action needs, so it's fast.
            val settle = when (action) {
                "open_app", "open" -> 1900L
                "tap", "tap_at", "enter" -> 850L
                "double_tap", "zoom_in", "zoom_out" -> 800L
                "long_press" -> 1000L
                "scroll" -> 450L
                "type", "write" -> 400L
                "back", "home", "recents" -> 650L
                else -> 800L
            }
            try { Thread.sleep(settle) } catch (_: Exception) {}
            step++
        }
        speak(if (plan.isBlank()) "Zrobiłem kilka kroków, ale nie widzę, żeby zadanie się domknęło. Powiedz, co dalej, albo zrób ostatni krok palcem i powiedz „jedź dalej”."
              else "Wyczerpałem kroki planu. Powiedz, co dalej, albo dokończ ostatni etap ręcznie i powiedz „jedź dalej”.")
        pendingHelpGoal = goal   // po pomocy palcem można wznowić
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
            "look" -> { ctx.startActivity(Intent(ctx, CameraCaptureActivity::class.java).putExtra("mode", "describe").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "" }
            "read_world" -> { ctx.startActivity(Intent(ctx, CameraCaptureActivity::class.java).putExtra("mode", "read").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "" }
            "check_framing" -> { ctx.startActivity(Intent(ctx, CameraCaptureActivity::class.java).putExtra("mode", "selfie").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "" }
            "tap" -> {
                val label = args.optString("text")
                // 🛡️ Strażnik: płatności/usuwanie tylko po Twoim „potwierdzam" (jeśli włączony).
                if (floorOn(ctx, "straznik") && isDanger(label)) {
                    pendingDangerTap = label
                    return "To ważny przycisk: $label. Powiedz: potwierdzam — a kliknę. Albo: anuluj."
                }
                if (svc?.tapByText(label, args.optString("pos")) != true) { learnFail(ctx); return "Nie znalazłem na ekranie: $label." }
            }
            "tap_at" -> { if (svc?.tapAt(args.optDouble("x", -1.0), args.optDouble("y", -1.0)) != true) { learnFail(ctx); return "Nie mogę dotknąć tego miejsca." } }
            "double_tap" -> { if (svc?.doubleTapAt(args.optDouble("x", 50.0), args.optDouble("y", 50.0)) != true) return "Nie mogę tam stuknąć dwa razy." }
            "zoom_in" -> { if (svc?.pinch(true) != true) return "Nie mogę powiększyć." }
            "zoom_out" -> { if (svc?.pinch(false) != true) return "Nie mogę pomniejszyć." }
            "long_press" -> {
                val lbl = args.optString("text")
                if (isDanger(lbl)) { pendingDangerTap = lbl; return "To ważny przycisk: $lbl. Powiedz: potwierdzam — a przytrzymam. Albo: anuluj." }
                if (svc?.longPressByText(lbl, args.optString("pos")) != true) { learnFail(ctx); return "Nie znalazłem na ekranie: $lbl." }
            }
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

    /** 📋 Piętro 16: poranny raport — bateria, sieć, pogoda, bot, przypomnienia dnia. */
    private fun morningReport(ctx: Context, speak: (String) -> Unit) {
        val sb = StringBuilder()
        val cal = java.util.Calendar.getInstance()
        val h = cal.get(java.util.Calendar.HOUR_OF_DAY)
        sb.append(if (h < 12) "Dzień dobry. " else if (h < 18) "Dzień dobry. " else "Dobry wieczór. ")
        sb.append("Dziś ").append(SimpleDateFormat("EEEE, d MMMM", Locale("pl", "PL")).format(Date())).append(". ")
        try {
            val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as android.os.BatteryManager
            sb.append("Bateria ").append(bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)).append(" procent. ")
        } catch (_: Exception) {}
        // przypomnienia na dziś
        try {
            val r = loadRules(ctx)
            val today = (0 until r.length()).mapNotNull { r.optJSONObject(it) }
                .filter { it.optString("type") == "time" }
                .joinToString(", ") { "${it.optString("text")} o ${"%02d".format(it.optInt("h"))}:${"%02d".format(it.optInt("m"))}" }
            if (today.isNotBlank()) sb.append("Przypomnienia: ").append(today).append(". ")
        } catch (_: Exception) {}
        speak(sb.toString())
        // pogoda + bot z serwera (jeśli jest sieć)
        try {
            val base = serverUrl(ctx).trimEnd('/')
            fun get(p: String) = http.newCall(Request.Builder().url(base + p).header("x-bot-pin", pin(ctx)).build())
                .execute().use { JSONObject(it.body?.string() ?: "{}") }
            get("/api/assistant/info?do=weather").optString("say", "").ifBlank { null }?.let { speak(it) }
            val s = get("/api/bot/status")
            if (s.has("sessionPnl")) speak("Bot: ${"%.2f".format(s.optDouble("sessionPnl", 0.0))} dolara w tej sesji.")
        } catch (_: Exception) {}
        speak("Powiedz, co zrobić.")
    }

    /** 🧭 Wyślij UDANĄ drogę zadania na serwer — buduje przepisy obsługi telefonu. */
    private fun saveRecipe(ctx: Context, goal: String, steps: List<String>) {
        if (!learnRecipesOn(ctx)) return   // 🧠 sekcja: nauka obsługi aplikacji
        Thread {
            try {
                val body = JSONObject().put("goal", goal).put("steps", JSONArray(steps.toList()))
                http.newCall(Request.Builder().url(serverUrl(ctx).trimEnd('/') + "/api/assistant/recipe")
                    .header("x-bot-pin", pin(ctx))
                    .post(body.toString().toRequestBody("application/json".toMediaType())).build())
                    .execute().close()
            } catch (_: Exception) { /* nauka jest best-effort */ }
        }.start()
    }

    /**
     * Tell the server the LAST action failed on the real screen, so it learns from reality
     * (marks that phrasing [nieudane] in the journal). Fire-and-forget, off the caller's path.
     */
    private fun learnFail(ctx: Context) {
        if (!learnJournalOn(ctx)) return   // 🧠 sekcja: nauka użytkownika (dziennik)
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

    /**
     * 📢 Klasyczny memowy napis na obrazku: WIELKIE litery, biały środek, gruba czarna
     * obwódka, góra i dół, proste łamanie wierszy. Zwraca nowy JPEG jako base64
     * (null gdy obrazek nie dał się przetworzyć — wtedy zapisujemy oryginał).
     */
    private fun drawMemeOnBase64(b64: String, top: String, bottom: String): String? = try {
        val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
        val src = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val bmp = src.copy(android.graphics.Bitmap.Config.ARGB_8888, true)
        val canvas = android.graphics.Canvas(bmp)
        val size = (bmp.width / 11f).coerceAtLeast(22f)
        fun makePaint(stroke: Boolean) = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size
            textAlign = android.graphics.Paint.Align.CENTER
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT_BOLD, android.graphics.Typeface.BOLD)
            if (stroke) { style = android.graphics.Paint.Style.STROKE; strokeWidth = size / 9f; color = android.graphics.Color.BLACK }
            else { style = android.graphics.Paint.Style.FILL; color = android.graphics.Color.WHITE }
        }
        val pStroke = makePaint(true); val pFill = makePaint(false)
        fun drawBlock(text: String, atTop: Boolean) {
            val t = text.trim().uppercase()
            if (t.isBlank()) return
            val lines = ArrayList<String>(); var cur = ""
            for (w in t.split(" ")) {
                val probe = if (cur.isBlank()) w else "$cur $w"
                if (pFill.measureText(probe) > bmp.width * 0.92f && cur.isNotBlank()) { lines.add(cur); cur = w } else cur = probe
            }
            if (cur.isNotBlank()) lines.add(cur)
            val lh = size * 1.12f
            lines.forEachIndexed { i, line ->
                val y = if (atTop) size + 8f + i * lh else bmp.height - 14f - (lines.size - 1 - i) * lh
                canvas.drawText(line, bmp.width / 2f, y, pStroke)
                canvas.drawText(line, bmp.width / 2f, y, pFill)
            }
        }
        drawBlock(top, true); drawBlock(bottom, false)
        val bos = java.io.ByteArrayOutputStream()
        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, bos)
        android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP)
    } catch (_: Throwable) { null }

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
