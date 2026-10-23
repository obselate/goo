package Goo

import System
import System.Collections.Generic
import System.Threading

/// Receives owned native MIME data and file lists through DropTarget.
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
      return family?.NativeDrop?.FileEnabled == true }
    set(value) {
      requireUiThread("Window.NativeFileDropEnabled")
      if value {
        if family?.NativeDrop?.FileEnabled == true { return }
        if host != nil && NativeTransferCapabilities == Goo.NativeTransferCapabilities.None {
          throw NotSupportedException("This host does not support native file drops")
        }
        let state = GetNativeDropState()
        state.FileEnabled = true
        if let native = host as SdlHost? { state.Bind(native) }
        if !state.ConfigureDataDrop() { state.FileEnabled = false
          throw NotSupportedException("Native MIME drop registration failed") }
      } else if let state = family?.NativeDrop {
        state.FileEnabled = false
        if state.Formats.Length == 0 { family!!.NativeDrop = nil
          state.Unbind() }
        else if !state.ConfigureDataDrop() { throw NotSupportedException("Native MIME drop registration failed") }
      }
    }
  }

  /// Gets the most recent rejected native file-list explanation, cleared when the next offer begins.
  public prop LastNativeFileDropError string? {
    get { requireUiThread("Window.LastNativeFileDropError")
      return family?.NativeDrop?.LastError }
  }

  /// Enables an exact MIME allow-list for native drops on the owning UI thread.
  /// @param formats At most 128 unique MIME names. An empty list disables MIME drops.
  /// @returns Accepted, Closed, Unsupported or Failed without changing an unsupported host.
  public func SetNativeDataDropFormats(formats IReadOnlyList[string]) WindowOperationResult {
    requireUiThread("Window.SetNativeDataDropFormats")
    if formats == nil { throw ArgumentNullException("formats") }
    if formats.Count > 128 { throw ArgumentOutOfRangeException("formats") }
    let copied = [formats.Count]string
    let seen = HashSet[string](StringComparer.Ordinal)
    for i in 0 ... copied.Length {
      TransferRepresentation.ValidateType(formats[i])
      if !seen.Add(formats[i]) { throw ArgumentException("Native MIME formats must be unique", "formats") }
      copied[i] = formats[i]
    }
    if !IsOpen || host?.IsClosing == true { return WindowOperationResult.Closed }
    guard let native = host as SdlHost? else { return WindowOperationResult.Unsupported }
    if (native.TransferCapabilities() & Goo.NativeTransferCapabilities.DataDrop) == Goo.NativeTransferCapabilities.None {
      return WindowOperationResult.Unsupported
    }
    let state = GetNativeDropState()
    let previous = state.Formats
    state.Formats = copied
    if copied.Length == 0 && !state.FileEnabled {
      state.Unbind()
      family!!.NativeDrop = nil
      return WindowOperationResult.Accepted
    }
    if !state.ConfigureDataDrop() { state.Formats = previous
      return WindowOperationResult.Failed }
    return WindowOperationResult.Accepted
  }

  /// Gets the latest native drop capture status.
  public prop LastNativeTransferStatus DataTransferStatus {
    get { requireUiThread("Window.LastNativeTransferStatus")
      return family?.NativeDrop?.LastStatus ?? DataTransferStatus.Unsupported }
  }

  /// Gets the latest native drop explanation, bounded to 1024 characters.
  public prop LastNativeTransferError string {
    get { requireUiThread("Window.LastNativeTransferError")
      return family?.NativeDrop?.LastTransferError ?? "" }
  }

  private func GetNativeDropState() NativeDropState {
    if let state = family?.NativeDrop { return state }
    let state = NativeDropState(() -> node, () -> CanReceiveNativeDrop(), () -> requestRender(), () -> UiScale)
    family ??= WindowFamily()
    family!!.NativeDrop = state
    if let native = host as SdlHost? { state.Bind(native) }
    return state
  }

  private func CanReceiveNativeDrop() bool -> IsOpen && Root != nil && !IsInputBlocked
    && family?.NativeDrop != nil && family?.Closing != true && host?.IsClosing != true
    && Interlocked.CompareExchange(&closeRequested, 0, 0) == 0
}
