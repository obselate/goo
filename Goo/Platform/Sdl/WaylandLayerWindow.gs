package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate LayerWaylandConfigure(data nint, layerSurface nint, serial uint32, width uint32, height uint32);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate LayerWaylandClosed(data nint, layerSurface nint);

internal unsafe sealed class WaylandLayerWindow : IDisposable {
  private let display nint
  private let surface nint
  private let output nint
  private let options LayerWindowOptions
  private let resize Action[int32, int32]
  private let requestClose Action
  private let allocations List[nint] = List[nint]()
  private let onGlobal BackdropWaylandGlobal
  private let onRemove BackdropWaylandRemove
  private let onConfigure LayerWaylandConfigure
  private let onClosed LayerWaylandClosed
  private var library nint
  private var queue nint
  private var registry nint
  private var manager nint
  private var layerSurface nint
  private var managerInterface nint
  private var surfaceInterface nint
  private var version uint32
  private var mapped bool
  private var disposed bool
  private var failure Exception?
  internal prop Configured bool { get; private set; }
  internal prop Visible bool { get -> mapped && Configured }

  internal init(display nint, surface nint, output nint, options LayerWindowOptions,
    resize Action[int32, int32], requestClose Action) {
    this.display = display
    this.surface = surface
    this.output = output
    this.options = options
    this.resize = resize
    this.requestClose = requestClose
    onGlobal = Global
    onRemove = Remove
    onConfigure = Configure
    onClosed = Closed
    try { Initialize() }
    catch (error Exception) { Dispose()
      throw error }
  }

  private func Initialize() {
    library = NativeLibrary.Load("libwayland-client.so.0")
    queue = wl_display_create_queue(display)
    if queue == nint(0) { throw InvalidOperationException("Cannot create the layer-shell event queue") }
    CreateInterfaces()
    let wrapper = wl_proxy_create_wrapper(display)
    if wrapper == nint(0) { throw InvalidOperationException("Cannot wrap the Wayland display") }
    try {
      wl_proxy_set_queue(wrapper, queue)
      var argument = BackdropWaylandArgument{}
      registry = wl_proxy_marshal_array_constructor_versioned(wrapper, 1u, &argument,
        NativeLibrary.GetExport(library, "wl_registry_interface"), 1u)
    } finally { wl_proxy_wrapper_destroy(wrapper) }
    if registry == nint(0) { throw InvalidOperationException("Cannot obtain the Wayland registry") }
    let listener = Allocate(IntPtr.Size * 2)
    Marshal.WriteIntPtr(listener, Marshal.GetFunctionPointerForDelegate(onGlobal))
    Marshal.WriteIntPtr(listener, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(onRemove))
    if wl_proxy_add_listener(registry, listener, nint(0)) != 0 {
      throw InvalidOperationException("Cannot listen to the Wayland registry")
    }
    Roundtrip()
    if manager == nint(0) { throw NotSupportedException("The Wayland compositor does not support zwlr_layer_shell_v1") }
    if options.KeyboardInteractivity == LayerWindowKeyboardInteractivity.OnDemand && version < 4u {
      throw NotSupportedException("On-demand keyboard interactivity requires layer-shell version 4")
    }
    let arguments * BackdropWaylandArgument = stackalloc[5]BackdropWaylandArgument
    arguments[0].Value = nint(0)
    arguments[1].Value = surface
    arguments[2].Value = output
    arguments[3].Value = nint(uint32(options.Layer))
    arguments[4].Value = Text(options.Namespace)
    layerSurface = wl_proxy_marshal_array_constructor_versioned(manager, 0u, arguments, surfaceInterface, version)
    if layerSurface == nint(0) { throw InvalidOperationException("Cannot create the layer-shell surface") }
    let surfaceListener = Allocate(IntPtr.Size * 2)
    Marshal.WriteIntPtr(surfaceListener, Marshal.GetFunctionPointerForDelegate(onConfigure))
    Marshal.WriteIntPtr(surfaceListener, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(onClosed))
    if wl_proxy_add_listener(layerSurface, surfaceListener, nint(0)) != 0 {
      throw InvalidOperationException("Cannot listen to the layer-shell surface")
    }
  }

  internal func Show() {
    if mapped { return }
    let arguments * BackdropWaylandArgument = stackalloc[4]BackdropWaylandArgument
    arguments[0].Value = nint(options.Width)
    arguments[1].Value = nint(options.Height)
    wl_proxy_marshal_array(layerSurface, 0u, arguments)
    arguments[0].Value = nint(uint32(options.Anchors))
    wl_proxy_marshal_array(layerSurface, 1u, arguments)
    arguments[0].Value = nint(options.ExclusiveZone)
    wl_proxy_marshal_array(layerSurface, 2u, arguments)
    arguments[0].Value = nint(options.MarginTop)
    arguments[1].Value = nint(options.MarginRight)
    arguments[2].Value = nint(options.MarginBottom)
    arguments[3].Value = nint(options.MarginLeft)
    wl_proxy_marshal_array(layerSurface, 3u, arguments)
    arguments[0].Value = nint(uint32(options.KeyboardInteractivity))
    wl_proxy_marshal_array(layerSurface, 4u, arguments)
    mapped = true
    wl_proxy_marshal_array(surface, 6u, nil)
    Roundtrip()
  }

  internal func Hide() {
    if !mapped { return }
    let arguments * BackdropWaylandArgument = stackalloc[3]BackdropWaylandArgument
    arguments[0].Value = nint(0)
    arguments[1].Value = nint(0)
    arguments[2].Value = nint(0)
    wl_proxy_marshal_array(surface, 1u, arguments)
    wl_proxy_marshal_array(surface, 6u, nil)
    mapped = false
    Configured = false
    wl_display_flush(display)
  }

  internal func Pump() {
    if disposed { return }
    if wl_display_dispatch_queue_pending(display, queue) < 0 {
      throw InvalidOperationException("Layer-shell event dispatch failed")
    }
    if let error = failure { throw error }
  }

  private func Roundtrip() {
    if wl_display_roundtrip_queue(display, queue) < 0 { throw InvalidOperationException("Layer-shell Wayland roundtrip failed") }
    if let error = failure { throw error }
  }

  private func Configure(data nint, proxy nint, serial uint32, width uint32, height uint32) {
    try {
      var argument = BackdropWaylandArgument{Value: nint(serial)}
      wl_proxy_marshal_array(proxy, 6u, &argument)
      resize(width == 0u ? Math.Max(1, options.Width) : checked(int32(width)),
        height == 0u ? Math.Max(1, options.Height) : checked(int32(height)))
      Configured = true
      wl_display_flush(display)
    } catch (error Exception) { failure = error }
  }

  private func Closed(data nint, proxy nint) {
    mapped = false
    Configured = false
    try { requestClose() } catch (error Exception) { failure = error }
  }

  private func Global(data nint, registry nint, name uint32, interfaceName nint, advertisedVersion uint32) {
    if Marshal.PtrToStringUTF8(interfaceName) != "zwlr_layer_shell_v1" || manager != nint(0) { return }
    version = Math.Min(advertisedVersion, 4u)
    let arguments * BackdropWaylandArgument = stackalloc[4]BackdropWaylandArgument
    arguments[0].Value = nint(name)
    arguments[1].Value = interfaceName
    arguments[2].Value = nint(version)
    arguments[3].Value = nint(0)
    manager = wl_proxy_marshal_array_constructor_versioned(registry, 0u, arguments, managerInterface, version)
  }

  private func Remove(data nint, registry nint, name uint32) { }

  public func Dispose() {
    if disposed { return }
    disposed = true
    if layerSurface != nint(0) {
      wl_proxy_marshal_array(layerSurface, 7u, nil)
      wl_proxy_destroy(layerSurface)
    }
    if manager != nint(0) {
      if version >= 3u { wl_proxy_marshal_array(manager, 1u, nil) }
      wl_proxy_destroy(manager)
    }
    if registry != nint(0) { wl_proxy_destroy(registry) }
    if queue != nint(0) { wl_event_queue_destroy(queue) }
    if display != nint(0) { wl_display_flush(display) }
    for allocation in allocations { Marshal.FreeHGlobal(allocation) }
    if library != nint(0) { NativeLibrary.Free(library) }
    GC.KeepAlive(onGlobal)
    GC.KeepAlive(onRemove)
    GC.KeepAlive(onConfigure)
    GC.KeepAlive(onClosed)
  }

  private func CreateInterfaces() {
    managerInterface = Allocate(Marshal.SizeOf[BackdropWaylandInterface]())
    surfaceInterface = Allocate(Marshal.SizeOf[BackdropWaylandInterface]())
    let messageSize = Marshal.SizeOf[BackdropWaylandMessage]()
    let managerMethods = Allocate(messageSize * 2)
    let types = Allocate(IntPtr.Size * 5)
    Marshal.WriteIntPtr(types, surfaceInterface)
    Marshal.WriteIntPtr(types, IntPtr.Size, NativeLibrary.GetExport(library, "wl_surface_interface"))
    Marshal.WriteIntPtr(types, IntPtr.Size * 2, NativeLibrary.GetExport(library, "wl_output_interface"))
    Marshal.WriteIntPtr(types, IntPtr.Size * 3, nint(0))
    Marshal.WriteIntPtr(types, IntPtr.Size * 4, nint(0))
    WriteMessage(managerMethods, "get_layer_surface", "no?ous", types)
    WriteMessage(managerMethods + nint(messageSize), "destroy", "3", nint(0))
    let methods = Allocate(messageSize * 9)
    WriteMessage(methods, "set_size", "uu", nint(0))
    WriteMessage(methods + nint(messageSize), "set_anchor", "u", nint(0))
    WriteMessage(methods + nint(messageSize * 2), "set_exclusive_zone", "i", nint(0))
    WriteMessage(methods + nint(messageSize * 3), "set_margin", "iiii", nint(0))
    WriteMessage(methods + nint(messageSize * 4), "set_keyboard_interactivity", "u", nint(0))
    WriteMessage(methods + nint(messageSize * 5), "get_popup", "o", nint(0))
    WriteMessage(methods + nint(messageSize * 6), "ack_configure", "u", nint(0))
    WriteMessage(methods + nint(messageSize * 7), "destroy", "", nint(0))
    WriteMessage(methods + nint(messageSize * 8), "set_layer", "2u", nint(0))
    let events = Allocate(messageSize * 2)
    WriteMessage(events, "configure", "uuu", nint(0))
    WriteMessage(events + nint(messageSize), "closed", "", nint(0))
    Marshal.StructureToPtr[BackdropWaylandInterface](BackdropWaylandInterface{
      Name: Text("zwlr_layer_shell_v1"), Version: 4, MethodCount: 2, Methods: managerMethods,
    }, managerInterface, false)
    Marshal.StructureToPtr[BackdropWaylandInterface](BackdropWaylandInterface{
      Name: Text("zwlr_layer_surface_v1"), Version: 4, MethodCount: 9, Methods: methods,
      EventCount: 2, Events: events,
    }, surfaceInterface, false)
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
