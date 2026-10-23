using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Xml.Linq;
using Goo;

if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
if (args.Length == 2 && args[0] == "--goo-notification")
{
    var read = ActivationArguments.Read(args, Environment.CurrentDirectory);
    Require(read.Status == ActivationReadStatus.Accepted && read.Activation is not null, read.Error);
    ApplicationActivation? received = null;
    Window.ApplicationActivated += value => received = value;
    Require(Window.InitializeApplicationActivation(read.Activation!) == WindowOperationResult.Accepted, "Activation initialization failed");
    typeof(Window).GetMethod("DrainApplicationActivations", BindingFlags.NonPublic | BindingFlags.Static)!.Invoke(null, null);
    Require(received?.Kind == ApplicationActivationKind.Notification, "Protocol did not raise notification activation");
    string activationOutput = Output(new Uri(args[1]).Scheme);
    File.WriteAllLines(activationOutput + ".new", new[]
    {
        received!.NotificationId, received.ActionId, received.Payload
    }.Select(value => Convert.ToBase64String(Encoding.UTF8.GetBytes(value))));
    File.Move(activationOutput + ".new", activationOutput);
    return;
}

string scheme = "goo-toast-smoke-" + Guid.NewGuid().ToString("N");
string identifier = "org.goo.notifications." + Guid.NewGuid().ToString("N");
Window.ConfigureApplication("Notifications smoke", "1.0", identifier);
var options = new NotificationOptions { ActivationScheme = scheme };
var missing = Notifications.Open(options);
Require(missing.Status == NotificationStatus.MissingIdentity && missing.Service is null, "Missing installation was accepted");
using var identity = new InstalledIdentity(identifier, scheme);
var opened = Notifications.Open(options);
Require(opened.Status == NotificationStatus.Success && opened.Service is not null, opened.Status + ": " + opened.Error);
using var service = opened.Service!;
var permission = await service.GetPermissionAsync();
Console.WriteLine("permission: " + permission.Status + " / " + permission.Permission);
var message = new NotificationMessage
{
    Id = "notice λ & \"quoted\"",
    Title = "Goo <notification> & protocol",
    Body = "Headless acceptance check",
    Payload = "opaque λ😀 & ? = # % + \"quoted\" \\ path\nsecond line"
};
var shown = await service.ShowAsync(message);
Require(Enum.IsDefined(shown.Status) && shown.Id == message.Id, "Show did not return a typed result");
Require(shown.Status is NotificationStatus.Accepted or NotificationStatus.Disabled or NotificationStatus.Denied
    or NotificationStatus.Unsupported or NotificationStatus.Failed, "Unexpected show status: " + shown.Status);
Console.WriteLine("show: " + shown.Status + " / " + shown.Delivery + " / " + shown.Error);
if (shown.Status == NotificationStatus.Accepted)
{
    var history = await service.GetStatusAsync(message.Id);
    Console.WriteLine("history: " + history.Status + " / " + history.Delivery);
    var removed = await service.RemoveAsync(message.Id);
    Require(removed.Status == NotificationStatus.Accepted && removed.Delivery == NotificationDelivery.Removed,
        "Remove failed: " + removed.Status + " / " + removed.Error);
}

string xml = WindowsNotificationService.Content(scheme, message);
var toast = XElement.Parse(xml);
Require((string?)toast.Attribute("activationType") == "protocol", "Toast uses a non-protocol activator");
Require(toast.Descendants("text").First().Value == message.Title, "Toast XML changed plain text");
string launch = (string)toast.Attribute("launch")!;
string output = Output(scheme);
try
{
    using var process = Process.Start(new ProcessStartInfo(launch) { UseShellExecute = true });
    var watch = Stopwatch.StartNew();
    while (!File.Exists(output) && watch.Elapsed < TimeSpan.FromSeconds(20)) await Task.Delay(50);
    Require(File.Exists(output), "Registered protocol did not reach its handler");
    var received = File.ReadAllLines(output).Select(value => Encoding.UTF8.GetString(Convert.FromBase64String(value)));
    Require(received.SequenceEqual(new[] { message.Id, "", message.Payload }), "Protocol activation changed notification data");
    Console.WriteLine("protocol: notification event retained ID, empty action and opaque Unicode payload");
}
finally { File.Delete(output); }

static string Output(string scheme) => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), scheme + ".payload");
static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
