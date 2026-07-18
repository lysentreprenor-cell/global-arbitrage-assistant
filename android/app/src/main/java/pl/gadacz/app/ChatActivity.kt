package pl.gadacz.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * ⌨️ CZAT Z TWARZAMI — pisanie ORAZ mówienie z Gadaczem jak w komunikatorze.
 * Rozmowa zapisuje się SAMA na serwerze; menu ⋮ (prawy górny róg) daje ustawienia:
 *  🔊 czytanie odpowiedzi na głos, 🎙️ tryb rozmowy głosowej (mówisz — Gadacz
 *  odpowiada głosem i wszystko zapisuje), 🎭 pisanie ze WSZYSTKIMI twarzami naraz
 *  (narada), 🗂 projekty i czaty, 🟢 tryb Neo (u Programowania).
 *  🎤 mikrofon dyktuje tekst, 📎 spinacz dołącza zdjęcie/plik.
 */
class ChatActivity : Activity(), TextToSpeech.OnInitListener {

    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var sendBtn: Button
    private lateinit var micBtn: Button
    private lateinit var attachBtn: Button
    private lateinit var faceBtn: Button
    private lateinit var menuBtn: Button
    private lateinit var rain: NeoRainView
    private lateinit var col: LinearLayout
    private val history = ArrayList<Pair<String, String>>()

    // 📎 Załącznik czekający na wysłanie (zdjęcie ALBO tekst pliku).
    private var attachB64: String? = null
    private var attachText: String? = null
    private val pickReq = 31
    private val micPermReq = 32

    // 🔊 Mowa: własny głos (Piper) albo systemowy; do trybu rozmowy głosowej.
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speakDone: (() -> Unit)? = null
    private var recognizer: SpeechRecognizer? = null
    private var pendingAutoSend = false

    // 🎭 Pisanie ze WSZYSTKIMI twarzami · 🎙️ tryb rozmowy głosowej (mowa+głos).
    private var allFaces = false
    private var voiceConvo = false

    // ⏳ „Myślę" = DEKODOWANIE: migające japońskie znaki z blokowym kursorem.
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
    private fun neoActive(): Boolean = neoOn() && isProgramista() && !allFaces
    private fun ttsOn(): Boolean = Brain.prefs(this).getBoolean("chat_tts", false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this, this)
        val pad = (resources.displayMetrics.density * 12).toInt()

        col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }

        // 🎭 Nagłówek: twarz (kliknięcie zmienia) + ⋮ menu ustawień w prawym rogu.
        faceBtn = Button(this).apply {
            textSize = 16f; isAllCaps = false
            setOnClickListener { pickFace() }
        }
        menuBtn = Button(this).apply {
            text = "⋮"; textSize = 22f; isAllCaps = false
            setOnClickListener { showMenu() }
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(faceBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(menuBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        }
        col.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // 📜 Rozmowa — dymki, przewijane.
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, pad, 0, pad) }
        scroll = ScrollView(this).apply { addView(list); isFillViewport = true }
        col.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        // ⌨️ Dół: mikrofon + załącznik + pole pisania + Wyślij.
        micBtn = Button(this).apply {
            text = "🎤"; textSize = 18f; isAllCaps = false
            setOnClickListener { startDictation(autoSend = false) }
        }
        attachBtn = Button(this).apply {
            text = "📎"; textSize = 18f; isAllCaps = false
            setOnClickListener { pickAttachment() }
        }
        input = EditText(this).apply {
            hint = "Napisz albo dotknij mikrofonu…"
            textSize = 18f
            setPadding(pad, pad, pad, pad)
            maxLines = 5
        }
        sendBtn = Button(this).apply {
            text = "✉️\nWyślij"; textSize = 15f; isAllCaps = false
            setOnClickListener { send() }
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(micBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
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
        else hint("Napisz albo dotknij 🎤 i mów — odpowiem tekstem. Rozmowa zapisuje się sama. " +
            "Menu ⋮ w prawym górnym rogu: czytanie na głos, rozmowa głosowa, wszystkie twarze, projekty.")
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            ttsReady = true
            try { tts?.language = java.util.Locale("pl", "PL") } catch (_: Exception) {}
            tts?.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) { runOnUiThread { speakDone?.invoke(); speakDone = null } }
                @Deprecated("api") override fun onError(id: String?) { runOnUiThread { speakDone?.invoke(); speakDone = null } }
            })
        }
    }

    /** 🎨 Zwykły czat albo Matrix — kolory całego ekranu w jednym miejscu. */
    private fun applyTheme() {
        val neo = neoActive()
        rain.visibility = if (neo) View.VISIBLE else View.GONE
        col.setBackgroundColor(if (neo) 0x00000000 else 0xFF0C0A09.toInt())
        faceBtn.text = if (allFaces) "💬 🎭 Wszystkie twarze (narada)" else "💬 ${Personas.nameOf(Brain.cachedPersona(this))}"
        if (neo) {
            faceBtn.setTextColor(0xFF00FF66.toInt()); faceBtn.setBackgroundColor(0x99001A00.toInt())
            menuBtn.setTextColor(0xFF00FF66.toInt()); menuBtn.setBackgroundColor(0x99001A00.toInt())
            micBtn.setTextColor(0xFF00FF66.toInt()); micBtn.setBackgroundColor(0x99001A00.toInt())
            attachBtn.setTextColor(0xFF00FF66.toInt()); attachBtn.setBackgroundColor(0x99001A00.toInt())
            input.setTextColor(0xFF00FF66.toInt()); input.setHintTextColor(0xFF00802F.toInt()); input.setBackgroundColor(0x99001300.toInt())
            sendBtn.setTextColor(0xFF001A00.toInt()); sendBtn.setBackgroundColor(0xFF00CC44.toInt())
        } else {
            faceBtn.setTextColor(0xFF3B2A06.toInt()); faceBtn.setBackgroundColor(if (allFaces) 0xFFA7F3D0.toInt() else 0xFFFDE68A.toInt())
            menuBtn.setTextColor(0xFFFDE68A.toInt()); menuBtn.setBackgroundColor(0xFF292524.toInt())
            micBtn.setTextColor(0xFFE7E5E4.toInt()); micBtn.setBackgroundColor(0xFF292524.toInt())
            attachBtn.setTextColor(0xFFE7E5E4.toInt()); attachBtn.setBackgroundColor(0xFF292524.toInt())
            input.setTextColor(0xFFE7E5E4.toInt()); input.setHintTextColor(0xFF78716C.toInt()); input.setBackgroundColor(0xFF1C1917.toInt())
            sendBtn.setTextColor(0xFF3B2A06.toInt()); sendBtn.setBackgroundColor(0xFFFBBF24.toInt())
        }
    }

    // ── ⋮ MENU USTAWIEŃ WIADOMOŚCI — czytanie na głos, rozmowa głosowa, narada… ──
    private fun showMenu() {
        val hasNeo = isProgramista()
        val labels = ArrayList<String>()
        labels.add((if (ttsOn()) "✓ " else "") + "🔊 Czytaj odpowiedzi na głos")
        labels.add((if (voiceConvo) "✓ " else "") + "🎙️ Tryb rozmowy głosowej (mów, ja piszę i mówię)")
        labels.add((if (allFaces) "✓ " else "") + "🎭 Pisz ze WSZYSTKIMI twarzami (narada)")
        labels.add("🗂 Projekty i czaty")
        labels.add("⏳ Kiedy kasować zwykłe czaty")
        if (hasNeo) labels.add((if (neoOn()) "✓ " else "") + "🟢 Tryb Neo (Matrix)")
        AlertDialog.Builder(this)
            .setTitle("⋮ Ustawienia wiadomości")
            .setItems(labels.toTypedArray()) { _, i ->
                when (i) {
                    0 -> {
                        val on = !ttsOn()
                        Brain.prefs(this).edit().putBoolean("chat_tts", on).apply()
                        if (!on) { PiperUsta.stopNow(); tts?.stop() }
                        bubble(if (on) "Będę czytał odpowiedzi na głos. Wyłącz w menu, gdy zechcesz ciszy." else "Cisza — już nie czytam na głos.", false)
                    }
                    1 -> toggleVoiceConvo()
                    2 -> {
                        allFaces = !allFaces
                        applyTheme()
                        bubble(if (allFaces) "🎭 Teraz odpowiada CAŁA narada: prawnik, lekarz, sprzedawca, programista, kucharz, żartowniś i bajerant — każdy po swojemu. Napisz pytanie." else "Wracam do pisania z jedną twarzą: ${Personas.nameOf(Brain.cachedPersona(this)).substringAfter(" ")}.", false)
                    }
                    3 -> showProjects()
                    4 -> showDeleteTiming()
                    5 -> if (hasNeo) {
                        Brain.prefs(this).edit().putBoolean("neo_mode", !neoOn()).apply()
                        applyTheme()
                        if (neoActive()) neoIntro() else bubble("Wyszedłeś z Matriksa.", false)
                    }
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    /** 🎙️ Rozmowa głosowa: mówisz → Gadacz zapisuje, odpowiada i CZYTA na głos,
     *  potem znów słucha. Cała rozmowa (jak zwykle) zapisuje się sama. */
    private fun toggleVoiceConvo() {
        voiceConvo = !voiceConvo
        if (voiceConvo) {
            bubble("🎙️ Tryb rozmowy głosowej włączony. Mów do mnie normalnie — zapiszę i odpowiem na głos, potem znów słucham. Wyłącz w menu ⋮.", false)
            startDictation(autoSend = true)
        } else {
            try { recognizer?.cancel(); recognizer?.destroy() } catch (_: Exception) {}
            recognizer = null; micBtn.text = "🎤"
            PiperUsta.stopNow(); tts?.stop()
            bubble("Koniec rozmowy głosowej. Piszę dalej normalnie.", false)
        }
    }

    // ── 🎤 DYKTOWANIE — zamień mowę na tekst; w trybie rozmowy wysyłaj od razu ──
    private fun startDictation(autoSend: Boolean) {
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            pendingAutoSend = autoSend
            requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), micPermReq)
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { bubble("Ten telefon nie ma rozpoznawania mowy.", false); return }
        // Zamilcz głos Gadacza, żeby mikrofon nie łapał jego własnej mowy.
        PiperUsta.stopNow(); tts?.stop()
        try { recognizer?.cancel(); recognizer?.destroy() } catch (_: Exception) {}
        micBtn.text = "🔴"
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    micBtn.text = "🎤"
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    if (!text.isNullOrBlank()) {
                        input.setText(text)
                        if (autoSend) send()
                    } else if (voiceConvo) {
                        bubble("Nie dosłyszałem — dotknij 🎤 i powiedz jeszcze raz.", false)
                    }
                }
                override fun onError(error: Int) {
                    micBtn.text = "🎤"
                    // W rozmowie głosowej cisza NIE spamuje — czekamy na dotknięcie 🎤.
                    if (!voiceConvo && error == SpeechRecognizer.ERROR_NO_MATCH)
                        bubble("Nie usłyszałem. Dotknij 🎤 i powiedz jeszcze raz.", false)
                }
                override fun onReadyForSpeech(p0: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(p0: Float) {}
                override fun onBufferReceived(p0: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(p0: Bundle?) {}
                override fun onEvent(p0: Int, p1: Bundle?) {}
            })
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pl-PL")
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
        }
        try { recognizer?.startListening(intent) } catch (_: Exception) { micBtn.text = "🎤"; bubble("Błąd mikrofonu.", false) }
    }

    override fun onRequestPermissionsResult(rc: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(rc, perms, res)
        if (rc == micPermReq && res.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED)
            startDictation(pendingAutoSend)
        else if (rc == micPermReq)
            bubble("Bez zgody na mikrofon nie mogę słuchać. Możesz dalej pisać ręcznie.", false)
    }

    /** 🔊 Przeczytaj tekst na głos (Piper albo systemowy). onDone po wybrzmieniu. */
    private fun speakOut(text: String, onDone: (() -> Unit)? = null) {
        if ((!voiceConvo && !ttsOn()) || text.isBlank()) { onDone?.invoke(); return }
        val clean = text.replace(Regex("[`*_#>]"), "").take(1500)
        if (PiperUsta.enabled(this)) {
            PiperUsta.stopNow()
            if (PiperUsta.speak(this, clean) { runOnUiThread { onDone?.invoke() } }) return
        }
        val t = tts
        if (t != null && ttsReady) {
            speakDone = onDone
            t.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "chat")
        } else onDone?.invoke()
    }

    /** 🐇 Jak u Neo: Morfeusz pisze do Ciebie pierwszy raz — literka po literce. */
    private fun neoIntro() {
        bubble("Obudź się, Neo…", false)
        list.postDelayed({ bubble("Matrix ma cię…", false) }, 2400)
        list.postDelayed({ bubble("Podążaj za białym królikiem. 🐇", false) }, 4800)
    }

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

    /** 💬 Dymek rozmowy: mój po prawej, twarzy po lewej. W Neo — zieleń + maszyna. */
    private fun bubble(text: String, mine: Boolean) {
        val neo = neoActive()
        val pad = (resources.displayMetrics.density * 10).toInt()
        val tv = TextView(this).apply {
            textSize = 17f
            setTextIsSelectable(true)   // kod/pisma można zaznaczyć i skopiować
            if (neo) {
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

    // ── 🗂 PROJEKTY I CZATY ──
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
                    3 -> showDeleteTiming()
                }
            }
            .setNegativeButton("Zamknij", null).show()
    }

    private fun showDeleteTiming() {
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

    // ── 📎 ZAŁĄCZNIKI ──
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
            (if (key == cur && !allFaces) "✓ " else "") + name + "\n" + desc
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("🎭 Z kim chcesz pisać?")
            .setItems(items) { _, which ->
                val (key, name, _) = Personas.list[which]
                allFaces = false
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

    // ── 🖐️ RĘCE GADACZA — czytanie i wypychanie własnego kodu (z potwierdzeniem) ──
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
                runOnUiThread { hideThinking(); bubble(if (ok) "📄 $path:\n\n${res.take(6000)}" else res, false) }
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
                        runOnUiThread { hideThinking(); bubble(res + if (ok) " Pamiętaj: zmiany serwera i www wymagają git pull na Replicie, a zmiany Androida — aktualizacji aplikacji." else "", false) }
                    }.start()
                }
                .setNegativeButton("Anuluj", null).show()
            return true
        }
        return false
    }

    private fun send() {
        val typed = input.text.toString().trim()
        if (typed.isNotBlank() && !allFaces && trySelfCode(typed)) return
        val hasAttach = attachB64 != null || attachText != null
        if (typed.isBlank() && !hasAttach) return
        val t = typed.ifBlank { "Przeczytaj załącznik i powiedz dokładnie, co w nim jest." }
        input.setText("")
        bubble(if (hasAttach) "$t 📎" else t, true)
        sendBtn.isEnabled = false
        showThinking()

        // 🎭 NARADA — pytanie do wszystkich twarzy (bez załączników, bez głosu).
        if (allFaces && !hasAttach) { sendRoundtable(t); return }

        val img = attachB64
        val fileTxt = attachText
        attachB64 = null; attachText = null
        Thread {
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
                        if (resp.optString("action") == "write") {
                            val txt = resp.optJSONObject("args")?.optString("text") ?: ""
                            if (txt.isNotBlank()) { lastCode = txt; say = (if (say.isBlank()) "" else say + "\n\n") + txt }
                        }
                        if (say.isBlank()) "Nie mam na to odpowiedzi. Napisz to inaczej." else say
                    }
                }
            }
            runOnUiThread {
                sendBtn.isEnabled = true
                hideThinking()
                bubble(answer, false)
                // 🔊 Czytanie na głos / 🎙️ rozmowa głosowa — po wybrzmieniu znów słuchaj.
                if (voiceConvo || ttsOn()) speakOut(answer) { if (voiceConvo) startDictation(true) }
            }
            if (!handled) {
                history.add("user" to t); history.add("assistant" to answer)
                while (history.size > 16) history.removeAt(0)
                try { Brain.convAppend(this, t, answer) } catch (_: Exception) {}
            }
        }.start()
    }

    /** 🎭 Wyślij pytanie do NARADY — każda twarz odpowiada w osobnym dymku. */
    private fun sendRoundtable(t: String) {
        attachB64 = null; attachText = null
        Thread {
            val answers = Brain.roundtable(this, t, history)
            runOnUiThread {
                sendBtn.isEnabled = true
                hideThinking()
                if (answers.isEmpty()) bubble("Narada nie odpowiedziała. Spróbuj jeszcze raz.", false)
                else answers.forEach { (label, ans) -> bubble("$label:\n$ans", false) }
            }
            if (answers.isNotEmpty()) {
                val joined = answers.joinToString("\n\n") { "${it.first}: ${it.second}" }
                history.add("user" to t); history.add("assistant" to joined)
                while (history.size > 16) history.removeAt(0)
                try { Brain.convAppend(this, t, joined) } catch (_: Exception) {}
            }
        }.start()
    }

    override fun onDestroy() {
        try { recognizer?.destroy() } catch (_: Exception) {}
        try { PiperUsta.stopNow() } catch (_: Exception) {}
        try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
        super.onDestroy()
    }
}
