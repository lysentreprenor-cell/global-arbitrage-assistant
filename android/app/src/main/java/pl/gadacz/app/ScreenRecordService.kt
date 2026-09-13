package pl.gadacz.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ContentValues
import android.content.Intent
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore

/**
 * 🎬 NAGRYWANIE EKRANU — Gadacz nagrywa ekran z dźwiękiem z mikrofonu do MP4.
 * Start: Ustawienia → Nagrywanie ekranu (Android pyta o zgodę) albo głosem
 * „nagrywaj ekran". Stop: to samo miejsce albo „zakończ nagrywanie".
 * Film ląduje w galerii (Filmy/Gadacz) — gotowy do wysłania.
 */
class ScreenRecordService : Service() {

    companion object {
        @Volatile var running = false
        @Volatile private var instance: ScreenRecordService? = null
        fun requestStop() { instance?.stopRecording() }
    }

    private var projection: MediaProjection? = null
    private var recorder: MediaRecorder? = null
    private var vdisp: android.hardware.display.VirtualDisplay? = null
    private var pfd: android.os.ParcelFileDescriptor? = null
    private var savedUri: android.net.Uri? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running || intent == null) return START_NOT_STICKY
        instance = this
        val chan = "gadacz_rec"
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(chan, "Nagrywanie ekranu", NotificationManager.IMPORTANCE_LOW))
        }
        val notif = Notification.Builder(this, chan)
            .setContentTitle("🔴 Gadacz nagrywa ekran")
            .setContentText("Powiedz: zakończ nagrywanie — żeby zapisać film")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
        // Android 10+ wymaga jawnego typu mediaProjection PRZED pobraniem projekcji.
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(7, notif, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(7, notif)
        try {
            val code = intent.getIntExtra("code", 0)
            val data: Intent? = if (Build.VERSION.SDK_INT >= 33)
                intent.getParcelableExtra("data", Intent::class.java)
            else @Suppress("DEPRECATION") intent.getParcelableExtra("data")
            val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            projection = mpm.getMediaProjection(code, data!!)
            // Android 14+ wymaga zarejestrowanego callbacku przed startem wirtualnego ekranu.
            projection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { stopRecording() }
            }, Handler(Looper.getMainLooper()))
            startRecording()
            running = true
        } catch (_: Exception) {
            stopRecording()
        }
        return START_NOT_STICKY
    }

    private fun startRecording() {
        val dm = resources.displayMetrics
        // Skaluj do maks. 1080 szerokości i parzystych wymiarów — koder tego wymaga.
        var w = dm.widthPixels; var h = dm.heightPixels
        if (w > 1080) { h = h * 1080 / w; w = 1080 }
        w -= w % 2; h -= h % 2

        val mr = MediaRecorder()
        mr.setAudioSource(MediaRecorder.AudioSource.MIC)
        mr.setVideoSource(MediaRecorder.VideoSource.SURFACE)
        mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        // 🗂 Zapis PROSTO do galerii (Filmy/Gadacz) przez MediaStore.
        val name = "Gadacz-ekran-" + java.text.SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", java.util.Locale.US).format(java.util.Date()) + ".mp4"
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, name)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Gadacz")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            savedUri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            pfd = contentResolver.openFileDescriptor(savedUri!!, "w")
            mr.setOutputFile(pfd!!.fileDescriptor)
        } else {
            val f = java.io.File(getExternalFilesDir(null), name)
            mr.setOutputFile(f.absolutePath)
        }
        mr.setVideoSize(w, h)
        mr.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
        mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        mr.setVideoEncodingBitRate(6_000_000)
        mr.setVideoFrameRate(30)
        mr.prepare()
        vdisp = projection?.createVirtualDisplay(
            "gadacz-ekran", w, h, resources.displayMetrics.densityDpi,
            android.hardware.display.DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            mr.surface, null, null
        )
        mr.start()
        recorder = mr
    }

    fun stopRecording() {
        val was = running
        running = false
        try { recorder?.stop() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
        try { vdisp?.release() } catch (_: Exception) {}
        try { projection?.stop() } catch (_: Exception) {}
        try { pfd?.close() } catch (_: Exception) {}
        recorder = null; vdisp = null; projection = null; pfd = null
        // Zdejmij flagę „w trakcie zapisu" — film pojawia się w galerii.
        if (was && Build.VERSION.SDK_INT >= 29) savedUri?.let { u ->
            try {
                contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
            } catch (_: Exception) {}
        }
        savedUri = null
        try { stopForeground(true) } catch (_: Exception) {}
        stopSelf()
    }

    override fun onDestroy() {
        if (running) stopRecording()
        instance = null
        super.onDestroy()
    }
}
