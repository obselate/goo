package Goo

import System
import System.Collections.Generic
import System.Text
import System.Threading.Tasks

/// Reports the outcome of a native menu operation.
public enum NativeMenuStatus { Success; Cancelled; Unsupported; Busy; OwnerClosed; Failed }

/// Describes one logical printable key and its exact modifiers.
public data struct NativeMenuShortcut {
    /// Gets the single printable Unicode scalar used as the native key equivalent.
    public prop Key string { get; init; }
    /// Gets the modifiers. Super means Command on macOS.
    public prop Modifiers KeyModifiers { get; init; }
}

/// Describes one immutable native menu row. Publishing copies the complete model.
public sealed class NativeMenuItem {
    /// Gets the unique action identifier. Separators have an empty identifier.
    public prop Id string { get; init; }
    /// Gets the native row title.
    public prop Text string { get; init; }
    /// Gets whether the row can be selected. The default is true.
    public prop Enabled bool { get; init; }
    /// Gets whether the native checked indicator is present.
    public prop Checked bool { get; init; }
    /// Gets whether this row is a separator with no action or children.
    public prop Separator bool { get; init; }
    /// Gets the executable native accelerator, or no accelerator.
    public prop Shortcut NativeMenuShortcut? { get; init; }
    /// Gets the child rows. The default is empty.
    public prop Items IReadOnlyList[NativeMenuItem] { get; init; }
    /// Creates an enabled row with empty text, identifier and children.
    public init() {
        Id = ""
        Text = ""
        Enabled = true
        Items = Array.Empty[NativeMenuItem]()
    }
}

/// Contains an explicit native menu outcome.
public sealed class NativeMenuResult {
    /// Gets the operation status.
    public prop Status NativeMenuStatus { get; }
    /// Gets the selected context-menu identifier, or an empty string for all other outcomes.
    public prop ItemId string { get; }
    /// Gets copied native failure details, or an empty string.
    public prop Error string { get; }

    internal init(status NativeMenuStatus, itemId string = "", error string = "") {
        Status = status
        ItemId = itemId
        Error = error
    }
}

/// Owns one native bar for an open Window. Operations are owner-thread-affine.
public sealed class NativeMenuBar : IDisposable {
    private let owner Window
    private var binding NativeMenuBinding?
    private var windowsBinding WindowsMenuBinding?
    private var disposed bool
    /// Reports a selected bar identifier on the owner's Goo queue after native dispatch.
    public event Activated Action[string]

    /// Binds a bar to an open owner. Unsupported platforms report Unsupported from SetItems.
    /// @param owner The open owner window on its UI thread.
    public init(owner Window) {
        if owner == nil { throw ArgumentNullException("owner") }
        owner.RequireNativeServiceThread()
        if !owner.IsOpen { throw InvalidOperationException("A native menu bar requires an open owner") }
        this.owner = owner
    }

    /// Replaces the complete snapshot. Duplicate identifiers and shortcuts are argument errors.
    /// @param items The complete menu model. Use an empty list to remove document menus.
    /// @returns Success with an empty ItemId, or an explicit platform or lifetime status.
    public func SetItems(items IReadOnlyList[NativeMenuItem]) NativeMenuResult {
        owner.RequireNativeServiceThread()
        ObjectDisposedException.ThrowIf(disposed, this)
        let snapshot = NativeMenuSnapshot(items)
        if !owner.IsOpen { return NativeMenuResult(NativeMenuStatus.OwnerClosed) }
        if OperatingSystem.IsWindows() {
            windowsBinding ??= WindowsMenuBinding(owner, id -> Activated?.Invoke(id))
            return windowsBinding!!.SetItems(snapshot)
        }
        if !OperatingSystem.IsMacOS() { return NativeMenuResult(NativeMenuStatus.Unsupported) }
        binding ??= NativeMenuBinding(owner, id -> Activated?.Invoke(id))
        return binding!!.SetItems(snapshot)
    }

    /// Detaches this bar and releases its native handles on the owner thread.
    public func Dispose() {
        owner.RequireNativeServiceThread()
        if disposed { return }
        disposed = true
        binding?.Dispose()
        binding = nil
        windowsBinding?.Dispose()
        windowsBinding = nil
    }
}

/// Opens operating-system context menus. No managed-widget fallback is implicit.
public sealed class NativeMenus {
    shared {
        /// Queues native tracking on the owner thread. Desktop tracking blocks the Goo scheduler.
        /// @param owner The open owner on its UI thread.
        /// @param point The anchor in owner-content Goo layout coordinates.
        /// @param items The complete menu model, copied before native launch.
        /// @returns Selection or cancellation through the task only, never a bar activation event.
        public func ShowContextMenuAsync(owner Window, point Point,
            items IReadOnlyList[NativeMenuItem]) Task[NativeMenuResult] {
            if owner == nil { throw ArgumentNullException("owner") }
            owner.RequireNativeServiceThread()
            if !Double.IsFinite(point.X) || !Double.IsFinite(point.Y) {
                throw ArgumentOutOfRangeException("point")
            }
            let snapshot = NativeMenuSnapshot(items)
            if !owner.IsOpen { return Task.FromResult(NativeMenuResult(NativeMenuStatus.OwnerClosed)) }
            if OperatingSystem.IsAndroid() { return AndroidMenuBridge.Show(owner, point, snapshot) }
            if !OperatingSystem.IsMacOS() && !OperatingSystem.IsWindows() {
                return Task.FromResult(NativeMenuResult(NativeMenuStatus.Unsupported))
            }
            let lease = owner.BeginNativeModal(out var status)
            if lease == nil {
                return Task.FromResult(NativeMenuResult(if status == NativeModalStatus.Busy {
                    NativeMenuStatus.Busy
                } else { NativeMenuStatus.OwnerClosed }))
            }
            let completion = TaskCompletionSource[NativeMenuResult](TaskCreationOptions.RunContinuationsAsynchronously)
            let launch Action = () -> {
                var result = NativeMenuResult(NativeMenuStatus.OwnerClosed)
                try {
                    if !lease.IsOwnerClosing {
                        result = if OperatingSystem.IsWindows() { WindowsMenuBridge.ShowContext(owner, point, snapshot, lease) }
                            else { MacMenuBridge.ShowContext(owner, point, snapshot, lease) }
                    }
                } catch (error Exception) {
                    result = NativeMenuResult(NativeMenuStatus.Failed, error: error.Message)
                } finally {
                    let closed = lease.IsOwnerClosing
                    lease.Dispose()
                    completion.TrySetResult(if closed || !owner.IsOpen { NativeMenuResult(NativeMenuStatus.OwnerClosed) } else { result })
                }
            }
            lease.Closing = launch
            if !owner.TryPost(launch) {
                lease.Dispose()
                completion.TrySetResult(NativeMenuResult(NativeMenuStatus.OwnerClosed))
            }
            return completion.Task
        }
    }
}

internal sealed class NativeMenuSnapshot {
    internal let Items IReadOnlyList[NativeMenuItem]
    internal let Actions List[NativeMenuItem] = List[NativeMenuItem]()
    internal let Tags Dictionary[string, int32] = Dictionary[string, int32](StringComparer.Ordinal)
    private let ids HashSet[string] = HashSet[string](StringComparer.Ordinal)
    private let shortcuts HashSet[string] = HashSet[string](StringComparer.Ordinal)

    internal init(items IReadOnlyList[NativeMenuItem]) {
        if items == nil { throw ArgumentNullException("items") }
        Items = Copy(items, HashSet[NativeMenuItem]())
    }

    private func Copy(items IReadOnlyList[NativeMenuItem], path HashSet[NativeMenuItem], enabled bool = true) IReadOnlyList[NativeMenuItem] {
        let copy = [items.Count]NativeMenuItem
        for i in 0 ... items.Count {
            let item = items[i]
            if item == nil || item.Items == nil || item.Text == nil || item.Id == nil || !path.Add(item) {
                throw ArgumentException("Menu rows must be nonnull and acyclic", "items")
            }
            if item.Text.Contains('\0') || item.Id.Contains('\0') {
                throw ArgumentException("Menu identifiers and titles cannot contain NUL", "items")
            }
            if item.Separator {
                if item.Id != "" || item.Items.Count != 0 || item.Shortcut != nil {
                    throw ArgumentException("Separators have no identifier, children or shortcut", "items")
                }
            } else if string.IsNullOrWhiteSpace(item.Id) || !ids.Add(item.Id) {
                throw ArgumentException("Menu identifiers must be nonempty and unique", "items")
            }
            if let shortcut = item.Shortcut {
                if item.Items.Count != 0 || string.IsNullOrEmpty(shortcut.Key)
                    || !Rune.TryGetRuneAt(shortcut.Key, 0, out var rune)
                    || rune.Utf16SequenceLength != shortcut.Key.Length || Rune.IsControl(rune)
                    || Rune.IsWhiteSpace(rune) && rune.Value != 32 {
                    throw ArgumentException("A shortcut requires one printable logical key on a leaf", "items")
                }
                let modifiers = shortcut.Modifiers
                let bits = (if modifiers.Shift { 1 } else { 0 }) | (if modifiers.Ctrl { 2 } else { 0 })
                    | (if modifiers.Alt { 4 } else { 0 }) | (if modifiers.Super { 8 } else { 0 })
                let key = shortcut.Key.ToUpperInvariant() + ":" + bits.ToString()
                if !shortcuts.Add(key) { throw ArgumentException("Menu shortcuts must be unique", "items") }
            }
            copy[i] = NativeMenuItem{
                Id: item.Id, Text: item.Text, Enabled: item.Enabled && enabled, Checked: item.Checked,
                Separator: item.Separator, Shortcut: item.Shortcut, Items: Copy(item.Items, path, enabled && item.Enabled),
            }
            if !item.Separator {
                Actions.Add(copy[i])
                Tags.Add(item.Id, Actions.Count)
            }
            path.Remove(item)
        }
        return copy
    }
}
