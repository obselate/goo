package Goo

import System
import System.IO
import System.Runtime.InteropServices
import System.Security
import System.Security.Cryptography
import System.Text
import System.Threading.Tasks

internal class WindowsNotificationService : NotificationService {
    private let identifier string
    private let scheme string
    private var disposed bool

    private init(identifier string, scheme string) {
        this.identifier = identifier
        this.scheme = scheme
    }

    public func Dispose() { disposed = true }

    public func GetPermissionAsync() Task[NotificationResult] -> Perform(0, "", nil)

    public func RequestPermissionAsync() Task[NotificationResult] -> GetPermissionAsync()

    public func ShowAsync(message NotificationMessage) Task[NotificationResult] {
        ArgumentNullException.ThrowIfNull(message)
        message.Validate()
        return Perform(1, message.Id, message)
    }

    public func GetStatusAsync(id string) Task[NotificationResult] {
        NotificationMessage.ValidateId(id)
        return Perform(2, id, nil)
    }

    public func RemoveAsync(id string) Task[NotificationResult] {
        NotificationMessage.ValidateId(id)
        return Perform(3, id, nil)
    }

    private func Perform(operation int32, id string, message NotificationMessage?) Task[NotificationResult] {
        ObjectDisposedException.ThrowIf(disposed, this)
        let initialized = WindowsToastNative.RoInitialize(1u)
        if initialized < 0 && initialized != -2147417850 {
            return Task.FromResult(Failure(initialized, id, operation == 1))
        }
        try {
            let manager = WindowsToastNative.Factory(WindowsToastNative.Manager, WindowsToastNative.ManagerId)
            try {
                let application = WindowsToastNative.String(identifier)
                try {
                    WindowsToastNative.Check(WindowsToastNative.Method[ToastCreate](manager, 7)(manager,
                        application, out var notifier))
                    try {
                        WindowsToastNative.Check(WindowsToastNative.Method[ToastSize](notifier, 8)(notifier,
                            out var setting))
                        if setting != 0u && operation <= 1 {
                            return Task.FromResult(Result(NotificationStatus.Disabled, id,
                                permission: NotificationPermission.Disabled))
                        }
                        if operation == 1 { Show(notifier, message!!) }
                        let delivery = if operation == 1 { NotificationDelivery.Accepted }
                            else if operation >= 2 { History(application, id, operation == 3) }
                            else { NotificationDelivery.Unknown }
                        return Task.FromResult(Result(if operation == 1 || operation == 3 {
                            NotificationStatus.Accepted
                        } else { NotificationStatus.Success }, id, delivery,
                            if setting == 0u { NotificationPermission.Granted } else { NotificationPermission.Disabled }))
                    } finally { WindowsToastNative.Release(notifier) }
                } finally { WindowsToastNative.WindowsDeleteString(application) }
            } finally { WindowsToastNative.Release(manager) }
        } catch (error COMException) {
            return Task.FromResult(Failure(error.HResult, id, operation == 1))
        } finally {
            if initialized >= 0 { WindowsToastNative.RoUninitialize() }
        }
    }

    private func Show(notifier nint, message NotificationMessage) {
        let xml = Content(scheme, message)
        let document = WindowsToastNative.Activate("Windows.Data.Xml.Dom.XmlDocument",
            "f7f3a506-1e87-42d6-bcfb-b8c809fa5494")
        try {
            let io = WindowsToastNative.Query(document, "6cd0e74e-ee65-4489-9ebf-ca43e87ba637")
            try {
                let text = WindowsToastNative.String(xml)
                try { WindowsToastNative.Check(WindowsToastNative.Method[ToastCall](io, 6)(io, text)) }
                finally { WindowsToastNative.WindowsDeleteString(text) }
            } finally { WindowsToastNative.Release(io) }
            let factory = WindowsToastNative.Factory("Windows.UI.Notifications.ToastNotification",
                "04124b20-82c6-4229-b109-fd9ed4662b53")
            try {
                WindowsToastNative.Check(WindowsToastNative.Method[ToastCreate](factory, 6)(factory,
                    document, out var toast))
                try {
                    let identity = WindowsToastNative.Query(toast, WindowsToastNative.ToastIdentityId)
                    try {
                        let tag = WindowsToastNative.String(Tag(message.Id))
                        try {
                            WindowsToastNative.Check(WindowsToastNative.Method[ToastCall](identity, 6)(identity, tag))
                        } finally { WindowsToastNative.WindowsDeleteString(tag) }
                    } finally { WindowsToastNative.Release(identity) }
                    WindowsToastNative.Check(WindowsToastNative.Method[ToastCall](notifier, 6)(notifier, toast))
                } finally { WindowsToastNative.Release(toast) }
            } finally { WindowsToastNative.Release(factory) }
        } finally { WindowsToastNative.Release(document) }
    }

    private func History(application nint, id string, remove bool) NotificationDelivery {
        let manager = WindowsToastNative.Factory(WindowsToastNative.Manager, WindowsToastNative.ManagerHistoryId)
        try {
            WindowsToastNative.Check(WindowsToastNative.Method[ToastGet](manager, 6)(manager, out var history))
            try {
                if remove {
                    let tag = WindowsToastNative.String(Tag(id))
                    try {
                        WindowsToastNative.Check(WindowsToastNative.Method[ToastRemove](history, 8)(history,
                            tag, nint(0), application))
                        return NotificationDelivery.Removed
                    } finally { WindowsToastNative.WindowsDeleteString(tag) }
                }
                let query = WindowsToastNative.Query(history, WindowsToastNative.HistoryId)
                try {
                    WindowsToastNative.Check(WindowsToastNative.Method[ToastCreate](query, 7)(query,
                        application, out var items))
                    try { return Find(items, Tag(id)) }
                    finally { WindowsToastNative.Release(items) }
                } finally { WindowsToastNative.Release(query) }
            } finally { WindowsToastNative.Release(history) }
        } finally { WindowsToastNative.Release(manager) }
    }

    private func Find(items nint, tag string) NotificationDelivery {
        WindowsToastNative.Check(WindowsToastNative.Method[ToastSize](items, 7)(items, out var count))
        for var i = 0u; i < count; i++ {
            WindowsToastNative.Check(WindowsToastNative.Method[ToastAt](items, 6)(items, i, out var toast))
            try {
                let identity = WindowsToastNative.Query(toast, WindowsToastNative.ToastIdentityId)
                try {
                    WindowsToastNative.Check(WindowsToastNative.Method[ToastGet](identity, 7)(identity,
                        out var text))
                    try {
                        if WindowsToastNative.Text(text) == tag { return NotificationDelivery.PresentInCenter }
                    } finally { WindowsToastNative.WindowsDeleteString(text) }
                } finally { WindowsToastNative.Release(identity) }
            } finally { WindowsToastNative.Release(toast) }
        }
        return NotificationDelivery.Unknown
    }

    private func Result(status NotificationStatus, id string,
        delivery NotificationDelivery = NotificationDelivery.Unknown,
        permission NotificationPermission = NotificationPermission.Granted) NotificationResult ->
        NotificationResult(status, permission, delivery, NotificationActivationSupport.WarmAndCold, id)

    shared {
        private func Content(scheme string, message NotificationMessage) string {
            let launch = scheme + "://goo-notification/activate?id=" + Uri.EscapeDataString(message.Id)
                + "&action=&data=" + Uri.EscapeDataString(message.Payload)
            return "<toast activationType=\"protocol\" launch=\"" + SecurityElement.Escape(launch)
                + "\"><visual><binding template=\"ToastGeneric\"><text>" + SecurityElement.Escape(message.Title)
                + "</text><text>" + SecurityElement.Escape(message.Body) + "</text></binding></visual></toast>"
        }

        internal func Open(identifier string, options NotificationOptions) NotificationServiceResult {
            if !OperatingSystem.IsWindowsVersionAtLeast(10) {
                return NotificationServiceResult(NotificationStatus.Unsupported)
            }
            let initialized = WindowsToastNative.RoInitialize(1u)
            if initialized < 0 && initialized != -2147417850 {
                return NotificationServiceResult(NotificationStatus.Failed, error: "WinRT initialization failed")
            }
            try {
                if !WindowsNotificationIdentity.Installed(identifier, options.ActivationScheme) {
                    return NotificationServiceResult(NotificationStatus.MissingIdentity,
                        error: "Install an AUMID shortcut with a stub toast CLSID and the private notification protocol")
                }
                WindowsToastNative.Check(WindowsNotificationIdentity.SetCurrentProcessExplicitAppUserModelID(identifier))
                return NotificationServiceResult(NotificationStatus.Success,
                    WindowsNotificationService(identifier, options.ActivationScheme))
            } catch (error COMException) {
                return NotificationServiceResult(NotificationStatus.Failed, error: error.Message)
            } catch (error IOException) {
                return NotificationServiceResult(NotificationStatus.MissingIdentity, error: error.Message)
            } catch (error UnauthorizedAccessException) {
                return NotificationServiceResult(NotificationStatus.MissingIdentity, error: error.Message)
            } finally {
                if initialized >= 0 { WindowsToastNative.RoUninitialize() }
            }
        }

        private func Tag(id string) string ->
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id))).Substring(0, 16)

        private func Failure(code int32, id string, submission bool) NotificationResult {
            let status = switch code {
                case -2147221164 or -2147467263 or -2147467262: NotificationStatus.Unsupported
                case -2147023728: NotificationStatus.MissingIdentity
                case -2147024891: NotificationStatus.Denied
                default: NotificationStatus.Failed
            }
            return NotificationResult(status, delivery: if submission { NotificationDelivery.Failed }
                else { NotificationDelivery.Unknown },
                activationSupport: NotificationActivationSupport.WarmAndCold, id: id,
                error: "Windows toast HRESULT 0x" + code.ToString("X8"))
        }
    }
}
