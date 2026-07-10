package pl.gadacz.app

import android.content.Context
import java.io.File

/**
 * 🤏 PIĘTRO 6 (pełne, EKSPERYMENTALNE): lokalny mały mózg — model AI w telefonie.
 *
 * Działa całkowicie BEZ internetu. Wchodzi do gry, gdy serwer/sieć są niedostępne —
 * żeby Gadacz nie był wtedy niemową, tylko odpowiadał z tego, co umie mały model.
 *
 * Wymaga JEDNORAZOWO wgrania pliku modelu (format MediaPipe .task, np. Gemma ~1-2 GB)
 * do folderu Pobrane pod nazwą: gadacz-mozg.task
 * Brak pliku = to piętro po prostu śpi i nic się nie dzieje.
 */
object LocalBrain {
    @Volatile private var llm: com.google.mediapipe.tasks.genai.llminference.LlmInference? = null
    private val MODEL_PATHS = listOf(
        "/sdcard/Download/gadacz-mozg.task",
        "/storage/emulated/0/Download/gadacz-mozg.task",
    )

    private fun modelPath(): String? = MODEL_PATHS.firstOrNull { File(it).exists() }

    fun available(): Boolean = modelPath() != null

    @Synchronized  // dwa wątki nie mogą naraz utworzyć modelu (wyciek ~GB). Audyt 10.07.
    private fun ensure(ctx: Context): com.google.mediapipe.tasks.genai.llminference.LlmInference? {
        llm?.let { return it }
        val path = modelPath() ?: return null
        return try {
            val opts = com.google.mediapipe.tasks.genai.llminference.LlmInference.LlmInferenceOptions.builder()
                .setModelPath(path)
                .setMaxTokens(256)
                .build()
            com.google.mediapipe.tasks.genai.llminference.LlmInference
                .createFromOptions(ctx.applicationContext, opts)
                .also { llm = it }
        } catch (_: Throwable) { null }
    }

    /** Odpowiedz lokalnie (offline). null = mózg niedostępny albo zawiódł. */
    fun answer(ctx: Context, question: String): String? {
        val engine = ensure(ctx) ?: return null
        return try {
            val prompt = "Jesteś Gadacz, polski asystent głosowy dla osoby niewidomej. " +
                "Odpowiedz BARDZO krótko, po polsku, pełnym zdaniem.\n" +
                "Pytanie: ${question.take(300)}\nOdpowiedź:"
            engine.generateResponse(prompt)?.trim()?.take(300)?.ifBlank { null }
        } catch (_: Throwable) { null }
    }
}
