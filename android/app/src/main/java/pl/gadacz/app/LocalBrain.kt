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

    // Zapasowy adres, gdy serwer nieosiągalny. GŁÓWNY adres bierzemy z serwera
    // (/api/assistant/brain-url) — żeby dało się poprawić link bez nowej wersji apki.
    // Qwen 2.5 0.5B (Apache) — publiczny, bez logowania; format MediaPipe .task.
    private const val MODEL_URL_FALLBACK =
        "https://huggingface.co/litert-community/Qwen2.5-0.5B-Instruct/resolve/main/Qwen2.5-0.5B-Instruct_multi-prefill-seq_q8_ekv1280.task"

    /** Adres domyślnego modelu z serwera (można go tam poprawić bez aktualizacji apki). */
    private fun modelUrl(ctx: Context): String = try {
        val base = Brain.serverUrl(ctx).trimEnd('/')
        if (base.isBlank()) MODEL_URL_FALLBACK else {
            val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
            client.newCall(Request.Builder().url("$base/api/assistant/brain-url").header("x-bot-pin", Brain.pin(ctx)).build())
                .execute().use { r ->
                    val u = if (r.isSuccessful) org.json.JSONObject(r.body?.string() ?: "{}").optString("url", "") else ""
                    if (u.startsWith("http")) u else MODEL_URL_FALLBACK
                }
        }
    } catch (_: Exception) { MODEL_URL_FALLBACK }

    /** 🧠 Lista SILNIKÓW lokalnych z serwera: (nazwa, opis, adres). Pusta = brak/serwer śpi. */
    fun brainOptions(ctx: Context): List<Triple<String, String, String>> = try {
        val base = Brain.serverUrl(ctx).trimEnd('/')
        if (base.isBlank()) emptyList() else {
            val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
            client.newCall(Request.Builder().url("$base/api/assistant/brain-url").header("x-bot-pin", Brain.pin(ctx)).build())
                .execute().use { r ->
                    if (!r.isSuccessful) return emptyList()
                    val arr = org.json.JSONObject(r.body?.string() ?: "{}").optJSONArray("options") ?: return emptyList()
                    (0 until arr.length()).mapNotNull { i ->
                        val o = arr.optJSONObject(i) ?: return@mapNotNull null
                        val u = o.optString("url"); if (!u.startsWith("http")) null
                        else Triple(o.optString("name"), o.optString("desc"), u)
                    }
                }
        }
    } catch (_: Exception) { emptyList() }

    private fun downloadedFile(ctx: Context) = File(ctx.getExternalFilesDir(null), "gadacz-mozg.task")

    private fun candidatePaths(ctx: Context): List<String> = listOf(
        downloadedFile(ctx).absolutePath,
        "/sdcard/Download/gadacz-mozg.task",
        "/storage/emulated/0/Download/gadacz-mozg.task",
    )

    private fun modelPath(ctx: Context): String? =
        candidatePaths(ctx).firstOrNull { File(it).length() > 50L * 1024 * 1024 }

    fun available(ctx: Context): Boolean = modelPath(ctx) != null

    /** 🗑️ Usuń pobrany lokalny mózg (zwalnia miejsce). Silnik najpierw zamykamy. */
    fun deleteBrain(ctx: Context): Boolean {
        synchronized(this) { llm?.let { try { it.close() } catch (_: Throwable) {} }; llm = null; loadedPath = null }
        return try {
            downloadedFile(ctx).delete()
            File(downloadedFile(ctx).absolutePath + ".part").delete()
            true
        } catch (_: Exception) { false }
    }

    /** 🏷️ Krótka nazwa wgranego mózgu do napisu na kafelku: „Mały" / „Średni" / „brak". */
    fun installedShort(ctx: Context): String {
        val p = modelPath(ctx) ?: return "brak"
        val mb = File(p).length() / (1024 * 1024)
        return when { mb >= 1000 -> "Średni"; mb >= 300 -> "Mały"; else -> "jest" }
    }

    /** 🏷️ Który mózg jest wgrany — rozpoznawany po ROZMIARZE pliku. */
    fun installedName(ctx: Context): String {
        val p = modelPath(ctx) ?: return "brak"
        val mb = File(p).length() / (1024 * 1024)
        return when {
            mb >= 1000 -> "Średni (Qwen 1.5B), około $mb megabajtów"
            mb >= 300  -> "Mały (Qwen 0.5B), około $mb megabajtów"
            else       -> "nieznany, około $mb megabajtów"
        }
    }

    /** 🧮 Czy telefon UDŹWIGNIE ten mózg? Model potrzebuje w RAM mniej więcej tyle,
     *  ile waży plik. Jeśli wolnej pamięci jest mniej — NIE ładujemy (inaczej cały
     *  proces pada z OutOfMemory). Zwraca komunikat błędu albo null gdy OK. */
    fun tooBigForRam(ctx: Context): String? {
        val p = modelPath(ctx) ?: return null
        val fileMb = File(p).length() / (1024 * 1024)
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val mi = android.app.ActivityManager.MemoryInfo(); am.getMemoryInfo(mi)
        val freeMb = mi.availMem / (1024 * 1024)
        // Zapas 300 MB dla reszty apki; model bierze ~rozmiar pliku.
        return if (freeMb < fileMb + 300)
            "Ten mózg (${fileMb} megabajtów) nie mieści się w wolnej pamięci telefonu (${freeMb} megabajtów wolne). Pobierz MNIEJSZY mózg — Mały — w Ustawieniach, Silniki, albo zamknij inne aplikacje. Do mądrzejszych odpowiedzi użyj internetu i serwera."
        else null
    }

    @Synchronized  // dwa wątki nie mogą naraz utworzyć modelu (wyciek ~GB). Audyt 10.07.
    private fun ensure(ctx: Context): com.google.mediapipe.tasks.genai.llminference.LlmInference? {
        val path = modelPath(ctx) ?: return null
        // Nowy plik (np. po pobraniu albo podmianie na większy) → przeładuj silnik.
        if (llm != null && loadedPath == path) return llm
        // 🛡️ Za duży model na tę pamięć → NIE ładuj (inaczej OOM ubija całą apkę).
        if (tooBigForRam(ctx) != null) return null
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

    /**
     * 🗨️ Pamięć ROZMOWY offline: ostatnie wymiany zdań trzymane w telefonie, żeby
     * mały mózg rozumiał „a on?", „powtórz to inaczej" — jak w prawdziwej rozmowie.
     */
    private fun history(ctx: Context): List<String> = try {
        val arr = JSONArray(Brain.prefs(ctx).getString("local_hist", "") ?: "[]")
        (0 until arr.length()).map { arr.optString(it) }
    } catch (_: Exception) { emptyList() }

    private fun remember(ctx: Context, q: String, a: String) = try {
        val cur = history(ctx).takeLast(4).toMutableList()
        cur.add("Użytkownik: ${q.take(150)}"); cur.add("Gadacz: ${a.take(150)}")
        Brain.prefs(ctx).edit().putString("local_hist", JSONArray(cur.takeLast(6)).toString()).apply()
    } catch (_: Exception) {}

    /** Odpowiedz lokalnie (offline). null = mózg niedostępny albo zawiódł. */
    fun answer(ctx: Context, question: String): String? {
        // 🛡️ Za duży model na tę pamięć → powiedz to wprost (zamiast wywalać apkę).
        tooBigForRam(ctx)?.let { return it }
        val engine = ensure(ctx) ?: return null
        return try {
            val facts = memoryFor(ctx, question)
            val hist = history(ctx).joinToString("\n")
            val prompt = "Jesteś Gadacz — polski asystent głosowy. Odpowiadaj PO POLSKU, " +
                "krótko i konkretnie, pełnymi zdaniami, bez gwiazdek i list — tekst będzie " +
                "czytany na głos. Gdy nie wiesz, powiedz uczciwie, że nie wiesz.\n" +
                (if (facts.isNotBlank()) "Wiesz o użytkowniku:\n$facts\n" else "") +
                (if (hist.isNotBlank()) "Ostatnia rozmowa:\n$hist\n" else "") +
                "Pytanie: ${question.take(400)}\nOdpowiedź:"
            engine.generateResponse(prompt)?.trim()?.take(600)?.ifBlank { null }
                ?.also { remember(ctx, question, it) }
        } catch (_: Throwable) { null }
    }

    /**
     * ⬇️ Pobierz model przyciskiem — bez limitu czasu, z paskiem postępu i przerwaniem.
     * ODPORNE NA DUŻE PLIKI (Średni ~1,5 GB — tu sieć LUBI paść w połowie):
     *  - najpierw sprawdzamy, czy w telefonie JEST MIEJSCE (i mówimy po ludzku, ile brakuje),
     *  - zerwane połączenie NIE kasuje tego, co już zeszło — WZNAWIAMY od tego miejsca
     *    (nagłówek Range), automatycznie, do ośmiu prób,
     *  - plik ląduje najpierw w .part; podmiana dopiero po KOMPLETNYM pobraniu.
     */
    fun downloadModel(ctx: Context, chosenUrl: String? = null, onProgress: (Int) -> Unit, onDone: (Boolean, String) -> Unit) {
        downloadCancel = false
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
        val out = downloadedFile(ctx)
        val tmp = File(out.absolutePath + ".part")
        val url = chosenUrl ?: modelUrl(ctx)
        // Kawałek z POPRZEDNIEJ próby wznawiamy tylko, gdy to TEN SAM silnik —
        // resztka po innym modelu dałaby posklejany, zepsuty mózg.
        val prevUrl = Brain.prefs(ctx).getString("brain_part_url", "") ?: ""
        if (tmp.exists() && prevUrl != url) tmp.delete()
        Brain.prefs(ctx).edit().putString("brain_part_url", url).apply()
        var lastErr = ""
        for (attempt in 1..8) {
            if (downloadCancel) { onDone(false, "Przerwane. To, co zeszło, zostaje — następna próba ruszy od tego miejsca."); return }
            var finished = false
            try {
                val have = tmp.length()
                val reqB = Request.Builder().url(url).header("User-Agent", "Gadacz/1.0")
                if (have > 0) reqB.header("Range", "bytes=$have-")
                client.newCall(reqB.build()).execute().use { resp ->
                    if (resp.code == 401 || resp.code == 403) {
                        onDone(false, "Ten model wymaga logowania i nie da się go pobrać automatycznie. Powiem opiekunowi, żeby podał inny link — a Ty możesz wgrać plik ręcznie do folderu Pobrane pod nazwą gadacz-mozg kropka task.")
                        return
                    }
                    if (resp.code == 416) { tmp.delete(); lastErr = "zły zakres wznowienia — zaczynam od zera"; return@use }
                    if (!resp.isSuccessful) { lastErr = "serwer modeli zwrócił błąd ${resp.code}"; return@use }
                    val resumed = resp.code == 206 && have > 0
                    if (!resumed && have > 0) tmp.delete()   // serwer nie umie wznowić — od zera
                    val already = if (resumed) have else 0L
                    val body = resp.body ?: run { lastErr = "pusta odpowiedź serwera"; return@use }
                    val remaining = body.contentLength()
                    val total = if (remaining > 0) remaining + already else -1L
                    // 🧮 MIEJSCE: sprawdź ZANIM polecą gigabajty — i powiedz konkretnie, ile brakuje.
                    val free = out.parentFile?.usableSpace ?: Long.MAX_VALUE
                    if (remaining > 0 && free < remaining + 200L * 1024 * 1024) {
                        val needMb = remaining / (1024 * 1024); val freeMb = free / (1024 * 1024)
                        onDone(false, "Za mało miejsca w telefonie. Potrzebuję jeszcze około $needMb megabajtów, a wolne jest tylko $freeMb. Usuń trochę zdjęć, filmów albo aplikacji i spróbuj znowu — pobieranie ruszy od miejsca, w którym stanęło.")
                        return
                    }
                    body.byteStream().use { input ->
                        java.io.FileOutputStream(tmp, resumed).use { output ->
                            val buf = ByteArray(256 * 1024); var read = already; var n: Int
                            while (input.read(buf).also { n = it } >= 0) {
                                if (downloadCancel) { onDone(false, "Przerwane. To, co zeszło, zostaje — następna próba ruszy od tego miejsca."); return }
                                output.write(buf, 0, n); read += n
                                if (total > 0) onProgress(((read * 100) / total).toInt())
                            }
                        }
                    }
                    // Połączenie padło w połowie? Plik krótszy niż zapowiedziany = wznów.
                    if (total > 0 && tmp.length() < total) { lastErr = "połączenie przerwane w trakcie"; return@use }
                    finished = true
                }
            } catch (e: Exception) {
                lastErr = e.message ?: "błąd sieci"   // .part ZOSTAJE — wznowimy od tego miejsca
            }
            if (finished) {
                if (tmp.length() < 50L * 1024 * 1024) { tmp.delete(); onDone(false, "Pobrany plik jest niekompletny. Spróbuj jeszcze raz."); return }
                out.delete(); tmp.renameTo(out)
                Brain.prefs(ctx).edit().remove("brain_part_url").apply()
                synchronized(this) { llm?.let { try { it.close() } catch (_: Throwable) {} }; llm = null; loadedPath = null }
                onDone(true, "")
                return
            }
            try { Thread.sleep(3000L * attempt.coerceAtMost(3)) } catch (_: Exception) {}
        }
        val gotMb = tmp.length() / (1024 * 1024)
        onDone(false, "Sieć zrywała się mimo ośmiu prób ($lastErr). Zdążyłem pobrać $gotMb megabajtów i to ZOSTAJE — spróbuj jeszcze raz, najlepiej na Wi-Fi, a dokończę od tego miejsca.")
    }
}
