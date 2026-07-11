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

    /** Pakiet aplikacji na wierzchu (dla „naucz się tej aplikacji"). Pusty = nieznany. */
    fun currentPackage(): String = rootInActiveWindow?.packageName?.toString() ?: ""

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

    /**
     * Wklej schowek w AKTYWNE pole (to, którego dotknął użytkownik — kursor miga).
     * Działa też tam, gdzie pola nie widać jako „editable" — wystarczy, że aplikacja
     * zgłasza fokus. Ostatnia deska ratunku przed ręcznym przytrzymaniem.
     */
    fun pasteFocused(): Boolean {
        val root = rootInActiveWindow ?: return false
        val field = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
            ?: findEditable(root) ?: return false
        field.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        return field.performAction(0x00008000) // ACTION_PASTE
    }

    /**
     * ⌨️ Ostatnia deska: przełącz na KLAWIATURĘ Gadacza, która wpisze tekst tam,
     * gdzie dostępność nie sięga (pola rysowane po swojemu — Replit itp.).
     * Wymaga Androida 11+ i jednorazowego włączenia klawiatury przez użytkownika.
     * Zwraca: "ok" (przełączono, klawiatura wpisze), "disabled" (nie włączona), "no" (za stary Android/błąd).
     */
    fun typeViaIme(text: String): String {
        if (android.os.Build.VERSION.SDK_INT < 30) return "no"
        return try {
            val enabled = android.provider.Settings.Secure.getString(contentResolver, "enabled_input_methods")
                ?.contains(packageName) == true
            if (!enabled) return "disabled"
            val prev = android.provider.Settings.Secure.getString(
                contentResolver, android.provider.Settings.Secure.DEFAULT_INPUT_METHOD) ?: ""
            Brain.prefs(this).edit()
                .putString("ime_pending", text)
                .putString("ime_prev", prev).apply()
            // Pole musi mieć fokus, żeby klawiatura dostała połączenie — kliknij je.
            val root = rootInActiveWindow
            val field = root?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
                ?: root?.let { findEditable(it) }
            field?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            if (softKeyboardController.switchToInputMethod("$packageName/.GadaczIME")) "ok" else "no"
        } catch (_: Exception) { "no" }
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

    /**
     * 📸 OKO GADACZA — zrzut aktualnego ekranu jako JPEG w base64 (Android 11+).
     * To zmienia wszystko: AI WIDZI ekran jak człowiek — ikony bez podpisów, układ,
     * obrazki — zamiast zgadywać z listy napisów. Zmniejszamy do 720 px szerokości
     * i ściskamy, żeby nie tuczyć zapytań.
     */
    fun screenshotBase64(): String? {
        if (android.os.Build.VERSION.SDK_INT < 30) return null
        val latch = java.util.concurrent.CountDownLatch(1)
        var result: String? = null
        try {
            takeScreenshot(android.view.Display.DEFAULT_DISPLAY, mainExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(shot: ScreenshotResult) {
                        try {
                            val hw = android.graphics.Bitmap.wrapHardwareBuffer(shot.hardwareBuffer, shot.colorSpace)
                            shot.hardwareBuffer.close()
                            val bmp = hw?.copy(android.graphics.Bitmap.Config.ARGB_8888, false)
                            if (bmp != null) {
                                val scale = 720f / bmp.width
                                val small = if (scale < 1f) android.graphics.Bitmap.createScaledBitmap(
                                    bmp, 720, (bmp.height * scale).toInt().coerceAtLeast(1), true) else bmp
                                val bos = java.io.ByteArrayOutputStream()
                                small.compress(android.graphics.Bitmap.CompressFormat.JPEG, 55, bos)
                                result = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP)
                            }
                        } catch (_: Exception) {}
                        latch.countDown()
                    }
                    override fun onFailure(code: Int) { latch.countDown() }
                })
        } catch (_: Exception) { latch.countDown() }
        try { latch.await(3, java.util.concurrent.TimeUnit.SECONDS) } catch (_: Exception) {}
        return result
    }

    /** 👉 Dotknij PUNKT ekranu podany w procentach (x od lewej, y od góry). Dla ikon bez nazw. */
    fun tapAt(xPct: Double, yPct: Double): Boolean {
        if (xPct !in 0.0..100.0 || yPct !in 0.0..100.0) return false
        val w = resources.displayMetrics.widthPixels
        val h = resources.displayMetrics.heightPixels
        val path = Path().apply { moveTo((w * xPct / 100.0).toFloat(), (h * yPct / 100.0).toFloat()) }
        dispatchGesture(GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build(), null, null)
        return true
    }

    // ─── 🔢 TRYB NUMERKÓW ────────────────────────────────────────────────────
    // Sterowanie KAŻDYM ekranem bez rozumienia: numerujemy klikalne elementy,
    // użytkownik mówi numer — my klikamy. Użytkownik jest mózgiem, my palcem.
    private var numberedEls: List<Pair<String, Rect>> = emptyList()

    /** Ponumeruj klikalne/edytowalne elementy i zwróć listę do przeczytania na głos. */
    fun listNumbered(): String {
        val root = rootInActiveWindow ?: return "Nie widzę ekranu."
        val out = ArrayList<Pair<String, Rect>>()
        collectInteractive(root, out)
        numberedEls = out
        if (numberedEls.isEmpty()) return "Nie widzę nic do kliknięcia na tym ekranie."
        val list = numberedEls.mapIndexed { i, p -> "${i + 1}: ${p.first}" }.joinToString(". ")
        return "$list. Powiedz numer, aby kliknąć."
    }

    fun hasNumbered() = numberedEls.isNotEmpty()

    /**
     * Klika element numer N — najpierw po NAPISIE na aktualnym ekranie (bezpiecznie),
     * a w miejsce zapamiętane tylko jeśli wciąż jest tam coś klikalnego. Bez tego stary
     * Rect po zmianie ekranu klikał w zły przycisk. Audyt 10.07.
     */
    fun tapNumber(num: Int): Boolean {
        val el = numberedEls.getOrNull(num - 1) ?: return false
        numberedEls = emptyList()   // numery jednorazowe
        if (el.first.isNotBlank() && tapByText(el.first)) return true
        val root = rootInActiveWindow ?: return false
        if (nodeAt(root, el.second.centerX(), el.second.centerY()) != null) {
            val path = Path().apply { moveTo(el.second.exactCenterX(), el.second.exactCenterY()) }
            dispatchGesture(GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build(), null, null)
            return true
        }
        return false
    }

    private fun nodeAt(node: AccessibilityNodeInfo?, x: Int, y: Int): AccessibilityNodeInfo? {
        if (node == null) return null
        val r = Rect(); node.getBoundsInScreen(r)
        if ((node.isClickable || node.isEditable) && r.contains(x, y)) return node
        for (i in 0 until node.childCount) nodeAt(node.getChild(i), x, y)?.let { return it }
        return null
    }

    private fun collectInteractive(node: AccessibilityNodeInfo?, out: ArrayList<Pair<String, Rect>>) {
        if (node == null || out.size >= 12) return
        if (node.isClickable || node.isEditable) {
            val label = node.text?.toString()?.trim().takeUnless { it.isNullOrEmpty() }
                ?: node.contentDescription?.toString()?.trim().takeUnless { it.isNullOrEmpty() }
                ?: node.hintText?.toString()?.trim().takeUnless { it.isNullOrEmpty() }
            if (label != null && label.length in 1..40) {
                val r = Rect(); node.getBoundsInScreen(r)
                if (r.width() > 0 && r.height() > 0) out.add(label to r)
            }
        }
        for (i in 0 until node.childCount) collectInteractive(node.getChild(i), out)
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
        // 👆 ZAWSZE przeciągnięcie palcem jako PODSTAWA. Powód (lekcja z Facebooka):
        // ACTION_SCROLL łapało pierwszy przewijalny element (poziomy pasek relacji) i
        // „udawało sukces", nie ruszając ściany. Fizyczny swipe przewija to, co jest
        // pod palcem — czyli właściwą treść — w każdej aplikacji (Facebook, TikTok, listy).
        swipeGesture(dir)
    }

    /** Fizyczny swipe. "down"=palec w górę (dalej), "up"=palec w dół (wstecz), "left"/"right" w bok. */
    private fun swipeGesture(dir: String) {
        val w = resources.displayMetrics.widthPixels
        val h = resources.displayMetrics.heightPixels
        val cx = w / 2f; val cy = h / 2f
        val path = Path()
        // Szeroki zakres (bez paska stanu u góry i nawigacji na dole) = wyraźne przewinięcie.
        when (dir) {
            "up"    -> { path.moveTo(cx, h * 0.28f); path.lineTo(cx, h * 0.82f) }
            "left"  -> { path.moveTo(w * 0.85f, cy); path.lineTo(w * 0.15f, cy) }  // następny w bok
            "right" -> { path.moveTo(w * 0.15f, cy); path.lineTo(w * 0.85f, cy) }  // poprzedni w bok
            else    -> { path.moveTo(cx, h * 0.82f); path.lineTo(cx, h * 0.28f) }  // "down"
        }
        // 220 ms — kontrolowane przewinięcie o mniej więcej ekran, nie gwałtowny „rzut".
        dispatchGesture(GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 220)).build(), null, null)
    }
    private fun findScrollable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) findScrollable(node.getChild(i))?.let { return it }
        return null
    }
}
