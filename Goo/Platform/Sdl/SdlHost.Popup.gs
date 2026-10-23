package Goo

import System
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  private var popupParent SdlHost?
  private var popupTimestamp uint64
  private var popupKind PopupKind

  internal prop HasPopupKeyboardFocus bool { get -> !disposed && SDL.GetKeyboardFocus() == window }

  shared {
    @DllImport("SDL3", EntryPoint: "Goo_ConfigurePopup", CallingConvention: CallingConvention.Cdecl)
    private func ConfigurePopupNative(parent nint, popup nint, timestamp uint64,
      x int32, y int32, width int32, height int32, placement int32) uint8;

    private func PopupCoordinate(value float64, scale float32) int32 {
      let result = Math.Round(value * float64(scale))
      if result < float64(Int32.MinValue) || result > float64(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("anchor", "Scaled popup coordinates exceed the native range")
      }
      return int32(result)
    }

    internal func PopupPosition(anchor ElementRect, width int32, height int32,
      placement PortalPlacement, scale float32) Point {
      let left = PopupCoordinate(anchor.X, scale)
      let top = PopupCoordinate(anchor.Y, scale)
      let anchorWidth = PopupCoordinate(anchor.Width, scale)
      let anchorHeight = PopupCoordinate(anchor.Height, scale)
      let x = switch placement {
        case PortalPlacement.Bottom or PortalPlacement.Top: float64(left) + (float64(anchorWidth) - width) / 2.0
        case PortalPlacement.BottomEnd or PortalPlacement.TopEnd: float64(left) + anchorWidth - width
        case PortalPlacement.RightStart or PortalPlacement.Right or PortalPlacement.RightEnd: float64(left) + anchorWidth
        case PortalPlacement.LeftStart or PortalPlacement.Left or PortalPlacement.LeftEnd: float64(left) - width
        case _: float64(left)
      }
      let y = switch placement {
        case PortalPlacement.TopStart or PortalPlacement.Top or PortalPlacement.TopEnd: float64(top) - height
        case PortalPlacement.Right or PortalPlacement.Left: float64(top) + (float64(anchorHeight) - height) / 2.0
        case PortalPlacement.RightEnd or PortalPlacement.LeftEnd: float64(top) + anchorHeight - height
        case PortalPlacement.RightStart or PortalPlacement.LeftStart: float64(top)
        case _: float64(top) + anchorHeight
      }
      return Point{ X: PopupCoordinate(x, 1.0F), Y: PopupCoordinate(y, 1.0F) }
    }
  }

  private func CreatePopup(parent SdlHost, width int32, height int32, kind PopupKind,
    timestamp uint64, anchor ElementRect, placement PortalPlacement, scale float32) {
    popupParent = parent
    popupKind = kind
    popupTimestamp = timestamp
    let position = PopupPosition(anchor, width, height, placement, scale)
    var flags = SDLWindowFlags.HighPixelDensity | SDLWindowFlags.Hidden
    flags = flags | (kind == PopupKind.Menu ? SDLWindowFlags.PopupMenu : SDLWindowFlags.Tooltip)
    if !VulkanDrivers.Enabled { flags = flags | SDLWindowFlags.Vulkan }
    window = SDL.CreatePopupWindow(parent.window, int32(position.X), int32(position.Y), width, height, uint64(flags))
    if window.IsNull { ThrowSdl("SDL_CreatePopupWindow") }
    if IsWayland() && !ConfigurePopupGrab(anchor, placement, scale) {
      throw PopupActivationException(SDL.GetErrorS())
    }
  }

  private func ConfigurePopupGrab(anchor ElementRect, placement PortalPlacement, scale float32) bool {
    guard let parent = popupParent else { return false }
    let x = PopupCoordinate(anchor.X, scale)
    let y = PopupCoordinate(anchor.Y, scale)
    let width = PopupCoordinate(anchor.Width, scale)
    let height = PopupCoordinate(anchor.Height, scale)
    if x < 0 || y < 0 || int64(x) + width > parent.LogicalWidth || int64(y) + height > parent.LogicalHeight {
      throw ArgumentOutOfRangeException("anchor", "A Wayland popup anchor must be inside its parent")
    }
    return ConfigurePopupNative(parent.WindowHandle, nint(window.Handle), popupKind == PopupKind.Menu ? popupTimestamp : 0uL,
      Math.Min(x, parent.LogicalWidth - 1), Math.Min(y, parent.LogicalHeight - 1),
      Math.Max(1, width), Math.Max(1, height), int32(placement)) != uint8(0)
  }

  internal func ShowPopup() {
    ThrowIfDisposed()
    Require(SDL.ShowWindow(window), "SDL_ShowWindow")
  }

  internal func UpdatePopup(anchor ElementRect, width int32, height int32, placement PortalPlacement,
    scale float32) WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    let position = PopupPosition(anchor, width, height, placement, scale)
    if IsWayland() && !ConfigurePopupGrab(anchor, placement, scale) { return WindowOperationResult.Unsupported }
    if !SDL.SetWindowSize(window, width, height) { return WindowOperationResult.Failed }
    return SDL.SetWindowPosition(window, int32(position.X), int32(position.Y))
      ? WindowOperationResult.Accepted : WindowOperationResult.Failed
  }
}
