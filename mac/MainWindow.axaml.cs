using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Markup.Xaml;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace GadaczMac;

// 🍎 Gadacz na Macu — Faza 1: czat z tym samym mózgiem (serwer + chmura) co telefon,
// z czytaniem odpowiedzi na głos (macOS „say"). Głos-wejście i sterowanie programami
// (Accessibility API) w kolejnych fazach.
public class MainWindow : Window
{
    private static readonly HttpClient Http = new() { Timeout = System.TimeSpan.FromMinutes(3) };
    private readonly List<object> _history = new();

    private TextBox Url => this.FindControl<TextBox>("Url")!;
    private TextBox Pin => this.FindControl<TextBox>("Pin")!;
    private TextBox Output => this.FindControl<TextBox>("Output")!;
    private TextBox Input => this.FindControl<TextBox>("Input")!;
    private CheckBox SpeakCb => this.FindControl<CheckBox>("SpeakCb")!;

    public MainWindow()
    {
        AvaloniaXamlLoader.Load(this);
        this.FindControl<Button>("SendBtn")!.Click += async (_, _) => await Send();
        Input.KeyDown += async (_, e) => { if (e.Key == Key.Enter) await Send(); };
        Append("Gadacz na Macu. Wpisz adres serwera z Replita i PIN, potem pisz. Odpowiedzi czytam na głos.\n");
    }

    private void Append(string t) { Output.Text += t; }

    private async System.Threading.Tasks.Task Send()
    {
        var q = (Input.Text ?? "").Trim();
        if (q.Length == 0) return;
        Input.Text = "";
        Append("\nTy: " + q + "\n");
        try
        {
            var baseUrl = (Url.Text ?? "").Trim().TrimEnd('/');
            var body = new Dictionary<string, object?>
            {
                ["question"] = q,
                ["history"] = _history,
                ["clientTime"] = System.DateTime.Now.ToString()
            };
            using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/assistant/ask");
            req.Headers.Add("x-bot-pin", (Pin.Text ?? "").Trim());
            req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            using var resp = await Http.SendAsync(req);
            var txt = await resp.Content.ReadAsStringAsync();

            string say;
            try
            {
                using var doc = JsonDocument.Parse(txt);
                var r = doc.RootElement;
                var err = r.TryGetProperty("error", out var e) ? (e.GetString() ?? "") : "";
                say = r.TryGetProperty("say", out var s) ? (s.GetString() ?? "") : "";
                if (err.Length > 0) say = "Błąd serwera: " + err;
            }
            catch { say = "Nie zrozumiałem odpowiedzi serwera (sprawdź adres i PIN)."; }

            if (string.IsNullOrWhiteSpace(say)) say = "(brak odpowiedzi)";
            Append("Gadacz: " + say + "\n");
            _history.Add(new { role = "user", content = q });
            _history.Add(new { role = "assistant", content = say });
            if (_history.Count > 24) _history.RemoveRange(0, _history.Count - 24);
            if (SpeakCb.IsChecked == true) SayAloud(say);
        }
        catch (System.Exception ex)
        {
            Append("Błąd połączenia: " + ex.Message + " (sprawdź adres serwera i czy serwer jest uruchomiony).\n");
        }
    }

    private void SayAloud(string t)
    {
        try
        {
            var psi = new ProcessStartInfo("say") { UseShellExecute = false };
            psi.ArgumentList.Add(t);
            Process.Start(psi);
        }
        catch { }
    }
}
