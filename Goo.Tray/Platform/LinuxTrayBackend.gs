package Goo

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Channels
import System.Threading.Tasks
import Tmds.DBus.Protocol

internal partial class LinuxTrayBackend : TrayBackend, IPathMethodHandler {
    private let icon TrayIcon
    private let connection DBusConnection
    private let stop CancellationTokenSource
    private let changes Channel[uint8]
    private let ready TaskCompletionSource[TrayStatus]
    private let subscriptions List[IDisposable]
    private let service string
    private var current LinuxTrayState
    private var run Task?
    private var nextMenuId int32
    private var closed int32
    private var connected int32
    private var registration int32
    private var token string?
    private var tokenSender string?

    public prop Path string { get -> ItemPath }

    public prop HandlesChildPaths bool { get -> true }

    private init(owner TrayIcon, content TrayContent, pixels IReadOnlyList[uint8], address string) {
        icon = owner
        stop = CancellationTokenSource()
        let options = BoundedChannelOptions(1)
        options.FullMode = BoundedChannelFullMode.DropWrite
        options.SingleReader = true
        changes = Channel.CreateBounded[uint8](options)
        ready = TaskCompletionSource[TrayStatus](TaskCreationOptions.RunContinuationsAsynchronously)
        subscriptions = List[IDisposable](2)
        service = "org.kde.StatusNotifierItem-" + Environment.ProcessId.ToString() + "-"
            + Interlocked.Increment(ref nextService).ToString()
        current = LinuxTrayState(content, pixels, nil, ref nextMenuId)
        let configuration = DBusConnectionOptions(address)
        configuration.OnException = OnBusException
        connection = DBusConnection(configuration)
    }

    public func Update(content TrayContent, pixels IReadOnlyList[uint8]) TrayStatus {
        if Volatile.Read(ref closed) != 0 { return TrayStatus.Closed }
        if Volatile.Read(ref connected) == 0 { return TrayStatus.Failed }
        var next LinuxTrayState
        try { next = LinuxTrayState(content, pixels, Volatile.Read(ref current), ref nextMenuId) }
        catch (error OverflowException) { return TrayStatus.Unsupported }
        Volatile.Write(ref current, next)
        try {
            if !Signal(ItemPath, ItemInterface, "NewIcon") || !Signal(ItemPath, ItemInterface, "NewToolTip")
                || !Signal(ItemPath, ItemInterface, "NewTitle") || !Signal(ItemPath, ItemInterface, "NewMenu")
                || !LayoutUpdated(next.Revision) {
                return TrayStatus.Failed
            }
            return TrayStatus(Volatile.Read(ref registration))
        } catch (error DBusConnectionException) {
            return TrayStatus.Failed
        } catch (error ObjectDisposedException) {
            return TrayStatus.Failed
        }
    }

    public func Dispose() {
        if Interlocked.Exchange(ref closed, 1) != 0 { return }
        stop.Cancel()
        connection.Dispose()
        run?.GetAwaiter().GetResult()
        stop.Dispose()
    }

    private func OnBusException(context DBusConnection.ExceptionContext) {
        if context.Source == DBusConnection.ExceptionSource.ConnectionFailed { changes.Writer.TryWrite(uint8(0)) }
    }

    private func OnHostSignal(value Notification) {
        if !value.IsCompletion { changes.Writer.TryWrite(uint8(0)) }
    }

    private func WatchHost(member string) ValueTask[IDisposable] {
        let rule = MatchRule{
            Type: MessageType.Signal, Sender: WatcherName, Path: WatcherPath, Interface: WatcherInterface, Member: member
        }
        return connection.AddMatchAsync(rule, OnHostSignal, emitOnCapturedContext: false)
    }

    private async func RunAsync() {
        try {
            await connection.ConnectAsync().ConfigureAwait(false)
            connection.AddMethodHandler(this)
            if !await connection.TryRequestNameAsync(service, RequestNameOptions.None).ConfigureAwait(false) {
                ready.TrySetResult(TrayStatus.Failed)
                return
            }
            using let watcher = await connection.WatchNameOwnerAsync(WatcherName).ConfigureAwait(false)
            subscriptions.Add(await WatchHost("StatusNotifierHostRegistered").ConfigureAwait(false))
            subscriptions.Add(await WatchHost("StatusNotifierHostUnregistered").ConfigureAwait(false))
            Volatile.Write(ref connected, 1)
            var registeredOwner string? = nil
            while !stop.IsCancellationRequested {
                var owner = watcher.GetCurrentOwner()
                if owner == nil {
                    ReportRegistration(TrayStatus.NoHost)
                    owner = await watcher.WaitForOwnerAsync(stop.Token).ConfigureAwait(false)
                }
                using let changed = watcher.GetOwnerChangedCancellationToken(owner).Register(
                    () -> { changes.Writer.TryWrite(uint8(0)) })
                try {
                    if owner != registeredOwner {
                        await RegisterItem(owner).WaitAsync(CallTimeout, stop.Token).ConfigureAwait(false)
                        registeredOwner = owner
                    }
                    let hasHost = await ReadHost(owner).WaitAsync(CallTimeout, stop.Token).ConfigureAwait(false)
                    ReportRegistration(if hasHost { TrayStatus.Registered } else { TrayStatus.NoHost })
                    await changes.Reader.ReadAsync(stop.Token).ConfigureAwait(false)
                } catch (error DBusOwnerChangedException) { }
            }
        } catch (error OperationCanceledException) {
            if Volatile.Read(ref closed) == 0 { ReportRegistration(TrayStatus.Failed) }
        } catch (error DBusExceptionBase) { ReportRegistration(TrayStatus.Failed) }
        catch (error TimeoutException) { ReportRegistration(TrayStatus.Failed) }
        catch (error ObjectDisposedException) {
            if Volatile.Read(ref closed) == 0 { ReportRegistration(TrayStatus.Failed) }
        } finally {
            Volatile.Write(ref connected, 0)
            ready.TrySetResult(TrayStatus.Failed)
            for subscription in subscriptions { subscription.Dispose() }
            connection.Dispose()
        }
    }

    private func ReportRegistration(value TrayStatus) {
        Volatile.Write(ref registration, int32(value))
        if !ready.TrySetResult(value) && Volatile.Read(ref closed) == 0 { icon.PostStatus(value) }
    }

    private func RegisterItem(owner string) Task {
        using var writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(owner, WatcherPath, WatcherInterface, "RegisterStatusNotifierItem", "s",
            MessageFlags.NoAutoStart)
        writer.WriteString(service)
        return connection.CallMethodAsync(writer.CreateMessage())
    }

    private func ReadHost(owner string) Task[bool] {
        using var writer = connection.GetMessageWriter()
        writer.WriteMethodCallHeader(owner, WatcherPath, PropertiesInterface, "Get", "ss", MessageFlags.NoAutoStart)
        writer.WriteString(WatcherInterface)
        writer.WriteString("IsStatusNotifierHostRegistered")
        return connection.CallMethodAsync[bool](writer.CreateMessage(), ReadHostValue)
    }

    private func Signal(path string, iface string, member string) bool {
        using var writer = connection.GetMessageWriter()
        writer.WriteSignalHeader(nil, path, iface, member, "")
        return connection.TrySendMessage(writer.CreateMessage())
    }

    private func LayoutUpdated(revision uint32) bool {
        using var writer = connection.GetMessageWriter()
        writer.WriteSignalHeader(nil, MenuPath, MenuInterface, "LayoutUpdated", "ui")
        writer.WriteUInt32(revision)
        writer.WriteInt32(0)
        return connection.TrySendMessage(writer.CreateMessage())
    }

    shared {
        private const ItemPath string = "/StatusNotifierItem"
        private const MenuPath string = "/StatusNotifierItem/Menu"
        private const ItemInterface string = "org.kde.StatusNotifierItem"
        private const MenuInterface string = "com.canonical.dbusmenu"
        private const PropertiesInterface string = "org.freedesktop.DBus.Properties"
        private const WatcherName string = "org.kde.StatusNotifierWatcher"
        private const WatcherPath string = "/StatusNotifierWatcher"
        private const WatcherInterface string = "org.kde.StatusNotifierWatcher"
        private let CallTimeout TimeSpan = TimeSpan.FromSeconds(3)
        private var nextService int32

        internal func Create(icon TrayIcon, content TrayContent, pixels IReadOnlyList[uint8],
            out status TrayStatus, out error string) TrayBackend? {
            status = TrayStatus.Failed
            error = ""
            let address = DBusAddress.Session
            if string.IsNullOrEmpty(address) {
                error = "The user session D-Bus address is unavailable"
                return nil
            }
            let result = LinuxTrayBackend(icon, content, pixels, address)
            result.run = Task.Run(result.RunAsync)
            try { status = result.ready.Task.WaitAsync(CallTimeout).GetAwaiter().GetResult() }
            catch (failure TimeoutException) { error = "The session D-Bus tray startup timed out" }
            if status != TrayStatus.Registered && status != TrayStatus.NoHost {
                result.Dispose()
                if error == "" { error = "The session D-Bus tray registration failed" }
                return nil
            }
            return result
        }

        private func ReadHostValue(message Message, state object?) bool {
            var reader = message.GetBodyReader()
            reader.ReadSignature("b")
            return reader.ReadBool()
        }
    }
}
