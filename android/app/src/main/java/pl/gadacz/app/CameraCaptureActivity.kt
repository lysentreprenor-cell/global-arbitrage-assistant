package pl.gadacz.app

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.provider.MediaStore
import android.speech.tts.TextToSpeech
import android.util.Base64
import androidx.appcompat.app.AppCompatActivity
import java.io.ByteArrayOutputStream
import java.util.Locale

/**
 * 👁️ PIĘTRO 11: OCZY NA ŚWIAT.
 *
 * Robi zdjęcie tylnym aparatem, wysyła je do wzroku AI i mówi na głos, co widać —
 * otoczenie, tekst z ulotki, produkt, znak. Dla osoby niewidomej to piętro-król.
 *
 * Uruchamiane komendą (przez Brain: action "look" / "read_world"). Aktywność jest
 * przezroczysta i sama się zamyka — użytkownik jej nie widzi, słyszy tylko opis.
 *
 * Intencja: "opisz" (co przede mną) albo "przeczytaj" (tekst na kartce).
 */
class CameraCaptureActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    private lateinit var tts: TextToSpeech
    private var mode = "describe"

    private val camLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val bmp = result.data?.extras?.get("data") as? Bitmap
        if (bmp == null) { speak("Nie udało się zrobić zdjęcia."); finishSoon(); return@registerForActivityResult }
        analyze(bmp)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mode = intent.getStringExtra("mode") ?: "describe"
        tts = TextToSpeech(this, this)
        if (!Brain.isConfigured(this)) { finishSoon(); return }
        if (checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.CAMERA), 7); return
        }
        openCamera()
    }

    override fun onRequestPermissionsResult(rc: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(rc, perms, res)
        if (res.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) openCamera()
        else { speak("Potrzebuję zgody na aparat, żeby patrzeć."); finishSoon() }
    }

    private fun openCamera() {
        try {
            val i = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            if (mode == "selfie") {
                // Podpowiedzi PRZEDNIEGO aparatu (best-effort — różne telefony różnie je czytają).
                i.putExtra("android.intent.extras.CAMERA_FACING", 1)
                i.putExtra("android.intent.extras.LENS_FACING_FRONT", 1)
                i.putExtra("android.intent.extra.USE_FRONT_CAMERA", true)
            }
            camLauncher.launch(i)
        } catch (e: Exception) { speak("Ten telefon nie ma aparatu."); finishSoon() }
    }

    override fun onInit(status: Int) { if (status == TextToSpeech.SUCCESS) tts.language = Locale("pl", "PL") }

    private fun analyze(bmp: Bitmap) {
        speak(if (mode == "read") "Czytam…" else if (mode == "selfie") "Sprawdzam…" else "Patrzę…")
        Thread {
            try {
                val scale = 1024f / bmp.width
                val small = if (scale < 1f)
                    Bitmap.createScaledBitmap(bmp, 1024, (bmp.height * scale).toInt().coerceAtLeast(1), true) else bmp
                val bos = ByteArrayOutputStream()
                small.compress(Bitmap.CompressFormat.JPEG, 70, bos)
                val b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
                val q = when (mode) {
                    "read" -> "Przeczytaj na głos CAŁY tekst widoczny na tym zdjęciu, po polsku. Jeśli tekst jest w innym języku, przeczytaj i krótko przetłumacz. Nic nie zmyślaj — jeśli czegoś nie widać wyraźnie, powiedz to."
                    "selfie" -> "To zdjęcie z przedniego aparatu osoby NIEWIDOMEJ, która jest na rozmowie wideo i chce wiedzieć, czy dobrze ją widać. Oceń KRÓTKO i praktycznie: czy twarz jest wyśrodkowana i cała w kadrze, czy światło jest dobre (nie za ciemno, nie pod słońce), czy nie jest za blisko/za daleko. Jeśli coś jest nie tak, powiedz KONKRETNIE co poprawić („podnieś telefon wyżej”, „odsuń trochę”, „jest za ciemno, włącz światło”). Jeśli wszystko dobrze — powiedz „Wyglądasz dobrze, twarz w kadrze, dobre światło”. Mów wprost, po polsku, do tej osoby."
                    else -> "Jesteś oczami osoby niewidomej. Opisz krótko i konkretnie, co jest na tym zdjęciu: najpierw najważniejsze (zagrożenia, przeszkody, ludzie), potem otoczenie. Na końcu przeczytaj widoczny tekst, jeśli jest. Mów spokojnie, po polsku."
                }
                val resp = Brain.ask(this, q, emptyList(), null, b64)
                speakThenFinish(resp.optString("say", "Nie wiem, co widzę."))
            } catch (e: Exception) {
                val local = try { LocalBrain.answer(this, "Opisz otoczenie") } catch (_: Throwable) { null }
                speakThenFinish(local ?: "Nie udało się połączyć, spróbuj ponownie.")
            }
        }.start()
    }

    private fun speak(text: String) {
        try { tts.speak(text, TextToSpeech.QUEUE_ADD, null, "look") } catch (_: Exception) {}
    }

    /**
     * Mów CAŁY opis, a aktywność zamknij DOPIERO gdy TTS skończy — inaczej finish()
     * ubijał TTS po 400 ms i niewidomy słyszał tylko ułamek. Audyt 10.07.
     */
    private fun speakThenFinish(text: String) {
        try {
            tts.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) { runOnUiThread { try { finish() } catch (_: Exception) {} } }
                @Deprecated("api") override fun onError(id: String?) { runOnUiThread { try { finish() } catch (_: Exception) {} } }
            })
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "look_final")
            window.decorView.postDelayed({ try { finish() } catch (_: Exception) {} }, (3000 + text.length * 70L).coerceAtMost(30000))
        } catch (_: Exception) { try { finish() } catch (_: Exception) {} }
    }

    private fun finishSoon() { window.decorView.postDelayed({ try { finish() } catch (_: Exception) {} }, 400) }

    override fun onDestroy() {
        try { tts.stop(); tts.shutdown() } catch (_: Exception) {}
        super.onDestroy()
    }
}
