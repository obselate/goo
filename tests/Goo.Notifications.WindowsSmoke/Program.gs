package GooNotificationsWindowsSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Linq
import System.Reflection
import System.Text
import System.Threading.Tasks
import System.Xml.Linq

func Output(scheme string) string -> Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), scheme + ".payload")

func Require(condition bool, message string) {
    if !condition { throw InvalidOperationException(message) }
}

async func Run(args []string) Task {
    if !OperatingSystem.IsWindows() { throw PlatformNotSupportedException() }
    if args.Length == 2 && args[0] == "--goo-notification" {
        let read = ActivationArguments.Read(args, Environment.CurrentDirectory)
        Require(read.Status == ActivationReadStatus.Accepted && read.Activation != nil, read.Error)
        var received ApplicationActivation? = nil
        Window.ApplicationActivated += value -> { received = value }
        Require(Window.InitializeApplicationActivation(read.Activation!!) == WindowOperationResult.Accepted, "Activation initialization failed")
        typeof(Window).GetMethod("DrainApplicationActivations", BindingFlags.NonPublic | BindingFlags.Static)!!.Invoke(nil, nil)
        Require(received?.Kind == ApplicationActivationKind.Notification, "Protocol did not raise notification activation")
        let activationOutput = Output(Uri(args[1]).Scheme)
        let activation = received!!
        File.WriteAllLines(activationOutput + ".new", []string{activation.NotificationId, activation.ActionId, activation.Payload}
            .Select(value -> Convert.ToBase64String(Encoding.UTF8.GetBytes(value))))
        File.Move(activationOutput + ".new", activationOutput)
        return
    }

    let scheme = "goo-toast-smoke-" + Guid.NewGuid().ToString("N")
    let identifier = "org.goo.notifications." + Guid.NewGuid().ToString("N")
    Window.ConfigureApplication("Notifications smoke", "1.0", identifier)
    let options = NotificationOptions{ ActivationScheme: scheme }
    let missing = Notifications.Open(options)
    Require(missing.Status == NotificationStatus.MissingIdentity && missing.Service == nil, "Missing installation was accepted")
    using let identity = InstalledIdentity(identifier, scheme)
    let opened = Notifications.Open(options)
    Require(opened.Status == NotificationStatus.Success && opened.Service != nil, "${opened.Status}: ${opened.Error}")
    using let service = opened.Service!!
    let permission = await service.GetPermissionAsync()
    Console.WriteLine("permission: ${permission.Status} / ${permission.Permission}")
    let message = NotificationMessage{
        Id: "notice λ & \"quoted\"", Title: "Goo <notification> & protocol", Body: "Headless acceptance check",
        Payload: "opaque λ😀 & ? = # % + \"quoted\" \\ path\nsecond line",
    }
    let shown = await service.ShowAsync(message)
    Require(Enum.IsDefined(shown.Status) && shown.Id == message.Id, "Show did not return a typed result")
    Require(shown.Status == NotificationStatus.Accepted || shown.Status == NotificationStatus.Disabled || shown.Status == NotificationStatus.Denied
        || shown.Status == NotificationStatus.MissingIdentity || shown.Status == NotificationStatus.Unsupported || shown.Status == NotificationStatus.Failed,
        "Unexpected show status: ${shown.Status}")
    Console.WriteLine("show: ${shown.Status} / ${shown.Delivery} / ${shown.Error}")
    if shown.Status == NotificationStatus.Accepted {
        let history = await service.GetStatusAsync(message.Id)
        Console.WriteLine("history: ${history.Status} / ${history.Delivery}")
        let removed = await service.RemoveAsync(message.Id)
        Require(removed.Status == NotificationStatus.Accepted && removed.Delivery == NotificationDelivery.Removed,
            "Remove failed: ${removed.Status} / ${removed.Error}")
    }

    let xml = WindowsNotificationService.Content(scheme, message)
    let toast = XElement.Parse(xml)
    Require(toast.Attribute("activationType")?.Value == "protocol", "Toast uses a non-protocol activator")
    Require(toast.Descendants("text").First().Value == message.Title, "Toast XML changed plain text")
    let launch = toast.Attribute("launch")!!.Value
    let output = Output(scheme)
    try {
        using let process = Process.Start(ProcessStartInfo{ FileName: launch, UseShellExecute: true })
        let watch = Stopwatch.StartNew()
        while !File.Exists(output) && watch.Elapsed < TimeSpan.FromSeconds(20) { await Task.Delay(50) }
        Require(File.Exists(output), "Registered protocol did not reach its handler")
        let received = File.ReadAllLines(output).Select(value -> Encoding.UTF8.GetString(Convert.FromBase64String(value)))
        Require(received.SequenceEqual([]string{message.Id, "", message.Payload}), "Protocol activation changed notification data")
        Console.WriteLine("protocol: notification event retained ID, empty action and opaque Unicode payload")
    } finally { File.Delete(output) }
}

Run(Environment.GetCommandLineArgs().Skip(1).ToArray()).GetAwaiter().GetResult()
