using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Speech.Synthesis;

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
    private readonly CheckBox _speak = new();

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
        Controls.Add(top);

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
        bottom.Controls.Add(_input);
        bottom.Controls.Add(_send);
        Controls.Add(bottom);

        LoadConfig();
        FormClosing += (_, _) => { SaveConfig(); try { _tts.Dispose(); } catch { } };
        Shown += (_, _) => _input.Focus();
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

            if (_speak.Checked)
            {
                try { _tts.SpeakAsyncCancelAll(); _tts.SpeakAsync(say); } catch { }
            }
        }
        catch (Exception ex)
        {
            Append("Błąd połączenia: " + ex.Message + " (sprawdź adres serwera i czy serwer jest uruchomiony).\n");
        }
        finally { _send.Enabled = true; _input.Focus(); }
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
            }
        }
        catch { }
    }

    private void SaveConfig()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ConfigPath)!);
            File.WriteAllLines(ConfigPath, new[] { "url=" + _url.Text.Trim(), "pin=" + _pin.Text.Trim() });
        }
        catch { }
    }
}
