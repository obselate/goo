package Goo

import Hexa.NET.SDL3
import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct SdlTrackMouseEvent {
  internal var Size uint32
  internal var Flags uint32
  internal var Window nint
  internal var HoverTime uint32
}

internal unsafe partial class SdlHost {
  shared {
    @DllImport("SDL3", EntryPoint: "Goo_BeginWindowInteraction", CallingConvention: CallingConvention.Cdecl)
    private func BeginWindowInteraction(window nint, edge int32) uint8;
    @DllImport("user32.dll", EntryPoint: "PostMessageW")
    private func PostMessage(window nint, message uint32, wparam nuint, lparam nint) int32;
    @DllImport("user32.dll")
    private func ReleaseCapture() int32;
    @DllImport("user32.dll")
    private func GetCursorPos(out point SdlTitlebarPoint) int32;
    @DllImport("user32.dll")
    private func ScreenToClient(window nint, ref point SdlTitlebarPoint) int32;
    @DllImport("user32.dll")
    private func TrackMouseEvent(ref value SdlTrackMouseEvent) int32;

    private func PackPoint(point SdlTitlebarPoint) nint -> nint((int64(point.Y & 0xffff) << 16) | int64(point.X & 0xffff))
    private func UnpackPoint(value nint) SdlTitlebarPoint {
      let packed = int64(value)
      return SdlTitlebarPoint{X: int32(int16(packed & 0xffffL)), Y: int32(int16((packed >> 16) & 0xffffL))}
    }
  }

  internal func BeginInteraction(edge WindowHitResult) WindowOperationResult {
    ThrowIfDisposed()
    if OperatingSystem.IsWindows() {
      let handle = NativePointer(NativeProperties(WindowHandle), "SDL.window.win32.hwnd", nint(0))
      let sent = if (SDL.GetMouseState(nil, nil) & 1u) != 0u && GetCursorPos(out var cursor) != 0 {
        ReleaseCapture()
        PostMessage(handle, 0xA1u, nuint(uint32(WindowsHitCode(edge))), PackPoint(cursor))
      } else {
        PostMessage(handle, 0x112u, nuint(edge == WindowHitResult.Draggable ? 0xF010u : 0xF000u), nint(0))
      }
      return sent != 0 ? WindowOperationResult.Accepted : WindowOperationResult.Failed
    }
    if !IsWayland() { return WindowOperationResult.Unsupported }
    try {
      return BeginWindowInteraction(windowHandle, int32(SdlHitTest(edge))) != 0
        ? WindowOperationResult.Accepted : WindowOperationResult.Unsupported
    } catch (_ EntryPointNotFoundException) { return WindowOperationResult.Unsupported }
  }

  internal func ShowSystemMenu(x int32, y int32) WindowOperationResult {
    ThrowIfDisposed()
    return SDL.ShowWindowSystemMenu(window, x, y) ? WindowOperationResult.Accepted : WindowOperationResult.Failed
  }

  private func WindowsHitCode(edge WindowHitResult) int32 -> switch edge {
    case WindowHitResult.TopLeft: 13
    case WindowHitResult.Top: 12
    case WindowHitResult.TopRight: 14
    case WindowHitResult.Right: 11
    case WindowHitResult.BottomRight: 17
    case WindowHitResult.Bottom: 15
    case WindowHitResult.BottomLeft: 16
    case WindowHitResult.Left: 10
    case _: 2
  }

  private func DispatchMaximizeButton(handle nint, message uint32, wparam nuint, lparam nint) nint {
    if message == 0x84u {
      let result = DefSubclassProc(handle, message, wparam, lparam)
      return result == nint(1) && IsMaximizeButton(handle, UnpackPoint(lparam)) ? nint(9) : result
    }
    if message == 0x2A3u && GetCursorPos(out var cursor) != 0 && IsMaximizeButton(handle, cursor) {
      TrackLeave(handle, 0x12u)
      return nint(0)
    }
    if message == 0x2A2u { TrackLeave(handle, 0x2u) }
    if message < 0xA0u || message > 0xA3u || wparam != nuint(9) {
      return DefSubclassProc(handle, message, wparam, lparam)
    }
    var point = UnpackPoint(lparam)
    ScreenToClient(handle, ref point)
    if message == 0xA0u { TrackLeave(handle, 0x12u) }
    DefSubclassProc(handle, message + 0x160u, message == 0xA1u || message == 0xA3u ? nuint(1) : nuint(0), PackPoint(point))
    return nint(0)
  }

  private func IsMaximizeButton(handle nint, screen SdlTitlebarPoint) bool {
    var point = screen
    if !hitTestEnabled || pointerButtons != PointerButtons.None || ScreenToClient(handle, ref point) == 0 { return false }
    try { return hitTest(point.X, point.Y) == WindowHitResult.MaximizeButton }
    catch (_ Exception) { return false }
  }

  private func TrackLeave(handle nint, flags uint32) {
    var value = SdlTrackMouseEvent{Size: uint32(Marshal.SizeOf[SdlTrackMouseEvent]()), Flags: flags, Window: handle}
    TrackMouseEvent(ref value)
  }
}
