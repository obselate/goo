package Goo

import System
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate FileDialogWindowVisitor(window nint, owner nint) int32;

internal partial class NativeFileDialog {
  shared {
    @DllImport("SDL3", EntryPoint: "Goo_CancelFileDialog", CallingConvention: CallingConvention.Cdecl)
    private func CancelPortal(window nint);
    @DllImport("SDL3", EntryPoint: "SDL_GetWindowProperties", CallingConvention: CallingConvention.Cdecl)
    private func WindowProperties(window nint) uint32;
    @DllImport("SDL3", EntryPoint: "SDL_GetPointerProperty", CallingConvention: CallingConvention.Cdecl)
    private func PointerProperty(properties uint32, name string, fallback nint) nint;
    @DllImport("user32.dll", EntryPoint: "EnumWindows")
    private func EnumWindows(visitor FileDialogWindowVisitor, owner nint) int32;
    @DllImport("user32.dll", EntryPoint: "GetWindow")
    private func GetWindow(window nint, command uint32) nint;
    @DllImport("user32.dll", EntryPoint: "GetClassNameW", CharSet: CharSet.Unicode)
    private func GetClassName(window nint, name nint, capacity int32) int32;
    @DllImport("user32.dll", EntryPoint: "PostMessageW")
    private func PostMessage(window nint, message uint32, word nuint, value nint) int32;
    @DllImport("/usr/lib/libobjc.A.dylib")
    private func sel_registerName(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func Send(receiver nint, selector nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func SendVoid(receiver nint, selector nint, sender nint);
    private let dismissVisitor FileDialogWindowVisitor = DismissOwnedDialog

    private func TryDismiss(window nint) {
      try {
        if OperatingSystem.IsLinux() {
          CancelPortal(window)
        } else if OperatingSystem.IsWindows() {
          let owner = PointerProperty(WindowProperties(window), "SDL.window.win32.hwnd", nint(0))
          if owner != nint(0) { EnumWindows(dismissVisitor, owner) }
        } else if OperatingSystem.IsMacOS() {
          let owner = PointerProperty(WindowProperties(window), "SDL.window.cocoa.window", nint(0))
          if owner == nint(0) { return }
          let sheet = Send(owner, sel_registerName("attachedSheet"))
          if sheet != nint(0) { SendVoid(sheet, sel_registerName("cancel:"), nint(0)) }
        }
      } catch (_ Exception) { }
    }

    private func DismissOwnedDialog(window nint, owner nint) int32 {
      try {
        if GetWindow(window, 4u) != owner { return 1 }
        let buffer = Marshal.AllocHGlobal(128)
        try {
          let length = GetClassName(window, buffer, 64)
          if length > 0 && Marshal.PtrToStringUni(buffer, length) == "#32770" {
            PostMessage(window, 16u, nuint(0), nint(0))
          }
        } finally { Marshal.FreeHGlobal(buffer) }
      } catch (_ Exception) { }
      return 1
    }
  }
}
