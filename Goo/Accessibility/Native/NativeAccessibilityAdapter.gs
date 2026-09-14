package Goo

import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Threading

/// Publishes a desktop window to AT-SPI, UI Automation, or macOS Accessibility through AccessKit.
/// Assign before Window.Open. Requires the optional Goo.Accessibility native runtime package.
public sealed partial class NativeAccessibilityAdapter : AccessibilityAdapter, IDisposable {
  private var owner Window?
  private var native nint
  private var binding int64
  private var platform int32
  private var disposed bool
  private var tree AccessibilityTree?
  private var full bool = true
  private var factoryError Exception?
  private let cache Dictionary[int64, NativeAccessibilityNodeCache] = Dictionary[int64, NativeAccessibilityNodeCache]()
  private let textRuns Dictionary[uint64, NativeAccessibilityTextRun] = Dictionary[uint64, NativeAccessibilityTextRun]()
  private let retired List[int64] = List[int64]()
  private var generation int64
  private var nextTextId uint64 = 9223372036854775808uL
  private var rootId int64 = -1
  private var rootTitle string = ""
  private var rootWidth int32
  private var rootHeight int32

  /// Creates an unattached adapter. Assign it to exactly one Window.AccessibilityAdapter.
  public init() { }

  /// Receives a retained tree on the owning window's UI thread.
  /// @param tree The current retained semantic tree.
  public func Update(tree AccessibilityTree) {
    if tree == nil { throw ArgumentNullException("tree") }
    if disposed { throw ObjectDisposedException("NativeAccessibilityAdapter") }
    guard let window = owner else { throw InvalidOperationException("Assign the adapter to Window.AccessibilityAdapter before updating it") }
    window.RequireNativeAccessibilityThread()
    this.tree = tree
    if native == nint(0) { return }
    factoryError = nil
    let data = nint(binding)
    if platform == 1 { AccessKitNative.UnixUpdate(native, factoryAddress, data) }
    else if platform == 2 { Raise(AccessKitNative.WindowsUpdate(native, factoryAddress, data)) }
    else { Raise(AccessKitNative.MacUpdate(native, factoryAddress, data)) }
    if let error = factoryError { throw error }
  }

  /// Detaches from its window and releases native objects on the owning UI thread. Idempotent.
  public func Dispose() {
    if disposed { return }
    owner?.RequireNativeAccessibilityThread()
    if let window = owner { window.AccessibilityAdapter = nil }
    disposed = true
  }

  internal func CheckOwner(window Window) {
    if disposed { throw ObjectDisposedException("NativeAccessibilityAdapter") }
    if owner != nil && owner != window { throw InvalidOperationException("A native accessibility adapter belongs to one window") }
  }
  internal func SetOwner(window Window) { CheckOwner(window)
    owner = window }
  internal func Detach() { Unbind()
    owner = nil }

  internal func Bind(host SdlHost) {
    if native != nint(0) { return }
    if !IsAvailable { throw PlatformNotSupportedException("Native accessibility requires a supported 64-bit desktop and the Goo.Accessibility 0.23 AccessKit runtime") }
    guard let window = owner else { throw InvalidOperationException("Native accessibility has no owner") }
    window.RequireNativeAccessibilityThread()
    platform = if OperatingSystem.IsLinux() { 1 } else if OperatingSystem.IsWindows() { 2 } else { 3 }
    binding = Interlocked.Increment(&nextBinding)
    bindings[binding] = WeakReference[NativeAccessibilityAdapter](this)
    try {
      let data = nint(binding)
      if platform == 1 {
        native = AccessKitNative.UnixNew(activateAddress, data, actionAddress, data, deactivateAddress, data)
      } else {
        let handle = host.AccessibilityWindowHandle()
        if handle == nint(0) { throw PlatformNotSupportedException("The native host has no supported accessibility window handle") }
        if platform == 2 { native = AccessKitNative.WindowsNew(handle, activateAddress, data, actionAddress, data) }
        else {
          host.InstallAccessibilityFocusForwarder(handle)
          native = AccessKitNative.MacNew(handle, activateAddress, data, actionAddress, data)
        }
      }
      if native == nint(0) { throw InvalidOperationException("AccessKit could not create a native window adapter") }
      FocusChanged(window.IsFocused)
    } catch (error Exception) { Unbind()
      throw error }
  }

  internal func Unbind() {
    let previous = native
    native = nint(0)
    if binding != 0 { bindings.TryRemove(binding, out var removed) }
    binding = 0
    if previous != nint(0) {
      if platform == 1 { AccessKitNative.UnixFree(previous) }
      else if platform == 2 { AccessKitNative.WindowsFree(previous) }
      else { AccessKitNative.MacFree(previous) }
    }
    tree = nil
    Reset()
  }

  internal func FocusChanged(value bool) {
    if native == nint(0) { return }
    if platform == 1 { AccessKitNative.UnixFocus(native, value ? uint8(1) : uint8(0)) }
    else if platform == 3 { Raise(AccessKitNative.MacFocus(native, value ? uint8(1) : uint8(0))) }
  }

  private func Raise(events nint) {
    if events == nint(0) { return }
    if platform == 2 { AccessKitNative.WindowsRaise(events) }
    else { AccessKitNative.MacRaise(events) }
  }

  private func Reset() {
    full = true
    cache.Clear()
    textRuns.Clear()
    retired.Clear()
    rootId = -1
    rootTitle = ""
    rootWidth = 0
    rootHeight = 0
  }

  private func ActivateOnUi(expected int64) {
    if binding != expected || native == nint(0) { return }
    full = true
    owner?.RequestNativeAccessibilityDelivery(this)
  }

  shared {
    private let loadGate object = Object()
    private var library nint
    private var nextBinding int64
    private let bindings ConcurrentDictionary[int64, WeakReference[NativeAccessibilityAdapter]] = ConcurrentDictionary[int64, WeakReference[NativeAccessibilityAdapter]]()
    private let activateCallback AccessKitActivation = Activate
    private let factoryCallback AccessKitActivation = Factory
    private let actionCallback AccessKitAction = Action
    private let deactivateCallback AccessKitDeactivation = Deactivate
    private let activateAddress nint = Marshal.GetFunctionPointerForDelegate(activateCallback)
    private let factoryAddress nint = Marshal.GetFunctionPointerForDelegate(factoryCallback)
    private let actionAddress nint = Marshal.GetFunctionPointerForDelegate(actionCallback)
    private let deactivateAddress nint = Marshal.GetFunctionPointerForDelegate(deactivateCallback)

    /// Reports whether the versioned native runtime can load on this 64-bit desktop platform.
    public prop IsAvailable bool{
      get {
        if nint.Size != 8 || (!OperatingSystem.IsLinux() && !OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS()) { return false }
        lock loadGate {
          if library != nint(0) { return true }
          // Keep the library loaded: macOS focus forwarding installs class methods for process lifetime.
          return NativeLibrary.TryLoad(AccessKitNative.Library, typeof(NativeAccessibilityAdapter).Assembly, nil, out library)
        }
      }
    }

    private func Find(data nint) NativeAccessibilityAdapter? {
      if bindings.TryGetValue(int64(data), out var weak) && weak.TryGetTarget(out var adapter) { return adapter }
      return nil
    }

    private func Activate(data nint) nint {
      guard let adapter = Find(data), let window = adapter.owner else { return nint(0) }
      if window.IsNativeAccessibilityThread { return EncodeSafely(adapter, true) }
      let expected = int64(data)
      window.TryPost(() -> adapter.ActivateOnUi(expected))
      return nint(0)
    }

    private func Factory(data nint) nint {
      guard let adapter = Find(data) else { return EmptyUpdate() }
      return EncodeSafely(adapter, adapter.full)
    }

    private func EncodeSafely(adapter NativeAccessibilityAdapter, all bool) nint {
      try { return adapter.Encode(all) }
      catch (error Exception) {
        adapter.factoryError = error
        adapter.Reset()
        adapter.owner?.ReportNativeAccessibilityError(error)
        return EmptyUpdate()
      }
    }

    private func EmptyUpdate() nint {
      let update = AccessKitNative.TreeUpdateNew(1uL)
      AccessKitNative.TreeUpdateSetTreeInfo(update, AccessKitNative.TreeInfoNew(1uL))
      AccessKitNative.TreeUpdatePushNode(update, 1uL, AccessKitNative.NodeNew(AccessKitSchema.Window))
      return update
    }

    private func Deactivate(data nint) {
      guard let adapter = Find(data), let window = adapter.owner else { return }
      let expected = int64(data)
      window.TryPost(() -> { if adapter.binding == expected { adapter.Reset() } })
    }
  }
}
