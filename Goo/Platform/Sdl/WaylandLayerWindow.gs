package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Diagnostics
import System.Threading

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate LayerWaylandConfigure(data nint, layerSurface nint, serial uint32, width uint32, height uint32);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate LayerWaylandClosed(data nint, layerSurface nint);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate LayerWaylandFrame(data nint, callback nint, time uint32);

internal unsafe sealed class WaylandLayerWindow : IDisposable {
  private let display nint
  private let surface nint
  private let options LayerWindowOptions
  private let resize Action[int32, int32]
  private let requestClose Action
  private let allocations List[nint] = List[nint]()
  private let onGlobal BackdropWaylandGlobal
  private let onRemove BackdropWaylandRemove
  private let onConfigure LayerWaylandConfigure
  private let onClosed LayerWaylandClosed
  private let onFrame LayerWaylandFrame
  private var library nint
  private var queue nint
  private var registry nint
  private var manager nint
  private var layerSurface nint
  private var surfaceListener nint
  private var namespaceText nint
  private var managerInterface nint
  private var surfaceInterface nint
  private var version uint32
  private var mapped bool
  private var disposed bool
  private var failure Exception?
  private var frameListener nint
  private var framePending bool
  internal prop Presented bool { get; set; }
  internal prop Configured bool { get; private set; }
  internal prop Visible bool { get -> mapped && Configured }
  internal prop Output WindowDisplayId? { get -> options.Output }

  internal init(display nint, surface nint, output nint, options LayerWindowOptions,
    resize Action[int32, int32], requestClose Action) {
    this.display = display
    this.surface = surface
    this.options = options
    this.resize = resize
    this.requestClose = requestClose
    onGlobal = Global
    onRemove = Remove
    onConfigure = Configure
    onClosed = Closed
    onFrame = (data nint, callback nint, time uint32) -> { framePending = false }
    try { Initialize(output) }
    catch (error Exception) { Dispose()
      throw error }
  }

  private func Initialize(output nint) {
    library = NativeLibrary.Load("libwayland-client.so.0")
    queue = WaylandBackdrop.wl_display_create_queue(display)
    if queue == nint(0) { throw InvalidOperationException("Cannot create the layer-shell event queue") }
    CreateInterfaces()
    let wrapper = WaylandBackdrop.wl_proxy_create_wrapper(display)
    if wrapper == nint(0) { throw InvalidOperationException("Cannot wrap the Wayland display") }
    try {
      WaylandBackdrop.wl_proxy_set_queue(wrapper, queue)
      var argument = BackdropWaylandArgument{}
      registry = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(wrapper, 1u, &argument,
        NativeLibrary.GetExport(library, "wl_registry_interface"), 1u)
    } finally { WaylandBackdrop.wl_proxy_wrapper_destroy(wrapper) }
    if registry == nint(0) { throw InvalidOperationException("Cannot obtain the Wayland registry") }
    let listener = Allocate(IntPtr.Size * 2)
    Marshal.WriteIntPtr(listener, Marshal.GetFunctionPointerForDelegate(onGlobal))
    Marshal.WriteIntPtr(listener, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(onRemove))
    if WaylandBackdrop.wl_proxy_add_listener(registry, listener, nint(0)) != 0 {
      throw InvalidOperationException("Cannot listen to the Wayland registry")
    }
    Roundtrip()
    if manager == nint(0) { throw NotSupportedException("The Wayland compositor does not support zwlr_layer_shell_v1") }
    if version < 2u { throw NotSupportedException("Layer-shell version 2 or newer is required") }
    if options.KeyboardInteractivity == LayerWindowKeyboardInteractivity.OnDemand && version < 4u {
      throw NotSupportedException("On-demand keyboard interactivity requires layer-shell version 4")
    }
    namespaceText = Text(options.Namespace)
    surfaceListener = Allocate(IntPtr.Size * 2)
    Marshal.WriteIntPtr(surfaceListener, Marshal.GetFunctionPointerForDelegate(onConfigure))
    Marshal.WriteIntPtr(surfaceListener, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(onClosed))
    frameListener = Allocate(IntPtr.Size)
    Marshal.WriteIntPtr(frameListener, Marshal.GetFunctionPointerForDelegate(onFrame))
    CreateLayerSurface(output)
  }

  private func CreateLayerSurface(output nint) {
    let arguments * BackdropWaylandArgument = stackalloc[5]BackdropWaylandArgument
    arguments[0].Value = nint(0)
    arguments[1].Value = surface
    arguments[2].Value = output
    arguments[3].Value = nint(uint32(options.Layer))
    arguments[4].Value = namespaceText
    layerSurface = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(manager, 0u, arguments, surfaceInterface, version)
    if layerSurface == nint(0) { throw InvalidOperationException("Cannot create the layer-shell surface") }
    if WaylandBackdrop.wl_proxy_add_listener(layerSurface, surfaceListener, nint(0)) != 0 {
      throw InvalidOperationException("Cannot listen to the layer-shell surface")
    }
  }

  internal func Show() {
    if mapped { return }
    let arguments * BackdropWaylandArgument = stackalloc[4]BackdropWaylandArgument
    arguments[0].Value = nint(options.Width)
    arguments[1].Value = nint(options.Height)
    WaylandBackdrop.wl_proxy_marshal_array(layerSurface, 0u, arguments)
    arguments[0].Value = nint(uint32(options.Anchors))
    WaylandBackdrop.wl_proxy_marshal_array(layerSurface, 1u, arguments)
    arguments[0].Value = nint(options.ExclusiveZone)
    WaylandBackdrop.wl_proxy_marshal_array(layerSurface, 2u, arguments)
    arguments[0].Value = nint(options.MarginTop)
    arguments[1].Value = nint(options.MarginRight)
    arguments[2].Value = nint(options.MarginBottom)
    arguments[3].Value = nint(options.MarginLeft)
    WaylandBackdrop.wl_proxy_marshal_array(layerSurface, 3u, arguments)
    arguments[0].Value = nint(uint32(options.KeyboardInteractivity))
    WaylandBackdrop.wl_proxy_marshal_array(layerSurface, 4u, arguments)
    arguments[0].Value = nint(uint32(options.Layer))
    WaylandBackdrop.wl_proxy_marshal_array(layerSurface, 8u, arguments)
    mapped = true
    WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
    Roundtrip()
  }

  internal func Hide() {
    if !mapped { return }
    Pump()
    if Presented { DrainFrame() }
    let arguments * BackdropWaylandArgument = stackalloc[3]BackdropWaylandArgument
    arguments[0].Value = nint(0)
    arguments[1].Value = nint(0)
    arguments[2].Value = nint(0)
    WaylandBackdrop.wl_proxy_marshal_array(surface, 1u, arguments)
    WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
    mapped = false
    Configured = false
    Presented = false
    Roundtrip()
  }

  private func DrainFrame() {
    var argument = BackdropWaylandArgument{}
    let callback = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(surface, 3u, &argument,
      NativeLibrary.GetExport(library, "wl_callback_interface"), 1u)
    if callback == nint(0) { throw InvalidOperationException("Cannot create the layer frame callback") }
    try {
      WaylandBackdrop.wl_proxy_set_queue(callback, queue)
      if WaylandBackdrop.wl_proxy_add_listener(callback, frameListener, nint(0)) != 0 {
        throw InvalidOperationException("Cannot listen to the layer frame callback")
      }
      framePending = true
      WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
      let started = Stopwatch.GetTimestamp()
      while framePending && Stopwatch.GetElapsedTime(started).TotalMilliseconds < 500.0 {
        Roundtrip()
        if framePending { Thread.Sleep(1) }
      }
    } finally { WaylandBackdrop.wl_proxy_destroy(callback) }
  }

  internal func Pump() {
    if disposed { return }
    if WaylandBackdrop.wl_display_dispatch_queue_pending(display, queue) < 0 {
      throw InvalidOperationException("Layer-shell event dispatch failed")
    }
    if let error = failure { throw error }
  }

  private func Roundtrip() {
    if WaylandBackdrop.wl_display_roundtrip_queue(display, queue) < 0 { throw InvalidOperationException("Layer-shell Wayland roundtrip failed") }
    if let error = failure { throw error }
  }

  private func Configure(data nint, proxy nint, serial uint32, width uint32, height uint32) {
    if !mapped { return }
    try {
      var argument = BackdropWaylandArgument{Value: nint(serial)}
      WaylandBackdrop.wl_proxy_marshal_array(proxy, 6u, &argument)
      resize(width == 0u ? Math.Max(1, options.Width) : checked(int32(width)),
        height == 0u ? Math.Max(1, options.Height) : checked(int32(height)))
      Configured = true
      WaylandBackdrop.wl_display_flush(display)
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
    manager = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(registry, 0u, arguments, managerInterface, version)
  }

  private func Remove(data nint, registry nint, name uint32) { }

  public func Dispose() {
    if disposed { return }
    disposed = true
    if layerSurface != nint(0) {
      WaylandBackdrop.wl_proxy_marshal_array(layerSurface, 7u, nil)
      WaylandBackdrop.wl_proxy_destroy(layerSurface)
    }
    if manager != nint(0) {
      if version >= 3u { WaylandBackdrop.wl_proxy_marshal_array(manager, 1u, nil) }
      WaylandBackdrop.wl_proxy_destroy(manager)
    }
    if registry != nint(0) { WaylandBackdrop.wl_proxy_destroy(registry) }
    if queue != nint(0) { WaylandBackdrop.wl_event_queue_destroy(queue) }
    if display != nint(0) { WaylandBackdrop.wl_display_flush(display) }
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

}
