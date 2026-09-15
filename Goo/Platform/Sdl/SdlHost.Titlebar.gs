package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate SdlTitlebarCallback(x int32, y int32) uint8;

internal class SdlTitlebarBinding {
  internal let Host SdlHost
  internal let Owner Window
  internal let Callback SdlTitlebarCallback
  internal let Properties uint32
  internal var NativeHandle nint
  internal init(host SdlHost, owner Window) {
    Host = host
    Owner = owner
    Properties = SdlTitlebarHooks.Properties(host.WindowHandle)
    Callback = Invoke
  }
  private func Invoke(x int32, y int32) uint8 -> Owner.NativeTitlebarDoubleClick(float64(x), float64(y)) ? uint8(1) : uint8(0)
}

// Allocated only for windows that subscribe to the titlebar event.
internal unsafe partial class SdlTitlebarHooks {
  shared {
    private const CallbackProperty string = "Goo.Window.TitlebarDoubleClick.1"
    private var bindings ConditionalWeakTable[SdlHost, SdlTitlebarBinding]?
    @DllImport("SDL3", EntryPoint: "SDL_GetWindowProperties", CallingConvention: CallingConvention.Cdecl)
    internal func Properties(window nint) uint32;
    @DllImport("SDL3", EntryPoint: "SDL_GetPointerProperty", CallingConvention: CallingConvention.Cdecl)
    private func PointerProperty(properties uint32, name string, fallback nint) nint;
    @DllImport("SDL3", EntryPoint: "SDL_SetPointerProperty", CallingConvention: CallingConvention.Cdecl)
    private func SetPointerProperty(properties uint32, name string, value nint) uint8;

    internal func Bind(host SdlHost, owner Window?) {
      if owner == nil { Unbind(host)
        return }
      if let values = bindings {
        if values.TryGetValue(host, out var existing) { return }
      }
      let binding = SdlTitlebarBinding(host, owner)
      bindings ??= ConditionalWeakTable[SdlHost, SdlTitlebarBinding]()
      bindings!!.Add(host, binding)
      try {
        if OperatingSystem.IsWindows() { BindWindows(binding) }
        else if OperatingSystem.IsMacOS() { BindMac(binding) }
        else if SetPointerProperty(binding.Properties, CallbackProperty,
          Marshal.GetFunctionPointerForDelegate(binding.Callback)) == uint8(0) {
            throw InvalidOperationException("Unable to register native titlebar callbacks")
          }
      } catch (error Exception) { Unbind(host)
        throw error }
    }
    internal func Unbind(host SdlHost) {
      guard let values = bindings else { return }
      if !values.TryGetValue(host, out var binding) { return }
      if OperatingSystem.IsWindows() { UnbindWindows(binding) }
      else if OperatingSystem.IsMacOS() { UnbindMac(binding) }
      else { SetPointerProperty(binding.Properties, CallbackProperty, nint(0)) }
      values.Remove(host)
      GC.KeepAlive(binding.Callback)
    }
  }
}
