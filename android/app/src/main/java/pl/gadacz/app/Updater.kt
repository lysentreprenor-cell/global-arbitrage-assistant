package pl.gadacz.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * One-tap auto-update. Reads the latest published version from the GitHub release
 * (a tiny version.txt asset), and if it differs from the installed one, downloads
 * Gadacz.apk and hands it to the system installer. No app store needed.
 */
object Updater {
    private const val BASE = "https://github.com/lysentreprenor-cell/global-arbitrage-assistant/releases/latest/download"
    private const val VERSION_URL = "$BASE/version.txt"
    private const val APK_URL = "$BASE/Gadacz.apk"
    @Volatile var downloadCancel = false
    private val http = OkHttpClient.Builder()
        // ⏳ Limit na NAWIĄZANIE połączenia (30 s) i na CISZĘ w transmisji (60 s) — gdy
        // 5G mrugnie i dane przestaną płynąć, po 60 s rzucamy błąd i WZNAWIAMY od miejsca,
        // w którym stanęło (Range), zamiast wisieć w nieskończoność na 27%.
        .connectTimeout(30, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(0, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    fun currentVersion(ctx: Context): String =
        try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "?" } catch (e: Exception) { "?" }

    /** @return the newer version string if an update exists, else null. Blocking. */
    fun checkLatest(): String? {
        return try {
            val r = http.newCall(Request.Builder().url(VERSION_URL).build()).execute()
            r.use { if (it.isSuccessful) it.body?.string()?.trim() else null }
        } catch (e: Exception) { null }
    }

    /**
     * Pobierz Gadacz.apk i uruchom instalator. ODPORNE NA ZRYWY SIECI: gdy 5G mrugnie
     * i pobieranie stanie, WZNAWIAMY od tego samego miejsca (nagłówek Range), do 8 prób.
     * Plik zbiera się w .part, na koniec podmiana — przerwane pobieranie nie instaluje
     * uszkodzonej apki. onProgress w %.
     */
    fun downloadAndInstall(ctx: Context, onProgress: (Int) -> Unit, onError: (String) -> Unit) {
        downloadCancel = false
        val out = File(ctx.cacheDir, "Gadacz-update.apk")
        val tmp = File(ctx.cacheDir, "Gadacz-update.apk.part")
        var lastErr = ""
        for (attempt in 1..8) {
            if (downloadCancel) { tmp.delete(); onError("Przerwane."); return }
            var finished = false
            try {
                val have = tmp.length()
                val reqB = Request.Builder().url(APK_URL)
                if (have > 0) reqB.header("Range", "bytes=$have-")
                http.newCall(reqB.build()).execute().use { resp ->
                    if (resp.code == 416) { tmp.delete(); lastErr = "zły zakres, zaczynam od zera"; return@use }
                    if (!resp.isSuccessful) { lastErr = "serwer zwrócił ${resp.code}"; return@use }
                    val resumed = resp.code == 206 && have > 0
                    if (!resumed && have > 0) tmp.delete()
                    val already = if (resumed) have else 0L
                    val body = resp.body ?: run { lastErr = "pusta odpowiedź"; return@use }
                    val remaining = body.contentLength()
                    val total = if (remaining > 0) remaining + already else -1L
                    body.byteStream().use { input ->
                        java.io.FileOutputStream(tmp, resumed).use { output ->
                            val buf = ByteArray(64 * 1024); var read = already; var n: Int
                            while (input.read(buf).also { n = it } >= 0) {
                                if (downloadCancel) { onError("Przerwane."); return }
                                output.write(buf, 0, n); read += n
                                if (total > 0) onProgress(((read * 100) / total).toInt())
                            }
                        }
                    }
                    if (total > 0 && tmp.length() < total) { lastErr = "połączenie przerwane w trakcie"; return@use }
                    finished = true
                }
            } catch (e: Exception) {
                lastErr = e.message ?: "błąd sieci"   // .part ZOSTAJE — wznowimy od tego miejsca
            }
            if (finished) {
                if (tmp.length() < 1_000_000) { tmp.delete(); onError("Pobrany plik jest niekompletny."); return }
                out.delete(); tmp.renameTo(out)
                val uri: Uri = FileProvider.getUriForFile(ctx, "pl.gadacz.app.fileprovider", out)
                val install = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                ctx.startActivity(install)
                return
            }
            try { Thread.sleep(2500L * attempt.coerceAtMost(3)) } catch (_: Exception) {}
        }
        onError("Sieć zrywała się mimo prób ($lastErr). To, co pobrano, zostaje — spróbuj jeszcze raz, najlepiej na Wi-Fi.")
    }
}
