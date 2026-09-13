package pl.gadacz.app

import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * Reads incoming notifications aloud — for a blind user, this is how they know
 * someone messaged or called without looking. Opt-in (toggle "read_notifications"),
 * filtered to skip noise (ongoing/foreground/own notifications), and rate-limited so
 * it doesn't chatter. Enabled by the user in Settings → Notification access → Gadacz.
 */
class GadaczNotificationService : NotificationListenerService(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var lastSpokenKey = ""
    private var lastSpokenAt = 0L

    override fun onListenerConnected() { if (tts == null) tts = TextToSpeech(this, this) }
    override fun onInit(status: Int) { if (status == TextToSpeech.SUCCESS) tts?.language = Locale("pl", "PL") }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (!Brain.prefs(this).getBoolean("read_notifications", false)) return
        if (sbn.packageName == packageName) return                 // never read our own
        val n = sbn.notification ?: return
        // Skip ongoing/foreground/low-priority noise (music, downloads, "app running").
        val flags = n.flags
        if (flags and android.app.Notification.FLAG_ONGOING_EVENT != 0) return
        if (flags and android.app.Notification.FLAG_FOREGROUND_SERVICE != 0) return
        if (!sbn.isClearable) return

        val extras = n.extras ?: return
        val title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
        if (title.isBlank() && text.isBlank()) return

        // De-dupe + rate-limit (same content, or bursts within 3s).
        val body = "$title|$text"
        val now = System.currentTimeMillis()
        if (body == lastSpokenKey && now - lastSpokenAt < 8000) return
        if (now - lastSpokenAt < 1500) return
        lastSpokenKey = body; lastSpokenAt = now

        val app = try {
            val pm = packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
        } catch (e: Exception) { "" }

        val spoken = when {
            title.isNotBlank() && text.isNotBlank() -> "$app. $title mówi: $text"
            title.isNotBlank() -> "$app. $title"
            else -> "$app. $text"
        }
        tts?.speak(spoken.take(300), TextToSpeech.QUEUE_ADD, null, "notif")
    }

    override fun onDestroy() { tts?.stop(); tts?.shutdown(); super.onDestroy() }
}
