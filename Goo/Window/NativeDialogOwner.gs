package Goo

import System
import System.Threading
import System.Threading.Tasks

/// Reports whether a native service can borrow this window as a modal owner.
public enum NativeDialogOwnerStatus { Success; Unsupported; Busy; NotReady; Closed; Cancelled; Failed }

/// Identifies the borrowed native owner representation.
public enum NativeDialogOwnerKind { Win32; Cocoa; Wayland }

/// Keeps a native dialog owner alive and blocks only that owner's Goo input until disposed.
public sealed class NativeDialogOwnerLease : IDisposable {
  private let owner Window
  private let kind NativeDialogOwnerKind
  private let handle nint
  private let identifier string
  private let closed CancellationTokenSource
  private var disposed bool

  internal init(owner Window, kind NativeDialogOwnerKind, handle nint, identifier string) {
    this.owner = owner
    this.kind = kind
    this.handle = handle
    this.identifier = identifier
    closed = CancellationTokenSource()
  }

  /// Gets the kind of borrowed native owner. The lease never owns the native window.
  public prop Kind NativeDialogOwnerKind{ get -> kind }
  /// Gets the HWND or NSWindow. Wayland owners use Identifier instead.
  public prop Handle nint{ get -> handle }
  /// Gets the exported wayland: parent identifier, or an empty string on other hosts.
  public prop Identifier string{ get -> identifier }
  /// Gets a token cancelled when the owner requests close. Release the lease after native dismissal.
  public prop Closed CancellationToken{ get -> closed.Token }

  /// Releases modal ownership on the window thread after native callbacks stop using the owner.
  public func Dispose() {
    if disposed { return }
    owner.ReleaseNativeDialogOwner(this)
    disposed = true
    closed.Dispose()
  }

  internal func Cancel() { closed.Cancel() }
}

/// Contains Status, an Owner lease on Success and Error detail on failure.
public data struct NativeDialogOwnerResult(Status NativeDialogOwnerStatus,
  Owner NativeDialogOwnerLease?, Error string) { }

/// Borrows native owners for optional service dialogs.
public partial class Window {
  /// Borrows a native owner for one optional package dialog without exposing SDL state.
  /// @param cancellation Cancels acquisition before native ownership begins.
  /// @returns A lease on Success, or an explicit host or lifecycle status.
  public func AcquireNativeDialogOwnerAsync(cancellation CancellationToken) Task[NativeDialogOwnerResult] {
    requireUiThread("Window.AcquireNativeDialogOwnerAsync")
    if cancellation.IsCancellationRequested {
      return Task.FromResult(NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Cancelled })
    }
    if !IsOpen || host?.IsClosing == true || family?.Closing == true {
      return Task.FromResult(NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Closed })
    }
    if IsInputBlocked {
      return Task.FromResult(NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Busy })
    }
    guard let native = host as SdlHost? else {
      return Task.FromResult(NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Unsupported })
    }
    let result = native.CreateNativeDialogOwner(this)
    if result.Status != NativeDialogOwnerStatus.Success { return Task.FromResult(result) }
    family ??= WindowFamily()
    let state = family!!
    state.ExternalDialog = result.Owner
    if let focused = input.FocusedNode() { state.PreviousFocus = WeakReference(focused) }
    input.FocusLost(node, resolver)
    RefreshPlatformInput()
    accessibility?.MarkDirty()
    requestRender()
    return Task.FromResult(result)
  }

  internal func ReleaseNativeDialogOwner(lease NativeDialogOwnerLease) {
    requireUiThread("NativeDialogOwnerLease.Dispose")
    guard let state = family else { return }
    if state.ExternalDialog != lease { return }
    state.ExternalDialog = nil
    let previous = state.PreviousFocus
    state.PreviousFocus = nil
    accessibility?.MarkDirty()
    if IsOpen && host?.IsClosing != true && !state.Closing {
      RequestActivation()
      if let focused = previous?.Target as Node? {
        if !focused.Retired { FocusElement(focused) }
      }
      requestRender()
    }
    host?.Wake()
  }
}
