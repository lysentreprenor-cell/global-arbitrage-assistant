package pl.resellassist.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.DownloadListener
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/**
 * 📱 ResellAssist — aplikacja opakowująca naszą stronę (WebView).
 *
 * To ten sam ResellAssist co w przeglądarce, tylko jako ikona na telefonie:
 *  - pełny ekran, bez paska adresu,
 *  - aparat i mikrofon działają (Filmiki: kamera→animacja, Gadacz: mowa),
 *  - pobieranie plików (memy, filmiki .webm) trafia do folderu Pobrane,
 *  - przycisk Wstecz cofa w historii strony zamiast zamykać apkę.
 *
 * Przy pierwszym uruchomieniu pyta o ADRES serwera (Twój link z Replit),
 * zapisuje go i już zawsze otwiera stronę wprost.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var pendingPermission: PermissionRequest? = null

    private val prefs by lazy { getSharedPreferences("resell", Context.MODE_PRIVATE) }

    // Zgoda systemowa na aparat/mikrofon dla WebView (kamera→animacja).
    private val permLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val ok = result.values.all { it }
        pendingPermission?.let { req ->
            if (ok) req.grant(req.resources) else req.deny()
            pendingPermission = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = prefs.getString("url", "") ?: ""
        if (url.isBlank()) showSetup() else showWeb(url)
    }

    /** Pierwszy ekran: podaj adres strony (link z Replit). */
    private fun showSetup(prefill: String = "") {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF001A0A.toInt())
            setPadding(48, 96, 48, 48)
        }
        col.addView(TextView(this).apply {
            text = "ResellAssist"; textSize = 26f; setTextColor(0xFFF5C842.toInt())
        })
        col.addView(TextView(this).apply {
            text = "Wklej adres swojej strony (link z Replit, np. https://twoj-projekt.repl.co)"
            textSize = 15f; setTextColor(0xFFB0B0B0.toInt()); setPadding(0, 24, 0, 16)
        })
        val input = EditText(this).apply {
            setText(prefill.ifBlank { "https://" })
            textSize = 16f; setTextColor(0xFFFFFFFF.toInt())
            setBackgroundColor(0xFF11251A.toInt()); setPadding(28, 28, 28, 28)
        }
        col.addView(input)
        col.addView(Button(this).apply {
            text = "Otwórz ResellAssist"; textSize = 18f; isAllCaps = false
            setTextColor(0xFF000000.toInt()); setBackgroundColor(0xFF4ADE80.toInt())
            setOnClickListener {
                var u = input.text.toString().trim()
                if (u.isBlank() || u == "https://") { Toast.makeText(this@MainActivity, "Wpisz adres strony", Toast.LENGTH_SHORT).show(); return@setOnClickListener }
                if (!u.startsWith("http")) u = "https://$u"
                prefs.edit().putString("url", u).apply()
                showWeb(u)
            }
        })
        setContentView(col)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun showWeb(url: String) {
        web = WebView(this)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true                 // localStorage (kontakty, klucze, ustawienia)
            mediaPlaybackRequiresUserGesture = false // kamera/mowa startują z kodu
            allowFileAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        // Mostek: strona (memy, filmiki) tworzy pliki jako blob:/data: — przeglądarkowy
        // menedżer pobierania ich NIE zapisze. Wstrzykiwany JS czyta taki plik i oddaje
        // tu bajty, a my zapisujemy je do folderu Pobrane.
        web.addJavascriptInterface(FileSaver(), "AndroidSaver")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView?, req: WebResourceRequest?): Boolean {
                val u = req?.url?.toString() ?: return false
                // Linki tel:/mailto:/sms: oddaj systemowi, resztę trzymaj w WebView.
                if (u.startsWith("tel:") || u.startsWith("mailto:") || u.startsWith("sms:")) {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse(u)))
                    return true
                }
                return false
            }
            override fun onReceivedError(v: WebView?, req: WebResourceRequest?, err: android.webkit.WebResourceError?) {
                // Błąd głównej strony (zły adres, serwer śpi) → wróć do wpisywania adresu.
                if (req?.isForMainFrame == true) {
                    runOnUiThread { showSetup(prefs.getString("url", "") ?: "") }
                }
            }
            override fun onPageFinished(v: WebView?, u: String?) {
                // Przechwyć kliknięcia w linki pobierania z blob:/data: i przekaż bajty do Androida.
                v?.evaluateJavascript(
                    """
                    (function(){
                      if (window.__resellSaverHooked) return; window.__resellSaverHooked = true;
                      document.addEventListener('click', function(e){
                        var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
                        if(!a) return;
                        var href = a.href || '';
                        if(href.indexOf('blob:')===0 || href.indexOf('data:')===0){
                          e.preventDefault();
                          fetch(href).then(function(r){return r.blob();}).then(function(b){
                            var fr = new FileReader();
                            fr.onload = function(){ AndroidSaver.saveBase64(fr.result, a.getAttribute('download')||'plik', b.type||''); };
                            fr.readAsDataURL(b);
                          }).catch(function(){});
                        }
                      }, true);
                    })();
                    """.trimIndent(), null)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // WebView prosi o aparat/mikrofon — poproś system i przekaż zgodę.
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    pendingPermission = request
                    val need = mutableListOf<String>()
                    if (request.resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }) need.add(Manifest.permission.CAMERA)
                    if (request.resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }) need.add(Manifest.permission.RECORD_AUDIO)
                    val missing = need.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
                    if (missing.isEmpty()) { request.grant(request.resources); pendingPermission = null }
                    else permLauncher.launch(missing.toTypedArray())
                }
            }
        }

        // Pobieranie plików (memy, filmiki .webm) → folder Pobrane.
        web.setDownloadListener(DownloadListener { dlUrl, _, contentDisposition, mimeType, _ ->
            try {
                if (dlUrl.startsWith("blob:") || dlUrl.startsWith("data:")) {
                    // Pliki tworzone w przeglądarce (nagrania) pobieramy przez JS→data nie zawsze wyjdą;
                    // dla nich WebView i tak wywoła zapis. Pokaż podpowiedź.
                    Toast.makeText(this, "Zapisywanie pliku…", Toast.LENGTH_SHORT).show()
                    return@DownloadListener
                }
                val req = DownloadManager.Request(Uri.parse(dlUrl))
                req.setMimeType(mimeType)
                val name = URLUtilGuess(dlUrl, contentDisposition, mimeType)
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                Toast.makeText(this, "Pobieram do folderu Pobrane: $name", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Nie udało się pobrać pliku.", Toast.LENGTH_SHORT).show()
            }
        })

        setContentView(web)
        web.loadUrl(url)
    }

    private fun URLUtilGuess(url: String, cd: String?, mime: String?): String =
        try { android.webkit.URLUtil.guessFileName(url, cd, mime) } catch (_: Exception) { "plik" }

    /** Most JS→Android: zapis pliku z data-URL (base64) do folderu Pobrane. */
    inner class FileSaver {
        @JavascriptInterface
        fun saveBase64(dataUrl: String, filename: String, mime: String) {
            try {
                val comma = dataUrl.indexOf(',')
                if (comma < 0) return
                val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
                val safe = filename.ifBlank { "plik" }.replace(Regex("[^\\w.\\-]+"), "_")
                val type = mime.ifBlank { "application/octet-stream" }
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                    // Android 10+: scoped storage — zapis przez MediaStore do publicznego Pobrane.
                    val values = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(android.provider.MediaStore.Downloads.MIME_TYPE, type)
                        put(android.provider.MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw Exception("brak miejsca docelowego")
                    contentResolver.openOutputStream(uri).use { it!!.write(bytes) }
                } else {
                    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!dir.exists()) dir.mkdirs()
                    val file = java.io.File(dir, safe)
                    java.io.FileOutputStream(file).use { it.write(bytes) }
                    android.media.MediaScannerConnection.scanFile(this@MainActivity, arrayOf(file.absolutePath), arrayOf(type), null)
                }
                runOnUiThread { Toast.makeText(this@MainActivity, "Zapisano w Pobrane: $safe", Toast.LENGTH_LONG).show() }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Nie udało się zapisać pliku.", Toast.LENGTH_SHORT).show() }
            }
        }
    }

    // Wstecz cofa w historii strony; zamyka apkę dopiero na początku.
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
