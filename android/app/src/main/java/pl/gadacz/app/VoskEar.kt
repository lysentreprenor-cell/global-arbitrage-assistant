package pl.gadacz.app

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * 👂 UCHO GADACZA — własny silnik rozpoznawania mowy (Vosk, licencja Apache 2.0),
 * polski model ~50 MB, działa CAŁKOWICIE offline.
 *
 * Po co, skoro Android ma swoje rozpoznawanie? Bo tamto działa SESJAMI — między
 * sesjami są głuche dziury, a dwie sesje walczą o mikrofon. Ucho słucha JEDNYM
 * ciągłym strumieniem, bez przerw: czuwanie na słowo „Gadacz", wchodzenie w słowo
 * („stop") i przerywanie zadań — wszystko z ucha. Dokładne rozpoznanie treści
 * polecenia dalej robi rozpoznawacz Google (jest celniejszy) — ucho tylko CZUWA.
 *
 * Model wgrywa się raz przyciskiem w Ustawieniach (z naszego wydania GitHub).
 * Brak modelu = ucho śpi, wszystko działa po staremu.
 */
object VoskEar {
    @Volatile private var model: org.vosk.Model? = null
    @Volatile private var service: org.vosk.android.SpeechService? = null
    @Volatile var downloadCancel = false

    // Zapasowy adres (ten sam, który poda serwer w /brain-url jako "ear").
    private const val EAR_URL_FALLBACK =
        "https://github.com/lysentreprenor-cell/global-arbitrage-assistant/releases/download/gadacz-brain/gadacz-ucho.zip"

    private fun dir(ctx: Context) = File(ctx.getExternalFilesDir(null), "gadacz-ucho")

    /** Folder z modelem (rozpakowany zip ma podfolder z plikami am/, conf/...). */
    private fun modelDir(ctx: Context): File? {
        val d = dir(ctx)
        if (File(d, "am").exists()) return d
        return d.listFiles()?.firstOrNull { it.isDirectory && File(it, "am").exists() }
    }

    fun available(ctx: Context): Boolean = modelDir(ctx) != null

    /** 🗑️ Usuń model ucha (zwalnia ~50 MB). Najpierw zatrzymujemy nasłuch. */
    fun deleteEar(ctx: Context): Boolean {
        stop()
        synchronized(this) { model?.let { try { it.close() } catch (_: Throwable) {} }; model = null }
        return try { dir(ctx).deleteRecursively() } catch (_: Exception) { false }
    }

    @Synchronized
    private fun ensure(ctx: Context): org.vosk.Model? {
        model?.let { return it }
        val md = modelDir(ctx) ?: return null
        return try { org.vosk.Model(md.absolutePath).also { model = it } } catch (_: Throwable) { null }
    }

    /**
     * 🔊 Start CIĄGŁEGO nasłuchu. onHeard(tekst, czyKońcowy) — częściowe wyniki
     * przychodzą na bieżąco (reakcja w pół słowa), końcowe po pauzie w mowie.
     * true = ucho wystartowało; false = brak modelu albo mikrofon zajęty.
     */
    fun start(ctx: Context, onHeard: (String, Boolean) -> Unit): Boolean {
        val m = ensure(ctx) ?: return false
        stop()
        return try {
            val rec = org.vosk.Recognizer(m, 16000.0f)
            val svc = org.vosk.android.SpeechService(rec, 16000.0f)
            svc.startListening(object : org.vosk.android.RecognitionListener {
                override fun onPartialResult(hyp: String?) { pull(hyp, "partial")?.let { onHeard(it, false) } }
                override fun onResult(hyp: String?) { pull(hyp, "text")?.let { onHeard(it, true) } }
                override fun onFinalResult(hyp: String?) { pull(hyp, "text")?.let { onHeard(it, true) } }
                override fun onError(e: Exception?) {}
                override fun onTimeout() {}
            })
            service = svc
            true
        } catch (_: Throwable) { false }
    }

    fun stop() {
        try { service?.stop() } catch (_: Throwable) {}
        try { service?.shutdown() } catch (_: Throwable) {}
        service = null
    }

    fun listening(): Boolean = service != null

    private fun pull(json: String?, key: String): String? = try {
        org.json.JSONObject(json ?: "{}").optString(key, "").trim().ifBlank { null }
    } catch (_: Exception) { null }

    /** Adres modelu ucha z serwera (można poprawić bez nowej wersji apki). */
    private fun earUrl(ctx: Context): String = try {
        val base = Brain.serverUrl(ctx).trimEnd('/')
        if (base.isBlank()) EAR_URL_FALLBACK else {
            val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
            client.newCall(Request.Builder().url("$base/api/assistant/brain-url").header("x-bot-pin", Brain.pin(ctx)).build())
                .execute().use { r ->
                    val u = if (r.isSuccessful) org.json.JSONObject(r.body?.string() ?: "{}").optString("ear", "") else ""
                    if (u.startsWith("http")) u else EAR_URL_FALLBACK
                }
        }
    } catch (_: Exception) { EAR_URL_FALLBACK }

    /**
     * ⬇️ Pobierz i rozpakuj model ucha (~50 MB). Z paskiem postępu, sprawdzeniem
     * miejsca i trzema próbami — jak przy mózgach, tylko mniejszy plik.
     */
    fun download(ctx: Context, onProgress: (Int) -> Unit, onDone: (Boolean, String) -> Unit) {
        downloadCancel = false
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
        val zip = File(ctx.getExternalFilesDir(null), "gadacz-ucho.zip.part")
        val url = earUrl(ctx)
        var lastErr = ""
        for (attempt in 1..3) {
            if (downloadCancel) { zip.delete(); onDone(false, "Przerwane."); return }
            try {
                client.newCall(Request.Builder().url(url).header("User-Agent", "Gadacz/1.0").build()).execute().use { resp ->
                    if (!resp.isSuccessful) { lastErr = "serwer zwrócił błąd ${resp.code}"; return@use }
                    val body = resp.body ?: run { lastErr = "pusta odpowiedź"; return@use }
                    val total = body.contentLength().coerceAtLeast(1)
                    val free = zip.parentFile?.usableSpace ?: Long.MAX_VALUE
                    if (free < total * 3 + 100L * 1024 * 1024) {
                        onDone(false, "Za mało miejsca w telefonie — potrzebuję około ${total * 3 / (1024 * 1024)} megabajtów na model i rozpakowanie.")
                        return
                    }
                    body.byteStream().use { input ->
                        zip.outputStream().use { output ->
                            val buf = ByteArray(128 * 1024); var read = 0L; var n: Int
                            while (input.read(buf).also { n = it } >= 0) {
                                if (downloadCancel) { zip.delete(); onDone(false, "Przerwane."); return }
                                output.write(buf, 0, n); read += n
                                onProgress(((read * 60) / total).toInt())   // 0-60% = pobieranie
                            }
                        }
                    }
                }
                if (zip.length() < 10L * 1024 * 1024) { lastErr = "plik niekompletny"; zip.delete(); continue }
                // 📦 Rozpakowanie (60-100%): do świeżego folderu, podmiana na końcu.
                val target = dir(ctx)
                target.deleteRecursively()
                target.mkdirs()
                var done = 0
                java.util.zip.ZipInputStream(zip.inputStream().buffered()).use { z ->
                    var e = z.nextEntry
                    while (e != null) {
                        val out = File(target, e.name)
                        if (!out.canonicalPath.startsWith(target.canonicalPath)) { e = z.nextEntry; continue }
                        if (e.isDirectory) out.mkdirs() else {
                            out.parentFile?.mkdirs()
                            out.outputStream().use { o -> z.copyTo(o) }
                        }
                        done++
                        if (done % 5 == 0) onProgress((60 + (done % 40)).coerceAtMost(99))
                        e = z.nextEntry
                    }
                }
                zip.delete()
                if (!available(ctx)) { onDone(false, "Rozpakowany model wygląda na niekompletny. Spróbuj jeszcze raz."); return }
                synchronized(this) { model?.let { try { it.close() } catch (_: Throwable) {} }; model = null }
                onProgress(100)
                onDone(true, "")
                return
            } catch (e: Exception) {
                lastErr = e.message ?: "błąd sieci"
            }
            try { Thread.sleep(2500) } catch (_: Exception) {}
        }
        zip.delete()
        onDone(false, "Nie udało się pobrać ucha ($lastErr). Spróbuj na Wi-Fi.")
    }
}
