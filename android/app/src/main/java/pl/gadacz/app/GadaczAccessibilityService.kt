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
        sb.append(out.take(120).joinToString(" | "))
        return sb.toString()
    }

    private fun collect(node: AccessibilityNodeInfo?, out: ArrayList<String>, screenH: Int) {
        if (node == null) return
        val text = node.text?.toString()?.trim()
        val desc = node.contentDescription?.toString()?.trim()
        val label = when {
            !text.isNullOrEmpty() -> text
            !desc.isNullOrEmpty() -> desc
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

    /** Tap the first clickable node whose text/description matches (case-insensitive). */
    fun tapByText(query: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val target = findClickable(root, query.lowercase()) ?: return false
        // Prefer the semantic click; fall back to a gesture on its bounds.
        if (target.isClickable && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        val rect = Rect(); target.getBoundsInScreen(rect)
        if (rect.width() <= 0 || rect.height() <= 0) return false
        val path = Path().apply { moveTo(rect.exactCenterX(), rect.exactCenterY()) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build()
        dispatchGesture(gesture, null, null)
        return true
    }

    private fun findClickable(node: AccessibilityNodeInfo?, q: String): AccessibilityNodeInfo? {
        if (node == null) return null
        val t = (node.text?.toString() ?: "") + " " + (node.contentDescription?.toString() ?: "")
        if (t.lowercase().contains(q)) {
            var n: AccessibilityNodeInfo? = node
            while (n != null) { if (n.isClickable) return n; n = n.parent }
        }
        for (i in 0 until node.childCount) findClickable(node.getChild(i), q)?.let { return it }
        return null
    }

    /** Type into the currently focused editable field. */
    fun typeText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val field = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: findEditable(root) ?: return false
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
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
    fun scroll(forward: Boolean) {
        val root = rootInActiveWindow ?: return
        val s = findScrollable(root) ?: return
        s.performAction(if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
    }
    private fun findScrollable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) findScrollable(node.getChild(i))?.let { return it }
        return null
    }
}
