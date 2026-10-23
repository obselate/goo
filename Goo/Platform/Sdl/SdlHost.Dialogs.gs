package Goo

import System
import System.Runtime.InteropServices

internal unsafe partial class SdlHost {
  shared {
    @DllImport("SDL3", EntryPoint: "SDL_GetWindowProperties", CallingConvention: CallingConvention.Cdecl)
    private func DialogProperties(window nint) uint32;
    @DllImport("SDL3", EntryPoint: "SDL_GetPointerProperty", CallingConvention: CallingConvention.Cdecl)
    private func DialogPointer(properties uint32, name string, fallback nint) nint;
    @DllImport("SDL3", EntryPoint: "SDL_GetStringProperty", CallingConvention: CallingConvention.Cdecl)
    private func DialogString(properties uint32, name string, fallback nint) nint;
  }

  internal func CreateNativeDialogOwner(owner Window) NativeDialogOwnerResult {
    ThrowIfDisposed()
    let properties = DialogProperties(WindowHandle)
    if properties == 0u { return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Failed } }
    if OperatingSystem.IsWindows() {
      let handle = DialogPointer(properties, "SDL.window.win32.hwnd", nint(0))
      if handle == nint(0) { return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.NotReady } }
      return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Success,
        Owner: NativeDialogOwnerLease(owner, NativeDialogOwnerKind.Win32, handle, "") }
    }
    if OperatingSystem.IsMacOS() {
      let handle = DialogPointer(properties, "SDL.window.cocoa.window", nint(0))
      if handle == nint(0) { return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.NotReady } }
      return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Success,
        Owner: NativeDialogOwnerLease(owner, NativeDialogOwnerKind.Cocoa, handle, "") }
    }
    if IsWayland() {
      let handle = DialogString(properties, "SDL.window.wayland.xdg_toplevel_export_handle", nint(0))
      let value = if handle != nint(0) { Marshal.PtrToStringUTF8(handle) ?? "" } else { "" }
      if value == "" { return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Unsupported } }
      return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Success,
        Owner: NativeDialogOwnerLease(owner, NativeDialogOwnerKind.Wayland, nint(0), "wayland:" + value) }
    }
    return NativeDialogOwnerResult{ Status: NativeDialogOwnerStatus.Unsupported }
  }
}
