package pl.gadacz.app

import android.inputmethodservice.InputMethodService
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * ⌨️ Klawiatura Gadacza — ostatnie, niezawodne drzwi do pisania.
 *
 * Pola, które nie wpuszczają usługi dostępności (Replit i inne rysowane po swojemu),
 * NIE MOGĄ odmówić klawiaturze — commitText działa wszędzie, tak samo jak w Gboardzie.
 *
 * Przepływ automatyczny: Brain nie zdołał wpisać → odkłada tekst w "ime_pending",
 * usługa dostępności przełącza klawiaturę na Gadacza → my wpisujemy czekający tekst
 * w aktywne pole → wracamy do poprzedniej klawiatury. Użytkownik tylko raz, na
 * zawsze, włącza "Gadacz Klawiatura" w ustawieniach klawiatur.
 */
class GadaczIME : InputMethodService() {

    private var info: TextView? = null

    override fun onCreateInputView(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF111111.toInt())
            setPadding(24, 20, 24, 28)
        }
        info = TextView(this).apply {
            text = "⌨️ Klawiatura Gadacza"
            setTextColor(0xFFFACC15.toInt())
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        }
        root.addView(info)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun btn(label: String, onClick: () -> Unit) = Button(this).apply {
            text = label
            textSize = 16f
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        row.addView(btn("Wklej") {
            val cb = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val t = cb.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString() ?: ""
            if (t.isNotBlank()) currentInputConnection?.commitText(t, 1)
        })
        row.addView(btn("Enter") {
            val ic = currentInputConnection ?: return@btn
            if (!ic.performEditorAction(EditorInfo.IME_ACTION_SEND))
                ic.performEditorAction(EditorInfo.IME_ACTION_DONE)
        })
        row.addView(btn("Zwykła klawiatura") { switchBack(force = true) })
        root.addView(row)
        return root
    }

    /** Pole właśnie dostało fokus z naszą klawiaturą — wpisz czekający tekst Gadacza. */
    override fun onStartInputView(attribute: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(attribute, restarting)
        val pending = Brain.prefs(this).getString("ime_pending", "") ?: ""
        if (pending.isNotBlank()) {
            info?.text = "⌨️ Wpisuję tekst Gadacza…"
            currentInputConnection?.commitText(pending, 1)
            Brain.prefs(this).edit().remove("ime_pending").apply()
            // Chwila, żeby pole przełknęło tekst — potem wracamy do zwykłej klawiatury.
            android.os.Handler(mainLooper).postDelayed({ switchBack() }, 600)
        } else {
            info?.text = "⌨️ Klawiatura Gadacza — Wklej / Enter / powrót"
        }
    }

    /** Wróć do klawiatury, której użytkownik używał wcześniej (zapamiętanej przy przełączeniu). */
    private fun switchBack(force: Boolean = false) {
        val prev = Brain.prefs(this).getString("ime_prev", "") ?: ""
        if (prev.isBlank()) { if (force) requestHideSelf(0); return }
        try { switchInputMethod(prev) } catch (_: Exception) { if (force) requestHideSelf(0) }
    }
}
