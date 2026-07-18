package pl.gadacz.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * 👄 USTA GADACZA — piękne, naturalne polskie głosy OFFLINE (Piper przez
 * sherpa-onnx; wszystko otwarte, licencje Apache/MIT).
 *
 * 🗣️ GŁOSY DO WYBORU (każdy ~70 MB, pobierany osobno w Ustawieniach → GŁOSY):
 *  - gosia    — kobiecy, ciepły,
 *  - darkman  — męski, głęboki,
 *  - mcspeech — męski, wyraźny, spikerski.
 * Wybrany głos pamiętamy; wyłączone usta = mówi głos systemowy, jak dotąd.
 */
object PiperUsta {
    @Volatile private var engine: com.k2fsa.sherpa.onnx.OfflineTts? = null
    @Volatile private var loadedKey: String? = null
    @Volatile private var track: AudioTrack? = null
    @Volatile private var worker: Thread? = null
    @Volatile private var generation = 0   // stopNow() podbija — stare zlecenia gasną
    @Volatile var downloadCancel = false
    private val queue = LinkedBlockingQueue<Triple<String, Int, () -> Unit>>()

    val VOICE_KEYS = listOf("gosia", "darkman", "mcspeech")
    private const val BRAIN_REL =
        "https://github.com/lysentreprenor-cell/global-arbitrage-assistant/releases/download/gadacz-brain"
    private fun fallbackUrl(key: String) = when (key) {
        "darkman" -> "$BRAIN_REL/gadacz-usta-darkman.zip"
        "mcspeech" -> "$BRAIN_REL/gadacz-usta-mcspeech.zip"
        else -> "$BRAIN_REL/gadacz-usta.zip"
    }

    // Gosia mieszka w starym folderze gadacz-usta (zgodność z tym, co już pobrane).
    private fun dirFor(ctx: Context, key: String) = File(ctx.getExternalFilesDir(null),
        if (key == "gosia") "gadacz-usta" else "gadacz-usta-$key")

    private fun modelDirFor(ctx: Context, key: String): File? {
        val d = dirFor(ctx, key)
        fun has(f: File) = f.listFiles()?.any { it.name.endsWith(".onnx") } == true
        if (has(d)) return d
        return d.listFiles()?.firstOrNull { it.isDirectory && has(it) }
    }

    fun voiceInstalled(ctx: Context, key: String): Boolean = modelDirFor(ctx, key) != null
    fun available(ctx: Context): Boolean = VOICE_KEYS.any { voiceInstalled(ctx, it) }

    /** 🗣️ Który głos jest WYBRANY (może nie być jeszcze pobrany). */
    fun selectedVoice(ctx: Context): String = Brain.prefs(ctx).getString("piper_voice_key", "gosia") ?: "gosia"
    fun setSelectedVoice(ctx: Context, key: String) {
        Brain.prefs(ctx).edit().putString("piper_voice_key", key).apply()
        synchronized(this) { engine?.let { try { it.release() } catch (_: Throwable) {} }; engine = null; loadedKey = null }
    }

    /** Włączone = jakiś głos wgrany ORAZ nie wyłączone ręcznie w Ustawieniach. */
    fun enabled(ctx: Context): Boolean =
        available(ctx) && Brain.prefs(ctx).getBoolean("piper_on", true)

    fun setEnabled(ctx: Context, on: Boolean) { Brain.prefs(ctx).edit().putBoolean("piper_on", on).apply() }

    @Synchronized
    private fun ensure(ctx: Context): com.k2fsa.sherpa.onnx.OfflineTts? {
        // Graj wybranym głosem; gdy niepobrany — pierwszym, który JEST w telefonie.
        val key = selectedVoice(ctx).takeIf { voiceInstalled(ctx, it) }
            ?: VOICE_KEYS.firstOrNull { voiceInstalled(ctx, it) } ?: return null
        engine?.let { if (loadedKey == key) return it }
        engine?.let { try { it.release() } catch (_: Throwable) {} }
        engine = null; loadedKey = null
        val md = modelDirFor(ctx, key) ?: return null
        val onnx = md.listFiles()?.firstOrNull { it.name.endsWith(".onnx") } ?: return null
        val tokens = File(md, "tokens.txt")
        val espeak = File(md, "espeak-ng-data")
        if (!tokens.exists() || !espeak.exists()) return null
        return try {
            val cfg = com.k2fsa.sherpa.onnx.OfflineTtsConfig(
                model = com.k2fsa.sherpa.onnx.OfflineTtsModelConfig(
                    vits = com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig(
                        model = onnx.absolutePath,
                        tokens = tokens.absolutePath,
                        dataDir = espeak.absolutePath,
                    ),
                    numThreads = 2,
                ),
            )
            com.k2fsa.sherpa.onnx.OfflineTts(config = cfg).also { engine = it; loadedKey = key }
        } catch (_: Throwable) { null }
    }

    /**
     * 🗣️ Powiedz tekst pięknym głosem. onDone woła się po WYBRZMIENIU ostatniej
     * próbki (jak systemowy utterance listener). Zwraca false, gdy ust nie ma —
     * wtedy mówi głos systemowy.
     */
    fun speak(ctx: Context, text: String, onDone: () -> Unit): Boolean {
        val e = ensure(ctx) ?: return false
        queue.offer(Triple(text, generation, onDone))
        startWorker(ctx, e)
        return true
    }

    /** ⏹ Zamilcz NATYCHMIAST: utnij dźwięk i wyrzuć kolejkę (wejście w słowo). */
    fun stopNow() {
        generation++
        queue.clear()
        try { track?.pause(); track?.flush(); track?.stop() } catch (_: Throwable) {}
    }

    fun speaking(): Boolean = queue.isNotEmpty() || track?.playState == AudioTrack.PLAYSTATE_PLAYING

    @Synchronized
    private fun startWorker(ctx: Context, e: com.k2fsa.sherpa.onnx.OfflineTts) {
        if (worker?.isAlive == true) return
        worker = Thread {
            while (true) {
                val item = queue.poll(20, TimeUnit.SECONDS) ?: break
                val (text, gen, onDone) = item
                if (gen != generation) { onDone(); continue }   // ucięte zanim doszło do głosu
                try {
                    val audio = e.generate(text = text.take(1500), sid = 0, speed = 1.0f)
                    val samples = audio.samples
                    val sr = audio.sampleRate
                    if (gen != generation || samples.isEmpty()) { onDone(); continue }
                    val minBuf = AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
                    val at = AudioTrack.Builder()
                        .setAudioAttributes(AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                        .setAudioFormat(AudioFormat.Builder()
                            .setSampleRate(sr)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build())
                        .setBufferSizeInBytes(maxOf(minBuf, 32 * 1024))
                        .build()   // domyślny tryb Buildera to strumień (MODE_STREAMING)
                    track = at
                    at.play()
                    var off = 0
                    while (off < samples.size && gen == generation) {
                        val n = at.write(samples, off, minOf(8192, samples.size - off), AudioTrack.WRITE_BLOCKING)
                        if (n <= 0) break
                        off += n
                    }
                    // Poczekaj, aż OSTATNIA próbka wybrzmi (write tylko buforuje).
                    while (gen == generation && at.playState == AudioTrack.PLAYSTATE_PLAYING &&
                        at.playbackHeadPosition < samples.size) {
                        try { Thread.sleep(40) } catch (_: Exception) { break }
                    }
                    try { at.stop() } catch (_: Throwable) {}
                    try { at.release() } catch (_: Throwable) {}
                    if (track === at) track = null
                } catch (_: Throwable) {
                    // Usta zawiodły przy tym zdaniu — nie blokuj rozmowy.
                } finally {
                    onDone()
                }
            }
            synchronized(this@PiperUsta) { if (worker === Thread.currentThread()) worker = null }
        }.apply { priority = Thread.NORM_PRIORITY + 1; start() }
    }

    /** Adres głosu z serwera (lista "voices" w /brain-url); zapas — nasz GitHub. */
    private fun voiceUrl(ctx: Context, key: String): String = try {
        val base = Brain.serverUrl(ctx).trimEnd('/')
        if (base.isBlank()) fallbackUrl(key) else {
            val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
            client.newCall(Request.Builder().url("$base/api/assistant/brain-url").header("x-bot-pin", Brain.pin(ctx)).build())
                .execute().use { r ->
                    if (!r.isSuccessful) return fallbackUrl(key)
                    val arr = org.json.JSONObject(r.body?.string() ?: "{}").optJSONArray("voices")
                    var u = ""
                    if (arr != null) for (i in 0 until arr.length()) {
                        val o = arr.optJSONObject(i) ?: continue
                        if (o.optString("key") == key) { u = o.optString("url"); break }
                    }
                    if (u.startsWith("http")) u else fallbackUrl(key)
                }
        }
    } catch (_: Exception) { fallbackUrl(key) }

    /** ⬇️ Pobierz i rozpakuj WYBRANY głos (~70 MB): postęp, miejsce, 3 próby. */
    fun download(ctx: Context, key: String, onProgress: (Int) -> Unit, onDone: (Boolean, String) -> Unit) {
        downloadCancel = false
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
        val zip = File(ctx.getExternalFilesDir(null), "gadacz-usta-$key.zip.part")
        val url = voiceUrl(ctx, key)
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
                        onDone(false, "Za mało miejsca w telefonie — potrzebuję około ${total * 3 / (1024 * 1024)} megabajtów.")
                        return
                    }
                    body.byteStream().use { input ->
                        zip.outputStream().use { output ->
                            val buf = ByteArray(128 * 1024); var read = 0L; var n: Int
                            while (input.read(buf).also { n = it } >= 0) {
                                if (downloadCancel) { zip.delete(); onDone(false, "Przerwane."); return }
                                output.write(buf, 0, n); read += n
                                onProgress(((read * 60) / total).toInt())
                            }
                        }
                    }
                }
                if (zip.length() < 20L * 1024 * 1024) { lastErr = "plik niekompletny"; zip.delete(); continue }
                val target = dirFor(ctx, key)
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
                        if (done % 20 == 0) onProgress((60 + (done % 40)).coerceAtMost(99))
                        e = z.nextEntry
                    }
                }
                zip.delete()
                if (!voiceInstalled(ctx, key)) { onDone(false, "Rozpakowany głos wygląda na niekompletny. Spróbuj jeszcze raz."); return }
                setSelectedVoice(ctx, key)   // świeżo pobrany głos od razu przejmuje mowę
                setEnabled(ctx, true)
                onProgress(100)
                onDone(true, "")
                return
            } catch (e: Exception) {
                lastErr = e.message ?: "błąd sieci"
            }
            try { Thread.sleep(2500) } catch (_: Exception) {}
        }
        zip.delete()
        onDone(false, "Nie udało się pobrać głosu ($lastErr). Spróbuj na Wi-Fi.")
    }
}
