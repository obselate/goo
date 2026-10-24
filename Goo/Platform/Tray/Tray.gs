package Goo

import System
import System.Collections.Generic

/// Reports native tray registration, not whether the user can see the icon.
public enum TrayStatus {
    /// The native host accepted the icon.
    Registered;
    /// No tray host is available. The live icon registers when a host appears.
    NoHost;
    /// The platform or requested menu feature is not supported.
    Unsupported;
    /// The icon or its owner is closed.
    Closed;
    /// The native operation failed.
    Failed;
}

/// Describes a tray icon. Create and Update copy the pixels and menu before returning.
public class TrayOptions {
    /// Gets the stable icon identity. Use a globally unique name of at most 255 UTF-16 units.
    public prop Id string { get; init; }

    /// Gets the pixel width, from 1 to 512.
    public prop Width int32 { get; init; }

    /// Gets the pixel height, from 1 to 512.
    public prop Height int32 { get; init; }

    /// Gets Width * Height * 4 straight-alpha sRGB bytes in red, green, blue, alpha order.
    public prop Rgba IReadOnlyList[uint8] { get; init; }

    /// Gets the tooltip, with at most 127 UTF-16 units and no NUL characters. Hosts may hide it.
    public prop Tooltip string { get; init; }

    /// Gets the native menu. Include an Open command because some hosts consume primary clicks.
    public prop Menu IReadOnlyList[NativeMenuItem] { get; init; }

    /// Creates empty options. Set Id, Width, Height and Rgba before use.
    public init() {
        Id = ""
        Tooltip = ""
        Rgba = Array.Empty[uint8]()
        Menu = Array.Empty[NativeMenuItem]()
    }
}

/// Reports tray creation. NoHost can return a live Icon that observes host availability.
public class TrayResult {
    /// Gets the creation status.
    public prop Status TrayStatus { get; }

    /// Gets the owned icon for Registered or NoHost, otherwise nil.
    public prop Icon TrayIcon? { get; }

    /// Gets bounded native failure detail, or an empty string.
    public prop Error string { get; }

    internal init(status TrayStatus, icon TrayIcon? = nil, error string = "") {
        Status = status
        Icon = icon
        Error = if error.Length > 512 { error.Substring(0, 512) } else { error }
    }
}

/// Owns a native tray icon on an open desktop Window's UI thread.
/// @remarks Keep the owner open and pump its scheduler, even when it is hidden. Closing the last Window still ends Run.
/// Native callbacks are queued to the owner and do not run user code inside native menu tracking.
/// Android and embedded owners return Unsupported. Tray icons do not show notifications or launch a closed app.
public class TrayIcon : IDisposable {
    internal let Owner Window
    private let id string
    private var backend TrayBackend?
    private var status TrayStatus

    /// Gets the current registration status on the owner UI thread.
    public prop Status TrayStatus { get -> status }

    /// Occurs on the owner UI thread when registration changes.
    public event StatusChanged Action[TrayStatus]

    /// Occurs on the owner UI thread after native primary activation. A menu can consume this gesture.
    public event Activated Action

    /// Occurs on the owner UI thread after a native menu selects a stable item ID.
    public event CommandActivated Action[string]

    private init(owner Window, identity string) {
        Owner = owner
        id = identity
    }

    /// Replaces icon pixels, tooltip and menu. Id must remain unchanged.
    /// @param options The replacement pixels, tooltip and menu.
    /// @returns The native update status.
    /// @remarks A failed update does not dispose the icon. StatusChanged reports later host changes.
    public func Update(options TrayOptions) TrayStatus {
        Owner.RequireNativeServiceThread()
        if status == TrayStatus.Closed { return TrayStatus.Closed }
        let content = TrayContent(options)
        if content.Id != id { throw ArgumentException("A tray icon's Id cannot change", "options") }
        let result = backend!!.Update(content, options.Rgba)
        if result != TrayStatus.Failed && result != TrayStatus.Unsupported { SetStatus(result) }
        return result
    }

    /// Unregisters the icon on its owner UI thread. Repeated calls have no effect.
    public func Dispose() {
        Owner.RequireNativeServiceThread()
        if status == TrayStatus.Closed { return }
        Owner.NativeWindowClosing -= Dispose
        backend?.Dispose()
        backend = nil
        SetStatus(TrayStatus.Closed)
    }

    internal func SetStatus(value TrayStatus) {
        if status == value { return }
        status = value
        StatusChanged?.Invoke(value)
    }

    internal func PostStatus(value TrayStatus) {
        Owner.TryPost(() -> { if status != TrayStatus.Closed { SetStatus(value) } })
    }

    internal func PostActivation(nativeToken string? = nil) {
        Owner.TryPost(() -> {
            if status == TrayStatus.Closed || Owner.NativeOwnerClosing { return }
            let previous = Window.CurrentActivationToken
            Window.CurrentActivationToken = nativeToken
            try { Activated?.Invoke() }
            finally { Window.CurrentActivationToken = previous }
        })
    }

    internal func PostCommand(itemId string, nativeToken string? = nil) {
        Owner.TryPost(() -> {
            if status == TrayStatus.Closed || Owner.NativeOwnerClosing { return }
            let previous = Window.CurrentActivationToken
            Window.CurrentActivationToken = nativeToken
            try { CommandActivated?.Invoke(itemId) }
            finally { Window.CurrentActivationToken = previous }
        })
    }

    shared {
        /// Creates an icon for an open desktop owner. Native failures return a typed result.
        /// @param owner The open desktop window that owns the icon and its callbacks.
        /// @param options The icon identity, pixels, tooltip and menu.
        /// @returns A typed registration result with an owned icon when the host can be observed.
        /// @remarks Call on the owner UI thread. KDE supports StatusNotifierItem. GNOME needs an installed SNI extension.
        /// Registration does not prove visibility. This method does not install or enable a tray host.
        public func Create(owner Window, options TrayOptions) TrayResult {
            ArgumentNullException.ThrowIfNull(owner)
            owner.RequireNativeServiceThread()
            if !owner.IsOpen || owner.NativeOwnerClosing { return TrayResult(TrayStatus.Closed) }
            if owner.BorrowNativeWindow() == nint(0) || OperatingSystem.IsAndroid() {
                return TrayResult(TrayStatus.Unsupported)
            }
            let content = TrayContent(options)
            let icon = TrayIcon(owner, content.Id)
            var result = TrayStatus.Unsupported
            var error = ""
            if OperatingSystem.IsWindows() {
                icon.backend = WindowsTrayBackend.Create(icon, content, options.Rgba, out result, out error)
            } else if OperatingSystem.IsMacOS() {
                icon.backend = MacTrayBackend.Create(icon, content, options.Rgba, out result, out error)
            } else if OperatingSystem.IsLinux() {
                icon.backend = LinuxTrayBackend.Create(icon, content, options.Rgba, out result, out error)
            }
            icon.status = result
            if icon.backend == nil { return TrayResult(result, error: error) }
            owner.NativeWindowClosing += icon.Dispose
            return TrayResult(result, icon, error)
        }
    }
}

internal interface TrayBackend : IDisposable {
    func Update(content TrayContent, pixels IReadOnlyList[uint8]) TrayStatus;
}

internal class TrayContent {
    internal let Id string
    internal let Width int32
    internal let Height int32
    internal let Tooltip string
    internal let Menu NativeMenuSnapshot

    internal init(options TrayOptions) {
        ArgumentNullException.ThrowIfNull(options)
        ArgumentNullException.ThrowIfNull(options.Id)
        ArgumentNullException.ThrowIfNull(options.Rgba)
        ArgumentNullException.ThrowIfNull(options.Tooltip)
        if options.Id.Length == 0 || options.Id.Length > MaxIdUnits || options.Id.Contains(char(0)) {
            throw ArgumentException("Id must contain 1 to 255 UTF-16 units and no NUL", "options")
        }
        if options.Width <= 0 || options.Width > MaxIconDimension || options.Height <= 0
            || options.Height > MaxIconDimension || options.Rgba.Count != options.Width * options.Height * 4 {
            throw ArgumentException("Rgba must contain Width * Height * 4 bytes, with dimensions from 1 to 512", "options")
        }
        if options.Tooltip.Length > MaxTooltipUnits || options.Tooltip.Contains(char(0)) {
            throw ArgumentException("Tooltip must contain at most 127 UTF-16 units and no NUL", "options")
        }
        Id = options.Id
        Width = options.Width
        Height = options.Height
        Tooltip = options.Tooltip
        Menu = NativeMenuSnapshot(options.Menu)
    }

    shared {
        private const MaxIdUnits int32 = 255
        private const MaxTooltipUnits int32 = 127
        private const MaxIconDimension int32 = 512
    }
}
