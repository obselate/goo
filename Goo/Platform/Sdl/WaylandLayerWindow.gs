package Goo

import Hexa.NET.SDL3
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

@StructLayout(LayoutKind.Sequential)
internal struct LayerWaylandArguments {
  internal var First nint
  internal var Second nint
  internal var Third nint
  internal var Fourth nint
  internal var Fifth nint
  internal var Sixth nint
}

internal unsafe sealed class WaylandLayerWindow : IDisposable {
  private const EPIPE int32 = 32
  private const ECONNRESET int32 = 104

  private let display nint
  private let surface nint
  private let options LayerWindowOptions
  private var geometry LayerWindowOptions
  private let resize Action[int32, int32]
  private let requestClose Action
  private let allocations List[nint] = List[nint]()
  private let onGlobal BackdropWaylandGlobal
  private let onRemove BackdropWaylandRemove
  private let onConfigure LayerWaylandConfigure
  private let onClosed LayerWaylandClosed
  private let onFrame LayerWaylandFrame
  private var library nint
  private var callbackInterface nint
  private var queue nint
  private var registry nint
  private var manager nint
  private var layerSurface nint
  private var surfaceListener nint
  private var namespaceText nint
  private var version uint32
  private var mapped bool
  private var closed bool
  private var disposed bool
  private var closePending bool
  private var pendingConfigure (uint32, uint32, uint32)?
  private var configureAck uint32?
  private var pendingGeometry LayerWindowOptions?
  private var pendingGeometryHold bool
  private var awaitingResizeConfigure bool
  private var resizeConfigureReceived bool
  private var frameListener nint
  private var presentFrame nint
  private var bufferCommitPending bool
  private var framePending bool
  private var still WaylandStillImage?
  private var stillSource LayerWindowImage?
  private var loadingImage LayerWindowImage?
  private var configuredWidth int32
  private var configuredHeight int32
  internal prop PresentsStillImage bool { get -> still != nil }
  internal prop StillImagePreparationReady bool { get -> loadingImage?.PreparationReady == true }
  internal prop StillImagePending bool {
    get -> still != nil && (configureAck != nil || still?.NeedsCommit(configuredWidth, configuredHeight) == true)
  }
  internal prop Presented bool { get; set; }
  internal prop Configured bool { get; private set; }
  internal prop Visible bool { get -> mapped && Configured }
  internal prop ResizePending bool { get -> awaitingResizeConfigure || pendingGeometryHold }
  internal prop FrameReady bool { get -> presentFrame == nint(0) && !ResizePending }
  internal prop Output WindowDisplayId? { get -> options.Output }
  internal prop Layer WindowLayer { get -> options.Layer }
  internal prop KeyboardInteractivity LayerWindowKeyboardInteractivity { get -> geometry.KeyboardInteractivity }

  internal init(display nint, surface nint, output nint, options LayerWindowOptions,
    resize Action[int32, int32], requestClose Action) {
    this.display = display
    this.surface = surface
    this.options = options
    geometry = options
    this.resize = resize
    this.requestClose = requestClose
    onGlobal = Global
    onRemove = Remove
    onConfigure = Configure
    onClosed = Closed
    onFrame = FrameDone
    try { Initialize(output) }
    catch (error Exception) { Dispose()
      rethrow }
  }

  private func Initialize(output nint) {
    library = NativeLibrary.Load("libwayland-client.so.0")
    callbackInterface = NativeLibrary.GetExport(library, "wl_callback_interface")
    queue = WaylandBackdrop.wl_display_create_queue(display)
    if queue == nint(0) { throw InvalidOperationException("Cannot create the layer-shell event queue") }
    if surfaceInterface == nint(0) { CreateInterfaces(library) }
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
    if !Roundtrip() { return }
    WaylandBackdrop.wl_proxy_destroy(registry)
    registry = nint(0)
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
    WaylandBackdrop.wl_proxy_set_queue(manager, nint(0))
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
    if closed || mapped { return }
    ApplyGeometry()
    var arguments = LayerWaylandArguments{First: nint(uint32(options.Layer))}
    MarshalRequest(layerSurface, 8u, ref arguments)
    mapped = true
    WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
    Roundtrip(dispatchLayer: true)
  }

  internal func SupportsGeometry(value LayerWindowOptions) bool ->
    value.Layer == options.Layer && value.Namespace == options.Namespace
      && value.Output?.NativeValue == options.Output?.NativeValue
      && (value.KeyboardInteractivity != LayerWindowKeyboardInteractivity.OnDemand || version >= 4u)

  internal func SetGeometry(value LayerWindowOptions, holdForConfigure bool) {
    if bufferCommitPending || awaitingResizeConfigure && holdForConfigure {
      pendingGeometry = value
      pendingGeometryHold = holdForConfigure
      return
    }
    pendingGeometry = nil
    pendingGeometryHold = false
    if mapped && (geometry.Width != value.Width || geometry.Height != value.Height) {
      awaitingResizeConfigure = holdForConfigure
      resizeConfigureReceived = false
    }
    geometry = value
    if !mapped { return }
    ApplyGeometry()
    WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
    WaylandBackdrop.wl_display_flush(display)
  }

  private func ApplyGeometry() {
    var arguments = LayerWaylandArguments{First: nint(geometry.Width), Second: nint(geometry.Height)}
    MarshalRequest(layerSurface, 0u, ref arguments)
    arguments.First = nint(uint32(geometry.Anchors))
    MarshalRequest(layerSurface, 1u, ref arguments)
    arguments.First = nint(geometry.ExclusiveZone)
    MarshalRequest(layerSurface, 2u, ref arguments)
    arguments.First = nint(geometry.MarginTop)
    arguments.Second = nint(geometry.MarginRight)
    arguments.Third = nint(geometry.MarginBottom)
    arguments.Fourth = nint(geometry.MarginLeft)
    MarshalRequest(layerSurface, 3u, ref arguments)
    arguments.First = nint(uint32(geometry.KeyboardInteractivity))
    MarshalRequest(layerSurface, 4u, ref arguments)
  }

  internal func Hide() {
    if !mapped { return }
    Pump()
    if !mapped { return }
    if Presented && still == nil {
      DrainFrame()
      if !mapped { return }
    }
    var arguments = LayerWaylandArguments{}
    MarshalRequest(surface, 1u, ref arguments)
    WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
    bufferCommitPending = false
    configureAck = nil
    awaitingResizeConfigure = false
    pendingGeometryHold = false
    resizeConfigureReceived = false
    if let next = pendingGeometry {
      geometry = next
      pendingGeometry = nil
    }
    mapped = false
    if Presented { Configured = false }
    Presented = false
    still?.Invalidate()
    FinishPresent(false)
    Roundtrip(dispatchLayer: true)
  }

  internal func SetStillImage(host SdlHost, viewport nint, source LayerWindowImage?, pixel uint32, owner Window) bool {
    still ??= WaylandStillImage.TryCreate(display, surface, viewport)
    guard let presenter = still else { return false }
    if !presenter.SetCanvas(pixel) { return !FinishStillImagePreparation() }
    if !Object.ReferenceEquals(loadingImage, source) && !FinishStillImagePreparation() { return true }
    if let requested = source {
      let result = requested.TryAttach(host, presenter, owner)
      loadingImage = result == nil ? requested : nil
      if result == nil { return true }
      if result == false { return false }
    } else if stillSource != nil && !presenter.SetImage(nil) { return false }
    if !Object.ReferenceEquals(source, stillSource) { stillSource?.ReleaseNative(presenter) }
    stillSource = source
    return true
  }

  internal func FinishStillImagePreparation() bool {
    if let presenter = still {
      if loadingImage?.FinishPreparation(presenter) == false { return false }
    }
    loadingImage = nil
    return true
  }

  internal func StopStillImage() {
    guard let presenter = still else { return }
    FinishPresent(false)
    bufferCommitPending = false
    presenter.Dispose()
    still = nil
    stillSource?.ReleaseNative(presenter)
    stillSource = nil
  }

  internal func PresentStillImage() bool {
    guard let presenter = still else { return false }
    if !Visible || !FrameReady { return false }
    let changed = presenter.NeedsCommit(configuredWidth, configuredHeight)
    if configureAck == nil && !changed { return false }
    PreparePresent(changed)
    if changed {
      presenter.PrepareCommit(configuredWidth, configuredHeight, stillSource?.Fit ?? ImageFit.Cover)
      Presented = true
    }
    WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
    WaylandBackdrop.wl_display_flush(display)
    return changed
  }

  internal func PreparePresent(requestFrame bool = true) {
    if let serial = configureAck {
      var arguments = LayerWaylandArguments{First: nint(serial)}
      MarshalRequest(layerSurface, 6u, ref arguments)
      configureAck = nil
    }
    if requestFrame {
      bufferCommitPending = true
      presentFrame = RequestFrame(nint(0))
    }
  }

  internal func FinishPresent(committed bool) {
    if !committed && presentFrame != nint(0) {
      WaylandBackdrop.wl_proxy_destroy(presentFrame)
      presentFrame = nint(0)
    }
  }

  private func FrameDone(data nint, callback nint, time uint32) {
    if callback == presentFrame {
      WaylandBackdrop.wl_proxy_destroy(callback)
      presentFrame = nint(0)
      bufferCommitPending = false
      SdlRuntime.Wake()
    } else {
      framePending = false
    }
  }

  private func RequestFrame(eventQueue nint) nint {
    var argument = BackdropWaylandArgument{}
    let callback = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(surface, 3u, &argument, callbackInterface, 1u)
    if callback == nint(0) { throw InvalidOperationException("Cannot create the layer frame callback") }
    WaylandBackdrop.wl_proxy_set_queue(callback, eventQueue)
    if WaylandBackdrop.wl_proxy_add_listener(callback, frameListener, nint(0)) != 0 {
      WaylandBackdrop.wl_proxy_destroy(callback)
      throw InvalidOperationException("Cannot listen to the layer frame callback")
    }
    return callback
  }

  private func DrainFrame() {
    if bufferCommitPending {
      let started = Stopwatch.GetTimestamp()
      while presentFrame != nint(0) && Stopwatch.GetElapsedTime(started).TotalMilliseconds < 500.0 {
        if !Roundtrip(dispatchLayer: true) { return }
        if presentFrame != nint(0) { Thread.Sleep(1) }
      }
      return
    }
    let callback = RequestFrame(queue)
    try {
      framePending = true
      WaylandBackdrop.wl_proxy_marshal_array(surface, 6u, nil)
      let started = Stopwatch.GetTimestamp()
      while framePending && Stopwatch.GetElapsedTime(started).TotalMilliseconds < 500.0 {
        if !Roundtrip() { return }
        if framePending { Thread.Sleep(1) }
      }
    } finally { WaylandBackdrop.wl_proxy_destroy(callback) }
  }

  internal func Pump() {
    if disposed || closed { return }
    let errno = WaylandBackdrop.wl_display_get_error(display)
    if errno != 0 {
      if HandleDisconnect(errno) { return }
      throw InvalidOperationException("Layer-shell event dispatch failed (errno $errno)")
    }
    if closePending {
      MarkClosed()
      requestClose()
      return
    }
    if let configure = pendingConfigure {
      pendingConfigure = nil
      if !mapped { return }
      let (serial, width, height) = configure
      configureAck = serial
      configuredWidth = width == 0u ? Math.Max(1, geometry.Width) : checked(int32(width))
      configuredHeight = height == 0u ? Math.Max(1, geometry.Height) : checked(int32(height))
      resize(configuredWidth, configuredHeight)
      Configured = true
      if resizeConfigureReceived { awaitingResizeConfigure = false }
    }
    if !bufferCommitPending && !awaitingResizeConfigure && pendingGeometry != nil {
      SetGeometry(pendingGeometry!!, pendingGeometryHold)
    }
  }

  private func MarkClosed() {
    closed = true
    mapped = false
    Configured = false
    pendingConfigure = nil
  }

  private func HandleDisconnect(errno int32) bool {
    if errno != EPIPE && errno != ECONNRESET { return false }
    let protocolCode = wl_display_get_protocol_error(display, out var protocolInterface, out var objectId)
    if protocolCode != 0u || protocolInterface != nint(0) || objectId != 0u { return false }
    MarkClosed()
    var termination = SDLEvent{Type: uint32(SDLEventType.Terminating)}
    SDL.PushEvent(ref termination)
    return true
  }

  private func Roundtrip(dispatchLayer bool = false) bool {
    let result = dispatchLayer ? wl_display_roundtrip(display) : WaylandBackdrop.wl_display_roundtrip_queue(display, queue)
    if result >= 0 { return true }
    if HandleDisconnect(WaylandBackdrop.wl_display_get_error(display)) { return false }
    throw InvalidOperationException("Layer-shell Wayland roundtrip failed")
  }

  private func Configure(data nint, proxy nint, serial uint32, width uint32, height uint32) {
    if !mapped { return }
    pendingConfigure = (serial, width, height)
    resizeConfigureReceived = true
    SdlRuntime.Wake()
  }

  private func Closed(data nint, proxy nint) {
    closePending = true
    SdlRuntime.Wake()
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
    StopStillImage()
    FinishPresent(false)
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

  shared {
    // Events queued before a proxy is destroyed still point at these descriptors, so they live for the process.
    private var managerInterface nint
    private var surfaceInterface nint

    @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array")
    private func MarshalRequest(proxy nint, opcode uint32, ref arguments LayerWaylandArguments);

    @DllImport("libwayland-client.so.0")
    private func wl_display_roundtrip(display nint) int32;

    @DllImport("libwayland-client.so.0")
    private func wl_display_get_protocol_error(display nint, out protocolInterface nint, out objectId uint32) uint32;

    private func CreateInterfaces(library nint) {
      let manager = AllocateInterface()
      let layerSurface = AllocateInterface()
      WriteInterface(manager, "zwlr_layer_shell_v1", 4, [](string, string, []nint){
        ("get_layer_surface", "no?ous", []nint{layerSurface, NativeLibrary.GetExport(library, "wl_surface_interface"),
          NativeLibrary.GetExport(library, "wl_output_interface"), nint(0), nint(0)}),
        ("destroy", "3", []nint{})}, [](string, string, []nint){})
      WriteInterface(layerSurface, "zwlr_layer_surface_v1", 4, [](string, string, []nint){
        ("set_size", "uu", []nint{}), ("set_anchor", "u", []nint{}), ("set_exclusive_zone", "i", []nint{}),
        ("set_margin", "iiii", []nint{}), ("set_keyboard_interactivity", "u", []nint{}), ("get_popup", "o", []nint{}),
        ("ack_configure", "u", []nint{}), ("destroy", "", []nint{}), ("set_layer", "2u", []nint{})},
        [](string, string, []nint){("configure", "uuu", []nint{}), ("closed", "", []nint{})})
      managerInterface = manager
      surfaceInterface = layerSurface
    }

    internal func AllocateInterface() nint -> Marshal.AllocHGlobal(Marshal.SizeOf[BackdropWaylandInterface]())

    internal func WriteInterface(address nint, name string, version int32,
      methods [](string, string, []nint), events [](string, string, []nint)) {
      Marshal.StructureToPtr[BackdropWaylandInterface](BackdropWaylandInterface{
        Name: Marshal.StringToHGlobalAnsi(name), Version: version, MethodCount: methods.Length, Methods: WriteMessages(methods),
        EventCount: events.Length, Events: WriteMessages(events)}, address, false)
    }

    private func WriteMessages(messages [](string, string, []nint)) nint {
      if messages.Length == 0 { return nint(0) }
      let size = Marshal.SizeOf[BackdropWaylandMessage]()
      let address = Marshal.AllocHGlobal(size * messages.Length)
      for index in 0 ... messages.Length {
        let (name, signature, types) = messages[index]
        var nativeTypes nint
        if types.Length != 0 {
          nativeTypes = Marshal.AllocHGlobal(IntPtr.Size * types.Length)
          Marshal.Copy(types, 0, nativeTypes, types.Length)
        }
        Marshal.StructureToPtr[BackdropWaylandMessage](BackdropWaylandMessage{
          Name: Marshal.StringToHGlobalAnsi(name), Signature: Marshal.StringToHGlobalAnsi(signature), Types: nativeTypes},
          address + nint(index * size), false)
      }
      return address
    }
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
