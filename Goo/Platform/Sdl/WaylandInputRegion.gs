package Goo

import System
import System.Runtime.InteropServices

internal unsafe sealed class WaylandInputRegion : IDisposable {
  private let surface nint
  private let library nint
  private let compositor nint
  private let regionInterface nint
  private var rectangles [] ? ElementRect
  private var dirty bool
  private var metrics (int32, int32, int32, int32)

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

  internal func Apply(width int32, height int32, pixelWidth int32, pixelHeight int32) {
    let nextMetrics = (width, height, pixelWidth, pixelHeight)
    if !dirty && (rectangles == nil || metrics == nextMetrics) { return }

    var argument = BackdropWaylandArgument{}
    if let values = rectangles {
      let region = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(compositor, 1u, &argument, regionInterface, 1u)
      if region == nint(0) { throw InvalidOperationException("Cannot create the Wayland input region") }
      let args *BackdropWaylandArgument = stackalloc[4]BackdropWaylandArgument
      for rect in values {
        if rect.Width == 0.0 || rect.Height == 0.0 { continue }
        let x = int32(Math.Clamp(Math.Floor(rect.X), 0.0, float64(width)))
        let y = int32(Math.Clamp(Math.Floor(rect.Y), 0.0, float64(height)))
        let right = int32(Math.Clamp(Math.Ceiling(rect.X + rect.Width), 0.0, float64(width)))
        let bottom = int32(Math.Clamp(Math.Ceiling(rect.Y + rect.Height), 0.0, float64(height)))
        if x >= right || y >= bottom { continue }
        args[0].Value = nint(x)
        args[1].Value = nint(y)
        args[2].Value = nint(right - x)
        args[3].Value = nint(bottom - y)
        WaylandBackdrop.wl_proxy_marshal_array(region, 1u, args)
      }
      argument.Value = region
    }
    WaylandBackdrop.wl_proxy_marshal_array(surface, 5u, &argument)
    if argument.Value != nint(0) {
      WaylandBackdrop.wl_proxy_marshal_array(argument.Value, 0u, nil)
      WaylandBackdrop.wl_proxy_destroy(argument.Value)
    }
    metrics = nextMetrics
    dirty = false
  }

  public func Dispose() {
    WaylandBackdrop.wl_proxy_destroy(compositor)
    NativeLibrary.Free(library)
  }

  shared {
    private func BindCompositor(display nint, library nint) nint {
      let queue = WaylandBackdrop.wl_display_create_queue(display)
      if queue == nint(0) { throw InvalidOperationException("Cannot create the Wayland input region event queue") }
      var registry nint
      var compositor nint
      let global BackdropWaylandGlobal = (data, registry, name, interfaceName, version) -> {
        if compositor != nint(0) || Marshal.PtrToStringUTF8(interfaceName) != "wl_compositor" { return }
        let args *BackdropWaylandArgument = stackalloc[4]BackdropWaylandArgument
        args[0].Value = nint(name)
        args[1].Value = interfaceName
        args[2].Value = nint(1)
        args[3].Value = nint(0)
        compositor = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(registry, 0u, args,
          NativeLibrary.GetExport(library, "wl_compositor_interface"), 1u)
      }
      let remove BackdropWaylandRemove = (data, registry, name) -> { }
      try {
        let wrapper = WaylandBackdrop.wl_proxy_create_wrapper(display)
        if wrapper == nint(0) { throw InvalidOperationException("Cannot wrap the Wayland display") }
        try {
          WaylandBackdrop.wl_proxy_set_queue(wrapper, queue)
          var argument = BackdropWaylandArgument{}
          registry = WaylandBackdrop.wl_proxy_marshal_array_constructor_versioned(wrapper, 1u, &argument,
            NativeLibrary.GetExport(library, "wl_registry_interface"), 1u)
        } finally { WaylandBackdrop.wl_proxy_wrapper_destroy(wrapper) }
        let listener *nint = stackalloc[2]nint
        listener[0] = Marshal.GetFunctionPointerForDelegate(global)
        listener[1] = Marshal.GetFunctionPointerForDelegate(remove)
        if registry == nint(0) || WaylandBackdrop.wl_proxy_add_listener(registry, nint(listener), nint(0)) != 0
          || WaylandBackdrop.wl_display_roundtrip_queue(display, queue) < 0 || compositor == nint(0) {
          if compositor != nint(0) { WaylandBackdrop.wl_proxy_destroy(compositor) }
          throw InvalidOperationException("Cannot bind the Wayland compositor for the input region")
        }
        WaylandBackdrop.wl_proxy_set_queue(compositor, nint(0))
        return compositor
      } finally {
        if registry != nint(0) { WaylandBackdrop.wl_proxy_destroy(registry) }
        WaylandBackdrop.wl_event_queue_destroy(queue)
        GC.KeepAlive(global)
        GC.KeepAlive(remove)
      }
    }
  }
}
