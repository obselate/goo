package Goo

import System
import System.Buffers
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Text
import System.Threading
import System.Threading.Tasks
import Microsoft.Win32.SafeHandles

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate NativeDataDropCallback(userData nint, kind int32, x float32, y float32,
  types nint, count uint32, effects uint32, token uint64, source nint) uint32;

internal class NativeMimeOffer {
  internal let Token uint64
  internal let Formats []string
  internal let Generic bool
  internal var Allowed DragEffect
  internal var X float32
  internal var Y float32
  internal var Modifiers KeyModifiers
  internal var Capturing bool
  internal let Cancellation CancellationTokenSource = CancellationTokenSource()
  internal init(token uint64, formats []string, generic bool, allowed DragEffect) {
    Token = token
    Formats = formats
    Generic = generic
    Allowed = allowed
  }
}

internal partial class NativeDropState {
  internal var FileEnabled bool
  internal var Formats []string = []string{}
  internal var LastStatus DataTransferStatus = DataTransferStatus.Unsupported
  internal var LastTransferError string = ""
  private var boundData bool
  private var handle GCHandle
  private var mimeOffer NativeMimeOffer?

  shared {
    @ThreadStatic
    internal var CallbackDepth int32
    private let callback NativeDataDropCallback = ReceiveDataDrop
    private let callbackAddress nint = Marshal.GetFunctionPointerForDelegate(callback)
    private let emptyData TransferData = TransferData(Array.Empty[TransferRepresentation](), Array.Empty[Uri]())

    internal func ReceiveDataDrop(userData nint, kind int32, x float32, y float32,
      types nint, count uint32, effects uint32, token uint64, source nint) uint32 {
      CallbackDepth++
      try {
        if let state = GCHandle.FromIntPtr(userData).Target as NativeDropState? {
          try { return uint32(state.ReceiveMime(kind, x, y, types, count, effects, token, source)) }
          catch (error Exception) {
            state.SetTransferResult(DataTransferStatus.Failed, error.Message)
            if let host = state.native { host.nativeTransferFailure = error }
            state.router.Cancel()
          }
        }
      } catch (_ Exception) { }
      finally { CallbackDepth-- }
      return uint32(0)
    }

    private func ReadBytes(handle SafeFileHandle, limit int32, cancellation CancellationToken) []uint8 {
      let chunks = List[[]uint8]()
      var total int32
      try {
        var complete bool
        while !complete {
          let chunk = ArrayPool[uint8].Shared.Rent(65536)
          chunks.Add(chunk)
          let pinned = GCHandle.Alloc(chunk, GCHandleType.Pinned)
          try {
            var used int32
            while used < 65536 {
              let requested = Math.Min(65536 - used, limit - total + 1)
              let count = WaylandTransferPipe.Read(int32(handle.DangerousGetHandle()), pinned.AddrOfPinnedObject() + nint(used), requested, cancellation)
              if count == 0 { complete = true
                break }
              used += count
              total += count
              if total > limit { throw ClipboardLimitException("Native MIME data exceeds its byte budget") }
            }
          } finally { pinned.Free() }
        }
        let bytes = [total]uint8
        var offset int32
        for chunk in chunks {
          let count = Math.Min(65536, total - offset)
          if count == 0 { break }
          Buffer.BlockCopy(chunk, 0, bytes, offset, count)
          offset += count
        }
        return bytes
      } finally { for chunk in chunks { ArrayPool[uint8].Shared.Return(chunk) } }
    }
  }

  internal func ConfigureDataDrop() bool {
    guard let host = native else { return true }
    if (host.TransferCapabilities() & NativeTransferCapabilities.DataDrop) == NativeTransferCapabilities.None { return Formats.Length == 0 }
    let types = List[string](Formats)
    if FileEnabled && !types.Contains("text/uri-list") { types.Add("text/uri-list") }
    if types.Count > 128 { return false }
    if !handle.IsAllocated { handle = GCHandle.Alloc(this) }
    if !host.SetDataDrop(types, callbackAddress, GCHandle.ToIntPtr(handle)) { return false }
    boundData = true
    return true
  }

  private func UnbindDataDrop() {
    if boundData { native?.SetDataDrop(Array.Empty[string](), nint(0), nint(0)) }
    boundData = false
    CancelMimeOffer()
    if handle.IsAllocated { handle.Free() }
  }

  private func CancelMimeOffer() {
    if let active = mimeOffer { active.Cancellation.Cancel()
      active.Cancellation.Dispose() }
    mimeOffer = nil
  }

  internal func SetTransferResult(status DataTransferStatus, error string = "") {
    LastStatus = status
    LastTransferError = if error.Length <= 1024 { error } else { error.Substring(0, 1024) }
    LastError = if error == "" { nil } else { LastTransferError }
  }

  private func ReceiveMime(kind int32, x float32, y float32, types nint, count uint32,
    effects uint32, token uint64, source nint) DragEffect {
    guard let host = native else { return DragEffect.None }
    if kind == 2 || kind == 4 {
      if kind == 2 && mimeOffer?.Capturing == true { return DragEffect.None }
      CancelMimeOffer()
      router.Cancel()
      SetTransferResult(DataTransferStatus.Cancelled)
      return DragEffect.None
    }
    if !Single.IsFinite(x) || !Single.IsFinite(y) || count > uint32(128) { return DragEffect.None }
    let scale = getScale?.Invoke() ?? 1.0F
    let allowed = DragEffect(effects & uint32(3))
    if allowed == DragEffect.None { return DragEffect.None }
    if OperatingSystem.IsWindows() && source == nint(0) { throw InvalidDataException("The native OLE offer is missing") }
    let local NativeDragBinding? = if OperatingSystem.IsLinux() && source != nint(0) { GCHandle.FromIntPtr(source).Target as NativeDragBinding? } else { nil }
    if mimeOffer?.Token != token {
      CancelMimeOffer()
      router.Cancel()
      var available IReadOnlyList[string]
      if OperatingSystem.IsWindows() {
        let queried = ClipboardTransfer.WindowsQueryFormats(source)
        if queried.Status != ClipboardReadStatus.Success {
          SetTransferResult(if queried.Status == ClipboardReadStatus.TooLarge { DataTransferStatus.TooLarge }
            else if queried.Status == ClipboardReadStatus.Unsupported || queried.Status == ClipboardReadStatus.Empty { DataTransferStatus.Unsupported }
            else { DataTransferStatus.Failed }, queried.Error)
          return DragEffect.None
        }
        available = queried.Formats
      } else {
        let names = List[string](int32(count))
        for i in 0 ... int32(count) {
          let name = ClipboardTransfer.BoundedUtf8(Marshal.ReadIntPtr(types, i * nint.Size), 256)
          if !names.Contains(name) { names.Add(name) }
        }
        available = names
      }
      let matched = List[string]()
      for name in available { if Array.IndexOf(Formats, name) >= 0 { matched.Add(name) } }
      let generic = matched.Count > 0
      if !generic && FileEnabled {
        for name in available {
          if name == "text/uri-list" { matched.Add(name)
            break }
        }
      }
      if matched.Count == 0 { return DragEffect.None }
      let active = NativeMimeOffer(token, matched.ToArray(), generic, if generic { allowed } else { allowed & DragEffect.Copy })
      if active.Allowed == DragEffect.None { return DragEffect.None }
      mimeOffer = active
      active.X = x / scale
      active.Y = y / scale
      active.Modifiers = host.NativeDropModifiers()
      SetTransferResult(DataTransferStatus.Success)
      let data = if generic { DragData(NativeDataDrop(active.Formats, emptyData, true), active.Allowed) } else { preview }
      router.Begin(data, active.X, active.Y, active.Modifiers)
    }
    guard let active = mimeOffer else { return DragEffect.None }
    if active.Token != token || active.Capturing { return DragEffect.None }
    active.X = x / scale
    active.Y = y / scale
    active.Modifiers = host.NativeDropModifiers()
    let selected = router.Move(active.X, active.Y, active.Modifiers) & allowed
    if kind != 3 { return selected }
    if selected == DragEffect.None {
      CancelMimeOffer()
      router.Cancel()
      SetTransferResult(DataTransferStatus.Cancelled)
      return DragEffect.None
    }
    active.Allowed = allowed
    active.Capturing = true
    if OperatingSystem.IsWindows() {
      let captured = ClipboardTransfer.WindowsReadTransfer(active.Formats, source)
      var outcome = if captured.Status == ClipboardReadStatus.Success { DataTransferStatus.Success }
        else if captured.Status == ClipboardReadStatus.TooLarge { DataTransferStatus.TooLarge }
        else if captured.Status == ClipboardReadStatus.Unsupported { DataTransferStatus.Unsupported }
        else { DataTransferStatus.Failed }
      var error = captured.Error
      if outcome == DataTransferStatus.Success &&
        captured.Data.Representations.Count + (captured.Data.Uris.Count > 0 ? 1 : 0) != active.Formats.Length {
        outcome = DataTransferStatus.Failed
        error = "The native offer did not contain every matched MIME type"
      }
      CompleteMime(active, captured.Data, outcome, error)
      return selected
    }
    if let binding = local {
      Task.Run(() -> CaptureMime(active, Array.Empty[SafeFileHandle](), binding.Representations))
      return selected
    }
    let handles = [active.Formats.Length]SafeFileHandle
    try {
      using let names = NativeMimeTable(active.Formats)
      for i in 0 ... handles.Length {
        let descriptor = host.ReceiveDataDrop(active.Token, Marshal.ReadIntPtr(names.Pointer, i * nint.Size))
        if descriptor < 0 { throw IOException("Native MIME stream could not be opened") }
        handles[i] = SafeFileHandle(nint(descriptor), true)
      }
      Task.Run(() -> CaptureMime(active, handles))
    } catch (error Exception) {
      for item in handles { item?.Dispose() }
      CompleteMime(active, emptyData, DataTransferStatus.Failed, error.Message)
    }
    return selected
  }

  private func CaptureMime(active NativeMimeOffer, handles []SafeFileHandle, owned IReadOnlyList[TransferRepresentation]? = nil) {
    var result = emptyData
    var status = DataTransferStatus.Success
    var error = ""
    try {
      let representations = List[TransferRepresentation]()
      var uris IReadOnlyList[Uri] = Array.Empty[Uri]()
      var total int32
      for i in 0 ... active.Formats.Length {
        let type = active.Formats[i]
        let budget = if type == "text/uri-list" { ClipboardTransfer.MaxFileListBytes } else if type.StartsWith("text/", StringComparison.Ordinal) { ClipboardTransfer.MaxTextBytes } else { ClipboardTransfer.MaxImageBytes }
        let token = active.Cancellation.Token
        token.ThrowIfCancellationRequested()
        let limit = Math.Min(budget, ClipboardTransfer.MaxImageBytes - total)
        var bytes []uint8
        if let available = owned {
          var match TransferRepresentation?
          for item in available { if item.ContentType == type { match = item
              break } }
          guard let item = match else { throw InvalidDataException("Native source did not provide the requested MIME data") }
          bytes = item.Data
          if bytes.Length > limit { throw ClipboardLimitException("Native MIME data exceeds its byte budget") }
        } else { bytes = ReadBytes(handles[i], limit, token) }
        total += bytes.Length
        if type == "text/uri-list" {
          let text = utf8.GetString(bytes)
          if text.IndexOf(char(0)) >= 0 { throw InvalidDataException("Native URI data contains NUL") }
          let files = ClipboardTransfer.ParseFiles(text, false)
          if files.Status != ClipboardReadStatus.Success && files.Status != ClipboardReadStatus.Empty { throw InvalidDataException(files.Error) }
          let selected = [files.Paths.Count]Uri
          for j in 0 ... selected.Length { selected[j] = Uri(files.Paths[j]) }
          uris = selected
        } else { representations.Add(TransferRepresentation(type, bytes)) }
      }
      result = TransferData(representations, uris)
    } catch (_ OperationCanceledException) { status = DataTransferStatus.Cancelled }
    catch (exception ClipboardLimitException) { status = DataTransferStatus.TooLarge
      error = exception.Message }
    catch (exception NativePathLimitException) { status = DataTransferStatus.TooLarge
      error = exception.Message }
    catch (exception Exception) { status = DataTransferStatus.Failed
      error = exception.Message }
    finally { for item in handles { item?.Dispose() } }
    native?.TransferPost?.Invoke(() -> CompleteMime(active, result, status, error))
  }

  private func CompleteMime(active NativeMimeOffer, data TransferData, status DataTransferStatus, error string) {
    if mimeOffer != active { return }
    var outcome = status
    var effect = DragEffect.None
    let accepted Action[DragEffect] = (selected DragEffect) -> { native?.FinishDataDrop(active.Token, selected) }
    try {
      if status == DataTransferStatus.Success {
        if active.Generic { effect = router.Complete(DragData(NativeDataDrop(active.Formats, data, false), active.Allowed), active.X, active.Y, active.Modifiers, accepted) }
        else {
          let paths = [data.Uris.Count]string
          for i in 0 ... paths.Length { paths[i] = data.Uris[i].LocalPath }
          if paths.Length > 0 { effect = router.Complete(DragData(NativeFileDrop(paths, false), DragEffect.Copy), active.X, active.Y, active.Modifiers, accepted) }
        }
        if effect == DragEffect.None { outcome = DataTransferStatus.Cancelled }
      }
      SetTransferResult(outcome, error)
    } finally {
      try { router.Cancel() }
      finally {
        try { native?.FinishDataDrop(active.Token, effect) }
        finally { CancelMimeOffer() }
      }
    }
  }
}

internal unsafe partial class SdlHost {
  shared {
    @DllImport("SDL3", EntryPoint: "Goo_GetDataTransferCapabilities", CallingConvention: CallingConvention.Cdecl)
    private func GetDataTransferCapabilities(window nint) uint32;
    @DllImport("SDL3", EntryPoint: "Goo_SetDataDropCallback", CallingConvention: CallingConvention.Cdecl)
    private func SetDataDropCallback(window nint, callback nint, userData nint, types nint, count uint32) uint8;
    @DllImport("SDL3", EntryPoint: "Goo_ReceiveDataDrop", CallingConvention: CallingConvention.Cdecl)
    private func ReceiveDataDropNative(window nint, token uint64, contentType nint) int32;
    @DllImport("SDL3", EntryPoint: "Goo_FinishDataDrop", CallingConvention: CallingConvention.Cdecl)
    private func FinishDataDropNative(window nint, token uint64, effect uint32);
  }
  internal func SetDataDrop(types IReadOnlyList[string], callback nint, userData nint) bool {
    if OperatingSystem.IsWindows() { return SetWindowsDataDrop(callback, userData) }
    using let names = NativeMimeTable(types)
    return SetDataDropCallback(windowHandle, callback, userData, names.Pointer, uint32(types.Count)) != uint8(0)
  }
  internal func ReceiveDataDrop(token uint64, contentType nint) int32 -> ReceiveDataDropNative(windowHandle, token, contentType)
  internal func FinishDataDrop(token uint64, effect DragEffect) {
    if OperatingSystem.IsWindows() { windowsDrop?.Commit(token, effect)
      return }
    FinishDataDropNative(windowHandle, token, uint32(effect))
  }
  internal func NativeDropModifiers() KeyModifiers -> windowsDrop?.Modifiers ?? MapModifiers(Hexa.NET.SDL3.SDL.GetModState())
}
