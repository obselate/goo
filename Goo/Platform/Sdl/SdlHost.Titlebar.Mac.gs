package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct SdlTitlebarMacPoint {
  internal var X float64
  internal var Y float64
}
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate SdlTitlebarMacMonitor(block nint, event nint) nint;

internal unsafe partial class SdlTitlebarHooks {
  shared {
    private var macWindows Dictionary[nint, SdlTitlebarBinding]?
    private var macCallback SdlTitlebarMacMonitor?
    private var macMonitor nint
    private var macBlock nint
    @DllImport("/usr/lib/libobjc.A.dylib") private func objc_getClass(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib") private func sel_registerName(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func MacSend(receiver nint, selector nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func MacSendPoint(receiver nint, selector nint) SdlTitlebarMacPoint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func MacAddMonitor(receiver nint, selector nint, mask nuint, block nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
    private func MacRemoveMonitor(receiver nint, selector nint, monitor nint);

    private func BindMac(binding SdlTitlebarBinding) {
      let handle = PointerProperty(binding.Properties, "SDL.window.cocoa.window", nint(0))
      if handle == nint(0) { throw InvalidOperationException("Native titlebar NSWindow is unavailable") }
      if macMonitor == nint(0) {
        if macBlock == nint(0) { CreateMacBlock() }
        macMonitor = MacAddMonitor(objc_getClass("NSEvent"), sel_registerName("addLocalMonitorForEventsMatchingMask:handler:"), nuint(2), macBlock)
        if macMonitor == nint(0) { throw InvalidOperationException("Unable to install the native titlebar event monitor") }
      }
      macWindows ??= Dictionary[nint, SdlTitlebarBinding]()
      macWindows!! [handle] = binding
      binding.NativeHandle = handle
    }
    private func UnbindMac(binding SdlTitlebarBinding) {
      if binding.NativeHandle != nint(0) { macWindows?.Remove(binding.NativeHandle)
        binding.NativeHandle = nint(0) }
      if macWindows != nil && macWindows!!.Count == 0 && macMonitor != nint(0) {
        MacRemoveMonitor(objc_getClass("NSEvent"), sel_registerName("removeMonitor:"), macMonitor)
        macMonitor = nint(0)
      }
    }
    private func CreateMacBlock() {
      // Apple Blocks ABI: a process-lifetime global block with no captured objects.
      // The local NSEvent monitor is installed only while a window subscribes.
      macCallback ??= MacEvent
      let library = NativeLibrary.Load("/usr/lib/libSystem.B.dylib")
      let descriptor = Marshal.AllocHGlobal(24)
      let block = Marshal.AllocHGlobal(32)
      Marshal.WriteIntPtr(descriptor, 0, nint(0))
      Marshal.WriteIntPtr(descriptor, 8, nint(32))
      Marshal.WriteIntPtr(descriptor, 16, Marshal.StringToCoTaskMemUTF8("@16@?0@8"))
      Marshal.WriteIntPtr(block, 0, NativeLibrary.GetExport(library, "_NSConcreteGlobalBlock"))
      Marshal.WriteInt32(block, 8, 0x50000000)
      Marshal.WriteInt32(block, 12, 0)
      Marshal.WriteIntPtr(block, 16, Marshal.GetFunctionPointerForDelegate(macCallback!!))
      Marshal.WriteIntPtr(block, 24, descriptor)
      macBlock = block
    }
    private func MacEvent(block nint, event nint) nint {
      if event == nint(0) || MacSend(event, sel_registerName("clickCount")) != nint(2) { return event }
      let window = MacSend(event, sel_registerName("window"))
      if let values = macWindows {
        if values.TryGetValue(window, out var binding) {
          let point = MacSendPoint(event, sel_registerName("locationInWindow"))
          if binding.Owner.NativeTitlebarDoubleClick(point.X, float64(binding.Host.LogicalHeight) - point.Y) { return nint(0) }
        }
      }
      return event
    }
  }
}
