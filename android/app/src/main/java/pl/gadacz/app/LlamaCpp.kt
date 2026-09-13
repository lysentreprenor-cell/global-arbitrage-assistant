package pl.gadacz.app

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * ✍️ SILNIK PISANIA (llama.cpp) — nowy, STABILNY silnik do pisania offline, który
 * zastępuje kapryśny silnik Google (MediaPipe) wywalający apkę.
 *
 * Model w formacie GGUF (Qwen 2.5 1.5B, ~1 GB) pobiera się raz przyciskiem
 * w Ustawieniach → Silniki. Potem pisze CAŁKOWICIE offline, za darmo, bez limitu.
 */
object LlamaCpp {
    @Volatile private var loaded = false
    @Volatile var downloadCancel = false

    private const val URL_FALLBACK =
        "https://github.com/lysentreprenor-cell/global-arbitrage-assistant/releases/download/gadacz-brain/gadacz-pisanie.gguf"

    fun libReady(): Boolean {
        if (loaded) return true
        return try { System.loadLibrary("gadaczllama"); loaded = true; true }
        catch (_: Throwable) { false }
    }

    private external fun nativeHello(): String
    private external fun nativeGenerate(modelPath: String, prompt: String, maxTokens: Int, threads: Int): String

    fun hello(): String =
        if (libReady()) try { nativeHello() } catch (_: Throwable) { "błąd wywołania natywnego" }
        else "biblioteka silnika pisania niewczytana"

    fun modelFile(ctx: Context) = File(ctx.getExternalFilesDir(null), "gadacz-pisanie.gguf")
    fun available(ctx: Context): Boolean = modelFile(ctx).length() > 100L * 1024 * 1024

    /** Adres modelu z serwera (pole "writing" z /brain-url), z bezpiecznym zapasem. */
    private fun modelUrl(ctx: Context): String = try {
        val base = Brain.serverUrl(ctx).trimEnd('/')
        if (base.isBlank()) URL_FALLBACK else {
            val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
            client.newCall(Request.Builder().url("$base/api/assistant/brain-url").header("x-bot-pin", Brain.pin(ctx)).build())
                .execute().use { r ->
                    val u = if (r.isSuccessful) org.json.JSONObject(r.body?.string() ?: "{}").optString("writing", "") else ""
                    if (u.startsWith("http")) u else URL_FALLBACK
                }
        }
    } catch (_: Exception) { URL_FALLBACK }

    /**
     * ✍️ Odpowiedz lokalnie NOWYM silnikiem (llama.cpp). null = brak modelu/biblioteki
     * albo błąd. Wołaj POZA głównym wątkiem — generowanie trwa. Format ChatML (Qwen).
     */
    fun answer(ctx: Context, question: String): String? {
        if (!available(ctx) || !libReady()) return null
        val sys = "Jesteś Gadacz — polski asystent głosowy. Odpowiadaj PO POLSKU, " +
            "krótko i konkretnie, pełnymi zdaniami, bez gwiazdek i list — tekst może być czytany na głos."
        val prompt = "<|im_start|>system\n$sys<|im_end|>\n" +
            "<|im_start|>user\n${question.take(600)}<|im_end|>\n" +
            "<|im_start|>assistant\n"
        val cores = Runtime.getRuntime().availableProcessors().coerceIn(2, 6)
        // 🪤 Czujnik natywnego upadku (jak przy MediaPipe) — llama.cpp jest stabilny,
        //    ale uszkodzony plik GGUF mógłby paść bez śladu w Javie.
        val wd = File(ctx.filesDir, "writing_running.flag")
        try { wd.writeText("Silnik pisania myślał nad: " + question.take(200)) } catch (_: Throwable) {}
        return try {
            generate(modelFile(ctx).absolutePath, prompt, maxTokens = 220, threads = cores)
        } finally { try { wd.delete() } catch (_: Throwable) {} }
    }

    /** Czy poprzednie otwarcie padło w silniku pisania? (analogicznie do lokalnego mózgu) */
    fun crashedInWriting(ctx: Context): String? {
        val wd = File(ctx.filesDir, "writing_running.flag")
        if (!wd.exists()) return null
        val what = try { wd.readText() } catch (_: Exception) { "" }
        try { wd.delete() } catch (_: Exception) {}
        return what.ifBlank { "Silnik pisania" }
    }

    fun generate(modelPath: String, prompt: String, maxTokens: Int = 200, threads: Int = 4): String? {
        if (!libReady()) return null
        return try {
            val r = nativeGenerate(modelPath, prompt, maxTokens, threads).trim()
            if (r.startsWith("BLAD:") || r.isBlank() || r == "(pusto)") null else r
        } catch (_: Throwable) { null }
    }

    fun deleteModel(ctx: Context): Boolean = try {
        modelFile(ctx).delete(); File(modelFile(ctx).absolutePath + ".part").delete(); true
    } catch (_: Exception) { false }

    /**
     * ⬇️ Pobierz model GGUF (~1 GB) — wznawialnie (nagłówek Range, 8 prób), z paskiem
     * postępu i sprawdzeniem miejsca. Plik ląduje w .part, podmiana po komplecie.
     */
    fun download(ctx: Context, onProgress: (Int) -> Unit, onDone: (Boolean, String) -> Unit) {
        downloadCancel = false
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS).callTimeout(0, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS).retryOnConnectionFailure(true).build()
        val out = modelFile(ctx)
        val tmp = File(out.absolutePath + ".part")
        val url = modelUrl(ctx)
        var lastErr = ""
        for (attempt in 1..8) {
            if (downloadCancel) { onDone(false, "Przerwane. To, co zeszło, zostaje — następna próba ruszy od tego miejsca."); return }
            var finished = false
            try {
                val have = tmp.length()
                val reqB = Request.Builder().url(url).header("User-Agent", "Gadacz/1.0")
                if (have > 0) reqB.header("Range", "bytes=$have-")
                client.newCall(reqB.build()).execute().use { resp ->
                    if (resp.code == 401 || resp.code == 403) { onDone(false, "Model pisania wymaga logowania i nie da się pobrać automatycznie. Powiem opiekunowi, żeby poprawił link."); return }
                    if (resp.code == 416) { tmp.delete(); lastErr = "zły zakres — od zera"; return@use }
                    if (!resp.isSuccessful) { lastErr = "serwer zwrócił błąd ${resp.code}"; return@use }
                    val resumed = resp.code == 206 && have > 0
                    if (!resumed && have > 0) tmp.delete()
                    val already = if (resumed) have else 0L
                    val body = resp.body ?: run { lastErr = "pusta odpowiedź"; return@use }
                    val remaining = body.contentLength()
                    val total = if (remaining > 0) remaining + already else -1L
                    val free = out.parentFile?.usableSpace ?: Long.MAX_VALUE
                    if (remaining > 0 && free < remaining + 200L * 1024 * 1024) {
                        val needMb = remaining / (1024 * 1024); val freeMb = free / (1024 * 1024)
                        onDone(false, "Za mało miejsca. Potrzebuję jeszcze około $needMb megabajtów, a wolne jest $freeMb. Zwolnij miejsce i spróbuj znowu — pobieranie ruszy od miejsca, gdzie stanęło.")
                        return
                    }
                    body.byteStream().use { input ->
                        java.io.FileOutputStream(tmp, resumed).use { output ->
                            val buf = ByteArray(256 * 1024); var read = already; var n: Int
                            while (input.read(buf).also { n = it } >= 0) {
                                if (downloadCancel) { onDone(false, "Przerwane. To, co zeszło, zostaje."); return }
                                output.write(buf, 0, n); read += n
                                if (total > 0) onProgress(((read * 100) / total).toInt())
                            }
                        }
                    }
                    if (total > 0 && tmp.length() < total) { lastErr = "połączenie przerwane w trakcie"; return@use }
                    finished = true
                }
            } catch (e: Exception) { lastErr = e.message ?: "błąd sieci" }
            if (finished) {
                if (tmp.length() < 100L * 1024 * 1024) { tmp.delete(); onDone(false, "Pobrany plik jest niekompletny. Spróbuj jeszcze raz."); return }
                out.delete(); tmp.renameTo(out)
                onProgress(100); onDone(true, ""); return
            }
            try { Thread.sleep(3000L * attempt.coerceAtMost(3)) } catch (_: Exception) {}
        }
        val gotMb = tmp.length() / (1024 * 1024)
        onDone(false, "Sieć zrywała się mimo ośmiu prób ($lastErr). Zdążyłem pobrać $gotMb megabajtów i to ZOSTAJE — spróbuj jeszcze raz na Wi-Fi.")
    }
}
