using System.IO;
using System.Runtime.InteropServices;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Speech.Synthesis;
using System.Speech.Recognition;

namespace Gadacz;

/// <summary>
/// ✍️ GADACZ NA WINDOWS — Faza 1: gada z tym samym mózgiem (serwer + chmura) co
/// telefon. Piszesz, Gadacz odpowiada i CZYTA na głos. Sterowanie ekranem innych
/// programów (UI Automation) dojdzie w kolejnej fazie.
/// </summary>
public class MainForm : Form
{
    private readonly TextBox _url = new();
    private readonly TextBox _pin = new();
    private readonly TextBox _output = new();
    private readonly TextBox _input = new();
    private readonly Button _send = new();
    private readonly Button _mic = new();
    private readonly CheckBox _speak = new();
    private readonly CheckBox _control = new();
    private readonly CheckBox _ollama = new();
    private readonly TextBox _ollamaModel = new();
    private readonly CheckBox _wakeCb = new();
    private readonly CheckBox _notifCb = new();
    private Notifications? _notif;
    private SpeechRecognitionEngine? _rec;
    private SpeechRecognitionEngine? _wake;
    private readonly NotifyIcon _tray = new();

    // ⌨️ Globalny skrót: Ctrl+Alt+G — otwiera Gadacza i od razu słucha (z każdego miejsca).
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mod, uint vk);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    private const int HotkeyId = 0xB1;

    private static readonly System.Text.RegularExpressions.Regex Danger =
        new(@"zap[łl]a|kup teraz|kupuj|przelew|usu[ńn]|wy[śs]lij pieni|potwierd[źz] p[łl]at",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    private readonly SpeechSynthesizer _tts = new();
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(3) };
    private readonly List<object> _history = new();

    private static readonly string ConfigPath =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Gadacz", "gadacz.cfg");

    public MainForm()
    {
        Text = "Gadacz na Windows";
        Width = 980; Height = 720;
        BackColor = Color.Black;
        ForeColor = Color.FromArgb(120, 255, 120);
        Font = new Font("Segoe UI", 12F);

        // Środek: rozmowa (wypełnia okno). DODAJEMY GO PIERWSZY — w WinForms kontrolka
        // Fill musi być z tyłu (najniższy z-order), żeby doki górny/dolny ją obcięły.
        _output.Multiline = true; _output.ReadOnly = true; _output.Dock = DockStyle.Fill;
        _output.ScrollBars = ScrollBars.Vertical; _output.BorderStyle = BorderStyle.None;
        _output.BackColor = Color.Black; _output.ForeColor = Color.FromArgb(120, 255, 120);
        _output.Font = new Font("Consolas", 13F);
        _output.AccessibleName = "Rozmowa z Gadaczem";
        Controls.Add(_output);

        // Góra: adres serwera + PIN + czytanie na głos.
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 46, BackColor = Color.FromArgb(10, 10, 10), WrapContents = false };
        top.Controls.Add(Lbl("Adres serwera (z Replita):"));
        _url.Width = 420; _url.Text = "https://twoj-projekt.replit.app";
        _url.BackColor = Color.FromArgb(20, 20, 20); _url.ForeColor = Color.White;
        _url.AccessibleName = "Adres serwera";
        top.Controls.Add(_url);
        top.Controls.Add(Lbl("PIN:"));
        _pin.Width = 70; _pin.Text = "0905";
        _pin.BackColor = Color.FromArgb(20, 20, 20); _pin.ForeColor = Color.White;
        _pin.AccessibleName = "PIN aplikacji";
        top.Controls.Add(_pin);
        _speak.Text = "Czytaj na głos"; _speak.Checked = true; _speak.AutoSize = true;
        _speak.ForeColor = Color.FromArgb(120, 255, 120); _speak.Padding = new Padding(10, 8, 0, 0);
        top.Controls.Add(_speak);
        // 🖥️ Tryb sterowania programami (UI Automation). Domyślnie wyłączony — włączasz,
        //    gdy chcesz, żeby Gadacz KLIKAŁ w innych programach, nie tylko gadał.
        _control.Text = "🖥️ Steruj programami"; _control.AutoSize = true;
        _control.ForeColor = Color.FromArgb(255, 200, 120); _control.Padding = new Padding(10, 8, 0, 0);
        top.Controls.Add(_control);
        Controls.Add(top);

        // 🦉 DUŻY MÓZG OFFLINE NA PC (Ollama) — gdy włączone, rozmowa idzie do lokalnej
        //    Ollamy (localhost) zamiast do chmury. Za darmo, bez internetu, mądrzej niż telefon.
        var top2 = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 42, BackColor = Color.FromArgb(10, 10, 10), WrapContents = false };
        _ollama.Text = "🦉 Mózg offline na PC (Ollama)"; _ollama.AutoSize = true;
        _ollama.ForeColor = Color.FromArgb(160, 220, 255); _ollama.Padding = new Padding(6, 10, 0, 0);
        top2.Controls.Add(_ollama);
        top2.Controls.Add(new Label { Text = "model:", AutoSize = true, ForeColor = Color.FromArgb(160, 220, 255), Padding = new Padding(10, 12, 0, 0) });
        _ollamaModel.Width = 160; _ollamaModel.Text = "qwen2.5:7b";
        _ollamaModel.BackColor = Color.FromArgb(20, 20, 20); _ollamaModel.ForeColor = Color.White;
        _ollamaModel.AccessibleName = "Model Ollama";
        top2.Controls.Add(_ollamaModel);
        // 🧠 Podgląd pamięci — „co Gadacz o mnie wie".
        var memBtn = new Button { Text = "🧠 Pamięć", AutoSize = true, FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(60, 40, 90) };
        memBtn.Click += (_, _) => ShowMemory();
        top2.Controls.Add(memBtn);
        var faceBtn = new Button { Text = "🎭 Twarz", AutoSize = true, FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(90, 60, 40) };
        faceBtn.Click += (_, _) => PickPersona();
        top2.Controls.Add(faceBtn);
        var fileBtn = new Button { Text = "📄 Czytaj plik", AutoSize = true, FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(40, 70, 70) };
        fileBtn.Click += (_, _) => ReadFile();
        top2.Controls.Add(fileBtn);
        // 👂 Nasłuch słowa-klucza „Gadacz…" — bez rąk. Powiedz „Gadacz <polecenie>".
        _wakeCb.Text = "👂 Nasłuch (Gadacz…)"; _wakeCb.AutoSize = true;
        _wakeCb.ForeColor = Color.FromArgb(180, 255, 180); _wakeCb.Padding = new Padding(10, 10, 0, 0);
        _wakeCb.CheckedChanged += (_, _) => ToggleWake();
        top2.Controls.Add(_wakeCb);
        // 🔔 Czytanie powiadomień Windows na głos (SMS, bank, poczta, komunikatory).
        _notifCb.Text = "🔔 Czytaj powiadomienia"; _notifCb.AutoSize = true;
        _notifCb.ForeColor = Color.FromArgb(255, 220, 150); _notifCb.Padding = new Padding(10, 10, 0, 0);
        _notifCb.CheckedChanged += (_, _) => ToggleNotif();
        top2.Controls.Add(_notifCb);
        Controls.Add(top2);

        // Dół: pole do pisania + Wyślij.
        var bottom = new Panel { Dock = DockStyle.Bottom, Height = 56, BackColor = Color.FromArgb(10, 10, 10) };
        _send.Text = "Wyślij"; _send.Dock = DockStyle.Right; _send.Width = 150;
        _send.BackColor = Color.FromArgb(0, 150, 0); _send.ForeColor = Color.White; _send.FlatStyle = FlatStyle.Flat;
        _send.AccessibleName = "Wyślij wiadomość";
        _send.Click += async (_, _) => await Send();
        _input.Dock = DockStyle.Fill; _input.BackColor = Color.FromArgb(20, 20, 20);
        _input.ForeColor = Color.White; _input.Font = new Font("Segoe UI", 13F);
        _input.AccessibleName = "Napisz wiadomość do Gadacza";
        _input.KeyDown += async (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; await Send(); } };
        // 🎤 Dyktowanie głosem (mowa → tekst) — dla osoby niewidomej mówienie zamiast pisania.
        _mic.Text = "🎤 Mów"; _mic.Dock = DockStyle.Left; _mic.Width = 120;
        _mic.BackColor = Color.FromArgb(20, 60, 110); _mic.ForeColor = Color.White; _mic.FlatStyle = FlatStyle.Flat;
        _mic.AccessibleName = "Dyktuj głosem";
        _mic.Click += (_, _) => StartDictation();
        bottom.Controls.Add(_input);
        bottom.Controls.Add(_mic);
        bottom.Controls.Add(_send);
        Controls.Add(bottom);

        // 🖥️ Ikona w zasobniku (tray): Gadacz chodzi w tle; dwuklik = pokaż.
        _tray.Text = "Gadacz"; _tray.Icon = System.Drawing.SystemIcons.Application; _tray.Visible = true;
        _tray.DoubleClick += (_, _) => ShowFromTray();
        var menu = new ContextMenuStrip();
        menu.Items.Add("Pokaż Gadacza", null, (_, _) => ShowFromTray());
        menu.Items.Add("🔄 Sprawdź aktualizację", null, (_, _) => _ = CheckUpdate(false));
        menu.Items.Add("🎤 Mów (Ctrl+Alt+G)", null, (_, _) => { ShowFromTray(); StartDictation(); });
        menu.Items.Add("Zamknij", null, (_, _) => { _tray.Visible = false; Application.Exit(); });
        _tray.ContextMenuStrip = menu;
        Resize += (_, _) => { if (WindowState == FormWindowState.Minimized) Hide(); };

        LoadConfig();
        FormClosing += (_, _) =>
        {
            SaveConfig();
            try { UnregisterHotKey(Handle, HotkeyId); } catch { }
            try { _tray.Visible = false; _tray.Dispose(); } catch { }
            try { _tts.Dispose(); } catch { }
            try { _rec?.Dispose(); } catch { }
            try { _wake?.RecognizeAsyncStop(); _wake?.Dispose(); } catch { }
            try { _notif?.Stop(); } catch { }
        };
        Shown += (_, _) => { _input.Focus(); _ = CheckUpdate(true); };
        Append("Gadacz na Windows. Wpisz u góry adres serwera z Replita i PIN, a potem pisz. Odpowiedzi czytam na głos.\n");
    }

    private Label Lbl(string t) => new()
    {
        Text = t, AutoSize = true, ForeColor = Color.FromArgb(120, 255, 120), Padding = new Padding(6, 12, 0, 0)
    };

    private void Append(string text)
    {
        if (_output.InvokeRequired) { _output.BeginInvoke(() => Append(text)); return; }
        _output.AppendText(text);
        _output.SelectionStart = _output.TextLength;
        _output.ScrollToCaret();
    }

    private async Task Send()
    {
        var q = _input.Text.Trim();
        if (string.IsNullOrEmpty(q)) return;
        _input.Clear();
        Append("\nTy: " + q + "\n");
        _send.Enabled = false;
        // 🧠 „zapomnij N" — usuń N-ty zapamiętany fakt.
        var forget = System.Text.RegularExpressions.Regex.Match(q, @"^zapomnij\s+(\d+)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (forget.Success)
        {
            int idx = int.Parse(forget.Groups[1].Value) - 1;
            await MemDelete(idx);
            Append("Gadacz: Zapomniałem punkt " + (idx + 1) + ".\n"); Speak("Zapomniałem.");
            _send.Enabled = true; _input.Focus(); return;
        }
        // 🖥️ Tryb sterowania: Gadacz czyta ekran i DZIAŁA w programach (wieloetapowo).
        if (_control.Checked)
        {
            try { await ControlLoop(q); }
            catch (Exception ex) { Append("Błąd: " + ex.Message + "\n"); }
            finally { _send.Enabled = true; _input.Focus(); }
            return;
        }
        // 🦉 Mózg offline na PC (Ollama) — rozmowa lokalnie, bez chmury.
        if (_ollama.Checked)
        {
            try
            {
                string oa = await AskOllama(q);
                Append("Gadacz: " + oa + "\n"); Speak(oa);
                _history.Add(new { role = "user", content = q });
                _history.Add(new { role = "assistant", content = oa });
                if (_history.Count > 24) _history.RemoveRange(0, _history.Count - 24);
            }
            finally { _send.Enabled = true; _input.Focus(); }
            return;
        }
        try
        {
            var baseUrl = _url.Text.Trim().TrimEnd('/');
            var body = new Dictionary<string, object?>
            {
                ["question"] = q,
                ["history"] = _history,
                ["clientTime"] = DateTime.Now.ToString("dddd, d MMMM yyyy, HH:mm")
            };
            using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/assistant/ask");
            req.Headers.Add("x-bot-pin", _pin.Text.Trim());
            req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

            using var resp = await _http.SendAsync(req);
            var txt = await resp.Content.ReadAsStringAsync();

            string say;
            try
            {
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;
                var err = root.TryGetProperty("error", out var e2) ? (e2.GetString() ?? "") : "";
                say = root.TryGetProperty("say", out var s) ? (s.GetString() ?? "") : "";
                if (!string.IsNullOrEmpty(err)) say = "Błąd serwera: " + err;
            }
            catch { say = "Nie zrozumiałem odpowiedzi serwera (sprawdź adres i PIN)."; }

            if (string.IsNullOrWhiteSpace(say)) say = "(brak odpowiedzi)";
            Append("Gadacz: " + say + "\n");
            _history.Add(new { role = "user", content = q });
            _history.Add(new { role = "assistant", content = say });
            if (_history.Count > 24) _history.RemoveRange(0, _history.Count - 24);

            Speak(say);
        }
        catch (Exception ex)
        {
            Append("Błąd połączenia: " + ex.Message + " (sprawdź adres serwera i czy serwer jest uruchomiony).\n");
        }
        finally { _send.Enabled = true; _input.Focus(); }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // MOD_ALT(1) | MOD_CONTROL(2) = 3 ; VK_G = 0x47
        try { RegisterHotKey(Handle, HotkeyId, 3, 0x47); } catch { }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x0312 && (int)m.WParam == HotkeyId) { ShowFromTray(); StartDictation(); }
        base.WndProc(ref m);
    }

    private void ShowFromTray()
    {
        Show(); WindowState = FormWindowState.Normal; Activate(); BringToFront();
    }

    private void Speak(string t)
    {
        if (!_speak.Checked || string.IsNullOrWhiteSpace(t)) return;
        try { _tts.SpeakAsyncCancelAll(); _tts.SpeakAsync(t); } catch { }
    }

    // 🧠 Pokaż, co Gadacz o Tobie pamięta (wspólna pamięć z telefonem/wtyczką).
    private async void ShowMemory()
    {
        try
        {
            var baseUrl = _url.Text.Trim().TrimEnd('/');
            using var req = new HttpRequestMessage(HttpMethod.Get, baseUrl + "/api/assistant/memory");
            req.Headers.Add("x-bot-pin", _pin.Text.Trim());
            using var resp = await _http.SendAsync(req);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var sb = new StringBuilder("\n🧠 Co Gadacz o Tobie wie:\n");
            int i = 1;
            if (doc.RootElement.TryGetProperty("memory", out var mem) && mem.ValueKind == JsonValueKind.Array)
                foreach (var f in mem.EnumerateArray()) sb.AppendLine("  " + (i++) + ". " + (f.GetString() ?? ""));
            if (i == 1) sb.AppendLine("  (jeszcze nic nie zapamiętałem)");
            sb.AppendLine("Aby usunąć — napisz np. „zapomnij 3”. Aby dodać — „zapamiętaj …”.");
            Append(sb.ToString());
            Speak("Wypisałem, co o Tobie wiem.");
        }
        catch (Exception ex) { Append("Nie mogę pobrać pamięci: " + ex.Message + "\n"); }
    }

    // 🎭 Wybór twarzy (persony) — wspólny z telefonem (serwer /persona).
    private async void PickPersona()
    {
        var list = new List<(string key, string label)>();
        string cur = "";
        try
        {
            var baseUrl = _url.Text.Trim().TrimEnd('/');
            using var req = new HttpRequestMessage(HttpMethod.Get, baseUrl + "/api/assistant/persona");
            req.Headers.Add("x-bot-pin", _pin.Text.Trim());
            using var resp = await _http.SendAsync(req);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root = doc.RootElement;
            cur = root.TryGetProperty("persona", out var p) ? p.GetString() ?? "" : "";
            if (root.TryGetProperty("list", out var l) && l.ValueKind == JsonValueKind.Array)
                foreach (var it in l.EnumerateArray())
                {
                    var key = it.TryGetProperty("key", out var k) ? k.GetString() ?? "" : "";
                    var name = it.TryGetProperty("name", out var n) ? n.GetString() ?? key : key;
                    var icon = it.TryGetProperty("icon", out var ic) ? ic.GetString() ?? "" : "";
                    if (key.Length > 0) list.Add((key, (icon + " " + name).Trim()));
                }
        }
        catch (Exception ex) { Append("Nie mogę pobrać twarzy: " + ex.Message + "\n"); return; }

        using var dlg = new Form { Text = "Wybierz twarz Gadacza", Width = 440, Height = 480, BackColor = Color.Black, ForeColor = Color.LightGreen, StartPosition = FormStartPosition.CenterParent };
        var lb = new ListBox { Dock = DockStyle.Fill, BackColor = Color.FromArgb(15, 15, 15), ForeColor = Color.LightGreen, Font = new Font("Segoe UI", 13F) };
        int sel = 0;
        for (int i = 0; i < list.Count; i++) { lb.Items.Add(list[i].label + (list[i].key == cur ? "  ✓" : "")); if (list[i].key == cur) sel = i; }
        if (list.Count > 0) lb.SelectedIndex = sel;
        var ok = new Button { Text = "Wybierz", Dock = DockStyle.Bottom, Height = 42, BackColor = Color.Green, ForeColor = Color.White };
        ok.Click += async (_, _) => { if (lb.SelectedIndex >= 0 && lb.SelectedIndex < list.Count) await SetPersona(list[lb.SelectedIndex].key, list[lb.SelectedIndex].label); dlg.Close(); };
        dlg.Controls.Add(lb); dlg.Controls.Add(ok);
        dlg.ShowDialog(this);
    }

    private async Task SetPersona(string key, string label)
    {
        try
        {
            var baseUrl = _url.Text.Trim().TrimEnd('/');
            using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/assistant/persona");
            req.Headers.Add("x-bot-pin", _pin.Text.Trim());
            req.Content = new StringContent(JsonSerializer.Serialize(new { persona = key }), Encoding.UTF8, "application/json");
            await _http.SendAsync(req);
            Append("Gadacz: Przełączyłem twarz na " + label + ".\n"); Speak("Przełączyłem twarz na " + label + ".");
        }
        catch (Exception ex) { Append("Nie udało się przełączyć twarzy: " + ex.Message + "\n"); }
    }

    // 📄 Czytaj plik na głos (tekst lub PDF).
    private void ReadFile()
    {
        using var d = new OpenFileDialog { Filter = "Dokumenty (*.txt;*.md;*.csv;*.pdf)|*.txt;*.md;*.csv;*.pdf|Wszystkie pliki (*.*)|*.*" };
        if (d.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            string txt;
            if (Path.GetExtension(d.FileName).ToLowerInvariant() == ".pdf")
            {
                var sb = new StringBuilder();
                using var pdf = UglyToad.PdfPig.PdfDocument.Open(d.FileName);
                foreach (var page in pdf.GetPages()) sb.AppendLine(page.Text);
                txt = sb.ToString();
            }
            else txt = File.ReadAllText(d.FileName);
            Append("\n📄 " + Path.GetFileName(d.FileName) + ":\n" + (txt.Length > 2000 ? txt.Substring(0, 2000) + "…" : txt) + "\n");
            _speak.Checked = true;
            Speak(txt.Length > 4000 ? txt.Substring(0, 4000) : txt);
        }
        catch (Exception ex) { Append("Nie mogę odczytać pliku: " + ex.Message + "\n"); }
    }

    private async Task MemDelete(int index)
    {
        try
        {
            var baseUrl = _url.Text.Trim().TrimEnd('/');
            using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/assistant/memory/delete");
            req.Headers.Add("x-bot-pin", _pin.Text.Trim());
            req.Content = new StringContent(JsonSerializer.Serialize(new { index }), Encoding.UTF8, "application/json");
            await _http.SendAsync(req);
        }
        catch { }
    }

    // 🦉 Zapytaj lokalną Ollamę (na tym komputerze). Wymaga zainstalowanej Ollamy
    // i pobranego modelu (np. „ollama pull qwen2.5:7b"). Za darmo, offline.
    private async Task<string> AskOllama(string q)
    {
        try
        {
            var msgs = new List<object>
            {
                new { role = "system", content = "Jesteś Gadacz — polski asystent głosowy. Odpowiadaj PO POLSKU, jasno i konkretnie." }
            };
            foreach (var h in _history) msgs.Add(h);
            msgs.Add(new { role = "user", content = q });
            var body = new { model = _ollamaModel.Text.Trim(), messages = msgs, stream = false };
            using var resp = await _http.PostAsync("http://localhost:11434/api/chat",
                new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
            var txt = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(txt);
            if (doc.RootElement.TryGetProperty("message", out var m) && m.TryGetProperty("content", out var c))
                return (c.GetString() ?? "").Trim();
            return "(pusta odpowiedź Ollamy)";
        }
        catch (Exception ex)
        {
            return "Nie mogę połączyć się z Ollamą. Zainstaluj ją z ollama.com, uruchom i pobierz model poleceniem: ollama pull " + _ollamaModel.Text.Trim() + ". (" + ex.Message + ")";
        }
    }

    // 🔄 AUTO-AKTUALIZACJA — sprawdza wydanie na GitHubie; gdy nowsza wersja Gadacz.exe
    // niż lokalny plik, pobiera i podmienia sam (bez ręcznego pobierania).
    private async Task CheckUpdate(bool silent)
    {
        try
        {
            var exe = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exe)) return;
            using var req = new HttpRequestMessage(HttpMethod.Get,
                "https://api.github.com/repos/lysentreprenor-cell/global-arbitrage-assistant/releases/tags/gadacz-windows");
            req.Headers.Add("User-Agent", "Gadacz");
            using var resp = await _http.SendAsync(req);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            string url = ""; DateTime relTime = DateTime.MinValue;
            if (doc.RootElement.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                foreach (var a in assets.EnumerateArray())
                {
                    if ((a.TryGetProperty("name", out var nm) ? nm.GetString() : "") == "Gadacz.exe")
                    {
                        url = a.TryGetProperty("browser_download_url", out var u) ? u.GetString() ?? "" : "";
                        if (a.TryGetProperty("updated_at", out var ua) && DateTime.TryParse(ua.GetString(), out var dt)) relTime = dt.ToUniversalTime();
                    }
                }
            if (url.Length == 0) { if (!silent) BeginInvoke(new Action(() => Append("Nie znalazłem aktualizacji.\n"))); return; }
            var local = File.GetLastWriteTimeUtc(exe);
            if (relTime > local.AddMinutes(2))
            {
                BeginInvoke(new Action(() =>
                {
                    if (MessageBox.Show(this, "Jest nowsza wersja Gadacza. Pobrać i zainstalować teraz?", "Aktualizacja Gadacza", MessageBoxButtons.YesNo) == DialogResult.Yes)
                        _ = DoUpdate(url, exe);
                }));
            }
            else if (!silent) BeginInvoke(new Action(() => Append("Masz najnowszą wersję Gadacza.\n")));
        }
        catch (Exception ex) { if (!silent) BeginInvoke(new Action(() => Append("Nie mogę sprawdzić aktualizacji: " + ex.Message + "\n"))); }
    }

    private async Task DoUpdate(string url, string exe)
    {
        try
        {
            var dir = Path.GetDirectoryName(exe)!;
            var newExe = Path.Combine(dir, "Gadacz.new.exe");
            using (var req = new HttpRequestMessage(HttpMethod.Get, url))
            {
                req.Headers.Add("User-Agent", "Gadacz");
                using var resp = await _http.SendAsync(req);
                using var fs = File.Create(newExe);
                await resp.Content.CopyToAsync(fs);
            }
            var bat = Path.Combine(dir, "gadacz-update.bat");
            File.WriteAllText(bat,
                "@echo off\r\ntimeout /t 2 /nobreak >nul\r\nmove /y \"" + newExe + "\" \"" + exe + "\" >nul\r\nstart \"\" \"" + exe + "\"\r\ndel \"%~f0\"\r\n");
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("cmd.exe", "/c \"" + bat + "\"")
            { UseShellExecute = true, CreateNoWindow = true, WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden });
            Application.Exit();
        }
        catch (Exception ex) { BeginInvoke(new Action(() => Append("Aktualizacja nie powiodła się: " + ex.Message + "\n"))); }
    }

    // 🔔 CZYTANIE POWIADOMIEŃ WINDOWS NA GŁOS — włącza/wyłącza nasłuch powiadomień
    // systemowych. Gdy wyskoczy nowe (SMS, bank, poczta), Gadacz je odczyta.
    private async void ToggleNotif()
    {
        if (_notifCb.Checked)
        {
            _notif ??= new Notifications((app, msg) =>
            {
                var pre = string.IsNullOrWhiteSpace(app) ? "🔔 Powiadomienie: " : ("🔔 " + app + ": ");
                Append("\n" + pre + msg + "\n");
                // Czytaj niezależnie od pola „Czytaj na głos", ale tylko krótko.
                try { _tts.SpeakAsync((string.IsNullOrWhiteSpace(app) ? "Powiadomienie. " : (app + ". ")) + msg); } catch { }
            });
            var err = await _notif.Start();
            if (err.Length > 0) { _notifCb.Checked = false; Append(err + "\n"); Speak(err); }
            else Append("🔔 Czytam powiadomienia — nowe wiadomości przeczytam na głos.\n");
        }
        else { _notif?.Stop(); Append("🔔 Przestałem czytać powiadomienia.\n"); }
    }

    // 👂 NASŁUCH SŁOWA-KLUCZA „Gadacz…" — ciągle słucha; gdy usłyszy „Gadacz" na
    // początku, resztę traktuje jak polecenie i wykonuje. Ręce wolne.
    private void ToggleWake()
    {
        try
        {
            if (_wakeCb.Checked)
            {
                if (_wake == null)
                {
                    SpeechRecognitionEngine eng;
                    try { eng = new SpeechRecognitionEngine(new System.Globalization.CultureInfo("pl-PL")); }
                    catch { eng = new SpeechRecognitionEngine(); }
                    eng.LoadGrammar(new DictationGrammar());
                    eng.SetInputToDefaultAudioDevice();
                    eng.SpeechRecognized += (_, e) =>
                    {
                        if (e.Result == null) return;
                        var t = e.Result.Text.Trim();
                        if (t.ToLowerInvariant().StartsWith("gadacz"))
                        {
                            var cmd = t.Substring(6).TrimStart(' ', ',', '.', '!').Trim();
                            if (cmd.Length > 0) BeginInvoke(new Action(async () => { _input.Text = cmd; await Send(); }));
                        }
                    };
                    _wake = eng;
                }
                _wake.RecognizeAsync(RecognizeMode.Multiple);
                Append("👂 Nasłuchuję — powiedz „Gadacz” i polecenie.\n");
            }
            else { try { _wake?.RecognizeAsyncStop(); } catch { } }
        }
        catch (Exception ex)
        {
            _wakeCb.Checked = false;
            Append("Nie mogę włączyć nasłuchu: " + ex.Message + " (może brakować polskiego pakietu mowy Windows).\n");
        }
    }

    // 🎤 DYKTOWANIE (mowa → tekst) przez wbudowane rozpoznawanie Windows. Próbuje
    // po polsku; gdy brak polskiego pakietu mowy — bierze domyślny zainstalowany.
    private void StartDictation()
    {
        try
        {
            if (_rec == null)
            {
                SpeechRecognitionEngine eng;
                try { eng = new SpeechRecognitionEngine(new System.Globalization.CultureInfo("pl-PL")); }
                catch { eng = new SpeechRecognitionEngine(); }   // domyślny zainstalowany język
                eng.LoadGrammar(new DictationGrammar());
                eng.SetInputToDefaultAudioDevice();
                eng.SpeechRecognized += (_, e) =>
                {
                    if (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text))
                        BeginInvoke(new Action(async () => { _input.Text = e.Result.Text; await Send(); }));
                };
                eng.RecognizeCompleted += (_, _) => BeginInvoke(new Action(() => _mic.Text = "🎤 Mów"));
                _rec = eng;
            }
            _mic.Text = "🔴 Słucham…";
            _rec.RecognizeAsync(RecognizeMode.Single);
        }
        catch (Exception ex)
        {
            _mic.Text = "🎤 Mów";
            Append("Nie mogę uruchomić dyktowania: " + ex.Message +
                   " (może brakować polskiego pakietu mowy Windows albo mikrofonu). Możesz pisać ręcznie.\n");
        }
    }

    // 🖥️ FAZA 2 — STEROWANIE PROGRAMAMI. Pętla jak w telefonie/wtyczce: czyta ekran
    // aktywnego programu → pyta mózg (serwer) o krok → wykonuje (klik/wpis/otwórz) →
    // czyta znowu, aż do celu. Płatności/„usuń" NIE klika sam.
    private async Task ControlLoop(string goal)
    {
        string lastError = "";
        for (int step = 0; step < 8; step++)
        {
            string screen = Desktop.ReadScreen();   // UI Automation działa na wątku UI (STA)
            var body = new Dictionary<string, object?>
            {
                ["question"] = "EKRAN: " + screen + "\n\nPolecenie: " + goal +
                    (lastError.Length > 0 ? "\n\nUWAGA: poprzedni krok NIE WYSZEDŁ: " + lastError + " Spróbuj inaczej." : ""),
                ["history"] = _history,
                ["clientTime"] = DateTime.Now.ToString("dddd, d MMMM yyyy, HH:mm"),
                ["learn"] = true
            };

            string say = "", action = "none", text = "", dir = "down";
            bool next = false;
            try
            {
                var baseUrl = _url.Text.Trim().TrimEnd('/');
                using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/assistant/ask");
                req.Headers.Add("x-bot-pin", _pin.Text.Trim());
                req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                using var resp = await _http.SendAsync(req);
                var txt = await resp.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(txt);
                var root = doc.RootElement;
                if (root.TryGetProperty("error", out var er) && (er.GetString() ?? "").Length > 0)
                { Append("Gadacz: Błąd serwera: " + er.GetString() + "\n"); Speak("Błąd serwera."); return; }
                say = root.TryGetProperty("say", out var s) ? s.GetString() ?? "" : "";
                action = root.TryGetProperty("action", out var ac) ? ac.GetString() ?? "none" : "none";
                next = root.TryGetProperty("next", out var nx) && nx.ValueKind == JsonValueKind.True;
                if (root.TryGetProperty("args", out var ag) && ag.ValueKind == JsonValueKind.Object)
                {
                    if (ag.TryGetProperty("text", out var tt)) text = tt.GetString() ?? "";
                    else if (ag.TryGetProperty("name", out var nn)) text = nn.GetString() ?? "";
                    if (ag.TryGetProperty("dir", out var dd)) dir = dd.GetString() ?? "down";
                }
            }
            catch (Exception ex) { Append("Błąd połączenia: " + ex.Message + "\n"); Speak("Nie mogę połączyć się z serwerem."); return; }

            if (say.Length > 0)
            {
                Append("Gadacz: " + say + "\n"); Speak(say);
                _history.Add(new { role = "user", content = goal });
                _history.Add(new { role = "assistant", content = say });
                if (_history.Count > 24) _history.RemoveRange(0, _history.Count - 24);
            }

            var a = action.ToLowerInvariant();
            if (a != "none")
            {
                if ((a == "tap" || a == "click") && Danger.IsMatch(text))
                {
                    Append("Gadacz: To ważny przycisk: " + text + ". Ze względów bezpieczeństwa NIE klikam sam — kliknij go proszę ręcznie.\n");
                    Speak("To ważny przycisk. Kliknij go proszę ręcznie."); return;
                }
                bool ok = DoDesktop(a, text, dir);
                lastError = ok ? "" : ("nie znalazłem: " + (text.Length > 0 ? text : "elementu"));
            }
            else lastError = "";

            if (!next) break;
            await Task.Delay(900);   // pozwól programowi zareagować
        }
    }

    private static bool DoDesktop(string a, string text, string dir)
    {
        switch (a)
        {
            case "tap": case "click": return Desktop.ClickByName(text);
            case "type": case "write": Desktop.TypeText(text); return true;
            case "enter": Desktop.PressEnter(); return true;
            case "scroll": Desktop.Scroll(dir); return true;
            case "open_app": case "open": case "launch": return Desktop.OpenApp(text);
            default: return true;
        }
    }

    private void LoadConfig()
    {
        try
        {
            if (!File.Exists(ConfigPath)) return;
            foreach (var line in File.ReadAllLines(ConfigPath))
            {
                var i = line.IndexOf('=');
                if (i < 0) continue;
                var k = line[..i]; var v = line[(i + 1)..];
                if (k == "url" && v.Length > 0) _url.Text = v;
                if (k == "pin" && v.Length > 0) _pin.Text = v;
                if (k == "ollama") _ollama.Checked = v == "1";
                if (k == "ollamaModel" && v.Length > 0) _ollamaModel.Text = v;
            }
        }
        catch { }
    }

    private void SaveConfig()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ConfigPath)!);
            File.WriteAllLines(ConfigPath, new[]
            {
                "url=" + _url.Text.Trim(),
                "pin=" + _pin.Text.Trim(),
                "ollama=" + (_ollama.Checked ? "1" : "0"),
                "ollamaModel=" + _ollamaModel.Text.Trim(),
            });
        }
        catch { }
    }
}
