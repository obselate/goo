package Goo

import System
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import Hexa.NET.SDL3

@UnmanagedFunctionPointer(CallingConvention.StdCall)
internal delegate WindowsDragTimer(window nint, message uint32, identity nuint, time uint32);

internal partial class NativeDragBinding {
  internal var WindowsObject nint
  internal var WindowsSource WindowsDragSource?

  shared {
    @DllImport("user32.dll", EntryPoint: "RegisterClipboardFormatW", CharSet: CharSet.Unicode)
    private func RegisterWindowsDropFormat(name string) uint32;
  }

  internal func FinishWindows(status int32, effect uint32, sourceRemoval bool, failure string = "") {
    try {
      let outcome = if status >= int32(DataTransferStatus.Success) && status <= int32(DataTransferStatus.Failed) {
        DataTransferStatus(status)
      } else { DataTransferStatus.Failed }
      var selected = DragEffect(effect & uint32(Effects))
      if outcome == DataTransferStatus.Success && Data.Uris.Count > 0 {
        let format = RegisterWindowsDropFormat("Logical Performed DropEffect")
        if format == 0u { throw IOException("Cannot register the logical native drop effect") }
        if ClipboardTransfer.WindowsReadFormat(WindowsObject, format, 4, out var bytes) {
          if bytes.Length != 4 { throw InvalidDataException("Invalid logical native drop effect") }
          let logical = BitConverter.ToUInt32(bytes, 0)
          if logical != 0u && logical != uint32(DragEffect.Copy) && logical != uint32(DragEffect.Move) {
            throw InvalidDataException("Unsupported logical native drop effect")
          }
          if (logical & ~uint32(Effects)) != 0u { throw InvalidDataException("Native target used an unoffered drop effect") }
          selected = DragEffect(logical)
        }
      }
      let accepted = outcome == DataTransferStatus.Success && (selected == DragEffect.Copy || selected == DragEffect.Move)
      let result = if accepted { DataTransferStatus.Success } else if outcome == DataTransferStatus.Success {
        DataTransferStatus.Cancelled
      } else { outcome }
      Finish(NativeTransferResult(result, if accepted { selected } else { DragEffect.None },
        accepted && selected == DragEffect.Move && Data.Uris.Count == 0 && sourceRemoval,
        if result == DataTransferStatus.Success || result == DataTransferStatus.Cancelled { "" }
        else if failure != "" { failure } else { "Native drag did not complete" }))
    } catch (error WindowsTransferException) { Finish(NativeTransferResult(error.Status, error: error.Message)) }
    catch (error ClipboardLimitException) { Finish(NativeTransferResult(DataTransferStatus.TooLarge, error: error.Message)) }
    catch (error IOException) { Finish(NativeTransferResult(DataTransferStatus.Failed, error: error.Message)) }
  }
}

internal unsafe partial class SdlHost {
  private var windowsDrop WindowsDropTarget?

  shared {
    private const WindowsDragServiceMilliseconds uint32 = 16u
    @ThreadStatic
    private var windowsTracking NativeDragBinding?
    @ThreadStatic
    private var windowsTrackingTick bool
    private let windowsTimer WindowsDragTimer = ServiceWindowsDrag
    private let windowsTimerAddress nint = Marshal.GetFunctionPointerForDelegate(windowsTimer)

    @DllImport("user32.dll", EntryPoint: "SetTimer", SetLastError: true)
    private func SetWindowsDragTimer(window nint, identity nuint, milliseconds uint32, callback nint) nuint;
    @DllImport("user32.dll", EntryPoint: "KillTimer")
    private func KillWindowsDragTimer(window nint, identity nuint) int32;

    private func ServiceWindowsDrag(window nint, message uint32, identity nuint, time uint32) {
      guard let binding = windowsTracking else { return }
      if windowsTrackingTick || NativeDropState.CallbackDepth != 0 { return }
      windowsTrackingTick = true
      try { Window.ServiceNativeTracking() }
      catch (error Exception) {
        binding.Host.nativeTransferFailure ??= error
        try { binding.Host.CancelNativeDrag() }
        catch (_ Exception) { }
      } finally { windowsTrackingTick = false }
    }

    private func WindowsDropFailure(userData nint, status DataTransferStatus, error string) bool {
      if userData != nint(0) {
        if let state = GCHandle.FromIntPtr(userData).Target as NativeDropState? { state.SetTransferResult(status, error) }
      }
      return false
    }
  }

  private func WindowsTransferCapabilities() NativeTransferCapabilities {
    try {
      let status = ClipboardTransfer.WindowsOleInitialize(nint(0))
      if status < 0 { return NativeTransferCapabilities.None }
      ClipboardTransfer.WindowsOleUninitialize()
      return NativeTransferCapabilities.FileDrop | NativeTransferCapabilities.DropPreview |
        NativeTransferCapabilities.OutboundData | NativeTransferCapabilities.EffectNegotiation | NativeTransferCapabilities.DataDrop
    } catch (_ DllNotFoundException) { return NativeTransferCapabilities.None }
    catch (_ EntryPointNotFoundException) { return NativeTransferCapabilities.None }
  }

  private func SetWindowsDataDrop(callback nint, userData nint) bool {
    if callback == nint(0) {
      windowsDrop?.Dispose()
      windowsDrop = nil
      return true
    }
    if let target = windowsDrop { target.Configure(userData)
      return true }
    try {
      let hwnd = nint(SDL.GetPointerProperty(SDL.GetWindowProperties(window), "SDL.window.win32.hwnd", nil))
      if hwnd == nint(0) { throw NotSupportedException("The native Windows drop window is unavailable") }
      windowsDrop = WindowsDropTarget(this, hwnd, userData)
      return true
    } catch (error WindowsTransferException) { return WindowsDropFailure(userData, error.Status, error.Message) }
    catch (error NotSupportedException) { return WindowsDropFailure(userData, DataTransferStatus.Unsupported, error.Message) }
    catch (error DllNotFoundException) { return WindowsDropFailure(userData, DataTransferStatus.Unsupported, error.Message) }
    catch (error EntryPointNotFoundException) { return WindowsDropFailure(userData, DataTransferStatus.Unsupported, error.Message) }
  }

  private func StartWindowsNativeDrag(binding NativeDragBinding) DataTransferStatus {
    let effects = binding.Effects
    if windowsTracking != nil { throw IOException("Another native drag is active on this thread") }
    if WindowsDragComWrappers.KeyState(1) >= int16(0) { throw NotSupportedException("Native drag requires a current primary mouse gesture") }
    SdlRuntime.Acquire()
    var initialized bool
    var source nint
    var timer nuint
    try {
      let apartment = ClipboardTransfer.WindowsOleInitialize(nint(0))
      if apartment < 0 { throw WindowsTransferException("OleInitialize", apartment) }
      initialized = true
      let intent = if effects == DragEffect.Move { ClipboardIntent.Cut } else { ClipboardIntent.Copy }
      binding.WindowsObject = ClipboardTransfer.WindowsCreateOffer(binding.Data, intent)
      if binding.Finished { return DataTransferStatus.Cancelled }
      let sourceObject = WindowsDragSource(binding)
      binding.WindowsSource = sourceObject
      source = WindowsDragComWrappers.Create(sourceObject, WindowsDragComWrappers.SourceId)
      windowsTracking = binding
      timer = SetWindowsDragTimer(nint(0), nuint(0), WindowsDragServiceMilliseconds, windowsTimerAddress)
      if timer == nuint(0) { throw IOException("Cannot start the native drag service timer: " + Marshal.GetLastPInvokeError().ToString()) }
      binding.Started = true
      var selected uint32
      let status = WindowsDragComWrappers.Start(binding.WindowsObject, source, uint32(effects), out selected)
      let outcome = if status == int32(0x00040100u) { DataTransferStatus.Success }
        else if status == int32(0x00040101u) { DataTransferStatus.Cancelled }
        else if status == int32(0x80070005u) { DataTransferStatus.Denied } else { DataTransferStatus.Failed }
      binding.FinishWindows(int32(outcome), selected, true,
        if outcome == DataTransferStatus.Failed || outcome == DataTransferStatus.Denied {
          "DoDragDrop failed: 0x" + uint32(status).ToString("X8", CultureInfo.InvariantCulture)
        } else { "" })
      return DataTransferStatus.Success
    } finally {
      if timer != nuint(0) { KillWindowsDragTimer(nint(0), timer) }
      windowsTracking = nil
      binding.WindowsSource = nil
      ClipboardTransfer.WindowsReleaseObject(source)
      ClipboardTransfer.WindowsReleaseObject(binding.WindowsObject)
      binding.WindowsObject = nint(0)
      if initialized { ClipboardTransfer.WindowsOleUninitialize() }
      SdlRuntime.Release()
    }
  }
}
