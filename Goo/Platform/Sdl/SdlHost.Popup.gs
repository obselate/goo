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
  }

  private func CreatePopup(parent SdlHost, width int32, height int32, kind PopupKind,
    timestamp uint64, anchor ElementRect, placement PortalPlacement, scale float32) {
    popupParent = parent
    popupKind = kind
    popupTimestamp = timestamp
    let position = PopupWindow.PopupPosition(anchor, width, height, placement, scale)
    var flags = SDLWindowFlags.HighPixelDensity | SDLWindowFlags.Hidden
    flags = flags | (kind == PopupKind.Menu ? SDLWindowFlags.PopupMenu : SDLWindowFlags.Tooltip)
    if OperatingSystem.IsWindows() && kind == PopupKind.Menu { flags = flags | SDLWindowFlags.NotFocusable }
    if !VulkanDrivers.Enabled { flags = flags | SDLWindowFlags.Vulkan }
    window = SDL.CreatePopupWindow(parent.window, int32(position.X), int32(position.Y), width, height, uint64(flags))
    if window.IsNull { ThrowSdl("SDL_CreatePopupWindow") }
    if IsWayland() && !ConfigurePopupGrab(anchor, placement, scale) {
      throw PopupActivationException(SDL.GetErrorS())
    }
  }

  private func ConfigurePopupGrab(anchor ElementRect, placement PortalPlacement, scale float32) bool {
    guard let parent = popupParent else { return false }
    let x = PopupWindow.PopupCoordinate(anchor.X, scale)
    let y = PopupWindow.PopupCoordinate(anchor.Y, scale)
    let width = PopupWindow.PopupCoordinate(anchor.Width, scale)
    let height = PopupWindow.PopupCoordinate(anchor.Height, scale)
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
    if OperatingSystem.IsWindows() && popupKind == PopupKind.Menu {
      Require(SDL.SetWindowFocusable(window, true), "SDL_SetWindowFocusable")
    }
  }

  internal func UpdatePopup(anchor ElementRect, width int32, height int32, placement PortalPlacement,
    scale float32) WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    let position = PopupWindow.PopupPosition(anchor, width, height, placement, scale)
    if IsWayland() && !ConfigurePopupGrab(anchor, placement, scale) { return WindowOperationResult.Unsupported }
    if !SDL.SetWindowSize(window, width, height) { return WindowOperationResult.Failed }
    return SDL.SetWindowPosition(window, int32(position.X), int32(position.Y))
      ? WindowOperationResult.Accepted : WindowOperationResult.Failed
  }
}
