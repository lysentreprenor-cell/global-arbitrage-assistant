package pl.gadacz.app

/**
 * 🎭 TWARZE GADACZA — jedna wspólna lista dla ekranu głównego i czatu.
 * Klucze MUSZĄ zgadzać się z serwerem (server/routes/assistant.ts, PERSONAS).
 */
object Personas {
    val list = listOf(
        Triple("niewidomi",  "🦯 Dla niewidomych", "Tryb podstawowy — ten, który trenujemy"),
        Triple("ogolny",     "⚡ Ogólny",          "Krótko i na temat — dla widzących"),
        Triple("prawnik",    "🧑‍⚖️ Prawnik",        "Prawo prostym językiem, pisma i odwołania"),
        Triple("lekarz",     "🩺 Lekarz",          "Zdrowie i leki — nie zastępuje lekarza"),
        Triple("zartownis",  "😂 Żartowniś",       "Żarty, anegdoty i dobry humor"),
        Triple("bajerant",   "😎 Bajerant",        "Rozmowy z dziewczynami — z klasą"),
        Triple("sprzedawca", "💼 Sprzedawca",      "Oferty, negocjacje, odpowiedzi klientom"),
        Triple("programista","💻 Programowanie",   "Pisze i tłumaczy kod, buduje aplikacje"),
    )

    /** Twarze działające BEZ internetu — musi zgadzać się z Brain.faceWorksOffline. */
    val offline = setOf("niewidomi", "ogolny")

    fun nameOf(key: String): String = list.firstOrNull { it.first == key }?.second ?: "Dla niewidomych"
}
