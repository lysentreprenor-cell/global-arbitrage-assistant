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
    private val http = OkHttpClient.Builder()
        .callTimeout(90, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS).build()

    fun currentVersion(ctx: Context): String =
        try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "?" } catch (e: Exception) { "?" }

    /** @return the newer version string if an update exists, else null. Blocking. */
    fun checkLatest(): String? {
        return try {
            val r = http.newCall(Request.Builder().url(VERSION_URL).build()).execute()
            r.use { if (it.isSuccessful) it.body?.string()?.trim() else null }
        } catch (e: Exception) { null }
    }

    /** Download Gadacz.apk to cache and launch the installer. onProgress in %. Blocking. */
    fun downloadAndInstall(ctx: Context, onProgress: (Int) -> Unit, onError: (String) -> Unit) {
        try {
            val req = Request.Builder().url(APK_URL).build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) { onError("Serwer zwrócił ${resp.code}"); return }
                val body = resp.body ?: run { onError("Pusta odpowiedź"); return }
                val total = body.contentLength().coerceAtLeast(1)
                val out = File(ctx.cacheDir, "Gadacz-update.apk")
                body.byteStream().use { input ->
                    out.outputStream().use { output ->
                        val buf = ByteArray(64 * 1024); var read = 0L; var n: Int
                        while (input.read(buf).also { n = it } >= 0) {
                            output.write(buf, 0, n); read += n
                            onProgress(((read * 100) / total).toInt())
                        }
                    }
                }
                val uri: Uri = FileProvider.getUriForFile(ctx, "pl.gadacz.app.fileprovider", out)
                val install = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                ctx.startActivity(install)
            }
        } catch (e: Exception) {
            onError(e.message ?: "Błąd pobierania")
        }
    }
}
