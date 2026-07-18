package pl.gadacz.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * ⌨️ CZAT Z TWARZAMI — pisanie z Gadaczem jak w zwykłym komunikatorze.
 * Rozmowa zapisuje się SAMA na serwerze; panel 🗂 daje projekty na stałe,
 * listę czatów i ustawienie, kiedy zwykłe czaty się kasują.
 * 📎 Załączniki: zdjęcia i pliki tekstowe — twarz je czyta i omawia.
 * 🟢 TRYB NEO (u Programowania): Matrix — deszcz znaków, zielone pismo,
 * odpowiedzi piszą się literka po literce jak na ekranie Neo.
 */
class ChatActivity : Activity() {

    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var sendBtn: Button
    private lateinit var attachBtn: Button
    private lateinit var faceBtn: Button
    private lateinit var projBtn: Button
    private lateinit var neoBtn: Button
    private lateinit var rain: NeoRainView
    private lateinit var col: LinearLayout
    private val history = ArrayList<Pair<String, String>>()

    // 📎 Załącznik czekający na wysłanie (zdjęcie ALBO tekst pliku).
    private var attachB64: String? = null
    private var attachText: String? = null
    private val pickReq = 31

    // ⏳ „Myślę" = DEKODOWANIE: migające japońskie znaki z blokowym kursorem,
    // jak na monitorze Neo — zawsze, bo wygląda najlepiej (w Neo i poza nim).
    private var thinkView: TextView? = null
    private val neoThinkGlyphs = "アイウエオカキクケコサシスセソタチツテト日月火水木金人中大電脳0123456789"
    private val thinkRnd = java.util.Random()
    private val thinkTick = object : Runnable {
        override fun run() {
            val tv = thinkView ?: return
            val sb = StringBuilder()
            repeat(7) { sb.append(neoThinkGlyphs[thinkRnd.nextInt(neoThinkGlyphs.length)]) }
            tv.text = "$sb █"
            tv.postDelayed(this, 110)
        }
    }

    private fun neoOn(): Boolean = Brain.prefs(this).getBoolean("neo_mode", false)
    private fun isProgramista(): Boolean = Brain.cachedPersona(this) == "programista"
    private fun neoActive(): Boolean = neoOn() && isProgramista()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 12).toInt()

        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }

        // 🎭 Nagłówek: twarz + panel projektów + włącznik Neo (u Programowania).
        faceBtn = Button(this).apply {
            textSize = 16f; isAllCaps = false
            setOnClickListener { pickFace() }
        }
        projBtn = Button(this).apply {
            textSize = 16f; isAllCaps = false; text = "🗂"
            setOnClickListener { showProjects() }
        }
        neoBtn = Button(this).apply {
            textSize = 16f; isAllCaps = false; text = "🟢"
            setOnClickListener {
                Brain.prefs(this@ChatActivity).edit().putBoolean("neo_mode", !neoOn()).apply()
                applyTheme()
                if (neoActive()) neoIntro() else bubble("Wyszedłeś z Matriksa.", false)
            }
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(faceBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(projBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
            addView(neoBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        }
        col.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // 📜 Rozmowa — dymki, przewijane.
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, pad, 0, pad) }
        scroll = ScrollView(this).apply { addView(list); isFillViewport = true }
        col.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        // ⌨️ Dół: załącznik + pole pisania + Wyślij.
        attachBtn = Button(this).apply {
            text = "📎"; textSize = 18f; isAllCaps = false
            setOnClickListener { pickAttachment() }
        }
        input = EditText(this).apply {
            hint = "Napisz wiadomość…"
            textSize = 18f
            setPadding(pad, pad, pad, pad)
            maxLines = 5
        }
        sendBtn = Button(this).apply {
            text = "✉️\nWyślij"; textSize = 16f; isAllCaps = false
            setOnClickListener { send() }
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(attachBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
            addView(input, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(sendBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        }
        col.addView(row)

        // 🟢 Deszcz Matriksa POD treścią czatu (widoczny tylko w Trybie Neo).
        rain = NeoRainView(this).apply { visibility = View.GONE }
        val root = FrameLayout(this).apply {
            addView(rain, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            addView(col, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
        setContentView(root)

        applyTheme()
        if (neoActive()) neoIntro()
        else hint("Napisz coś — odpowiem tekstem, bez czytania na głos. Rozmowa zapisuje się sama. " +
            "Panel 🗂 to projekty i czaty, spinacz 📎 dołącza zdjęcie albo plik do przeczytania.")
    }

    /** 🎨 Zwykły czat albo Matrix — kolory całego ekranu w jednym miejscu. */
    private fun applyTheme() {
        val neo = neoActive()
        rain.visibility = if (neo) View.VISIBLE else View.GONE
        col.setBackgroundColor(if (neo) 0x00000000 else 0xFF0C0A09.toInt())
        faceBtn.text = "💬 ${Personas.nameOf(Brain.cachedPersona(this))}"
        if (neo) {
            faceBtn.setTextColor(0xFF00FF66.toInt()); faceBtn.setBackgroundColor(0x99001A00.toInt())
            projBtn.setTextColor(0xFF00FF66.toInt()); projBtn.setBackgroundColor(0x99001A00.toInt())
            neoBtn.setTextColor(0xFF00FF66.toInt()); neoBtn.setBackgroundColor(0x99003300.toInt()); neoBtn.text = "🟢 NEO"
            attachBtn.setTextColor(0xFF00FF66.toInt()); attachBtn.setBackgroundColor(0x99001A00.toInt())
            input.setTextColor(0xFF00FF66.toInt()); input.setHintTextColor(0xFF00802F.toInt()); input.setBackgroundColor(0x99001300.toInt())
            sendBtn.setTextColor(0xFF001A00.toInt()); sendBtn.setBackgroundColor(0xFF00CC44.toInt())
        } else {
            faceBtn.setTextColor(0xFF3B2A06.toInt()); faceBtn.setBackgroundColor(0xFFFDE68A.toInt())
            projBtn.setTextColor(0xFFFDE68A.toInt()); projBtn.setBackgroundColor(0xFF44403C.toInt())
            neoBtn.setTextColor(0xFFDCFCE7.toInt()); neoBtn.setBackgroundColor(0xFF14532D.toInt()); neoBtn.text = "🟢"
            attachBtn.setTextColor(0xFFE7E5E4.toInt()); attachBtn.setBackgroundColor(0xFF292524.toInt())
            input.setTextColor(0xFFE7E5E4.toInt()); input.setHintTextColor(0xFF78716C.toInt()); input.setBackgroundColor(0xFF1C1917.toInt())
            sendBtn.setTextColor(0xFF3B2A06.toInt()); sendBtn.setBackgroundColor(0xFFFBBF24.toInt())
        }
        neoBtn.visibility = if (isProgramista()) View.VISIBLE else View.GONE
    }

    /** 🐇 Jak u Neo: Morfeusz pisze do Ciebie pierwszy raz — literka po literce. */
    private fun neoIntro() {
        bubble("Obudź się, Neo…", false)
        list.postDelayed({ bubble("Matrix ma cię…", false) }, 2400)
        list.postDelayed({ bubble("Podążaj za białym królikiem. 🐇", false) }, 4800)
    }

    /** Szara podpowiedź na starcie. */
    private fun hint(text: String) {
        list.addView(TextView(this).apply {
            this.text = text
            textSize = 15f; setTextColor(0xFF78716C.toInt())
            setPadding(8, 8, 8, 20)
        })
    }

    /** ⌨️ Efekt maszyny do pisania — tekst pojawia się znak po znaku, z kursorem. */
    private fun typeInto(tv: TextView, full: String) {
        val step = if (full.length > 400) 4 else 1
        val delay = if (full.length > 400) 8L else 26L
        var i = 0
        val r = object : Runnable {
            override fun run() {
                i = (i + step).coerceAtMost(full.length)
                tv.text = full.substring(0, i) + if (i < full.length) "█" else ""
                if (i >= full.length) scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
                if (i < full.length) tv.postDelayed(this, delay)
            }
        }
        tv.postDelayed(r, delay)
    }

    /** 💬 Dymek rozmowy: mój po prawej, twarzy po lewej. W Neo — zieleń + maszyna do pisania. */
    private fun bubble(text: String, mine: Boolean) {
        val neo = neoActive()
        val pad = (resources.displayMetrics.density * 10).toInt()
        val tv = TextView(this).apply {
            textSize = 17f
            setTextIsSelectable(true)   // kod/pisma można zaznaczyć i skopiować
            if (neo) {
                // Prawie przezroczyste dymki — deszcz znaków PRZEŚWITUJE zza tekstu.
                typeface = android.graphics.Typeface.MONOSPACE
                setTextColor(if (mine) 0xFFB7FFC9.toInt() else 0xFF00FF66.toInt())
                setBackgroundColor(if (mine) 0x4D0A0F0A else 0x4D001A00)
            } else {
                setTextColor(if (mine) 0xFFE7E5E4.toInt() else 0xFFDCFCE7.toInt())
                setBackgroundColor(if (mine) 0xFF292524.toInt() else 0xFF052E16.toInt())
            }
            setPadding(pad + 4, pad, pad + 4, pad)
        }
        if (neo && !mine) typeInto(tv, text) else tv.text = text
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = if (mine) Gravity.END else Gravity.START
            topMargin = pad
            marginStart = if (mine) pad * 4 else 0
            marginEnd = if (mine) 0 else pad * 4
        }
        list.addView(tv, lp)
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    /** ⏳ Pokaż/kręć „myślę" — i zdejmij, gdy przyjdzie odpowiedź. */
    private fun showThinking() {
        hideThinking()
        val pad = (resources.displayMetrics.density * 10).toInt()
        thinkView = TextView(this).apply {
            text = "█"
            textSize = 17f
            setTextColor(if (neoActive()) 0xFF00FF66.toInt() else 0xFF86EFAC.toInt())
            setPadding(pad, pad, pad, pad)
        }
        list.addView(thinkView)
        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
        thinkView?.postDelayed(thinkTick, 250)
    }

    private fun hideThinking() {
        thinkView?.let { it.removeCallbacks(thinkTick); list.removeView(it) }
        thinkView = null
    }

    // ── 🗂 PROJEKTY I CZATY — zapis na stałe, wczytywanie, czas kasowania ──
    private fun showProjects() {
        AlertDialog.Builder(this)
            .setTitle("🗂 Projekty i czaty")
            .setItems(arrayOf(
                "🆕  Nowa rozmowa (obecna się zapisze)",
                "📌  Zapisz ten czat na stałe jako projekt…",
                "📂  Moje projekty i czaty (wczytaj)",
                "⏳  Kiedy kasować zwykłe czaty",
            )) { _, which ->
                when (which) {
                    0 -> Thread {
                        Brain.convNew(this)
                        runOnUiThread { history.clear(); bubble("Zaczynam nową rozmowę. Poprzednia jest zapisana w 🗂.", false) }
                    }.start()
                    1 -> {
                        val nameIn = EditText(this).apply { hint = "Nazwa projektu, np. Moja aplikacja" }
                        AlertDialog.Builder(this).setTitle("📌 Zapisz na stałe").setView(nameIn)
                            .setPositiveButton("Zapisz") { _, _ ->
                                val nm = nameIn.text.toString().trim().ifBlank { null }
                                Thread {
                                    val saved = Brain.convKeep(this, nm)
                                    runOnUiThread { bubble(if (saved != null) "Zapisane na stałe jako: $saved. Ten projekt nigdy sam się nie skasuje." else "Nie udało się zapisać — sprawdź internet i czy serwer jest zaktualizowany.", false) }
                                }.start()
                            }.setNegativeButton("Anuluj", null).show()
                    }
                    2 -> Thread {
                        val convs = Brain.convList(this)
                        runOnUiThread {
                            if (convs.isEmpty()) { bubble("Ta twarz nie ma jeszcze zapisanych rozmów.", false); return@runOnUiThread }
                            val items = convs.take(25).map { (t, perm) -> (if (perm) "📌 " else "💬 ") + t }.toTypedArray()
                            AlertDialog.Builder(this).setTitle("📂 Wczytaj (📌 = projekt na stałe)")
                                .setItems(items) { _, i ->
                                    val title = convs[i].first
                                    Thread {
                                        val loaded = Brain.convLoad(this, title)
                                        runOnUiThread {
                                            if (loaded == null) { bubble("Nie udało się wczytać: $title.", false); return@runOnUiThread }
                                            history.clear()
                                            loaded.second.takeLast(12).forEach { history.add(it) }
                                            bubble("Wczytane: ${loaded.first}. Kontynuujemy dokładnie tam, gdzie skończyliśmy.", false)
                                        }
                                    }.start()
                                }.setNegativeButton("Zamknij", null).show()
                        }
                    }.start()
                    3 -> {
                        val days = listOf(1, 7, 30, 90, 0)
                        val labels = arrayOf("po 1 dniu", "po tygodniu", "po miesiącu", "po 3 miesiącach", "nigdy — trzymaj wszystkie")
                        AlertDialog.Builder(this).setTitle("⏳ Zwykłe czaty kasują się…")
                            .setItems(labels) { _, i ->
                                Thread {
                                    val ok = Brain.convSetKeepDays(this, days[i])
                                    runOnUiThread { bubble(if (ok) "Ustawione: zwykłe czaty kasują się ${labels[i]}. Projekty 📌 zostają ZAWSZE." else "Nie udało się zapisać ustawienia — sprawdź internet i aktualność serwera.", false) }
                                }.start()
                            }.setNegativeButton("Zamknij", null).show()
                    }
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    // ── 📎 ZAŁĄCZNIKI — zdjęcie (opisze/przeczyta) albo plik tekstowy (omówi) ──
    private fun pickAttachment() {
        val i = Intent(Intent.ACTION_GET_CONTENT).apply { type = "*/*"; addCategory(Intent.CATEGORY_OPENABLE) }
        try { startActivityForResult(Intent.createChooser(i, "Wybierz załącznik"), pickReq) }
        catch (_: Exception) { bubble("Nie mogę otworzyć wyboru plików na tym telefonie.", false) }
    }

    @Deprecated("klasyczna ścieżka Activity")
    override fun onActivityResult(req: Int, res: Int, data: Intent?) {
        super.onActivityResult(req, res, data)
        if (req != pickReq || res != RESULT_OK) return
        val uri = data?.data ?: return
        Thread {
            try {
                val type = contentResolver.getType(uri) ?: ""
                if (type.startsWith("image/")) {
                    val bmp = contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it) }
                    if (bmp == null) { runOnUiThread { bubble("Nie udało się otworzyć zdjęcia.", false) }; return@Thread }
                    val scale = 1024f / bmp.width
                    val small = if (scale < 1f) android.graphics.Bitmap.createScaledBitmap(bmp, 1024, (bmp.height * scale).toInt().coerceAtLeast(1), true) else bmp
                    val bos = java.io.ByteArrayOutputStream()
                    small.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, bos)
                    attachB64 = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP)
                    attachText = null
                    runOnUiThread { bubble("📎 Dołączono zdjęcie. Napisz, co z nim zrobić — albo po prostu Wyślij, to je opiszę i przeczytam.", false) }
                } else {
                    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
                    if (bytes.size > 300_000) { runOnUiThread { bubble("Ten plik jest za duży (ponad 300 kilobajtów). Dołącz mniejszy — albo zrób zdjęcie dokumentu.", false) }; return@Thread }
                    val txt = try { String(bytes, Charsets.UTF_8) } catch (_: Exception) { "" }
                    val printable = txt.count { it.code in 9..13 || it.code >= 32 }
                    if (txt.isBlank() || printable < txt.length * 9 / 10) {
                        runOnUiThread { bubble("Nie umiem przeczytać tego typu pliku. Najlepiej działają pliki tekstowe i zdjęcia — zdjęcie dokumentu też wystarczy.", false) }
                        return@Thread
                    }
                    attachText = txt.take(12000)
                    attachB64 = null
                    runOnUiThread { bubble("📎 Dołączono plik tekstowy (${txt.length} znaków). Napisz, co z nim zrobić — albo po prostu Wyślij, to go omówię.", false) }
                }
            } catch (_: Exception) { runOnUiThread { bubble("Nie udało się wczytać załącznika.", false) } }
        }.start()
    }

    private fun pickFace() {
        val cur = Brain.cachedPersona(this)
        val items = Personas.list.map { (key, name, desc) ->
            (if (key == cur) "✓ " else "") + name + "\n" + desc
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("🎭 Z kim chcesz pisać?")
            .setItems(items) { _, which ->
                val (key, name, _) = Personas.list[which]
                history.clear()   // nowa twarz = świeży wątek (stary został zapisany)
                Thread {
                    val ok = Brain.setPersona(this, key)
                    if (ok) Brain.prefs(this).edit().putString("persona_cache", key).apply()
                    runOnUiThread {
                        applyTheme()
                        bubble(if (ok) "Jestem: ${name.substringAfter(" ")}. Pisz śmiało." else "Nie udało się przełączyć twarzy — sprawdź internet.", false)
                    }
                }.start()
            }
            .setNegativeButton("Zamknij", null).show()
    }

    // ── 🖐️ RĘCE GADACZA — komendy czatu do WŁASNEGO kodu: czytanie pliku z repo
    // i wypychanie świeżo napisanego pliku (zawsze z potwierdzeniem na ekranie).
    @Volatile private var lastCode: String? = null
    private fun trySelfCode(t: String): Boolean {
        val readM = Regex("^(?:przeczytaj|pokaż|pokaz|otwórz|otworz)\\s+(?:swój\\s+|swoj\\s+)?plik\\s+(\\S+)$", RegexOption.IGNORE_CASE).find(t)
        if (readM != null) {
            val path = readM.groupValues[1].trim()
            input.setText(""); bubble(t, true); showThinking()
            Thread {
                val (ok, res) = Brain.selfRead(this, path)
                if (ok) {
                    history.add("user" to "Przeczytaj plik $path")
                    history.add("assistant" to "TREŚĆ PLIKU $path:\n${res.take(9000)}")
                    while (history.size > 16) history.removeAt(0)
                }
                runOnUiThread {
                    hideThinking()
                    bubble(if (ok) "📄 $path:\n\n${res.take(6000)}" else res, false)
                }
            }.start()
            return true
        }
        val pushM = Regex("^(?:wypchnij|wyślij|wyslij|push)\\s+do\\s+(\\S+)(?:\\s*[:,]\\s*(.+))?$", RegexOption.IGNORE_CASE).find(t)
        if (pushM != null) {
            val path = pushM.groupValues[1].trim().trimEnd(':', ',')
            val msg = pushM.groupValues[2].trim().ifBlank { "Zmiana przez twarz Programowanie" }
            val code = lastCode
            input.setText(""); bubble(t, true)
            if (Brain.githubToken(this).isBlank()) {
                bubble("Nie mam jeszcze rąk — wklej token GitHub w Ustawienia → Połączenia → Ręce Gadacza.", false); return true
            }
            if (code == null) {
                bubble("Nie mam świeżo napisanego pliku do wypchnięcia. Najpierw poproś mnie o napisanie PEŁNEGO pliku — potem powiedz: wypchnij do ŚCIEŻKA.", false); return true
            }
            AlertDialog.Builder(this)
                .setTitle("🖐️ Wypchnąć do repozytorium?")
                .setMessage("Plik: $path\nOpis: $msg\nRozmiar: ${code.length} znaków\n\nPo wypchnięciu robot GitHuba zbuduje projekt (ok. 5 minut).")
                .setPositiveButton("Wypchnij") { _, _ ->
                    showThinking()
                    Thread {
                        val (ok, res) = Brain.selfWrite(this, path, code, msg)
                        runOnUiThread {
                            hideThinking()
                            bubble(res + if (ok) " Pamiętaj: zmiany serwera i www wymagają git pull na Replicie, a zmiany Androida — aktualizacji aplikacji." else "", false)
                        }
                    }.start()
                }
                .setNegativeButton("Anuluj", null).show()
            return true
        }
        return false
    }

    private fun send() {
        val typed = input.text.toString().trim()
        if (typed.isNotBlank() && trySelfCode(typed)) return
        val hasAttach = attachB64 != null || attachText != null
        if (typed.isBlank() && !hasAttach) return
        val t = typed.ifBlank { "Przeczytaj załącznik i powiedz dokładnie, co w nim jest." }
        input.setText("")
        bubble(if (hasAttach) "$t 📎" else t, true)
        sendBtn.isEnabled = false
        showThinking()
        val img = attachB64
        val fileTxt = attachText
        attachB64 = null; attachText = null
        Thread {
            // 🗂 Odruchy rozmów działają też w czacie (nowa rozmowa, projekty...).
            var handled = false
            val said = StringBuilder()
            if (!hasAttach) try {
                handled = Brain.convReflex(this, t, history) { s -> said.append(s).append(" ") }
            } catch (_: Exception) {}
            val answer: String = if (handled) said.toString().trim() else {
                val question = t + (fileTxt?.let { "\n\nTREŚĆ ZAŁĄCZNIKA:\n$it" } ?: "")
                val resp = try { Brain.ask(this, question, history, null, img) } catch (_: Exception) { null }
                when {
                    resp == null -> "Nie mam połączenia z serwerem. Sprawdź internet i czy serwer działa."
                    resp.optString("error", "").isNotBlank() -> "Błąd serwera: " + resp.optString("error")
                    else -> {
                        var say = resp.optString("say", "")
                        // ✍️ Gdy twarz coś NAPISAŁA (pismo, kod, wiersz) — pokaż całość w dymku.
                        if (resp.optString("action") == "write") {
                            val txt = resp.optJSONObject("args")?.optString("text") ?: ""
                            if (txt.isNotBlank()) {
                                lastCode = txt   // 🖐️ gotowe do „wypchnij do ŚCIEŻKA"
                                say = (if (say.isBlank()) "" else say + "\n\n") + txt
                            }
                        }
                        if (say.isBlank()) "Nie mam na to odpowiedzi. Napisz to inaczej." else say
                    }
                }
            }
            runOnUiThread {
                sendBtn.isEnabled = true
                hideThinking()
                bubble(answer, false)
            }
            if (!handled) {
                history.add("user" to t); history.add("assistant" to answer)
                while (history.size > 16) history.removeAt(0)
                try { Brain.convAppend(this, t, answer) } catch (_: Exception) {}
            }
        }.start()
    }
}
