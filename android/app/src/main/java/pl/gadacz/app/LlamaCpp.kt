package pl.gadacz.app

/**
 * ✍️ SILNIK PISANIA (llama.cpp) — nowy, STABILNY silnik do pisania offline, który
 * ma zastąpić kapryśny silnik Google (MediaPipe) wywalający apkę.
 *
 * ETAP 2a: sprawdzamy tylko, że natywna biblioteka wpina się do apki, kompiluje
 * i daje się załadować. Prawdziwe generowanie tekstu (wczytanie modelu GGUF,
 * pisanie odpowiedzi) dojdzie w etapie 2b.
 */
object LlamaCpp {
    @Volatile private var loaded = false

    /** Załaduj natywną bibliotekę (raz). false = brak biblioteki w tej wersji apki. */
    fun libReady(): Boolean {
        if (loaded) return true
        return try { System.loadLibrary("gadaczllama"); loaded = true; true }
        catch (_: Throwable) { false }
    }

    private external fun nativeHello(): String
    private external fun nativeGenerate(modelPath: String, prompt: String, maxTokens: Int, threads: Int): String

    /** Krótki test: czy silnik pisania jest wpięty i odpowiada. */
    fun hello(): String =
        if (libReady()) try { nativeHello() } catch (_: Throwable) { "błąd wywołania natywnego" }
        else "biblioteka silnika pisania niewczytana"

    /**
     * ✍️ Wygeneruj odpowiedź lokalnym modelem GGUF (offline, stabilnie).
     * Zwraca tekst albo null, gdy biblioteki brak / błąd. Wołaj poza głównym wątkiem.
     */
    fun generate(modelPath: String, prompt: String, maxTokens: Int = 200, threads: Int = 4): String? {
        if (!libReady()) return null
        return try {
            val r = nativeGenerate(modelPath, prompt, maxTokens, threads).trim()
            if (r.startsWith("BLAD:") || r.isBlank() || r == "(pusto)") null else r
        } catch (_: Throwable) { null }
    }
}
