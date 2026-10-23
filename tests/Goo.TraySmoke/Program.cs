using Goo;
using System.Diagnostics;
using System.Reflection;

using var watcher = OperatingSystem.IsLinux() ? new LinuxSmoke() : null;
var owner = new Window { Title = "Goo tray smoke", Width = 240, Height = 160 }.Open();
try
{
    owner.Pump(0);
    var result = TrayIcon.Create(owner, Options("Initial"));
    Check(result.Icon != null, $"Create: {result.Status}: {result.Error}");
    using var icon = result.Icon!;
    Check(result.Status == TrayStatus.Registered || OperatingSystem.IsWindows() && result.Status == TrayStatus.NoHost,
        $"Native registration: {result.Status}");
    var activations = 0;
    var commands = 0;
    var thread = Environment.CurrentManagedThreadId;
    icon.Activated += () => { Check(Environment.CurrentManagedThreadId == thread, "Activation owner thread"); activations++; };
    icon.CommandActivated += id =>
    {
        Check(Environment.CurrentManagedThreadId == thread && id == "open", "Command owner thread and stable ID");
        commands++;
    };
    var backend = Field(icon, "backend");
    if (watcher != null)
    {
        Wait(watcher.Registered.Task);
        Wait(watcher.VerifyAsync("Initial", true));
    }
    Check(icon.Update(Options("Updated")) == result.Status, "Native update");
    if (watcher != null) Wait(watcher.VerifyAsync("Updated", false));
    else if (OperatingSystem.IsMacOS()) MacSmoke.Invoke(backend);
    else WindowsSmoke.Invoke(owner, backend);
    Until(() => commands == (watcher != null ? 2 : 1) && (OperatingSystem.IsMacOS() || activations == 1));
    icon.Dispose();
    icon.Dispose();
    Check(icon.Status == TrayStatus.Closed && icon.Update(Options("Closed")) == TrayStatus.Closed, "Idempotent disposal");
    if (watcher != null) Wait(watcher.VerifyDisposedAsync());
    else if (OperatingSystem.IsMacOS()) Check((nint)Field(backend, "item") == 0, "Status item released");
    else Check((nint)Field(backend, "image") == 0, "Native icon released");
    using var closing = TrayIcon.Create(owner, Options("Owner close")).Icon!;
    owner.RequestClose();
    Until(() => !owner.IsOpen);
    Check(closing.Status == TrayStatus.Closed, "Owner closes tray");
    Console.WriteLine($"Tray smoke passed: {result.Status}, create, update, menu invocation, dispose, owner close.");
}
finally
{
    if (owner.IsOpen) { owner.RequestClose(); owner.Run(); }
}

TrayOptions Options(string tooltip) => new()
{
    Id = "org.goo.TraySmoke", Width = 2, Height = 2,
    Rgba = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128],
    Tooltip = tooltip,
    Menu = [new NativeMenuItem { Id = "open", Text = "Open " + tooltip, Checked = true },
        new NativeMenuItem { Id = "disabled", Text = "Disabled", Enabled = false }]
};

void Wait(Task task) { Until(() => task.IsCompleted); task.GetAwaiter().GetResult(); }
void Until(Func<bool> ready)
{
    var clock = Stopwatch.StartNew();
    while (!ready())
    {
        Check(clock.Elapsed < TimeSpan.FromSeconds(15), "Native callback timeout");
        owner.Pump(0);
        Thread.Sleep(5);
    }
}

static object Field(object value, string name) => value.GetType().GetField(name,
    BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(value)!;
static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
