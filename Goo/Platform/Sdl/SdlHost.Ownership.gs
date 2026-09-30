package Goo

import System
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  shared {
    @DllImport("SDL3", EntryPoint: "Goo_SetForeignParent", CallingConvention: CallingConvention.Cdecl)
    private func SetForeignParentNative(window nint, handle nint, modal uint8) uint8;
  }

  internal func SetForeignParent(identifier string, modal bool) bool {
    ThrowIfDisposed()
    if !IsWayland() || !identifier.StartsWith("wayland:", StringComparison.Ordinal)
      || identifier.Length <= 8 || identifier.Length > 4096 || identifier.Contains(char(0)) { return false }
    let handle = Marshal.StringToCoTaskMemUTF8(identifier.Substring(8))
    try { return SetForeignParentNative(windowHandle, handle, modal ? uint8(1) : uint8(0)) != 0 }
    catch (_ EntryPointNotFoundException) { return false }
    finally { Marshal.FreeCoTaskMem(handle) }
  }

  internal func SetOwner(parent SdlHost, modal bool) {
    ThrowIfDisposed()
    if !SDL.SetWindowParent(window, parent.NativeWindow) {
      throw NotSupportedException("The native backend could not establish window ownership: " + SDL.GetErrorS())
    }
    if modal && !SDL.SetWindowModal(window, true) {
      throw NotSupportedException("The native backend could not establish modal window semantics: " + SDL.GetErrorS())
    }
  }
}
