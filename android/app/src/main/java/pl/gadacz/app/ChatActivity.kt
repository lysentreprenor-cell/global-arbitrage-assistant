package pl.gadacz.app

import android.app.Activity
import android.app.AlertDialog
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
 * Piszesz na dole, twarz odpisuje w dymkach; rozmowa zapisuje się SAMA na
 * serwerze (te same rozmowy co głosem — „zapisz projekt na stałe" działa i tu).
 * Nic nie jest czytane na głos — to tryb do CICHEGO pisania, np. w autobusie.
 *
 * 🟢 TRYB NEO (u twarzy Programowanie): włącznik zamienia czat w Matriksa —
 * czarne tło z deszczem zielonych znaków, zielone pismo. Czysta frajda.
 */
class ChatActivity : Activity() {

    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var sendBtn: Button
    private lateinit var faceBtn: Button
    private lateinit var neoBtn: Button
    private lateinit var rain: NeoRainView
    private lateinit var col: LinearLayout
    private val history = ArrayList<Pair<String, String>>()

    // ⏳ „Myślę" — kręcący się wskaźnik, jak u prawdziwego asystenta.
    private var thinkView: TextView? = null
    private var thinkPhase = 0
    private val spinFrames = listOf("◐", "◓", "◑", "◒")
    private val thinkTick = object : Runnable {
        override fun run() {
            val tv = thinkView ?: return
            thinkPhase = (thinkPhase + 1) % spinFrames.size
            tv.text = "${spinFrames[thinkPhase]} myślę…"
            tv.postDelayed(this, 250)
        }
    }

    private fun neoOn(): Boolean = Brain.prefs(this).getBoolean("neo_mode", false)
    private fun isProgramista(): Boolean = Brain.cachedPersona(this) == "programista"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 12).toInt()

        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }

        // 🎭 Nagłówek: z KIM piszesz + włącznik Trybu Neo (widoczny u Programowania).
        faceBtn = Button(this).apply {
            textSize = 17f; isAllCaps = false
            setOnClickListener { pickFace() }
        }
        neoBtn = Button(this).apply {
            textSize = 17f; isAllCaps = false
            text = "🟢"
            setOnClickListener {
                Brain.prefs(this@ChatActivity).edit().putBoolean("neo_mode", !neoOn()).apply()
                applyTheme()
                bubble(if (neoOn()) "Witaj w Matriksie, Neo." else "Wyszedłeś z Matriksa.", false)
            }
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(faceBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(neoBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        }
        col.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // 📜 Rozmowa — dymki, przewijane.
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, pad, 0, pad) }
        scroll = ScrollView(this).apply { addView(list); isFillViewport = true }
        col.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        // ⌨️ Dół: pole pisania + Wyślij.
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
        hint("Napisz coś — odpowiem tekstem, bez czytania na głos. Rozmowa zapisuje się sama. " +
            "Działają też polecenia: nowa rozmowa · zapisz projekt na stałe jako NAZWA · wczytaj projekt NAZWA · jakie mam projekty.")
    }

    /** 🎨 Zwykły czat albo Matrix — kolory całego ekranu w jednym miejscu. */
    private fun applyTheme() {
        val neo = neoOn() && isProgramista()
        rain.visibility = if (neo) View.VISIBLE else View.GONE
        col.setBackgroundColor(if (neo) 0x00000000 else 0xFF0C0A09.toInt())
        faceBtn.text = "💬 Piszesz z: ${Personas.nameOf(Brain.cachedPersona(this))}"
        if (neo) {
            faceBtn.setTextColor(0xFF00FF66.toInt()); faceBtn.setBackgroundColor(0xE6001A00.toInt())
            neoBtn.setTextColor(0xFF00FF66.toInt()); neoBtn.setBackgroundColor(0xE6003300.toInt()); neoBtn.text = "🟢 NEO"
            input.setTextColor(0xFF00FF66.toInt()); input.setHintTextColor(0xFF00802F.toInt()); input.setBackgroundColor(0xE6001300.toInt())
            sendBtn.setTextColor(0xFF001A00.toInt()); sendBtn.setBackgroundColor(0xFF00CC44.toInt())
        } else {
            faceBtn.setTextColor(0xFF3B2A06.toInt()); faceBtn.setBackgroundColor(0xFFFDE68A.toInt())
            neoBtn.setTextColor(0xFFDCFCE7.toInt()); neoBtn.setBackgroundColor(0xFF14532D.toInt()); neoBtn.text = "🟢"
            input.setTextColor(0xFFE7E5E4.toInt()); input.setHintTextColor(0xFF78716C.toInt()); input.setBackgroundColor(0xFF1C1917.toInt())
            sendBtn.setTextColor(0xFF3B2A06.toInt()); sendBtn.setBackgroundColor(0xFFFBBF24.toInt())
        }
        neoBtn.visibility = if (isProgramista()) View.VISIBLE else View.GONE
    }

    /** Szara podpowiedź na starcie. */
    private fun hint(text: String) {
        list.addView(TextView(this).apply {
            this.text = text
            textSize = 15f; setTextColor(0xFF78716C.toInt())
            setPadding(8, 8, 8, 20)
        })
    }

    /** 💬 Dymek rozmowy: mój po prawej, twarzy po lewej. W Neo — zieleń na czerni. */
    private fun bubble(text: String, mine: Boolean) {
        val neo = neoOn() && isProgramista()
        val pad = (resources.displayMetrics.density * 10).toInt()
        val tv = TextView(this).apply {
            this.text = text
            textSize = 17f
            setTextIsSelectable(true)   // kod/pisma można zaznaczyć i skopiować
            if (neo) {
                typeface = android.graphics.Typeface.MONOSPACE
                setTextColor(if (mine) 0xFFB7FFC9.toInt() else 0xFF00FF66.toInt())
                setBackgroundColor(if (mine) 0xD90A0F0A.toInt() else 0xD9001A00.toInt())
            } else {
                setTextColor(if (mine) 0xFFE7E5E4.toInt() else 0xFFDCFCE7.toInt())
                setBackgroundColor(if (mine) 0xFF292524.toInt() else 0xFF052E16.toInt())
            }
            setPadding(pad + 4, pad, pad + 4, pad)
        }
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
        val neo = neoOn() && isProgramista()
        val pad = (resources.displayMetrics.density * 10).toInt()
        thinkView = TextView(this).apply {
            text = "◐ myślę…"
            textSize = 17f
            setTextColor(if (neo) 0xFF00FF66.toInt() else 0xFFA8A29E.toInt())
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

    private fun send() {
        val t = input.text.toString().trim()
        if (t.isBlank()) return
        input.setText("")
        bubble(t, true)
        sendBtn.isEnabled = false
        showThinking()
        Thread {
            // 🗂 Odruchy rozmów działają też w czacie (nowa rozmowa, projekty...).
            var handled = false
            val said = StringBuilder()
            try {
                handled = Brain.convReflex(this, t, history) { s -> said.append(s).append(" ") }
            } catch (_: Exception) {}
            val answer: String = if (handled) said.toString().trim() else {
                val resp = try { Brain.ask(this, t, history) } catch (_: Exception) { null }
                when {
                    resp == null -> "Nie mam połączenia z serwerem. Sprawdź internet i czy serwer działa."
                    resp.optString("error", "").isNotBlank() -> "Błąd serwera: " + resp.optString("error")
                    else -> {
                        var say = resp.optString("say", "")
                        // ✍️ Gdy twarz coś NAPISAŁA (pismo, kod, wiersz) — pokaż całość w dymku.
                        if (resp.optString("action") == "write") {
                            val txt = resp.optJSONObject("args")?.optString("text") ?: ""
                            if (txt.isNotBlank()) say = (if (say.isBlank()) "" else say + "\n\n") + txt
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
