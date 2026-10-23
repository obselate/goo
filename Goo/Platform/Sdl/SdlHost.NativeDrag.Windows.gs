package Goo

import System
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import System.Threading
import Hexa.NET.SDL3

@UnmanagedFunctionPointer(CallingConvention.StdCall)
internal delegate WindowsDragTimer(window nint, fired uint8);
@UnmanagedFunctionPointer(CallingConvention.StdCall)
internal delegate WindowsDragSubclass(window nint, message uint32, wparam nuint, lparam nint, identity nuint, data nuint) nint;

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
    private const WindowsDragTimerId uint32 = 0x474F4Fu
    private const WindowsDragServiceMessage uint32 = 0x8474u
    private var windowsPulsePending int32
    @ThreadStatic
    private var windowsTracking NativeDragBinding?
    @ThreadStatic
    private var windowsTrackingTick bool
    private let windowsTimer WindowsDragTimer = PulseWindowsDrag
    private let windowsTimerAddress nint = Marshal.GetFunctionPointerForDelegate(windowsTimer)
    private let windowsMessage WindowsDragSubclass = ServiceWindowsDrag
    private let windowsMessageAddress nint = Marshal.GetFunctionPointerForDelegate(windowsMessage)

    @DllImport("kernel32.dll", EntryPoint: "CreateTimerQueueTimer", SetLastError: true)
    private func CreateWindowsDragTimer(out timer nint, queue nint, callback nint, context nint, due uint32, period uint32, flags uint32) int32;
    @DllImport("kernel32.dll", EntryPoint: "DeleteTimerQueueTimer")
    private func DeleteWindowsDragTimer(queue nint, timer nint, completion nint) int32;
    @DllImport("comctl32.dll", EntryPoint: "SetWindowSubclass", SetLastError: true)
    private func SetWindowsDragSubclass(window nint, callback nint, identity nuint, data nuint) int32;
    @DllImport("comctl32.dll", EntryPoint: "RemoveWindowSubclass")
    private func RemoveWindowsDragSubclass(window nint, callback nint, identity nuint) int32;
    @DllImport("comctl32.dll", EntryPoint: "DefSubclassProc")
    private func DefaultWindowsDragMessage(window nint, message uint32, wparam nuint, lparam nint) nint;
    @DllImport("user32.dll", EntryPoint: "SendMessageTimeoutW")
    private func SendWindowsDragMessage(window nint, message uint32, wparam nuint, lparam nint, flags uint32, timeout uint32, out result nuint) nint;

    private func PulseWindowsDrag(window nint, fired uint8) {
      if Interlocked.CompareExchange(ref windowsPulsePending, 1, 0) != 0 { return }
      try { SendWindowsDragMessage(window, WindowsDragServiceMessage, nuint(0), nint(0), 3u, 100u, out var result) }
      finally { Interlocked.Exchange(ref windowsPulsePending, 0) }
    }

    private func ServiceWindowsDrag(window nint, message uint32, wparam nuint, lparam nint, identity nuint, data nuint) nint {
      if message != WindowsDragServiceMessage { return DefaultWindowsDragMessage(window, message, wparam, lparam) }
      guard let binding = windowsTracking else { return nint(0) }
      if windowsTrackingTick || NativeDropState.CallbackDepth != 0 { return nint(0) }
      windowsTrackingTick = true
      Console.WriteLine("service-enter " + Environment.TickCount64.ToString())
      try {
        Window.ServiceNativeTracking()
        Console.WriteLine("service-exit " + Environment.TickCount64.ToString() + " " + binding.Host.IsClosing.ToString())
      }
      catch (error Exception) {
        binding.Host.nativeTransferFailure ??= error
        try { binding.Host.CancelNativeDrag() }
        catch (_ Exception) { }
      } finally { windowsTrackingTick = false }
      return nint(0)
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
    let timerWindow = nint(SDL.GetPointerProperty(SDL.GetWindowProperties(window), "SDL.window.win32.hwnd", nil))
    if timerWindow == nint(0) { throw NotSupportedException("The native Windows drag window is unavailable") }
    SdlRuntime.Acquire()
    var initialized bool
    var source nint
    var timer nint
    var subclassed bool
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
      if SetWindowsDragSubclass(timerWindow, windowsMessageAddress, nuint(WindowsDragTimerId), nuint(0)) == 0 {
        throw IOException("Cannot install the native drag service callback")
      }
      subclassed = true
      if CreateWindowsDragTimer(out timer, nint(0), windowsTimerAddress, timerWindow,
        WindowsDragServiceMilliseconds, WindowsDragServiceMilliseconds, 0u) == 0 {
        throw IOException("Cannot start the native drag service timer: " + Marshal.GetLastPInvokeError().ToString())
      }
      binding.Started = true
      var selected uint32
      let status = WindowsDragComWrappers.Start(binding.WindowsObject, source, uint32(effects), out selected)
      Console.WriteLine("modal-return " + status.ToString() + " " + selected.ToString())
      let outcome = if status == int32(0x00040100u) { DataTransferStatus.Success }
        else if status == int32(0x00040101u) { DataTransferStatus.Cancelled }
        else if status == int32(0x80070005u) { DataTransferStatus.Denied } else { DataTransferStatus.Failed }
      binding.FinishWindows(int32(outcome), selected, true,
        if outcome == DataTransferStatus.Failed || outcome == DataTransferStatus.Denied {
          "DoDragDrop failed: 0x" + uint32(status).ToString("X8", CultureInfo.InvariantCulture)
        } else { "" })
      return DataTransferStatus.Success
    } finally {
      if timer != nint(0) { DeleteWindowsDragTimer(nint(0), timer, nint(0)) }
      if subclassed { RemoveWindowsDragSubclass(timerWindow, windowsMessageAddress, nuint(WindowsDragTimerId)) }
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
