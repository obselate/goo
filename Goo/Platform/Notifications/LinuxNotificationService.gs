package Goo

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Tmds.DBus.Protocol

internal class LinuxNotificationEntry {
    internal let Message NotificationMessage
    internal let NativeId uint32
    internal var Token string?
    internal var Error string = ""

    internal init(message NotificationMessage, nativeId uint32) {
        Message = message
        NativeId = nativeId
    }
}

internal data struct LinuxNotificationSignal {
    internal prop Id uint32 { get; init; }
    internal prop Text string { get; init; }
}

internal class LinuxNotificationService : NotificationService {
    private let connection DBusConnection
    private let identifier string
    private let gate object = Object()
    private let requests SemaphoreSlim = SemaphoreSlim(1, 1)
    private let entries Dictionary[string, LinuxNotificationEntry] = Dictionary[string, LinuxNotificationEntry](StringComparer.Ordinal)
    private let nativeEntries Dictionary[uint32, LinuxNotificationEntry] = Dictionary[uint32, LinuxNotificationEntry]()
    private let observers List[IDisposable] = List[IDisposable]()
    private var watcher NameOwnerWatcher?
    private var destination string = Service
    private var actions bool
    private var markup bool
    private var disposed bool

    private init(identifier string, address string) {
        this.identifier = identifier
        connection = DBusConnection(address)
    }

    private async func StartAsync() Task {
        await connection.ConnectAsync().ConfigureAwait(false)
        let capabilities = await GetCapabilitiesAsync().ConfigureAwait(false)
        actions = Array.IndexOf(capabilities, "actions") >= 0
        markup = Array.IndexOf(capabilities, "body-markup") >= 0
        let owner = await connection.WatchNameOwnerAsync(Service).ConfigureAwait(false)
        watcher = owner
        destination = owner.GetCurrentOwner() ?? throw InvalidOperationException("The notification service has no owner")
        observers.Add(await connection.AddMatchAsync[LinuxNotificationSignal](
            Rule("ActionInvoked"), ReadSignal, OnAction, emitOnCapturedContext: false).ConfigureAwait(false))
        observers.Add(await connection.AddMatchAsync[LinuxNotificationSignal](
            Rule("ActivationToken"), ReadSignal, OnToken, emitOnCapturedContext: false).ConfigureAwait(false))
        observers.Add(await connection.AddMatchAsync[uint32](
            Rule("NotificationClosed"), ReadId, OnClosed, emitOnCapturedContext: false).ConfigureAwait(false))
    }

    private func Rule(member string) MatchRule -> MatchRule {
        Type: MessageType.Signal, Sender: destination, Path: Path, Interface: Service, Member: member,
    }

    private func GetCapabilitiesAsync() Task[[]string] {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(destination, Path, Service, "GetCapabilities")
        return connection.CallMethodAsync[[]string](writer.CreateMessage(), ReadCapabilities)
    }

    private func NotifyAsync(message NotificationMessage, previous uint32) Task[uint32] {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(destination, Path, Service, "Notify", "susssasa{sv}i")
        writer.WriteString(identifier)
        writer.WriteUInt32(previous)
        writer.WriteString("")
        writer.WriteString(message.Title)
        writer.WriteString(if markup { message.Body.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;") }
            else { message.Body })
        writer.WriteArray(if actions { []string{"default", "Open"} } else { Array.Empty[string]() })
        let hints = writer.WriteDictionaryStart()
        writer.WriteDictionaryEntryStart()
        writer.WriteString("desktop-entry")
        writer.WriteVariantString(identifier)
        writer.WriteDictionaryEnd(hints)
        writer.WriteInt32(-1)
        return connection.CallMethodAsync[uint32](writer.CreateMessage(), ReadId)
    }

    private func CloseAsync(id uint32) Task {
        using let writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(destination, Path, Service, "CloseNotification", "u")
        writer.WriteUInt32(id)
        return connection.CallMethodAsync(writer.CreateMessage())
    }

    private func Result(status NotificationStatus = NotificationStatus.Success,
        delivery NotificationDelivery = NotificationDelivery.Unknown, id string = "", error string = "") NotificationResult ->
        NotificationResult(status, NotificationPermission.Unknown, delivery,
            if actions { NotificationActivationSupport.WarmOnly } else { NotificationActivationSupport.None }, id, error)

    private func RequireOpen() {
        lock gate {
            if disposed { throw ObjectDisposedException("NotificationService") }
        }
    }

    public func GetPermissionAsync() Task[NotificationResult] {
        RequireOpen()
        return Task.FromResult(Result())
    }

    public func RequestPermissionAsync() Task[NotificationResult] -> GetPermissionAsync()

    public async func ShowAsync(message NotificationMessage) Task[NotificationResult] {
        ArgumentNullException.ThrowIfNull(message)
        message.Validate()
        RequireOpen()
        await requests.WaitAsync().ConfigureAwait(false)
        try {
            RequireOpen()
            var previous uint32 = 0
            lock gate {
                if entries.TryGetValue(message.Id, out let entry) { previous = entry.NativeId }
            }
            let id = await NotifyAsync(message, previous).ConfigureAwait(false)
            if id == 0 { return Result(NotificationStatus.Failed, error: "The notification service returned an invalid ID") }
            lock gate {
                if disposed { throw ObjectDisposedException("NotificationService") }
                if entries.TryGetValue(message.Id, out let old) { nativeEntries.Remove(old.NativeId) }
                let entry = LinuxNotificationEntry(message, id)
                entries[message.Id] = entry
                nativeEntries[id] = entry
            }
            return Result(NotificationStatus.Accepted, NotificationDelivery.Accepted, message.Id)
        } catch (error DBusExceptionBase) {
            return Result(NotificationStatus.Failed, NotificationDelivery.Failed, message.Id, error.Message)
        } finally {
            requests.Release()
        }
    }

    public func GetStatusAsync(id string) Task[NotificationResult] {
        NotificationMessage.ValidateId(id)
        RequireOpen()
        lock gate {
            if watcher!!.GetOwnerChangedCancellationToken(destination).IsCancellationRequested {
                return Task.FromResult(Result(NotificationStatus.Failed, id: id,
                    error: "The notification service owner changed. Reopen the service"))
            }
            if entries.TryGetValue(id, out let entry) && entry.Error.Length != 0 {
                return Task.FromResult(Result(NotificationStatus.Failed, id: id, error: entry.Error))
            }
        }
        return Task.FromResult(Result(id: id))
    }

    public async func RemoveAsync(id string) Task[NotificationResult] {
        NotificationMessage.ValidateId(id)
        RequireOpen()
        await requests.WaitAsync().ConfigureAwait(false)
        try {
            RequireOpen()
            var nativeId uint32 = 0
            lock gate {
                if entries.TryGetValue(id, out let entry) { nativeId = entry.NativeId }
            }
            if nativeId == 0 { return Result(id: id) }
            await CloseAsync(nativeId).ConfigureAwait(false)
            Forget(nativeId)
            return Result(NotificationStatus.Accepted, NotificationDelivery.Removed, id)
        } catch (error DBusExceptionBase) {
            return Result(NotificationStatus.Failed, id: id, error: error.Message)
        } finally {
            requests.Release()
        }
    }

    private func OnToken(notification Notification[LinuxNotificationSignal]) {
        if !notification.HasValue { return }
        let signal = notification.Value
        if signal.Text.Length > ApplicationActivation.MaxNativeTokenBytes { return }
        lock gate {
            if !disposed && nativeEntries.TryGetValue(signal.Id, out let entry) { entry.Token = signal.Text }
        }
    }

    private func OnAction(notification Notification[LinuxNotificationSignal]) {
        if !notification.HasValue { return }
        let signal = notification.Value
        if signal.Text != "default" { return }
        lock gate {
            if disposed || !nativeEntries.TryGetValue(signal.Id, out let entry) { return }
            let posted = Window.PostApplicationActivation(ApplicationActivation {
                Kind: ApplicationActivationKind.Notification, NotificationId: entry.Message.Id,
                Payload: entry.Message.Payload, NativeActivationToken: entry.Token,
            })
            entry.Token = nil
            if posted != ActivationPostStatus.Accepted { entry.Error = "Notification activation was not queued: " + posted.ToString() }
        }
    }

    private func OnClosed(notification Notification[uint32]) {
        if notification.HasValue { Forget(notification.Value) }
    }

    private func Forget(nativeId uint32) {
        lock gate {
            if nativeEntries.Remove(nativeId, out let entry) { entries.Remove(entry.Message.Id) }
        }
    }

    public func Dispose() {
        lock gate {
            if disposed { return }
            disposed = true
            nativeEntries.Clear()
            entries.Clear()
        }
        for observer in observers { observer.Dispose() }
        watcher?.Dispose()
        connection.Dispose()
    }

    shared {
        private const Service string = "org.freedesktop.Notifications"
        private const Path string = "/org/freedesktop/Notifications"

        internal func Open(identifier string, options NotificationOptions) NotificationServiceResult {
            let address = DBusAddress.Session
            if string.IsNullOrEmpty(address) { return NotificationServiceResult(NotificationStatus.Unsupported) }
            let service = LinuxNotificationService(identifier, address)
            try {
                service.StartAsync().GetAwaiter().GetResult()
                return NotificationServiceResult(NotificationStatus.Success, service)
            } catch (error DBusErrorReplyException) {
                service.Dispose()
                let status = if error.ErrorName == "org.freedesktop.DBus.Error.AccessDenied" { NotificationStatus.Denied }
                    else if error.ErrorName == "org.freedesktop.DBus.Error.ServiceUnknown"
                        || error.ErrorName == "org.freedesktop.DBus.Error.NameHasNoOwner"
                        || error.ErrorName == "org.freedesktop.DBus.Error.UnknownMethod" { NotificationStatus.Unsupported }
                    else { NotificationStatus.Failed }
                return NotificationServiceResult(status, error: error.Message)
            } catch (error DBusExceptionBase) {
                service.Dispose()
                return NotificationServiceResult(NotificationStatus.Failed, error: error.Message)
            } catch (error InvalidOperationException) {
                service.Dispose()
                return NotificationServiceResult(NotificationStatus.Failed, error: error.Message)
            }
        }

        private func ReadCapabilities(message Message, state object?) []string {
            var reader = message.GetBodyReader()
            return reader.ReadArrayOfString()
        }

        private func ReadId(message Message, state object?) uint32 {
            var reader = message.GetBodyReader()
            return reader.ReadUInt32()
        }

        private func ReadSignal(message Message, state object?) LinuxNotificationSignal {
            var reader = message.GetBodyReader()
            return LinuxNotificationSignal { Id: reader.ReadUInt32(), Text: reader.ReadString() }
        }
    }
}
