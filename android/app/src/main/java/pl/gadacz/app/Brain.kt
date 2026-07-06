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

    fun prefs(ctx: Context) = ctx.getSharedPreferences("gadacz", Context.MODE_PRIVATE)
    fun serverUrl(ctx: Context) = prefs(ctx).getString("server_url", "") ?: ""
    fun anthropicKey(ctx: Context) = prefs(ctx).getString("anthropic_key", "") ?: ""
    fun pin(ctx: Context) = prefs(ctx).getString("app_pin", "") ?: ""
    fun isConfigured(ctx: Context) = serverUrl(ctx).isNotBlank() && anthropicKey(ctx).isNotBlank()

    /** Ask the server. history = list of role→content pairs. Blocking (call off main thread). */
    fun ask(ctx: Context, question: String, history: List<Pair<String, String>>, screenDump: String? = null): JSONObject {
        val msgs = JSONArray()
        history.takeLast(8).forEach { (role, content) ->
            msgs.put(JSONObject().put("role", role).put("content", content))
        }
        val body = JSONObject().apply {
            put("anthropicKey", anthropicKey(ctx))
            put("question", if (screenDump != null) "EKRAN: $screenDump\n\nPolecenie: $question" else question)
            put("history", msgs)
            put("clientTime", SimpleDateFormat("EEEE, d MMMM yyyy, HH:mm", Locale("pl", "PL")).format(Date()))
        }
        val req = Request.Builder()
            .url(serverUrl(ctx).trimEnd('/') + "/api/assistant/ask")
            .header("x-bot-pin", pin(ctx))   // app PIN — required when the server is locked
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { r -> return JSONObject(r.body?.string() ?: "{}") }
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
            "open_app" -> openApp(ctx, args.optString("name"))?.let { return it }
            "read_screen" -> { readScreenAsync(ctx, speak); return "" }
            "tap" -> { if (svc?.tapByText(args.optString("text")) != true) return "Nie znalazłem na ekranie: ${args.optString("text")}." }
            "type" -> { if (svc?.typeText(args.optString("text")) != true) return "Nie ma pola do wpisania." }
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
            "scroll" -> svc?.scroll(args.optString("dir") != "up")
            "app_action" -> return appAction(ctx, args)
            // ── System control ──────────────────────────────────────────────
            "flashlight" -> return flashlight(ctx, args.optString("on") != "false")
            "volume" -> return volume(ctx, args.optString("dir"))
            "quick_settings" -> { svc?.openQuickSettings() ?: return "Włącz sterowanie ekranem, żeby otworzyć szybkie ustawienia." }
            "notifications" -> { svc?.openNotifications() ?: return "Włącz sterowanie ekranem." }
            "settings" -> return openSettings(ctx, args.optString("what"))
            else -> {}
        }
        return say
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
