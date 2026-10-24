package Goo

import System
import System.Text
import System.Threading.Tasks

/// Reports the operating system's notification permission or setting.
public enum NotificationPermission {
    /// The user has not made a permission choice.
    NotDetermined;
    /// The operating system allows notification submission. Banner presentation is not guaranteed.
    Granted;
    /// The user denied notification permission.
    Denied;
    /// Application, channel or system settings disable notifications.
    Disabled;
    /// The platform cannot report a reliable permission state.
    Unknown;
    /// The platform does not support this notification service.
    Unsupported;
}

/// Reports submission or current native notification state, not whether the user read it.
public enum NotificationDelivery {
    /// The platform cannot report the notification's current presence.
    Unknown;
    /// The native service accepted submission. It may suppress or defer presentation.
    Accepted;
    /// A native query found the notification in the current notification center.
    PresentInCenter;
    /// The native service accepted removal or reported that the notification closed.
    Removed;
    /// The native service rejected submission or reported a delivery failure.
    Failed;
}

/// Reports the configured default-click route, not a guarantee that the user will activate it.
public enum NotificationActivationSupport {
    /// No supported activation route is available.
    None;
    /// The click can reach the running process only.
    WarmOnly;
    /// The click can reach a running process or start the installed application.
    WarmAndCold;
}

/// Reports a notification operation without throwing for expected platform failures.
public enum NotificationStatus {
    /// The query or configuration operation succeeded.
    Success;
    /// The native service accepted the request.
    Accepted;
    /// The application must request permission before it can submit.
    PermissionRequired;
    /// The user denied permission.
    Denied;
    /// Native application, channel or system settings disable submission.
    Disabled;
    /// The required installed application identity or activation registration is missing.
    MissingIdentity;
    /// The platform or requested native operation is not supported.
    Unsupported;
    /// The native operation failed.
    Failed;
}

/// Configures the platform's notification identity and channel without requesting permission.
public class NotificationOptions {
    /// Gets the installer-registered private Windows protocol used with --goo-notification.
    public prop ActivationScheme string { get; init; }

    /// Gets the stable Android notification channel ID. Other platforms ignore this value.
    public prop ChannelId string { get; init; }

    /// Gets the user-visible Android channel name. Other platforms ignore this value.
    public prop ChannelName string { get; init; }

    /// Gets an Android drawable resource name for the required small icon. Other platforms ignore it.
    public prop SmallIconResource string { get; init; }

    /// Creates empty options. Set the fields required by the target platform.
    public init() {
        ActivationScheme = ""
        ChannelId = ""
        ChannelName = ""
        SmallIconResource = ""
    }
}

/// Describes plain notification text and opaque application data for its default click.
public class NotificationMessage {
    /// Gets the stable replacement identity, containing 1 to 64 UTF-16 units and no NUL.
    public prop Id string { get; init; }

    /// Gets the plain title. The operating system controls wrapping and truncation.
    public prop Title string { get; init; }

    /// Gets the plain body. The operating system controls wrapping and truncation.
    public prop Body string { get; init; }

    /// Gets opaque data delivered through ApplicationActivation.Payload after a default click.
    public prop Payload string { get; init; }

    /// Creates an empty message. Set Id before submission.
    public init() {
        Id = ""
        Title = ""
        Body = ""
        Payload = ""
    }

    internal func Validate() {
        ValidateId(Id)
        ValidateText(Title, "Title")
        ValidateText(Body, "Body")
        ValidateText(Payload, "Payload")
    }

    shared {
        private const MaxIdUnits int32 = 64
        private const MaxTextBytes int32 = 65536

        internal func ValidateId(value string) {
            ArgumentNullException.ThrowIfNull(value)
            if value.Length == 0 || value.Length > MaxIdUnits || value.Contains(char(0)) {
                throw ArgumentException("Notification Id must contain 1 to 64 UTF-16 units and no NUL", "value")
            }
        }

        private func ValidateText(value string, name string) {
            ArgumentNullException.ThrowIfNull(value)
            if value.Contains(char(0)) || value.Length > MaxTextBytes || Encoding.UTF8.GetByteCount(value) > MaxTextBytes {
                throw ArgumentException("Notification text must fit 64 KiB of UTF-8 and contain no NUL", name)
            }
        }
    }
}

/// Reports native permission, delivery and activation support for one operation.
public class NotificationResult {
    /// Gets the operation status.
    public prop Status NotificationStatus { get; }

    /// Gets the current permission or Unknown when the OS cannot report it.
    public prop Permission NotificationPermission { get; }

    /// Gets submission or native presence state. Accepted does not mean displayed.
    public prop Delivery NotificationDelivery { get; }

    /// Gets the configured default-click route.
    public prop ActivationSupport NotificationActivationSupport { get; }

    /// Gets the original application notification ID, or an empty string for permission queries.
    public prop Id string { get; }

    /// Gets bounded native failure detail, or an empty string.
    public prop Error string { get; }

    internal init(status NotificationStatus, permission NotificationPermission = NotificationPermission.Unknown,
        delivery NotificationDelivery = NotificationDelivery.Unknown,
        activationSupport NotificationActivationSupport = NotificationActivationSupport.None,
        id string = "", error string = "") {
        Status = status
        Permission = permission
        Delivery = delivery
        ActivationSupport = activationSupport
        Id = id
        Error = if error.Length > 512 { error.Substring(0, 512) } else { error }
    }
}

/// Owns a native notification service. Clicks use Window.ApplicationActivated with Kind Notification.
public interface NotificationService : IDisposable {
    /// Queries native permission or returns Unknown where the platform has no query.
    /// @returns The current setting and configured activation support.
    func GetPermissionAsync() Task[NotificationResult];

    /// Requests permission only when the native platform has a permission prompt.
    /// @returns The user's native decision, or the current setting on platforms without a prompt.
    func RequestPermissionAsync() Task[NotificationResult];

    /// Submits or replaces a notification. It never requests permission implicitly.
    /// @param message Plain text and bounded opaque default-click data.
    /// @returns Accepted after native submission, or an explicit permission, identity or platform failure.
    func ShowAsync(message NotificationMessage) Task[NotificationResult];

    /// Queries current native presence when available, otherwise returns Unknown.
    /// @param id The original notification identity.
    /// @returns Native presence or the platform's reporting limit.
    func GetStatusAsync(id string) Task[NotificationResult];

    /// Asks the operating system to remove the application's notification.
    /// @param id The original notification identity.
    /// @returns Removed after native acceptance, or an explicit platform failure.
    func RemoveAsync(id string) Task[NotificationResult];
}

/// Reports service creation. Only Success supplies an owned Service.
public class NotificationServiceResult {
    /// Gets service creation status.
    public prop Status NotificationStatus { get; }

    /// Gets the owned native service on Success, otherwise nil.
    public prop Service NotificationService? { get; }

    /// Gets bounded native failure detail, or an empty string.
    public prop Error string { get; }

    internal init(status NotificationStatus, service NotificationService? = nil, error string = "") {
        Status = status
        Service = service
        Error = if error.Length > 512 { error.Substring(0, 512) } else { error }
    }
}

/// Opens optional desktop notifications without changing application lifetime or requesting permission.
public class Notifications {
    private init() {}

    shared {
        /// Uses the configured desktop application ID and installed native activation route.
        /// @param options Platform identity and channel configuration.
        /// @returns An owned native service, or an explicit unsupported, identity or native failure.
        /// @remarks Subscribe and initialize application activation first. On macOS, open before the first Window opens.
        /// Windows needs its installed AUMID shortcut and private protocol. Android uses AndroidNotifications.Open.
        /// Disposing a service does not erase notifications that the OS already accepted.
        public func Open(options NotificationOptions) NotificationServiceResult {
            ArgumentNullException.ThrowIfNull(options)
            if OperatingSystem.IsAndroid() || (!OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS()
                && !OperatingSystem.IsLinux()) { return NotificationServiceResult(NotificationStatus.Unsupported) }
            let identifier = SdlRuntime.ApplicationIdentifier
            if string.IsNullOrEmpty(identifier) {
                return NotificationServiceResult(NotificationStatus.MissingIdentity,
                    error: "Call Window.ConfigureApplication with the installed application identifier first")
            }
            try {
                if OperatingSystem.IsWindows() { return WindowsNotificationService.Open(identifier, options) }
                if OperatingSystem.IsMacOS() { return MacNotificationService.Open(identifier, options) }
                return LinuxNotificationService.Open(identifier, options)
            } catch (error DllNotFoundException) {
                return NotificationServiceResult(NotificationStatus.Unsupported, error: error.Message)
            } catch (error EntryPointNotFoundException) {
                return NotificationServiceResult(NotificationStatus.Unsupported, error: error.Message)
            }
        }
    }
}
