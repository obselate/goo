package Goo

import System
import System.Text
import System.Threading.Tasks

/// <summary>Reports the operating system's notification permission or setting.</summary>
public enum NotificationPermission {
    /// <summary>The user has not made a permission choice.</summary>
    NotDetermined;
    /// <summary>The operating system allows notification submission. Banner presentation is not guaranteed.</summary>
    Granted;
    /// <summary>The user denied notification permission.</summary>
    Denied;
    /// <summary>Application, channel or system settings disable notifications.</summary>
    Disabled;
    /// <summary>The platform cannot report a reliable permission state.</summary>
    Unknown;
    /// <summary>The platform does not support this notification service.</summary>
    Unsupported;
}

/// <summary>Reports submission or current native notification state, not whether the user read it.</summary>
public enum NotificationDelivery {
    /// <summary>The platform cannot report the notification's current presence.</summary>
    Unknown;
    /// <summary>The native service accepted submission. It may suppress or defer presentation.</summary>
    Accepted;
    /// <summary>A native query found the notification in the current notification center.</summary>
    PresentInCenter;
    /// <summary>The native service accepted removal or reported that the notification closed.</summary>
    Removed;
    /// <summary>The native service rejected submission or reported a delivery failure.</summary>
    Failed;
}

/// <summary>Reports the configured default-click route, not a guarantee that the user will activate it.</summary>
public enum NotificationActivationSupport {
    /// <summary>No supported activation route is available.</summary>
    None;
    /// <summary>The click can reach the running process only.</summary>
    WarmOnly;
    /// <summary>The click can reach a running process or start the installed application.</summary>
    WarmAndCold;
}

/// <summary>Reports a notification operation without throwing for expected platform failures.</summary>
public enum NotificationStatus {
    /// <summary>The query or configuration operation succeeded.</summary>
    Success;
    /// <summary>The native service accepted the request.</summary>
    Accepted;
    /// <summary>The application must request permission before it can submit.</summary>
    PermissionRequired;
    /// <summary>The user denied permission.</summary>
    Denied;
    /// <summary>Native application, channel or system settings disable submission.</summary>
    Disabled;
    /// <summary>The required installed application identity or activation registration is missing.</summary>
    MissingIdentity;
    /// <summary>The platform or requested native operation is not supported.</summary>
    Unsupported;
    /// <summary>The native operation failed.</summary>
    Failed;
}

/// <summary>Configures the platform's notification identity and channel without requesting permission.</summary>
public class NotificationOptions {
    /// <summary>Gets the installer-registered private Windows protocol used with --goo-notification.</summary>
    public prop ActivationScheme string { get; init; }

    /// <summary>Gets the stable Android notification channel ID. Other platforms ignore this value.</summary>
    public prop ChannelId string { get; init; }

    /// <summary>Gets the user-visible Android channel name. Other platforms ignore this value.</summary>
    public prop ChannelName string { get; init; }

    /// <summary>Gets an Android drawable resource name for the required small icon. Other platforms ignore it.</summary>
    public prop SmallIconResource string { get; init; }

    /// <summary>Creates empty options. Set the fields required by the target platform.</summary>
    public init() {
        ActivationScheme = ""
        ChannelId = ""
        ChannelName = ""
        SmallIconResource = ""
    }
}

/// <summary>Describes plain notification text and opaque application data for its default click.</summary>
public class NotificationMessage {
    /// <summary>Gets the stable replacement identity, containing 1 to 64 UTF-16 units and no NUL.</summary>
    public prop Id string { get; init; }

    /// <summary>Gets the plain title. The operating system controls wrapping and truncation.</summary>
    public prop Title string { get; init; }

    /// <summary>Gets the plain body. The operating system controls wrapping and truncation.</summary>
    public prop Body string { get; init; }

    /// <summary>Gets opaque data delivered through ApplicationActivation.Payload after a default click.</summary>
    public prop Payload string { get; init; }

    /// <summary>Creates an empty message. Set Id before submission.</summary>
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

/// <summary>Reports native permission, delivery and activation support for one operation.</summary>
public class NotificationResult {
    /// <summary>Gets the operation status.</summary>
    public prop Status NotificationStatus { get; }

    /// <summary>Gets the current permission or Unknown when the OS cannot report it.</summary>
    public prop Permission NotificationPermission { get; }

    /// <summary>Gets submission or native presence state. Accepted does not mean displayed.</summary>
    public prop Delivery NotificationDelivery { get; }

    /// <summary>Gets the configured default-click route.</summary>
    public prop ActivationSupport NotificationActivationSupport { get; }

    /// <summary>Gets the original application notification ID, or an empty string for permission queries.</summary>
    public prop Id string { get; }

    /// <summary>Gets bounded native failure detail, or an empty string.</summary>
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

/// <summary>Owns a native notification service. Clicks use Window.ApplicationActivated with Kind Notification.</summary>
public interface NotificationService : IDisposable {
    /// <summary>Queries native permission or returns Unknown where the platform has no query.</summary>
    /// <returns>The current setting and configured activation support.</returns>
    func GetPermissionAsync() Task[NotificationResult];

    /// <summary>Requests permission only when the native platform has a permission prompt.</summary>
    /// <returns>The user's native decision, or the current setting on platforms without a prompt.</returns>
    func RequestPermissionAsync() Task[NotificationResult];

    /// <summary>Submits or replaces a notification. It never requests permission implicitly.</summary>
    /// <param name="message">Plain text and bounded opaque default-click data.</param>
    /// <returns>Accepted after native submission, or an explicit permission, identity or platform failure.</returns>
    func ShowAsync(message NotificationMessage) Task[NotificationResult];

    /// <summary>Queries current native presence when available, otherwise returns Unknown.</summary>
    /// <param name="id">The original notification identity.</param>
    /// <returns>Native presence or the platform's reporting limit.</returns>
    func GetStatusAsync(id string) Task[NotificationResult];

    /// <summary>Asks the operating system to remove the application's notification.</summary>
    /// <param name="id">The original notification identity.</param>
    /// <returns>Removed after native acceptance, or an explicit platform failure.</returns>
    func RemoveAsync(id string) Task[NotificationResult];
}

/// <summary>Reports service creation. Only Success supplies an owned Service.</summary>
public class NotificationServiceResult {
    /// <summary>Gets service creation status.</summary>
    public prop Status NotificationStatus { get; }

    /// <summary>Gets the owned native service on Success, otherwise nil.</summary>
    public prop Service NotificationService? { get; }

    /// <summary>Gets bounded native failure detail, or an empty string.</summary>
    public prop Error string { get; }

    internal init(status NotificationStatus, service NotificationService? = nil, error string = "") {
        Status = status
        Service = service
        Error = if error.Length > 512 { error.Substring(0, 512) } else { error }
    }
}

/// <summary>Opens optional desktop notifications without changing application lifetime or requesting permission.</summary>
public class Notifications {
    shared {
        /// <summary>Uses the configured desktop application ID and installed native activation route.</summary>
        /// <param name="options">Platform identity and channel configuration.</param>
        /// <returns>An owned native service, or an explicit unsupported, identity or native failure.</returns>
        /// <remarks>
        /// Subscribe and initialize application activation first. On macOS, open before the first Window opens.
        /// Windows needs its installed AUMID shortcut and private protocol. Android uses AndroidNotifications.Open.
        /// Disposing a service does not erase notifications that the OS already accepted.
        /// </remarks>
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
