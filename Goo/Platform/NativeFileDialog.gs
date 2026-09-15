package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Threading
import System.Threading.Tasks
import Hexa.NET.SDL3

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate FileDialogCallback(userData nint, paths nint, filter int32);

internal partial class NativeFileDialog {
  private let owner Window
  private let window nint
  private let kind FileDialogKind
  private let title string
  private let initialPath string
  private let multiple bool
  private let filters []FileDialogFilter
  private let completion TaskCompletionSource[FileDialogResult] = TaskCompletionSource[FileDialogResult](TaskCreationOptions.RunContinuationsAsynchronously)
  private let strings List[nint] = List[nint]()
  private var nativeFilters nint
  private var handle GCHandle
  private var nativeCompleted int32
  private var cancelRetry Timer?
  private var result FileDialogResult?

  internal init(owner Window, nativeWindow nint, kind FileDialogKind, options FileDialogOptions) {
    this.owner = owner
    window = nativeWindow
    this.kind = kind
    title = options.Title
    initialPath = options.InitialPath
    multiple = options.Multiple
    filters = [options.Filters.Count]FileDialogFilter
    for i in 0 ... filters.Length { filters[i] = options.Filters[i] }
  }

  internal prop Task Task[FileDialogResult]{ get -> completion.Task }
  internal prop NativeCompleted bool{ get -> Interlocked.CompareExchange(&nativeCompleted, 0, 0) != 0 }

  internal func Start() {
    var properties uint32
    try {
      properties = SDL.CreateProperties()
      if properties == 0u { throw IOException(SDL.GetErrorS() ?? "Native chooser properties are unavailable") }
      Set(SDL.SetPointerProperty(properties, "SDL.filedialog.window", window))
      Set(SDL.SetBooleanProperty(properties, "SDL.filedialog.many", multiple))
      if title != "" { Set(SDL.SetStringProperty(properties, "SDL.filedialog.title", title)) }
      if initialPath != "" { Set(SDL.SetStringProperty(properties, "SDL.filedialog.location", initialPath)) }
      if filters.Length > 0 {
        nativeFilters = Marshal.AllocHGlobal(filters.Length * 2 * nint.Size)
        for i in 0 ... filters.Length {
          Marshal.WriteIntPtr(nativeFilters, i * 2 * nint.Size, StringPointer(filters[i].Name))
          Marshal.WriteIntPtr(nativeFilters, (i * 2 + 1) * nint.Size, StringPointer(filters[i].Pattern))
        }
        Set(SDL.SetPointerProperty(properties, "SDL.filedialog.filters", nativeFilters))
        Set(SDL.SetNumberProperty(properties, "SDL.filedialog.nfilters", int64(filters.Length)))
      }
      handle = GCHandle.Alloc(this)
      if OperatingSystem.IsLinux() { ShowPortal(int32(kind), callbackAddress, GCHandle.ToIntPtr(handle), properties) }
      else { Show(int32(kind), callbackAddress, GCHandle.ToIntPtr(handle), properties) }
    } catch (error Exception) {
      ReleaseBuffers()
      result = FileDialogResult(if error is DllNotFoundException || error is EntryPointNotFoundException { FileDialogStatus.Unsupported } else { FileDialogStatus.Failed }, []string{}, error: error.Message)
      Interlocked.Exchange(&nativeCompleted, 1)
    } finally {
      if properties != 0u { SDL.DestroyProperties(properties) }
    }
  }

  internal func Cancel() {
    completion.TrySetResult(FileDialogResult(FileDialogStatus.Cancelled, []string{}))
    if NativeCompleted { return }
    TryDismiss(window)
    // SDL creates the Windows chooser on a worker; cancellation can precede its HWND.
    if OperatingSystem.IsWindows() {
      lock (completion) {
        if !NativeCompleted && cancelRetry == nil { cancelRetry = Timer(RetryCancellation, nil, 50, 50) }
      }
    }
  }

  private func RetryCancellation(_ object?) {
    try { owner.TryPost(DismissIfPending) } catch (_ Exception) { }
  }

  private func DismissIfPending() {
    if !NativeCompleted { TryDismiss(window) }
  }

  internal func Complete() {
    if let value = result { completion.TrySetResult(value) }
  }

  private func StringPointer(value string) nint {
    let pointer = Marshal.StringToCoTaskMemUTF8(value)
    strings.Add(pointer)
    return pointer
  }

  private func Receive(paths nint, filter int32) {
    try { result = ReadResult(paths, filter, filters.Length) }
    catch (error NativePathLimitException) { result = FileDialogResult(FileDialogStatus.TooLarge, []string{}, error: error.Message) }
    catch (error Exception) { result = FileDialogResult(FileDialogStatus.Failed, []string{}, error: error.Message) }
    finally {
      ReleaseBuffers()
      Interlocked.Exchange(&nativeCompleted, 1)
      lock (completion) {
        cancelRetry?.Dispose()
        cancelRetry = nil
      }
      try { owner.TryPost(owner.DrainFileDialog) } catch (_ Exception) { }
    }
  }

  private func ReleaseBuffers() {
    if handle.IsAllocated { handle.Free() }
    for pointer in strings { Marshal.FreeCoTaskMem(pointer) }
    strings.Clear()
    if nativeFilters != nint(0) {
      Marshal.FreeHGlobal(nativeFilters)
      nativeFilters = nint(0)
    }
  }

  shared {
    @DllImport("SDL3", EntryPoint: "SDL_ShowFileDialogWithProperties", CallingConvention: CallingConvention.Cdecl)
    private func Show(kind int32, callback nint, userData nint, properties uint32);
    @DllImport("SDL3", EntryPoint: "Goo_ShowPortalFileDialog", CallingConvention: CallingConvention.Cdecl)
    private func ShowPortal(kind int32, callback nint, userData nint, properties uint32);
    private let callback FileDialogCallback = Callback
    private let callbackAddress nint = Marshal.GetFunctionPointerForDelegate(callback)

    private func Callback(userData nint, paths nint, filter int32) {
      try {
        let handle = GCHandle.FromIntPtr(userData)
        if let dialog = handle.Target as NativeFileDialog? { dialog.Receive(paths, filter) }
      } catch (_ Exception) { }
    }

    private func Set(success bool) {
      if !success { throw IOException(SDL.GetErrorS() ?? "Native chooser option failed") }
    }

    internal func Validate(kind FileDialogKind, options FileDialogOptions) {
      if kind < FileDialogKind.OpenFile || kind > FileDialogKind.Folder { throw ArgumentOutOfRangeException("kind") }
      ValidateString(options.Title, 256, "Title")
      ValidateString(options.InitialPath, 32768, "InitialPath")
      if options.InitialPath != "" && !Path.IsPathFullyQualified(options.InitialPath) { throw ArgumentException("InitialPath must be absolute") }
      if options.Multiple && kind == FileDialogKind.SaveFile { throw ArgumentException("Save dialogs select one file") }
      if options.Filters == nil || options.Filters.Count > 64 { throw ArgumentException("Filters must contain at most 64 entries") }
      if kind == FileDialogKind.Folder && options.Filters.Count != 0 { throw ArgumentException("Folder dialogs do not use file filters") }
      for filter in options.Filters {
        if filter == nil { throw ArgumentException("Filters must not contain nil") }
        ValidateString(filter.Name, 256, "Filter.Name")
        ValidateString(filter.Pattern, 1024, "Filter.Pattern")
        if filter.Name.Length == 0 || filter.Pattern.Length == 0 { throw ArgumentException("Filters need a label and extension pattern") }
        if filter.Pattern == "*" { continue }
        for extension in filter.Pattern.Split(';') {
          if extension.Length == 0 { throw ArgumentException("Filter extensions must be nonempty") }
          for character in extension {
            if !Char.IsAsciiLetterOrDigit(character) && character != '-' && character != '_' && character != '.' {
              throw ArgumentException("Filters use extensions separated by semicolons, or a single asterisk")
            }
          }
        }
      }
    }

    private func ValidateString(value string, limit int32, name string) {
      if value == nil || value.Length > limit || value.IndexOf(char(0)) >= 0 { throw ArgumentException(name + " exceeds its limit or contains NUL") }
    }

    internal func ReadResult(paths nint, filter int32, filterCount int32) FileDialogResult {
      if paths == nint(0) {
        let error = SDL.GetErrorS() ?? "Native chooser failed"
        let unsupported = error.Contains("not built with dialog support", StringComparison.OrdinalIgnoreCase)
          || error.Contains("not supported", StringComparison.OrdinalIgnoreCase)
        let tooLarge = error.Contains("exceeds", StringComparison.OrdinalIgnoreCase) || error.Contains("excessive", StringComparison.OrdinalIgnoreCase)
        return FileDialogResult(if unsupported { FileDialogStatus.Unsupported } else if tooLarge { FileDialogStatus.TooLarge } else { FileDialogStatus.Failed }, []string{}, error: error)
      }
      let values = List[string]()
      var units = 0
      for i in 0 ... (NativeFilePaths.MaxCount + 1) {
        let pointer = Marshal.ReadIntPtr(paths, i * nint.Size)
        if pointer == nint(0) {
          let selected = if filter >= 0 && filter < filterCount { filter } else { -1 }
          return FileDialogResult(if values.Count == 0 { FileDialogStatus.Cancelled } else { FileDialogStatus.Success }, values.ToArray(), selected)
        }
        if i == NativeFilePaths.MaxCount { throw NativePathLimitException("Native chooser exceeds 4096 paths") }
        var length = 0
        while length <= NativeFilePaths.MaxUtf8Bytes && Marshal.ReadByte(pointer, length) != 0 { length++ }
        if length > NativeFilePaths.MaxUtf8Bytes { throw NativePathLimitException("Native chooser path exceeds its text budget") }
        NativeFilePaths.Add(values, Marshal.PtrToStringUTF8(pointer, length), ref units)
      }
      throw InvalidDataException("Native chooser file list is unterminated")
    }
  }
}
