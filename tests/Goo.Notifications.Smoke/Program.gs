package GooNotificationsSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

internal class Program {
    shared {
        private const Identity string = "org.goo.notifications.smoke"
        private const Id string = "notification-42"
        private const Payload string = "opaque|report-42|α"

        internal func Run(arguments []string) {
            Window.ConfigureApplication("Goo notification smoke", "1.0", Identity)
            Require(Window.InitializeApplicationActivation(ApplicationActivation{ IsInitial: true }) == WindowOperationResult.Accepted,
                "Activation initialization failed")
            let opened = Notifications.Open(NotificationOptions{})
            if arguments[0] == "missing" {
                Require(opened.Status == NotificationStatus.MissingIdentity, "An unbundled macOS process claimed identity")
                Console.WriteLine("notifications: missing bundle identity returned MissingIdentity")
                return
            }
            Require(opened.Status == NotificationStatus.Success && opened.Service != nil,
                "Notification service did not open: ${opened.Status}: ${opened.Error}")
            using let service = opened.Service!!
            let window = Window{ Width: 160, Height: 100, InitiallyVisible: false, Root: Cell() }.Open()
            let owner = Environment.CurrentManagedThreadId
            var received = false
            let callback Action[ApplicationActivation] = activation -> {
                if activation.Kind != ApplicationActivationKind.Notification { return }
                Require(Environment.CurrentManagedThreadId == owner, "Notification activation left the UI thread")
                Require(activation.NotificationId == Id && activation.ActionId == "" && activation.Payload == Payload,
                    "Native notification activation changed identity or payload")
                Require(!activation.IsInitial, "A warm notification became a cold activation")
                received = true
            }
            Window.ApplicationActivated += callback
            try {
                let permission = Complete(service.GetPermissionAsync(), window)
                Require(permission.Status == NotificationStatus.Success || permission.Status == NotificationStatus.Denied
                    || permission.Status == NotificationStatus.Disabled,
                    "Permission query failed: ${permission.Status}: ${permission.Error}")
                let message = NotificationMessage{
                    Id: Id, Title: "Native notification proof", Body: "plain <&> text", Payload: Payload,
                }
                if OperatingSystem.IsLinux() {
                    Require(permission.Permission == NotificationPermission.Unknown, "Linux invented a permission query")
                    Require(permission.ActivationSupport == NotificationActivationSupport.WarmOnly,
                        "The native daemon did not expose default actions")
                    Require(Complete(service.ShowAsync(NotificationMessage{ Id: Id, Title: "Old notification", Payload: "old" }), window).Delivery
                        == NotificationDelivery.Accepted, "Initial native notification was not accepted")
                    Require(Complete(service.ShowAsync(message), window).Delivery == NotificationDelivery.Accepted,
                        "Native notification replacement was not accepted")
                    let root = Path.GetFullPath(arguments[1])
                    Directory.CreateDirectory(root)
                    File.WriteAllText(Path.Combine(root, "ready"), "ready")
                    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30
                    while !received && Stopwatch.GetTimestamp() < deadline {
                        window.Pump(0.01)
                        Thread.Sleep(1)
                    }
                    Require(received, "The native daemon action did not reach ApplicationActivated")
                    Require(Complete(service.ShowAsync(message), window).Delivery == NotificationDelivery.Accepted,
                        "Native notification could not be resubmitted after activation")
                } else {
                    let shown = Complete(service.ShowAsync(message), window)
                    Require(shown.Status == NotificationStatus.Accepted || shown.Status == NotificationStatus.PermissionRequired
                        || shown.Status == NotificationStatus.Denied || shown.Status == NotificationStatus.Disabled,
                        "Native submission returned ${shown.Status}: ${shown.Error}")
                    let state = Complete(service.GetStatusAsync(Id), window)
                    Require(state.Status == NotificationStatus.Success && (state.Delivery == NotificationDelivery.Unknown
                        || state.Delivery == NotificationDelivery.PresentInCenter), "Native Notification Center query failed")
                    Console.WriteLine("notifications: permission=${permission.Permission}")
                    Console.WriteLine("notifications: submission=${shown.Status}, presence=${state.Delivery}")
                }
                Require(Complete(service.RemoveAsync(Id), window).Delivery == NotificationDelivery.Removed,
                    "Native removal was not accepted")
                Console.WriteLine("notifications: native permission, submission, presence and removal checks passed")
            } finally {
                Window.ApplicationActivated -= callback
                window.RequestClose()
                window.Pump(0)
            }
        }

        private func Complete[T any](task Task[T], window Window) T {
            let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30
            while !task.IsCompleted && Stopwatch.GetTimestamp() < deadline {
                window.Pump(0.01)
                Thread.Sleep(1)
            }
            Require(task.IsCompleted, "Native notification completion timed out")
            return task.GetAwaiter().GetResult()
        }

        private func Require(value bool, message string) {
            if !value { throw InvalidOperationException(message) }
        }
    }
}

Program.Run(Environment.GetCommandLineArgs().Skip(1).ToArray())
