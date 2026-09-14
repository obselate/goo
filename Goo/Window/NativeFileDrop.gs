package Goo

import System
import System.Threading

/// Receives native external file lists through the retained DropTarget contract.
public partial class Window {
  /// Gets the current native transfer capabilities; closed and embedded windows return None.
  public prop NativeTransferCapabilities NativeTransferCapabilities{
    get {
      requireUiThread("Window.NativeTransferCapabilities")
      if !IsOpen { return Goo.NativeTransferCapabilities.None }
      if let native = host as SdlHost? { return native.TransferCapabilities() }
      return Goo.NativeTransferCapabilities.None
    }
  }

  /// Enables native file-drop ingress before Open or on the owning UI thread; disabled by default.
  /// Unsupported hosts reject enabling. Disabling cancels any active preview.
  public prop NativeFileDropEnabled bool{
    get { requireUiThread("Window.NativeFileDropEnabled")
      return family?.NativeDrop != nil }
    set(value) {
      requireUiThread("Window.NativeFileDropEnabled")
      if value {
        if family?.NativeDrop != nil { return }
        if host != nil && NativeTransferCapabilities == Goo.NativeTransferCapabilities.None {
          throw NotSupportedException("This host does not support native file drops")
        }
        let state = NativeDropState(() -> node, () -> CanReceiveNativeDrop(), () -> requestRender())
        family ??= WindowFamily()
        family!!.NativeDrop = state
        if let native = host as SdlHost? { state.Bind(native) }
      } else if let state = family?.NativeDrop {
        family!!.NativeDrop = nil
        state.Unbind()
      }
    }
  }

  /// Gets the most recent rejected native file-list explanation, cleared when the next offer begins.
  public prop LastNativeFileDropError string? {
    get { requireUiThread("Window.LastNativeFileDropError")
      return family?.NativeDrop?.LastError }
  }

  private func CanReceiveNativeDrop() bool -> IsOpen && Root != nil && !IsInputBlocked
    && family?.NativeDrop != nil && family?.Closing != true && host?.IsClosing != true
    && Interlocked.CompareExchange(&closeRequested, 0, 0) == 0
}
