package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWaylandArgument {
  internal var Value nint
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWaylandInterface {
  internal var Name nint
  internal var Version int32
  internal var MethodCount int32
  internal var Methods nint
  internal var EventCount int32
  internal var Events nint
}

@StructLayout(LayoutKind.Sequential)
internal struct BackdropWaylandMessage {
  internal var Name nint
  internal var Signature nint
  internal var Types nint
}

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate BackdropWaylandGlobal(data nint, registry nint, name uint32, interfaceName nint, version uint32);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate BackdropWaylandRemove(data nint, registry nint, name uint32);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate BackdropWaylandCapabilities(data nint, manager nint, flags uint32);

internal unsafe class WaylandBackdrop : NativeBackdrop {
  private let display nint
  private let surface nint
  private let allocations List[nint] = List[nint]()
  private let onGlobal BackdropWaylandGlobal
  private let onRemove BackdropWaylandRemove
  private let onCapabilities BackdropWaylandCapabilities
  private var library nint
  private var queue nint
  private var registry nint
  private var compositor nint
  private var manager nint
  private var effect nint
  private var managerInterface nint
  private var effectInterface nint
  private var managerName uint32
  private var canBlur bool
  private var disposed bool

  internal init(display nint, surface nint) {
    this.display = display
    this.surface = surface
    onGlobal = Global
    onRemove = Remove
    onCapabilities = Capabilities
    if display == nint(0) || surface == nint(0) { return }
    try { Initialize() }
    catch (error Exception) { Dispose()
      throw error }
  }

  private func Initialize() {
    library = NativeLibrary.Load("libwayland-client.so.0")
    queue = wl_display_create_queue(display)
    if queue == nint(0) { return }
    CreateInterfaces()
    let wrapper = wl_proxy_create_wrapper(display)
    if wrapper == nint(0) { return }
    try {
      wl_proxy_set_queue(wrapper, queue)
      var argument = BackdropWaylandArgument{}
      registry = wl_proxy_marshal_array_constructor_versioned(wrapper, 1u, &argument,
        NativeLibrary.GetExport(library, "wl_registry_interface"), 1u)
    } finally { wl_proxy_wrapper_destroy(wrapper) }
    if registry == nint(0) { return }
    let listener = Allocate(IntPtr.Size * 2)
    Marshal.WriteIntPtr(listener, Marshal.GetFunctionPointerForDelegate(onGlobal))
    Marshal.WriteIntPtr(listener, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(onRemove))
    if wl_proxy_add_listener(registry, listener, nint(0)) != 0 { return }
    if wl_display_roundtrip_queue(display, queue) < 0 || manager == nint(0)
      || compositor == nint(0) { return }
    if wl_display_roundtrip_queue(display, queue) < 0 { return }
    let arguments * BackdropWaylandArgument = stackalloc[2]BackdropWaylandArgument
    arguments[0].Value = nint(0)
    arguments[1].Value = surface
    effect = wl_proxy_marshal_array_constructor_versioned(manager, 1u, arguments, effectInterface, 1u)
    if effect == nint(0) { return }
    var newId = BackdropWaylandArgument{}
    let region = wl_proxy_marshal_array_constructor_versioned(compositor, 1u, &newId,
      NativeLibrary.GetExport(library, "wl_region_interface"), 1u)
    if region == nint(0) { return }
    let rectangle * BackdropWaylandArgument = stackalloc[4]BackdropWaylandArgument
    rectangle[0].Value = nint(0)
    rectangle[1].Value = nint(0)
    rectangle[2].Value = nint(int32.MaxValue)
    rectangle[3].Value = nint(int32.MaxValue)
    wl_proxy_marshal_array(region, 1u, rectangle)
    var regionArgument = BackdropWaylandArgument{Value: region}
    wl_proxy_marshal_array(effect, 1u, &regionArgument)
    DestroyRequest(region)
    wl_display_flush(display)
  }

  public func Refresh() bool {
    if disposed || queue == nint(0) { return false }
    if wl_display_dispatch_queue_pending(display, queue) < 0 { return false }
    return effect != nint(0) && managerName != 0u && canBlur
  }

  public func Dispose() {
    if disposed { return }
    disposed = true
    if effect != nint(0) { DestroyRequest(effect) }
    if manager != nint(0) { DestroyRequest(manager) }
    if compositor != nint(0) { wl_proxy_destroy(compositor) }
    if registry != nint(0) { wl_proxy_destroy(registry) }
    if queue != nint(0) { wl_event_queue_destroy(queue) }
    for allocation in allocations { Marshal.FreeHGlobal(allocation) }
    if library != nint(0) { NativeLibrary.Free(library) }
    GC.KeepAlive(onGlobal)
    GC.KeepAlive(onRemove)
    GC.KeepAlive(onCapabilities)
  }

  private func Global(data nint, registry nint, name uint32, interfaceName nint, version uint32) {
    let nameText = Marshal.PtrToStringUTF8(interfaceName)
    if nameText == "wl_compositor" && compositor == nint(0) {
      compositor = Bind(name, interfaceName, NativeLibrary.GetExport(library, "wl_compositor_interface"))
    } else if nameText == "ext_background_effect_manager_v1" && manager == nint(0) {
      manager = Bind(name, interfaceName, managerInterface)
      if manager == nint(0) { return }
      managerName = name
      let listener = Allocate(IntPtr.Size)
      Marshal.WriteIntPtr(listener, Marshal.GetFunctionPointerForDelegate(onCapabilities))
      wl_proxy_add_listener(manager, listener, nint(0))
    }
  }

  private func Remove(data nint, registry nint, name uint32) {
    if name == managerName { managerName = 0u
      canBlur = false }
  }

  private func Capabilities(data nint, manager nint, flags uint32) {
    canBlur = (flags & 1u) != 0u
  }

  private func Bind(name uint32, interfaceName nint, nativeInterface nint) nint {
    let arguments * BackdropWaylandArgument = stackalloc[4]BackdropWaylandArgument
    arguments[0].Value = nint(name)
    arguments[1].Value = interfaceName
    arguments[2].Value = nint(1)
    arguments[3].Value = nint(0)
    return wl_proxy_marshal_array_constructor_versioned(registry, 0u, arguments, nativeInterface, 1u)
  }

  private func CreateInterfaces() {
    managerInterface = Allocate(Marshal.SizeOf[BackdropWaylandInterface]())
    effectInterface = Allocate(Marshal.SizeOf[BackdropWaylandInterface]())
    let surfaceType = NativeLibrary.GetExport(library, "wl_surface_interface")
    let regionType = NativeLibrary.GetExport(library, "wl_region_interface")
    let messageSize = Marshal.SizeOf[BackdropWaylandMessage]()
    let managerMethods = Allocate(messageSize * 2)
    WriteMessage(managerMethods, "destroy", "", nint(0))
    let types = Allocate(IntPtr.Size * 2)
    Marshal.WriteIntPtr(types, effectInterface)
    Marshal.WriteIntPtr(types, IntPtr.Size, surfaceType)
    WriteMessage(managerMethods + nint(messageSize), "get_background_effect", "no", types)
    let events = Allocate(messageSize)
    WriteMessage(events, "capabilities", "u", nint(0))
    let methods = Allocate(messageSize * 2)
    WriteMessage(methods, "destroy", "", nint(0))
    let regionTypes = Allocate(IntPtr.Size)
    Marshal.WriteIntPtr(regionTypes, regionType)
    WriteMessage(methods + nint(messageSize), "set_blur_region", "?o", regionTypes)
    Marshal.StructureToPtr[BackdropWaylandInterface](BackdropWaylandInterface{
      Name: Text("ext_background_effect_manager_v1"), Version: 1,
      MethodCount: 2, Methods: managerMethods, EventCount: 1, Events: events,
    }, managerInterface, false)
    Marshal.StructureToPtr[BackdropWaylandInterface](BackdropWaylandInterface{
      Name: Text("ext_background_effect_surface_v1"), Version: 1,
      MethodCount: 2, Methods: methods,
    }, effectInterface, false)
  }

  private func WriteMessage(address nint, name string, signature string, types nint) {
    Marshal.StructureToPtr[BackdropWaylandMessage](BackdropWaylandMessage{
      Name: Text(name), Signature: Text(signature), Types: types,
    }, address, false)
  }

  private func Allocate(size int32) nint {
    let value = Marshal.AllocHGlobal(size)
    allocations.Add(value)
    return value
  }

  private func Text(value string) nint {
    let text = Marshal.StringToHGlobalAnsi(value)
    allocations.Add(text)
    return text
  }

  shared {
    private func DestroyRequest(proxy nint) {
      wl_proxy_marshal_array(proxy, 0u, nil)
      wl_proxy_destroy(proxy)
    }
    @DllImport("libwayland-client.so.0") private func wl_display_create_queue(display nint) nint;
    @DllImport("libwayland-client.so.0") private func wl_event_queue_destroy(queue nint);
    @DllImport("libwayland-client.so.0") private func wl_proxy_create_wrapper(proxy nint) nint;
    @DllImport("libwayland-client.so.0") private func wl_proxy_wrapper_destroy(proxy nint);
    @DllImport("libwayland-client.so.0") private func wl_proxy_set_queue(proxy nint, queue nint);
    @DllImport("libwayland-client.so.0") private func wl_proxy_add_listener(proxy nint, listener nint, data nint) int32;
    @DllImport("libwayland-client.so.0") private func wl_proxy_marshal_array_constructor_versioned(proxy nint, opcode uint32, arguments * BackdropWaylandArgument, nativeInterface nint, version uint32) nint;
    @DllImport("libwayland-client.so.0") private func wl_proxy_marshal_array(proxy nint, opcode uint32, arguments * BackdropWaylandArgument);
    @DllImport("libwayland-client.so.0") private func wl_proxy_destroy(proxy nint);
    @DllImport("libwayland-client.so.0") private func wl_display_roundtrip_queue(display nint, queue nint) int32;
    @DllImport("libwayland-client.so.0") private func wl_display_dispatch_queue_pending(display nint, queue nint) int32;
    @DllImport("libwayland-client.so.0") private func wl_display_flush(display nint) int32;
  }
}
