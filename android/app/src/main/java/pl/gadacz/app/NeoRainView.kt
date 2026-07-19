package pl.gadacz.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.view.View

/**
 * 🟢 TRYB NEO — deszcz zielonych znaków jak w Matriksie. Tło czatu z twarzą
 * Programowanie: kolumny znaków katakana, chińskich i cyfr spadają w dół,
 * z jasną „głową" i gasnącym zielonym ogonem (klasyczny efekt z filmu).
 * Rysowane na własnej bitmapie z przyciemnianiem — lekkie dla baterii.
 */
class NeoRainView(ctx: Context) : View(ctx) {
    private val glyphs =
        "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
        "日月火水木金土人中大小上下左右口目手心山川田力女子学生電脳夢道龍光影時空剣0123456789"
    private val head = Paint().apply { color = Color.rgb(200, 255, 210); textSize = 34f; typeface = Typeface.MONOSPACE; isAntiAlias = true }
    private val tail = Paint().apply { color = Color.rgb(0, 220, 70); textSize = 34f; typeface = Typeface.MONOSPACE; isAntiAlias = true }
    private val fade = Paint().apply { color = Color.argb(42, 0, 0, 0) }
    private var bmp: Bitmap? = null
    private var cv: Canvas? = null
    private var drops = FloatArray(0)
    private var speeds = FloatArray(0)
    private val rnd = java.util.Random()

    private val tick = object : Runnable {
        override fun run() {
            if (visibility == VISIBLE) { step(); invalidate() }
            postDelayed(this, 55)
        }
    }

    override fun onAttachedToWindow() { super.onAttachedToWindow(); postDelayed(tick, 55) }
    override fun onDetachedFromWindow() { removeCallbacks(tick); super.onDetachedFromWindow() }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
        super.onSizeChanged(w, h, ow, oh)
        if (w <= 0 || h <= 0) return
        // 🛡️ RGB_565 zamiast ARGB_8888 = POŁOWA pamięci; a gdy telefon nie ma jej ani
        // tyle (OutOfMemory), po prostu wyłączamy deszcz zamiast wywalać apkę.
        bmp = try {
            Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565).also {
                cv = Canvas(it).apply { drawColor(Color.BLACK) }
            }
        } catch (_: Throwable) { cv = null; null }
        val cols = (w / head.textSize).toInt().coerceAtLeast(1)
        drops = FloatArray(cols) { rnd.nextFloat() * h }
        speeds = FloatArray(cols) { 10f + rnd.nextFloat() * 22f }
    }

    private fun step() {
        val c = cv ?: return
        try {
        // Każda klatka lekko przyciemnia całość — stare znaki gasną = zielony ogon.
        c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fade)
        for (i in drops.indices) {
            val ch = glyphs[rnd.nextInt(glyphs.length)].toString()
            val p = if (rnd.nextInt(7) == 0) head else tail   // czasem błysk jasnej „głowy"
            c.drawText(ch, i * head.textSize, drops[i], p)
            drops[i] += speeds[i]
            if (drops[i] > height + 60) {
                drops[i] = -rnd.nextInt(300).toFloat()
                speeds[i] = 10f + rnd.nextFloat() * 22f
            }
        }
        } catch (_: Throwable) {}
    }

    override fun onDraw(canvas: Canvas) { try { bmp?.let { canvas.drawBitmap(it, 0f, 0f, null) } } catch (_: Throwable) {} }
}
