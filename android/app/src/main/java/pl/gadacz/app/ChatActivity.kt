package pl.gadacz.app

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * ⌨️ CZAT Z TWARZAMI — pisanie z Gadaczem jak w zwykłym komunikatorze.
 * Piszesz na dole, twarz odpisuje w dymkach; rozmowa zapisuje się SAMA na
 * serwerze (te same rozmowy co głosem — „zapisz projekt na stałe" działa i tu).
 * Nic nie jest czytane na głos — to tryb do CICHEGO pisania, np. w autobusie.
 */
class ChatActivity : Activity() {

    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var sendBtn: Button
    private lateinit var faceBtn: Button
    private val history = ArrayList<Pair<String, String>>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 12).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF0C0A09.toInt())
            setPadding(pad, pad, pad, pad)
        }

        // 🎭 Nagłówek: z KIM piszesz — dotknięcie zmienia twarz.
        faceBtn = Button(this).apply {
            textSize = 18f; isAllCaps = false
            setTextColor(0xFF3B2A06.toInt()); setBackgroundColor(0xFFFDE68A.toInt())
            text = "💬 Piszesz z: ${Personas.nameOf(Brain.cachedPersona(this@ChatActivity))} — dotknij, by zmienić"
            setOnClickListener { pickFace() }
        }
        root.addView(faceBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // 📜 Rozmowa — dymki, przewijane.
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, pad, 0, pad) }
        scroll = ScrollView(this).apply { addView(list); isFillViewport = true }
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        // ⌨️ Dół: pole pisania + Wyślij.
        input = EditText(this).apply {
            hint = "Napisz wiadomość…"
            textSize = 18f
            setTextColor(0xFFE7E5E4.toInt()); setHintTextColor(0xFF78716C.toInt())
            setBackgroundColor(0xFF1C1917.toInt())
            setPadding(pad, pad, pad, pad)
            maxLines = 5
        }
        sendBtn = Button(this).apply {
            text = "✉️\nWyślij"; textSize = 16f; isAllCaps = false
            setTextColor(0xFF3B2A06.toInt()); setBackgroundColor(0xFFFBBF24.toInt())
            setOnClickListener { send() }
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(input, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(sendBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        }
        root.addView(row)

        setContentView(root)
        hint("Napisz coś — odpowiem tekstem, bez czytania na głos. Rozmowa zapisuje się sama. " +
            "Działają też polecenia: nowa rozmowa · zapisz projekt na stałe jako NAZWA · wczytaj projekt NAZWA · jakie mam projekty.")
    }

    /** Szara podpowiedź na środku — znika w praktyce pod dymkami. */
    private fun hint(text: String) {
        list.addView(TextView(this).apply {
            this.text = text
            textSize = 15f; setTextColor(0xFF78716C.toInt())
            setPadding(8, 8, 8, 20)
        })
    }

    /** 💬 Dymek rozmowy: mój po prawej (ciemny), twarzy po lewej (zielonkawy). */
    private fun bubble(text: String, mine: Boolean) {
        val pad = (resources.displayMetrics.density * 10).toInt()
        val tv = TextView(this).apply {
            this.text = text
            textSize = 17f
            setTextIsSelectable(true)   // kod/pisma można zaznaczyć i skopiować
            setTextColor(if (mine) 0xFFE7E5E4.toInt() else 0xFFDCFCE7.toInt())
            setBackgroundColor(if (mine) 0xFF292524.toInt() else 0xFF052E16.toInt())
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

    private fun pickFace() {
        val cur = Brain.cachedPersona(this)
        val items = Personas.list.map { (key, name, desc) ->
            (if (key == cur) "✓ " else "") + name + "\n" + desc
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("🎭 Z kim chcesz pisać?")
            .setItems(items) { _, which ->
                val (key, name, _) = Personas.list[which]
                faceBtn.text = "💬 Piszesz z: $name — dotknij, by zmienić"
                history.clear()   // nowa twarz = świeży wątek (stary został zapisany)
                Thread {
                    val ok = Brain.setPersona(this, key)
                    if (ok) Brain.prefs(this).edit().putString("persona_cache", key).apply()
                    runOnUiThread { bubble(if (ok) "Jestem: ${name.substringAfter(" ")}. Pisz śmiało." else "Nie udało się przełączyć twarzy — sprawdź internet.", false) }
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
        sendBtn.text = "…"
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
                sendBtn.text = "✉️\nWyślij"
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
