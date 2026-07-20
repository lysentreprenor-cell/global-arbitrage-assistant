using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

namespace Gadacz;

/// <summary>
/// 🔔 CZYTANIE POWIADOMIEN WINDOWS NA GLOS — dla osoby niewidomej: wyskakuje
/// powiadomienie (SMS, bank, poczta, komunikator), a Gadacz od razu je czyta.
/// Uzywa systemowego „nasluchiwacza powiadomien" (UserNotificationListener).
/// Przy pierwszym wlaczeniu Windows pyta o zgode na dostep do powiadomien.
/// </summary>
sealed class Notifications
{
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 3000 };
    private readonly HashSet<uint> _seen = new();
    private readonly Action<string, string> _onNew;   // (nazwa aplikacji, tresc)
    private UserNotificationListener? _listener;
    private bool _primed;   // pierwszy przebieg tylko zapamietuje, nie czyta starych

    public Notifications(Action<string, string> onNew)
    {
        _onNew = onNew;
        _timer.Tick += async (_, _) => await Poll();
    }

    /// <summary>Wlacz nasluch. Zwraca komunikat o stanie (zgoda / brak / blad).</summary>
    public async Task<string> Start()
    {
        try
        {
            _listener = UserNotificationListener.Current;
            var access = await _listener.RequestAccessAsync().AsTask();
            if (access != UserNotificationListenerAccessStatus.Allowed)
                return "Windows nie dal dostepu do powiadomien. Wlacz go w Ustawienia → Prywatnosc → Powiadomienia.";
            _seen.Clear();
            _primed = false;
            _timer.Start();
            return "";
        }
        catch (Exception ex)
        {
            return "Nie moge wlaczyc czytania powiadomien: " + ex.Message;
        }
    }

    public void Stop() { try { _timer.Stop(); } catch { } }

    private async Task Poll()
    {
        if (_listener == null) return;
        IReadOnlyList<UserNotification> notes;
        try { notes = await _listener.GetNotificationsAsync(NotificationKinds.Toast).AsTask(); }
        catch { return; }

        // Pierwszy przebieg: tylko zapamietaj to, co juz wisi, zeby nie czytac starych.
        if (!_primed)
        {
            foreach (var n in notes) _seen.Add(n.Id);
            _primed = true;
            return;
        }

        var current = new HashSet<uint>();
        foreach (var n in notes)
        {
            current.Add(n.Id);
            if (_seen.Contains(n.Id)) continue;
            _seen.Add(n.Id);
            var (app, msg) = Extract(n);
            if (msg.Length > 0) _onNew(app, msg);
        }
        // Zapomnij te, ktore znikly (zwolnione, zeby ponowne to samo dalo sie odczytac).
        _seen.RemoveWhere(id => !current.Contains(id));
    }

    private static (string app, string msg) Extract(UserNotification n)
    {
        string app = "";
        try { app = n.AppInfo?.DisplayInfo?.DisplayName ?? ""; } catch { }

        string msg = "";
        try
        {
            var binding = n.Notification?.Visual?.GetBinding(KnownNotificationBindings.ToastGeneric);
            if (binding != null)
            {
                var parts = new List<string>();
                foreach (var t in binding.GetTextElements())
                {
                    var s = (t.Text ?? "").Trim();
                    if (s.Length > 0) parts.Add(s);
                }
                msg = string.Join(". ", parts);
            }
        }
        catch { }
        return (app, msg);
    }
}
