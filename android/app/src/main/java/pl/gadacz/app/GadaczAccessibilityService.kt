package pl.gadacz.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * The eyes and hands of Gadacz. Enabled by the user in
 * Settings → Accessibility → Gadacz. Once on, it can read the content of ANY
 * screen and perform taps/scrolls/typing — the only sanctioned way on Android
 * for an app to control other apps, built precisely for blind users.
 *
 * MainActivity talks to this singleton to run screen actions decided by the AI.
 */
class GadaczAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile var instance: GadaczAccessibilityService? = null
    }

    override fun onServiceConnected() { instance = this }
    override fun onInterrupt() {}
    override fun onDestroy() { instance = null; super.onDestroy() }

    // We don't react to every event — MainActivity pulls the screen on demand.
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    /**
     * Flatten the active window into a readable summary for the AI/TTS. Captures
     * EVERYTHING visible — text, buttons, input fields, checked state, and a rough
     * top/middle/bottom position — so Gadacz truly "sees" the whole screen.
     */
    fun readScreen(): String {
        val root = rootInActiveWindow ?: return "Nie widzę żadnego ekranu."
        val sb = StringBuilder()
        val pkg = root.packageName?.toString() ?: "?"
        sb.append("EKRAN aplikacji: ").append(pkg).append(". Elementy (od góry): ")
        val out = ArrayList<String>()
        val screenH = resources.displayMetrics.heightPixels.coerceAtLeast(1)
        collect(root, out, screenH)
        sb.append(out.take(140).joinToString(" | "))
        if (hasScrollable(root)) sb.append(" || (można PRZEWIJAĆ — jest więcej treści poza ekranem; użyj scroll aby zobaczyć)")
        return sb.toString()
    }

    private fun hasScrollable(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) return false
        if (node.isScrollable) return true
        for (i in 0 until node.childCount) if (hasScrollable(node.getChild(i))) return true
        return false
    }

    private fun collect(node: AccessibilityNodeInfo?, out: ArrayList<String>, screenH: Int) {
        if (node == null) return
        val text = node.text?.toString()?.trim()
        val desc = node.contentDescription?.toString()?.trim()
        // Puste pole tekstowe zdradza się podpowiedzią (hint) — „Wpisz wiadomość",
        // „Szukaj"... — bez tego AI nie wie, do czego pole służy.
        val hint = node.hintText?.toString()?.trim()
        val label = when {
            !text.isNullOrEmpty() -> text
            !desc.isNullOrEmpty() -> desc
            node.isEditable && !hint.isNullOrEmpty() -> hint
            else -> null
        }
        if (label != null && label.length in 1..120) {
            val kind = when {
                node.isEditable -> "[pole" + (if (!text.isNullOrEmpty()) "=\"$text\"" else "") + "] "
                node.isClickable -> "[przycisk] "
                node.isCheckable -> if (node.isChecked) "[✓zaznaczone] " else "[☐puste] "
                else -> ""
            }
            // rough vertical position for "gdzie jest..."
            val r = Rect(); node.getBoundsInScreen(r)
            val pos = when { r.centerY() < screenH / 3 -> "góra" ; r.centerY() > 2 * screenH / 3 -> "dół" ; else -> "środek" }
            out.add("$kind$label ($pos)")
        }
        for (i in 0 until node.childCount) collect(node.getChild(i), out, screenH)
    }

    /** Bez polskich znaków i wielkości liter — „Wyślij" trafia w „wyslij" i odwrotnie. */
    private fun norm(s: String): String {
        val map = mapOf('ą' to 'a', 'ć' to 'c', 'ę' to 'e', 'ł' to 'l', 'ń' to 'n',
            'ó' to 'o', 'ś' to 's', 'ź' to 'z', 'ż' to 'z')
        return s.lowercase().map { map[it] ?: it }.joinToString("")
    }

    private fun zoneOf(node: AccessibilityNodeInfo, screenH: Int): String {
        val r = Rect(); node.getBoundsInScreen(r)
        return when { r.centerY() < screenH / 3 -> "góra"; r.centerY() > 2 * screenH / 3 -> "dół"; else -> "środek" }
    }

    /** Zbierz WSZYSTKIE pasujące elementy z oceną trafności — nie pierwszy z brzegu. */
    private fun scoreNodes(node: AccessibilityNodeInfo?, q: String, out: ArrayList<Pair<Int, AccessibilityNodeInfo>>) {
        if (node == null) return
        val label = ((node.text?.toString() ?: "") + " " + (node.contentDescription?.toString() ?: "")).trim()
        if (label.isNotEmpty()) {
            val t = norm(label)
            var score = when {
                t == q -> 100                 // dokładnie ten napis
                t.startsWith(q) -> 60         // zaczyna się od szukanego
                t.contains(q) -> 40           // zawiera szukane
                else -> {
                    val words = q.split(" ").filter { it.length > 2 }
                    if (words.isNotEmpty() && words.all { t.contains(it) }) 25 else 0
                }
            }
            if (score > 0) {
                if (node.isClickable) score += 10   // klikane elementy przed ozdobnikami
                out.add(score to node)
            }
        }
        for (i in 0 until node.childCount) scoreNodes(node.getChild(i), q, out)
    }

    private fun bestMatch(query: String, pos: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val q = norm(query)
        if (q.isBlank()) return null
        val matches = ArrayList<Pair<Int, AccessibilityNodeInfo>>()
        scoreNodes(root, q, matches)
        if (matches.isEmpty()) return null
        val screenH = resources.displayMetrics.heightPixels.coerceAtLeast(1)
        // Gdy AI mówi „ten na dole" — zawęź do strefy, o ile coś tam pasuje.
        val pool = if (pos.isNotBlank()) matches.filter { zoneOf(it.second, screenH) == pos }.ifEmpty { matches } else matches
        return pool.maxByOrNull { it.first }?.second
    }

    /** Tap the BEST matching node (score, diacritics-proof), optionally in a screen zone. */
    fun tapByText(query: String, pos: String = ""): Boolean {
        val found = bestMatch(query, pos) ?: return false
        // Prefer the semantic click on the nearest clickable ancestor; else gesture.
        var n: AccessibilityNodeInfo? = found
        while (n != null && !n.isClickable) n = n.parent
        if (n?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
        return gestureAt(found, 60)
    }

    /** Przytrzymaj element (menu kontekstowe, kasowanie wiadomości, ikony...). */
    fun longPressByText(query: String, pos: String = ""): Boolean {
        val found = bestMatch(query, pos) ?: return false
        var n: AccessibilityNodeInfo? = found
        while (n != null && !n.isLongClickable) n = n.parent
        if (n?.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK) == true) return true
        return gestureAt(found, 700)   // przytrzymanie palcem
    }

    private fun gestureAt(node: AccessibilityNodeInfo, holdMs: Long): Boolean {
        val rect = Rect(); node.getBoundsInScreen(rect)
        if (rect.width() <= 0 || rect.height() <= 0) return false
        val path = Path().apply { moveTo(rect.exactCenterX(), rect.exactCenterY()) }
        dispatchGesture(GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, holdMs)).build(), null, null)
        return true
    }

    /** Enter/wyślij w aktywnym polu — zatwierdza wyszukiwanie, wysyła wiadomość. */
    fun pressEnter(): Boolean {
        val root = rootInActiveWindow ?: return false
        val field = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: findEditable(root) ?: return false
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            if (field.performAction(android.R.id.accessibilityActionImeEnter)) return true
        }
        // Starsze Androidy: spróbuj klawisza „Wyślij/Szukaj" na ekranie.
        return tapByText("Wyślij").let { if (it) true else tapByText("Szukaj") }
    }

    /**
     * Type into the focused editable field. Two methods, tried in order, so it works
     * across far more apps (standard fields AND WebView/chat/custom inputs):
     *  1) ACTION_SET_TEXT — clean, works for normal EditText.
     *  2) clipboard + ACTION_PASTE — the universal fallback for fields that reject #1
     *     (web inputs, many chat apps). This is why "write to Claude" failed before.
     */
    fun typeText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val field = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: findEditable(root) ?: return false
        // Make sure the field is focused/active first.
        field.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        field.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        if (field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) return true
        // Fallback — paste from clipboard (reaches WebViews and custom inputs).
        return try {
            val cb = getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cb.setPrimaryClip(android.content.ClipData.newPlainText("Gadacz", text))
            field.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            field.performAction(0x00008000) // ACTION_PASTE (int id, works on all API levels)
        } catch (e: Exception) { false }
    }

    private fun findEditable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isEditable) return node
        for (i in 0 until node.childCount) findEditable(node.getChild(i))?.let { return it }
        return null
    }

    fun goBack() { performGlobalAction(GLOBAL_ACTION_BACK) }
    fun goHome() { performGlobalAction(GLOBAL_ACTION_HOME) }
    fun recents() { performGlobalAction(GLOBAL_ACTION_RECENTS) }
    fun openQuickSettings() {
        if (android.os.Build.VERSION.SDK_INT >= 31) performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
        else performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
    }
    fun openNotifications() { performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS) }
    /** Toggle an on-screen switch by its label — for Wi-Fi/Bluetooth panels etc. */
    fun toggleByText(label: String): Boolean = tapByText(label)
    /**
     * Przewijanie w KAŻDĄ stronę, dwiema metodami próbowanymi po kolei:
     *  1) ACTION_SCROLL — dla zwykłych list (ściana Facebooka, ustawienia, czaty).
     *  2) gest przesunięcia palcem — dla TikToka, Reelsów, Stories i Shortsów, które
     *     NIE słuchają ACTION_SCROLL, bo czekają na fizyczny swipe.
     * dir: "down" (dalej/następny), "up" (wstecz), "left"/"right" (karuzele, stories).
     */
    fun scroll(dir: String) {
        when (dir) {
            "left", "right" -> swipeGesture(dir)
            else -> {
                val forward = dir != "up"
                val root = rootInActiveWindow
                val s = root?.let { findScrollable(it) }
                if (s != null && s.performAction(
                        if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                        else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return
                // Fallback — przeciągnij palcem po środku ekranu (TikTok, Reelsy, Stories).
                swipeGesture(if (forward) "down" else "up")
            }
        }
    }

    /** Fizyczny swipe. "down"=palec w górę (następny), "up"=palec w dół, "left"/"right" w bok. */
    private fun swipeGesture(dir: String) {
        val w = resources.displayMetrics.widthPixels
        val h = resources.displayMetrics.heightPixels
        val cx = w / 2f; val cy = h / 2f
        val path = Path()
        when (dir) {
            "up"    -> { path.moveTo(cx, h * 0.30f); path.lineTo(cx, h * 0.75f) }
            "left"  -> { path.moveTo(w * 0.80f, cy); path.lineTo(w * 0.20f, cy) }  // następny w bok
            "right" -> { path.moveTo(w * 0.20f, cy); path.lineTo(w * 0.80f, cy) }  // poprzedni w bok
            else    -> { path.moveTo(cx, h * 0.75f); path.lineTo(cx, h * 0.30f) }  // "down"
        }
        dispatchGesture(GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 250)).build(), null, null)
    }
    private fun findScrollable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) findScrollable(node.getChild(i))?.let { return it }
        return null
    }
}
