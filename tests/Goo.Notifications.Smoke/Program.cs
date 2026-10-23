using System.Diagnostics;
using Goo;

internal static class Program
{
    private const string Identity = "org.goo.notifications.smoke";
    private const string Id = "notification-42";
    private const string Payload = "opaque|report-42|α";

    private static void Main(string[] arguments)
    {
        Window.ConfigureApplication("Goo notification smoke", "1.0", Identity);
        Require(Window.InitializeApplicationActivation(new() { IsInitial = true }) == WindowOperationResult.Accepted,
            "Activation initialization failed");
        var opened = Notifications.Open(new());
        if (arguments[0] == "missing")
        {
            Require(opened.Status == NotificationStatus.MissingIdentity, "An unbundled macOS process claimed identity");
            Console.WriteLine("notifications: missing bundle identity returned MissingIdentity");
            return;
        }
        Require(opened.Status == NotificationStatus.Success && opened.Service is not null,
            $"Notification service did not open: {opened.Status}: {opened.Error}");
        using var service = opened.Service!;
        var window = new Window { Width = 160, Height = 100, InitiallyVisible = false, Root = new Cell() }.Open();
        var owner = Environment.CurrentManagedThreadId;
        var received = false;
        Action<ApplicationActivation> callback = activation =>
        {
            if (activation.Kind != ApplicationActivationKind.Notification) return;
            Require(Environment.CurrentManagedThreadId == owner, "Notification activation left the UI thread");
            Require(activation.NotificationId == Id && activation.ActionId == "default"
                && activation.Payload == Payload,
                "Native notification activation changed identity or payload");
            Require(!activation.IsInitial, "A warm notification became a cold activation");
            received = true;
        };
        Window.ApplicationActivated += callback;
        try
        {
            var permission = Complete(service.GetPermissionAsync(), window);
            Require(permission.Status is NotificationStatus.Success or NotificationStatus.Denied
                or NotificationStatus.Disabled, $"Permission query failed: {permission.Status}: {permission.Error}");
            var message = new NotificationMessage
            {
                Id = Id, Title = "Native notification proof", Body = "plain <&> text", Payload = Payload
            };
            if (OperatingSystem.IsLinux())
            {
                Require(permission.Permission == NotificationPermission.Unknown, "Linux invented a permission query");
                Require(permission.ActivationSupport == NotificationActivationSupport.WarmOnly,
                    "The native daemon did not expose default actions");
                Require(Complete(service.ShowAsync(
                    new() { Id = Id, Title = "Old notification", Payload = "old" }), window).Delivery
                    == NotificationDelivery.Accepted, "Initial native notification was not accepted");
                Require(Complete(service.ShowAsync(message), window).Delivery == NotificationDelivery.Accepted,
                    "Native notification replacement was not accepted");
                var root = Path.GetFullPath(arguments[1]);
                Directory.CreateDirectory(root);
                File.WriteAllText(Path.Combine(root, "ready"), "ready");
                var deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30;
                while (!received && Stopwatch.GetTimestamp() < deadline) { window.Pump(0.01); Thread.Sleep(1); }
                Require(received, "The native daemon action did not reach ApplicationActivated");
                Require(Complete(service.ShowAsync(message), window).Delivery == NotificationDelivery.Accepted,
                    "Native notification could not be resubmitted after activation");
            }
            else
            {
                var shown = Complete(service.ShowAsync(message), window);
                Require(shown.Status is NotificationStatus.Accepted or NotificationStatus.PermissionRequired
                    or NotificationStatus.Denied or NotificationStatus.Disabled,
                    $"Native submission returned {shown.Status}: {shown.Error}");
                var state = Complete(service.GetStatusAsync(Id), window);
                Require(state.Status == NotificationStatus.Success && state.Delivery is NotificationDelivery.Unknown
                    or NotificationDelivery.PresentInCenter, "Native Notification Center query failed");
                Console.WriteLine($"notifications: permission={permission.Permission}");
                Console.WriteLine($"notifications: submission={shown.Status}, presence={state.Delivery}");
            }
            Require(Complete(service.RemoveAsync(Id), window).Delivery == NotificationDelivery.Removed,
                "Native removal was not accepted");
            Console.WriteLine("notifications: native permission, submission, presence and removal checks passed");
        }
        finally
        {
            Window.ApplicationActivated -= callback;
            window.RequestClose();
            window.Pump(0);
        }
    }

    private static T Complete<T>(Task<T> task, Window window)
    {
        var deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30;
        while (!task.IsCompleted && Stopwatch.GetTimestamp() < deadline) { window.Pump(0.01); Thread.Sleep(1); }
        Require(task.IsCompleted, "Native notification completion timed out");
        return task.GetAwaiter().GetResult();
    }

    private static void Require(bool value, string message)
    {
        if (!value) throw new InvalidOperationException(message);
    }
}
