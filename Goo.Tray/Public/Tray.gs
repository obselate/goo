package Goo

import System
import System.Collections.Generic

/// <summary>Reports native tray registration, not whether the user can see the icon.</summary>
public enum TrayStatus {
    /// <summary>The native host accepted the icon.</summary>
    Registered;
    /// <summary>No tray host is available. The live icon registers when a host appears.</summary>
    NoHost;
    /// <summary>The platform or requested menu feature is not supported.</summary>
    Unsupported;
    /// <summary>The icon or its owner is closed.</summary>
    Closed;
    /// <summary>The native operation failed.</summary>
    Failed;
}

/// <summary>Describes a tray icon. Create and Update copy the pixels and menu before returning.</summary>
public class TrayOptions {
    /// <summary>Gets the stable icon identity. Use a globally unique name of at most 255 UTF-16 units.</summary>
    public prop Id string { get; init; }

    /// <summary>Gets the pixel width, from 1 to 512.</summary>
    public prop Width int32 { get; init; }

    /// <summary>Gets the pixel height, from 1 to 512.</summary>
    public prop Height int32 { get; init; }

    /// <summary>Gets Width * Height * 4 straight-alpha sRGB bytes in red, green, blue, alpha order.</summary>
    public prop Rgba IReadOnlyList[uint8] { get; init; }

    /// <summary>Gets the tooltip, with at most 127 UTF-16 units and no NUL characters. Hosts may hide it.</summary>
    public prop Tooltip string { get; init; }

    /// <summary>Gets the native menu. Include an Open command because some hosts consume primary clicks.</summary>
    public prop Menu IReadOnlyList[NativeMenuItem] { get; init; }

    /// <summary>Creates empty options. Set Id, Width, Height and Rgba before use.</summary>
    public init() {
        Id = ""
        Tooltip = ""
        Rgba = Array.Empty[uint8]()
        Menu = Array.Empty[NativeMenuItem]()
    }
}

/// <summary>Reports tray creation. NoHost can return a live Icon that observes host availability.</summary>
public class TrayResult {
    /// <summary>Gets the creation status.</summary>
    public prop Status TrayStatus { get; }

    /// <summary>Gets the owned icon for Registered or NoHost, otherwise nil.</summary>
    public prop Icon TrayIcon? { get; }

    /// <summary>Gets bounded native failure detail, or an empty string.</summary>
    public prop Error string { get; }

    internal init(status TrayStatus, icon TrayIcon? = nil, error string = "") {
        Status = status
        Icon = icon
        Error = if error.Length > 512 { error.Substring(0, 512) } else { error }
    }
}

/// <summary>Owns a native tray icon on an open desktop Window's UI thread.</summary>
/// <remarks>
/// Keep the owner open and pump its scheduler, even when it is hidden. Closing the last Window still ends Run.
/// Native callbacks are queued to the owner and do not run user code inside native menu tracking.
/// Android and embedded owners return Unsupported. This package does not show notifications or launch a closed app.
/// </remarks>
public class TrayIcon : IDisposable {
    internal let Owner Window
    private let id string
    private var backend TrayBackend?
    private var status TrayStatus

    /// <summary>Gets the current registration status on the owner UI thread.</summary>
    public prop Status TrayStatus { get -> status }

    /// <summary>Occurs on the owner UI thread when registration changes.</summary>
    public event StatusChanged Action[TrayStatus]

    /// <summary>Occurs on the owner UI thread after native primary activation. A menu can consume this gesture.</summary>
    public event Activated Action

    /// <summary>Occurs on the owner UI thread after a native menu selects a stable item ID.</summary>
    public event CommandActivated Action[string]

    private init(owner Window, identity string) {
        Owner = owner
        id = identity
    }

    /// <summary>Replaces icon pixels, tooltip and menu. Id must remain unchanged.</summary>
    /// <remarks>A failed update does not dispose the icon. StatusChanged reports later host changes.</remarks>
    public func Update(options TrayOptions) TrayStatus {
        Owner.RequireNativeServiceThread()
        if status == TrayStatus.Closed { return TrayStatus.Closed }
        let content = TrayContent(options)
        if content.Id != id { throw ArgumentException("A tray icon's Id cannot change", "options") }
        let result = backend!!.Update(content, options.Rgba)
        if result != TrayStatus.Failed && result != TrayStatus.Unsupported { SetStatus(result) }
        return result
    }

    /// <summary>Unregisters the icon on its owner UI thread. Repeated calls have no effect.</summary>
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
        /// <summary>Creates an icon for an open desktop owner. Native failures return a typed result.</summary>
        /// <remarks>
        /// Call on the owner UI thread. KDE supports StatusNotifierItem. GNOME needs an installed SNI extension.
        /// Registration does not prove visibility. This method does not install or enable a tray host.
        /// </remarks>
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
