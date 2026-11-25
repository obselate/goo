package Goo

import System
import System.Runtime.InteropServices

internal sealed class WaylandInputRegion : IDisposable {
  private let surface nint
  private let library nint
  private let compositor nint
  private let regionInterface nint
  private var rectangles [] ? ElementRect
  private var dirty bool
  private var metrics (int32, int32, int32, int32, float32)

  internal init(display nint, surface nint) {
    this.surface = surface
    library = NativeLibrary.Load("libwayland-client.so.0")
    try {
      regionInterface = NativeLibrary.GetExport(library, "wl_region_interface")
      compositor = BindCompositor(display, library)
    } catch {
      NativeLibrary.Free(library)
      rethrow
    }
  }

  internal func Set(value [] ? ElementRect) bool {
    if let next = value {
      if let current = rectangles {
        if MemoryExtensions.SequenceEqual[ElementRect](next.AsSpan(), current.AsSpan()) { return false }
      }
      rectangles = next.Length == 0 ? Array.Empty[ElementRect]() : (next.Clone() as []ElementRect)!!
    } else {
      if rectangles == nil { return false }
      rectangles = nil
    }
    dirty = true
    return true
  }

  internal func Invalidate() {
    if rectangles != nil { dirty = true }
  }

  internal func Apply(width int32, height int32, pixelWidth int32, pixelHeight int32, scale float32) {
    let nextMetrics = (width, height, pixelWidth, pixelHeight, scale)
    if !dirty && (rectangles == nil || metrics == nextMetrics) { return }

    var argument = LayerWaylandArguments{}
    if let values = rectangles {
      let region = Construct(compositor, 1u, ref argument, regionInterface, 1u)
      if region == nint(0) { throw InvalidOperationException("Cannot create the Wayland input region") }
      var bounds = LayerWaylandArguments{}
      for rect in values {
        if rect.Width == 0.0 || rect.Height == 0.0 { continue }
        let x = int32(Math.Clamp(Math.Floor(rect.X), 0.0, float64(width)))
        let y = int32(Math.Clamp(Math.Floor(rect.Y), 0.0, float64(height)))
        let right = int32(Math.Clamp(Math.Ceiling(rect.X + rect.Width), 0.0, float64(width)))
        let bottom = int32(Math.Clamp(Math.Ceiling(rect.Y + rect.Height), 0.0, float64(height)))
        if x >= right || y >= bottom { continue }
        bounds.First = nint(x)
        bounds.Second = nint(y)
        bounds.Third = nint(right - x)
        bounds.Fourth = nint(bottom - y)
        MarshalRequest(region, 1u, ref bounds)
      }
      argument.First = region
    }
    MarshalRequest(surface, 5u, ref argument)
    if argument.First != nint(0) {
      WaylandBackdrop.wl_proxy_marshal_array(argument.First, 0u, nil)
      WaylandBackdrop.wl_proxy_destroy(argument.First)
    }
    metrics = nextMetrics
    dirty = false
  }

  public func Dispose() {
    WaylandBackdrop.wl_proxy_destroy(compositor)
    NativeLibrary.Free(library)
  }

  shared {
    @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array_constructor_versioned")
    private func Construct(proxy nint, opcode uint32, ref arguments LayerWaylandArguments, kind nint, version uint32) nint;

    @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array")
    private func MarshalRequest(proxy nint, opcode uint32, ref arguments LayerWaylandArguments);

    private func BindCompositor(display nint, library nint) nint {
      let queue = WaylandBackdrop.wl_display_create_queue(display)
      if queue == nint(0) { throw InvalidOperationException("Cannot create the Wayland input region event queue") }
      var registry nint
      var compositor nint
      var listener nint
      let global BackdropWaylandGlobal = (data, registry, name, interfaceName, version) -> {
        if compositor != nint(0) || Marshal.PtrToStringUTF8(interfaceName) != "wl_compositor" { return }
        var args = LayerWaylandArguments{First: nint(name), Second: interfaceName, Third: nint(1)}
        compositor = Construct(registry, 0u, ref args,
          NativeLibrary.GetExport(library, "wl_compositor_interface"), 1u)
      }
      let remove BackdropWaylandRemove = (data, registry, name) -> { }
      try {
        let wrapper = WaylandBackdrop.wl_proxy_create_wrapper(display)
        if wrapper == nint(0) { throw InvalidOperationException("Cannot wrap the Wayland display") }
        try {
          WaylandBackdrop.wl_proxy_set_queue(wrapper, queue)
          var argument = LayerWaylandArguments{}
          registry = Construct(wrapper, 1u, ref argument,
            NativeLibrary.GetExport(library, "wl_registry_interface"), 1u)
        } finally { WaylandBackdrop.wl_proxy_wrapper_destroy(wrapper) }
        listener = Marshal.AllocHGlobal(2 * IntPtr.Size)
        Marshal.WriteIntPtr(listener, Marshal.GetFunctionPointerForDelegate(global))
        Marshal.WriteIntPtr(listener, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(remove))
        if registry == nint(0) || WaylandBackdrop.wl_proxy_add_listener(registry, listener, nint(0)) != 0
          || WaylandBackdrop.wl_display_roundtrip_queue(display, queue) < 0 || compositor == nint(0) {
          if compositor != nint(0) { WaylandBackdrop.wl_proxy_destroy(compositor) }
          throw InvalidOperationException("Cannot bind the Wayland compositor for the input region")
        }
        WaylandBackdrop.wl_proxy_set_queue(compositor, nint(0))
        return compositor
      } finally {
        if registry != nint(0) { WaylandBackdrop.wl_proxy_destroy(registry) }
        Marshal.FreeHGlobal(listener)
        WaylandBackdrop.wl_event_queue_destroy(queue)
        GC.KeepAlive(global)
        GC.KeepAlive(remove)
      }
    }
  }
}
