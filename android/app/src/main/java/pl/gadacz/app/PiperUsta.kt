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
 * 👄 USTA GADACZA — piękny, naturalny polski głos OFFLINE (Piper „Gosia"
 * uruchamiany silnikiem sherpa-onnx; wszystko otwarte, licencje Apache/MIT).
 *
 * Po co, skoro Android ma swój głos? Bo najładniejsze głosy systemowe działają
 * tylko z internetem — offline zostaje „stara Ivona". Usta brzmią jak człowiek
 * ZAWSZE, także bez sieci i bez wydawania grosza.
 *
 * Model (~80 MB) pobiera się raz w Ustawieniach → SILNIKI. Brak modelu albo
 * wyłączenie w ustawieniach = mówi głos systemowy, jak dotąd.
 */
object PiperUsta {
    @Volatile private var engine: com.k2fsa.sherpa.onnx.OfflineTts? = null
    @Volatile private var track: AudioTrack? = null
    @Volatile private var worker: Thread? = null
    @Volatile private var generation = 0   // stopNow() podbija — stare zlecenia gasną
    @Volatile var downloadCancel = false
    private val queue = LinkedBlockingQueue<Triple<String, Int, () -> Unit>>()

    private const val MOUTH_URL_FALLBACK =
        "https://github.com/lysentreprenor-cell/global-arbitrage-assistant/releases/download/gadacz-brain/gadacz-usta.zip"

    private fun dir(ctx: Context) = File(ctx.getExternalFilesDir(null), "gadacz-usta")

    /** Folder z modelem: szukamy pliku .onnx (zip ma podfolder z nazwą głosu). */
    private fun modelDir(ctx: Context): File? {
        val d = dir(ctx)
        fun has(f: File) = f.listFiles()?.any { it.name.endsWith(".onnx") } == true
        if (has(d)) return d
        return d.listFiles()?.firstOrNull { it.isDirectory && has(it) }
    }

    fun available(ctx: Context): Boolean = modelDir(ctx) != null

    /** Włączone = wgrane ORAZ nie wyłączone ręcznie w Ustawieniach. */
    fun enabled(ctx: Context): Boolean =
        available(ctx) && Brain.prefs(ctx).getBoolean("piper_on", true)

    fun setEnabled(ctx: Context, on: Boolean) { Brain.prefs(ctx).edit().putBoolean("piper_on", on).apply() }

    @Synchronized
    private fun ensure(ctx: Context): com.k2fsa.sherpa.onnx.OfflineTts? {
        engine?.let { return it }
        val md = modelDir(ctx) ?: return null
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
            com.k2fsa.sherpa.onnx.OfflineTts(config = cfg).also { engine = it }
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
                        .setTransferMode(AudioTrack.MODE_STREAMING)
                        .setBufferSizeInBytes(maxOf(minBuf, 32 * 1024))
                        .build()
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

    private fun mouthUrl(ctx: Context): String = try {
        val base = Brain.serverUrl(ctx).trimEnd('/')
        if (base.isBlank()) MOUTH_URL_FALLBACK else {
            val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
            client.newCall(Request.Builder().url("$base/api/assistant/brain-url").header("x-bot-pin", Brain.pin(ctx)).build())
                .execute().use { r ->
                    val u = if (r.isSuccessful) org.json.JSONObject(r.body?.string() ?: "{}").optString("mouth", "") else ""
                    if (u.startsWith("http")) u else MOUTH_URL_FALLBACK
                }
        }
    } catch (_: Exception) { MOUTH_URL_FALLBACK }

    /** ⬇️ Pobierz i rozpakuj głos (~80 MB) — jak ucho: postęp, miejsce, 3 próby. */
    fun download(ctx: Context, onProgress: (Int) -> Unit, onDone: (Boolean, String) -> Unit) {
        downloadCancel = false
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
        val zip = File(ctx.getExternalFilesDir(null), "gadacz-usta.zip.part")
        val url = mouthUrl(ctx)
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
                        if (done % 20 == 0) onProgress((60 + (done % 40)).coerceAtMost(99))
                        e = z.nextEntry
                    }
                }
                zip.delete()
                if (!available(ctx)) { onDone(false, "Rozpakowany głos wygląda na niekompletny. Spróbuj jeszcze raz."); return }
                synchronized(this) { engine?.let { try { it.release() } catch (_: Throwable) {} }; engine = null }
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
        onDone(false, "Nie udało się pobrać ust ($lastErr). Spróbuj na Wi-Fi.")
    }
}
