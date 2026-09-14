package Goo

import System
import System.Collections.Generic
import System.Threading.Tasks

/// Selects an open-file, save-file, or folder chooser.
public enum FileDialogKind { OpenFile; SaveFile; Folder }

/// Distinguishes selected paths, cancellation, unavailable backends, excessive results, and native failures.
public enum FileDialogStatus { Success; Cancelled; Unsupported; TooLarge; Failed }

/// Describes one immutable native chooser filter.
public class FileDialogFilter {
  private let name string
  private let pattern string
  /// Gets the label shown to the user.
  public prop Name string{ get -> name }
  /// Gets semicolon-separated extensions, such as png;jpg, or a single * for all files.
  public prop Pattern string{ get -> pattern }
  /// Creates a filter; the chooser validates the bounded label and extension syntax before launch.
  /// @param name The user-visible filter label.
  /// @param pattern Semicolon-separated extensions or a single asterisk.
  public init(name string, pattern string) {
    this.name = name
    this.pattern = pattern
  }
}

/// Supplies optional native chooser hints, copied when the request starts.
public class FileDialogOptions {
  /// Gets the optional title; empty uses the platform default.
  public prop Title string{ get; init; }
  /// Gets the initial absolute directory or full file path; include a filename for a save suggestion.
  public prop InitialPath string{ get; init; }
  /// Gets whether open-file and folder dialogs may select multiple entries; save dialogs reject true.
  public prop Multiple bool{ get; init; }
  /// Gets up to 64 filters; folder dialogs reject nonempty filters.
  public prop Filters IReadOnlyList[FileDialogFilter]{ get; init; }
  /// Creates options with native defaults and single selection.
  public init() {
    Title = ""
    InitialPath = ""
    Filters = Array.Empty[FileDialogFilter]()
  }
}

/// Contains owned native chooser results without opening or writing any selected file.
public class FileDialogResult {
  private let status FileDialogStatus
  private let paths IReadOnlyList[string]
  private let filterIndex int32
  private let error string
  /// Gets the request outcome.
  public prop Status FileDialogStatus{ get -> status }
  /// Gets the immutable absolute paths selected by the user, valid after owner close.
  public prop Paths IReadOnlyList[string]{ get -> paths }
  /// Gets the selected filter index, or -1 when the backend does not report it.
  public prop FilterIndex int32{ get -> filterIndex }
  /// Gets a native failure or limit explanation, or an empty string.
  public prop Error string{ get -> error }
  internal init(status FileDialogStatus, paths []string, filterIndex int32 = -1, error string = "") {
    this.status = status
    this.paths = Array.AsReadOnly[string](paths)
    this.filterIndex = filterIndex
    this.error = error
  }
}

/// Opens asynchronous native choosers owned by this window.
public partial class Window {
  /// Starts one owner-modal chooser on the open window's UI thread; other windows continue rendering.
  /// @param kind The open-file, save-file, or folder chooser to show.
  /// @param options Optional title, initial path, filters, and multiple-selection hints copied before launch.
  /// @returns A task completed on the UI thread with owned paths and an explicit outcome. Await continuations follow normal .NET context rules.
  public func ShowFileDialogAsync(kind FileDialogKind, options FileDialogOptions? = nil) Task[FileDialogResult] {
    requireUiThread("Window.ShowFileDialogAsync")
    if !IsOpen || host?.IsClosing == true || family?.Closing == true { throw InvalidOperationException("A file dialog requires an open, non-closing owner") }
    let selected = options ?? FileDialogOptions()
    NativeFileDialog.Validate(kind, selected)
    if embeddedHost != nil || (!OperatingSystem.IsLinux() && !OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS()) {
      return Task.FromResult(FileDialogResult(FileDialogStatus.Unsupported, []string{}, error: "The host does not provide desktop file dialogs"))
    }
    if IsInputBlocked { throw InvalidOperationException("The owner already has a modal child or native chooser") }
    guard let native = host as SdlHost ? else { throw NotSupportedException("A native desktop host is required") }
    let dialog = NativeFileDialog(this, native.WindowHandle, kind, selected)
    family ??= WindowFamily()
    let state = family!!
    state.Dialog = dialog
    if let focused = input.FocusedNode() { state.PreviousFocus = WeakReference(focused) }
    input.FocusLost(node, resolver)
    RefreshPlatformInput()
    accessibility?.MarkDirty()
    requestRender()
    dialog.Start()
    DrainFileDialog()
    return dialog.Task
  }

  /// Cancels delivery of a pending chooser result on the UI thread and requests native dismissal where available.
  /// Native ownership remains active until the platform callback returns.
  /// @returns True when a pending native chooser exists, including one already awaiting dismissal.
  public func CancelFileDialog() bool {
    requireUiThread("Window.CancelFileDialog")
    guard let dialog = family?.Dialog else { return false }
    dialog.Cancel()
    DrainFileDialog()
    return true
  }

  internal func DrainFileDialog() {
    guard let state = family, let dialog = state.Dialog else { return }
    if !dialog.NativeCompleted { return }
    state.Dialog = nil
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
    dialog.Complete()
  }

  private func closeFileDialog() bool {
    guard let state = family, let dialog = state.Dialog else { return true }
    state.Closing = true
    dialog.Cancel()
    host?.PollEvents()
    DrainFileDialog()
    if state.Dialog == nil { return true }
    host?.Wake()
    return false
  }
}
