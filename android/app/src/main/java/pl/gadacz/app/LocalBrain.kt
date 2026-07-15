package pl.gadacz.app

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * 🤏 PIĘTRO 6 (rozbudowane): lokalny mały mózg — model AI w telefonie.
 *
 * Działa całkowicie BEZ internetu i BEZ klucza (zero kosztów) — to serce trybu
 * darmowego, gdy odruchy i autopilot nie wystarczą.
 *
 * Skąd model (pierwszy z brzegu wygrywa):
 *  1. pobrany przyciskiem „Pobierz lokalny mózg" (folder prywatny aplikacji),
 *  2. wgrany ręcznie do Pobranych jako gadacz-mozg.task — np. WIĘKSZY model
 *     (Gemma 4B), jeśli telefon ma dużo pamięci; podmiana pliku = lepszy mózg.
 *
 * Co umie ponad zwykłe „odpowiedz na pytanie":
 *  - zna PAMIĘĆ użytkownika offline (lustro faktów w telefonie): imiona, dawki
 *    leków, kody — bo po to Gadacz je zapamiętywał,
 *  - odpowiada pod czytanie NA GŁOS (krótko, pełne zdania, bez gwiazdek).
 */
object LocalBrain {
    @Volatile private var llm: com.google.mediapipe.tasks.genai.llminference.LlmInference? = null
    @Volatile private var loadedPath: String? = null
    @Volatile var downloadCancel = false

    // Gemma 3 1B (int4, ~0.5 GB) w formacie MediaPipe .task — mały, ale rozmowny,
    // dobrze zna polski. Publiczne wydanie społeczności LiteRT.
    private const val MODEL_URL =
        "https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4.task"

    private fun downloadedFile(ctx: Context) = File(ctx.getExternalFilesDir(null), "gadacz-mozg.task")

    private fun candidatePaths(ctx: Context): List<String> = listOf(
        downloadedFile(ctx).absolutePath,
        "/sdcard/Download/gadacz-mozg.task",
        "/storage/emulated/0/Download/gadacz-mozg.task",
    )

    private fun modelPath(ctx: Context): String? =
        candidatePaths(ctx).firstOrNull { File(it).length() > 50L * 1024 * 1024 }

    fun available(ctx: Context): Boolean = modelPath(ctx) != null

    @Synchronized  // dwa wątki nie mogą naraz utworzyć modelu (wyciek ~GB). Audyt 10.07.
    private fun ensure(ctx: Context): com.google.mediapipe.tasks.genai.llminference.LlmInference? {
        val path = modelPath(ctx) ?: return null
        // Nowy plik (np. po pobraniu albo podmianie na większy) → przeładuj silnik.
        if (llm != null && loadedPath == path) return llm
        llm?.let { try { it.close() } catch (_: Throwable) {} }
        llm = null
        return try {
            val opts = com.google.mediapipe.tasks.genai.llminference.LlmInference.LlmInferenceOptions.builder()
                .setModelPath(path)
                .setMaxTokens(512)
                .build()
            com.google.mediapipe.tasks.genai.llminference.LlmInference
                .createFromOptions(ctx.applicationContext, opts)
                .also { llm = it; loadedPath = path }
        } catch (_: Throwable) { null }
    }

    /**
     * 🧠 Pamięć offline: telefon trzyma lustro faktów (memory_mirror z serwera).
     * Do promptu idą fakty pasujące do pytania — mały mózg zna użytkownika
     * bez internetu, dokładnie po to Gadacz je zapamiętywał.
     */
    private fun memoryFor(ctx: Context, question: String): String = try {
        val raw = Brain.prefs(ctx).getString("memory_mirror", "") ?: ""
        if (raw.isBlank()) "" else {
            val arr = JSONArray(raw)
            val all = (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotBlank() }
            val qWords = question.lowercase().split(Regex("[^a-ząćęłńóśźż0-9]+")).filter { it.length > 3 }.toSet()
            val hits = all.filter { f -> qWords.any { f.lowercase().contains(it) } }.take(6)
            (if (hits.isNotEmpty()) hits else all.takeLast(4)).joinToString("\n")
        }
    } catch (_: Exception) { "" }

    /** Odpowiedz lokalnie (offline). null = mózg niedostępny albo zawiódł. */
    fun answer(ctx: Context, question: String): String? {
        val engine = ensure(ctx) ?: return null
        return try {
            val facts = memoryFor(ctx, question)
            val prompt = "Jesteś Gadacz — polski asystent głosowy. Odpowiadaj PO POLSKU, " +
                "krótko i konkretnie, pełnymi zdaniami, bez gwiazdek i list — tekst będzie " +
                "czytany na głos. Gdy nie wiesz, powiedz uczciwie, że nie wiesz.\n" +
                (if (facts.isNotBlank()) "Wiesz o użytkowniku:\n$facts\n" else "") +
                "Pytanie: ${question.take(400)}\nOdpowiedź:"
            engine.generateResponse(prompt)?.trim()?.take(600)?.ifBlank { null }
        } catch (_: Throwable) { null }
    }

    /**
     * ⬇️ Pobierz model przyciskiem — bez limitu czasu (plik ~0.5 GB), z paskiem
     * postępu i możliwością przerwania. Najpierw do pliku .part, na koniec
     * podmiana — przerwane pobieranie nie zostawia uszkodzonego mózgu.
     */
    fun downloadModel(ctx: Context, onProgress: (Int) -> Unit, onDone: (Boolean, String) -> Unit) {
        downloadCancel = false
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
        val out = downloadedFile(ctx)
        val tmp = File(out.absolutePath + ".part")
        try {
            client.newCall(Request.Builder().url(MODEL_URL).build()).execute().use { resp ->
                if (!resp.isSuccessful) { onDone(false, "Serwer modeli zwrócił błąd ${resp.code}."); return }
                val body = resp.body ?: run { onDone(false, "Pusta odpowiedź serwera."); return }
                val total = body.contentLength().coerceAtLeast(1)
                body.byteStream().use { input ->
                    tmp.outputStream().use { output ->
                        val buf = ByteArray(256 * 1024); var read = 0L; var n: Int
                        while (input.read(buf).also { n = it } >= 0) {
                            if (downloadCancel) { tmp.delete(); onDone(false, "Przerwane."); return }
                            output.write(buf, 0, n); read += n
                            onProgress(((read * 100) / total).toInt())
                        }
                    }
                }
            }
            if (tmp.length() < 50L * 1024 * 1024) { tmp.delete(); onDone(false, "Pobrany plik jest niekompletny."); return }
            out.delete(); tmp.renameTo(out)
            synchronized(this) { llm?.let { try { it.close() } catch (_: Throwable) {} }; llm = null; loadedPath = null }
            onDone(true, "")
        } catch (e: Exception) {
            tmp.delete()
            onDone(false, e.message ?: "błąd sieci")
        }
    }
}
