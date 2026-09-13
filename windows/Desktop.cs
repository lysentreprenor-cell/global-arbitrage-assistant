using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

namespace Gadacz;

/// <summary>
/// 🖥️ STEROWANIE PROGRAMAMI (Faza 2) — „ręce i oczy" Gadacza na Windows przez
/// UI Automation. Czyta aktywne okno, klika przyciski po napisie, wpisuje tekst,
/// otwiera programy. To ta sama moc, którą na Androidzie daje usługa Dostępności.
/// </summary>
static class Desktop
{
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);

    private static AutomationElement? Foreground()
    {
        try { var h = GetForegroundWindow(); return h == IntPtr.Zero ? AutomationElement.RootElement : AutomationElement.FromHandle(h); }
        catch { try { return AutomationElement.RootElement; } catch { return null; } }
    }

    /// <summary>👀 Odczyt aktywnego okna: nazwa okna + widoczne kontrolki z napisami.</summary>
    public static string ReadScreen()
    {
        var root = Foreground();
        if (root == null) return "";
        var sb = new StringBuilder();
        try
        {
            var wn = Safe(() => root.Current.Name);
            if (!string.IsNullOrWhiteSpace(wn)) sb.AppendLine("OKNO: " + wn);
            var walker = TreeWalker.ControlViewWalker;
            int count = 0;
            void Walk(AutomationElement el, int depth)
            {
                if (count >= 140 || depth > 7) return;
                AutomationElement? child;
                try { child = walker.GetFirstChild(el); } catch { return; }
                while (child != null && count < 140)
                {
                    try
                    {
                        var cn = child.Current.Name ?? "";
                        var ct = (child.Current.ControlType?.ProgrammaticName ?? "").Replace("ControlType.", "");
                        if (!string.IsNullOrWhiteSpace(cn) && cn.Length < 120) { sb.AppendLine(ct + ": " + cn); count++; }
                    }
                    catch { }
                    Walk(child, depth + 1);
                    try { child = walker.GetNextSibling(child); } catch { break; }
                }
            }
            Walk(root, 0);
        }
        catch { }
        return sb.ToString();
    }

    /// <summary>🖱️ Kliknij element po napisie (punktacja jak w telefonie/wtyczce).</summary>
    public static bool ClickByName(string text)
    {
        text = (text ?? "").Trim(); if (text.Length == 0) return false;
        var root = Foreground(); if (root == null) return false;
        try
        {
            var all = root.FindAll(TreeScope.Descendants, Condition.TrueCondition);
            AutomationElement? best = null; int bestScore = int.MinValue;
            var lt = text.ToLowerInvariant();
            foreach (AutomationElement el in all)
            {
                string n = Safe(() => el.Current.Name) ?? "";
                if (string.IsNullOrWhiteSpace(n)) continue;
                var ln = n.ToLowerInvariant();
                int sc;
                if (ln == lt) sc = 100; else if (ln.StartsWith(lt)) sc = 70; else if (ln.Contains(lt)) sc = 40; else continue;
                sc -= Math.Min(25, n.Length / 8);
                bool enabled = true; try { enabled = (bool)el.GetCurrentPropertyValue(AutomationElement.IsEnabledProperty); } catch { }
                if (!enabled) sc -= 40;
                if (sc > bestScore) { bestScore = sc; best = el; }
            }
            if (best == null) return false;
            try { best.SetFocus(); } catch { }
            try
            {
                if (best.TryGetCurrentPattern(InvokePattern.Pattern, out var ip)) { ((InvokePattern)ip).Invoke(); return true; }
                if (best.TryGetCurrentPattern(TogglePattern.Pattern, out var tp)) { ((TogglePattern)tp).Toggle(); return true; }
                if (best.TryGetCurrentPattern(SelectionItemPattern.Pattern, out var sp)) { ((SelectionItemPattern)sp).Select(); return true; }
            }
            catch { }
            // Zapasowo: klik myszą w środek elementu.
            try
            {
                var r = best.Current.BoundingRectangle;
                if (r.Width > 0 && r.Height > 0) { ClickAt((int)(r.X + r.Width / 2), (int)(r.Y + r.Height / 2)); return true; }
            }
            catch { }
            return false;
        }
        catch { return false; }
    }

    /// <summary>⌨️ Wpisz tekst — do skupionego pola (ValuePattern) albo klawiaturą.</summary>
    public static void TypeText(string text)
    {
        try
        {
            var f = AutomationElement.FocusedElement;
            if (f != null && f.TryGetCurrentPattern(ValuePattern.Pattern, out var vp)) { ((ValuePattern)vp).SetValue(text); return; }
        }
        catch { }
        try { System.Windows.Forms.SendKeys.SendWait(EscapeKeys(text)); } catch { }
    }

    public static void PressEnter() { try { System.Windows.Forms.SendKeys.SendWait("{ENTER}"); } catch { } }
    public static void Scroll(string dir)
    {
        try { System.Windows.Forms.SendKeys.SendWait(dir == "up" ? "{PGUP}" : "{PGDN}"); } catch { }
    }

    /// <summary>🚀 Otwórz program (mapa popularnych nazw PL → polecenie).</summary>
    public static bool OpenApp(string name)
    {
        name = (name ?? "").Trim().ToLowerInvariant();
        string cmd = name;
        var map = new (string k, string v)[]
        {
            ("notatnik", "notepad"), ("notepad", "notepad"), ("kalkulator", "calc"), ("kalkulacja", "calc"),
            ("paint", "mspaint"), ("word", "winword"), ("excel", "excel"), ("eksplorator", "explorer"),
            ("pliki", "explorer"), ("ustawienia", "ms-settings:"), ("przeglądarka", "https://www.google.pl"),
        };
        foreach (var (k, v) in map) if (name.Contains(k)) { cmd = v; break; }
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(cmd) { UseShellExecute = true });
            return true;
        }
        catch { return false; }
    }

    private static void ClickAt(int x, int y)
    {
        SetCursorPos(x, y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); // lewy w dół
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero); // lewy w górę
    }

    private static string EscapeKeys(string s)
    {
        var sb = new StringBuilder();
        foreach (char c in s)
        {
            if ("+^%~(){}[]".IndexOf(c) >= 0) sb.Append('{').Append(c).Append('}');
            else sb.Append(c);
        }
        return sb.ToString();
    }

    private static T? Safe<T>(Func<T> f) { try { return f(); } catch { return default; } }
}
