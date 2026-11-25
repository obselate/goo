package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct StillImageArguments {
  var First nint
  var Second nint
  var Third nint
  var Fourth nint
  var Fifth nint
  var Sixth nint
}

@StructLayout(LayoutKind.Sequential)
internal struct WaylandArray {
  var Size nuint
  var Capacity nuint
  var Data nint
}

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate WaylandStillFormatTable(data nint, proxy nint, fd int32, size uint32);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate WaylandStillFormats(data nint, proxy nint, array nint);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate WaylandStillBufferCreated(data nint, proxy nint, buffer nint);

internal unsafe sealed class WaylandStillImage : IDisposable {
  private let display nint
  private let parent nint
  private let parentViewport nint
  private let delegates List[Delegate] = List[Delegate]()
  private let listeners List[nint] = List[nint]()
  private let formats List[WaylandDmaFormat] = List[WaylandDmaFormat]()
  private var formatTable nint = nint(-1)
  private var formatTableSize uint32
  private var deviceNumber uint64
  private var queue nint
  private var registry nint
  private var shm nint
  private var compositor nint
  private var subcompositor nint
  private var dmabuf nint
  private var viewporter nint
  private var child nint
  private var subsurface nint
  private var viewport nint
  private var feedback nint
  private var createdBuffer nint
  private var bufferDone bool
  private var feedbackDone bool
  private var imageBuffer nint
  private var canvasBuffer nint
  private var color uint32
  private var hasColor bool
  private var imageWidth int32
  private var imageHeight int32
  private var canvasWidth int32
  private var canvasHeight int32
  private var dirty bool = true

  private init(display nint, parent nint, parentViewport nint) {
    this.display = display
    this.parent = parent
    this.parentViewport = parentViewport
  }

  internal prop Formats List[WaylandDmaFormat] { get -> formats }
  internal prop RenderNode string? { get; private set; }

  shared {
    internal func TryCreate(display nint, surface nint, parentViewport nint) WaylandStillImage? {
      if parentViewport == nint(0) { return nil }
      let result = WaylandStillImage(display, surface, parentViewport)
      var supported = false
      try {
        supported = result.Initialize()
        return supported ? result : nil
      } finally {
        if !supported { result.Dispose() }
      }
    }

    private func Fixed(value float64) int32 -> int32(Math.Round(value * 256.0))

    internal func Geometry(imageWidth int32, imageHeight int32, width int32, height int32,
      fit ImageFit) (ElementRect, ElementRect) {
      var destination = ElementRect{Width: width, Height: height}
      var source = ElementRect{Width: imageWidth * 256, Height: imageHeight * 256}
      let xScale = float64(width) / imageWidth
      let yScale = float64(height) / imageHeight
      if fit == ImageFit.Cover {
        let scale = Math.Max(xScale, yScale)
        let w = Math.Clamp(Fixed(width / scale), 1, imageWidth * 256)
        let h = Math.Clamp(Fixed(height / scale), 1, imageHeight * 256)
        source = ElementRect{X: (imageWidth * 256 - w) / 2, Y: (imageHeight * 256 - h) / 2, Width: w, Height: h}
      } else if fit == ImageFit.Contain {
        let scale = Math.Min(xScale, yScale)
        let w = Math.Clamp(int32(Math.Round(imageWidth * scale)), 1, width)
        let h = Math.Clamp(int32(Math.Round(imageHeight * scale)), 1, height)
        destination = ElementRect{X: (width - w) / 2, Y: (height - h) / 2, Width: w, Height: h}
      } else if fit == ImageFit.None {
        let w = Math.Min(imageWidth, width)
        let h = Math.Min(imageHeight, height)
        destination = ElementRect{Width: w, Height: h}
        source = ElementRect{Width: w * 256, Height: h * 256}
      }
      return (source, destination)
    }
    private let library nint = NativeLibrary.Load("libwayland-client.so.0")
    private let surfaceType nint = Core("wl_surface")
    private let bufferType nint = Core("wl_buffer")
    private let dmaType nint = AllocateInterface()
    private let paramsType nint = AllocateInterface()
    private let feedbackType nint = AllocateInterface()
    private let viewporterType nint = AllocateInterface()
    private let viewportType nint = AllocateInterface()
    private let protocols bool = InitializeProtocols()

    private func InitializeProtocols() bool {
      WriteInterface(dmaType, "zwp_linux_dmabuf_v1", 4, [](string, string, []nint){
        ("destroy", "", []nint{}), ("create_params", "n", []nint{paramsType}),
        ("get_default_feedback", "4n", []nint{feedbackType}),
        ("get_surface_feedback", "4no", []nint{feedbackType, surfaceType})}, [](string, string, []nint){
        ("format", "u", []nint{}), ("modifier", "3uuu", []nint{})})
      WriteInterface(paramsType, "zwp_linux_buffer_params_v1", 4, [](string, string, []nint){
        ("destroy", "", []nint{}), ("add", "huuuuu", []nint{}), ("create", "iiuu", []nint{}),
        ("create_immed", "2niiuu", []nint{bufferType, nint(0), nint(0), nint(0), nint(0)})},
        [](string, string, []nint){("created", "n", []nint{bufferType}), ("failed", "", []nint{})})
      WriteInterface(feedbackType, "zwp_linux_dmabuf_feedback_v1", 4, [](string, string, []nint){("destroy", "", []nint{})},
        [](string, string, []nint){("done", "", []nint{}), ("format_table", "hu", []nint{}), ("main_device", "a", []nint{}),
        ("tranche_done", "", []nint{}), ("tranche_target_device", "a", []nint{}), ("tranche_formats", "a", []nint{}),
        ("tranche_flags", "u", []nint{})})
      WriteInterface(viewporterType, "wp_viewporter", 1, [](string, string, []nint){
        ("destroy", "", []nint{}), ("get_viewport", "no", []nint{viewportType, surfaceType})}, [](string, string, []nint){})
      WriteInterface(viewportType, "wp_viewport", 1, [](string, string, []nint){
        ("destroy", "", []nint{}), ("set_source", "ffff", []nint{}), ("set_destination", "ii", []nint{})}, [](string, string, []nint){})
      return true
    }

    private func Core(name string) nint -> NativeLibrary.GetExport(library, name + "_interface")

    private func AllocateInterface() nint -> Marshal.AllocHGlobal(Marshal.SizeOf[BackdropWaylandInterface]())

    private func WriteInterface(address nint, name string, version int32,
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

    @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array_constructor_versioned")
    private func Construct(proxy nint, opcode uint32, ref args StillImageArguments, kind nint, version uint32) nint;
    @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array")
    private func Send(proxy nint, opcode uint32, ref args StillImageArguments);
    @DllImport("libwayland-client.so.0")
    private func wl_proxy_get_version(proxy nint) uint32;
    @DllImport("libc", EntryPoint: "memfd_create")
    private func MemFd(name string, flags uint32) int32;
    @DllImport("libc", EntryPoint: "write")
    private func Write(fd int32, ref value uint32, size nuint) nint;
    @DllImport("libc", EntryPoint: "mmap")
    private func Map(address nint, size nuint, protection int32, flags int32, fd int32, offset int64) nint;
    @DllImport("libc", EntryPoint: "munmap")
    private func Unmap(address nint, size nuint) int32;

    private func Destroy(proxy nint, opcode uint32 = 0u) {
      if proxy == nint(0) { return }
      WaylandBackdrop.wl_proxy_marshal_array(proxy, opcode, nil)
      WaylandBackdrop.wl_proxy_destroy(proxy)
    }
  }

  private func Initialize() bool {
    if !protocols { return false }
    queue = WaylandBackdrop.wl_display_create_queue(display)
    let wrapper = WaylandBackdrop.wl_proxy_create_wrapper(display)
    if wrapper == nint(0) { return false }
    try {
      if queue == nint(0) { return false }
      WaylandBackdrop.wl_proxy_set_queue(wrapper, queue)
      var args = StillImageArguments{}
      registry = Construct(wrapper, 1u, ref args, Core("wl_registry"), 1u)
    } finally { WaylandBackdrop.wl_proxy_wrapper_destroy(wrapper) }
    if registry == nint(0) { return false }
    let onGlobal BackdropWaylandGlobal = Global
    let onRemove BackdropWaylandRemove = (_, _, _) -> {}
    if !Listen(registry, []Delegate{onGlobal, onRemove}) || !Roundtrip() || dmabuf == nint(0)
      || viewporter == nint(0) || shm == nint(0) || compositor == nint(0) || subcompositor == nint(0) { return false }
    var args = StillImageArguments{}
    child = Construct(compositor, 0u, ref args, surfaceType, wl_proxy_get_version(compositor))
    if child == nint(0) { return false }
    args.Second = child
    args.Third = parent
    subsurface = Construct(subcompositor, 1u, ref args, Core("wl_subsurface"), 1u)
    viewport = Construct(viewporter, 1u, ref args, viewportType, 1u)
    feedback = Construct(dmabuf, 3u, ref args, feedbackType, 4u)
    if subsurface == nint(0) || viewport == nint(0) || feedback == nint(0) { return false }
    let onDone WaylandLockEvent = (_, _) -> { feedbackDone = true }
    let onTable WaylandStillFormatTable = FormatTable
    let onMainDevice WaylandStillFormats = MainDevice
    let onDevice WaylandStillFormats = (_, _, _) -> {}
    let onTranche WaylandLockEvent = (_, _) -> {}
    let onFormats WaylandStillFormats = TrancheFormats
    let onFlags BackdropWaylandCapabilities = (_, _, _) -> {}
    if !Listen(feedback, []Delegate{onDone, onTable, onMainDevice, onTranche, onDevice, onFormats, onFlags})
      || !Roundtrip() || !feedbackDone || formats.Count == 0 { return false }
    Destroy(feedback)
    feedback = nint(0)
    UnmapFormatTable()
    RenderNode = FindRenderNode()
    if RenderNode == nil { return false }
    args = StillImageArguments{}
    let region = Construct(compositor, 1u, ref args, Core("wl_region"), 1u)
    if region == nint(0) { return false }
    args.First = region
    Send(child, 5u, ref args)
    Destroy(region)
    return true
  }

  private func Global(data nint, proxy nint, name uint32, interfaceName nint, version uint32) {
    let text = Marshal.PtrToStringUTF8(interfaceName)
    let (kind, bindVersion) = switch text {
      case "wl_compositor": (Core("wl_compositor"), Math.Min(version, 4u))
      case "wl_subcompositor": (Core("wl_subcompositor"), 1u)
      case "wl_shm": (Core("wl_shm"), 1u)
      case "zwp_linux_dmabuf_v1": (dmaType, if version >= 4u { 4u } else { 0u })
      case "wp_viewporter": (viewporterType, 1u)
      default: (nint(0), 0u)
    }
    if bindVersion == 0u { return }
    var args = StillImageArguments{First: nint(name), Second: interfaceName, Third: nint(bindVersion)}
    let value = Construct(registry, 0u, ref args, kind, bindVersion)
    switch text {
      case "wl_compositor" { compositor = value }
      case "wl_subcompositor" { subcompositor = value }
      case "wl_shm" { shm = value }
      case "zwp_linux_dmabuf_v1" { dmabuf = value }
      case "wp_viewporter" { viewporter = value }
    }
  }

  private func MainDevice(data nint, proxy nint, array nint) {
    let device = Marshal.PtrToStructure[WaylandArray](array)
    if device.Size == nuint(8) { deviceNumber = uint64(Marshal.ReadInt64(device.Data)) }
  }

  private func FindRenderNode() string? {
    if deviceNumber == 0uL { return nil }
    let major = uint32((deviceNumber >> 8 & 0xfffuL) | (deviceNumber >> 32 & 0xfffff000uL))
    let minor = uint32((deviceNumber & 0xffuL) | (deviceNumber >> 12 & 0xffffff00uL))
    let drm = "/sys/dev/char/" + major.ToString() + ":" + minor.ToString() + "/device/drm"
    try {
      for entry in Directory.EnumerateFileSystemEntries(drm, "renderD*") {
        let path = "/dev/dri/" + Path.GetFileName(entry)
        if File.Exists(path) { return path }
      }
    } catch (_ IOException) {
    } catch (_ UnauthorizedAccessException) {
    }
    return nil
  }

  private func FormatTable(data nint, proxy nint, fd int32, size uint32) {
    using let handle = ExternalNativeHandle(nint(fd), false)
    UnmapFormatTable()
    if size == 0u || size > 1048576u || size % 16u != 0u { return }
    formatTable = Map(nint(0), nuint(size), 1, 2, fd, 0L)
    if formatTable != nint(-1) { formatTableSize = size }
  }

  private func UnmapFormatTable() {
    if formatTable == nint(-1) { return }
    Unmap(formatTable, nuint(formatTableSize))
    formatTable = nint(-1)
    formatTableSize = 0u
  }

  private func TrancheFormats(data nint, proxy nint, array nint) {
    let indices = Marshal.PtrToStructure[WaylandArray](array)
    for index in 0 ... int32(Math.Min(uint64(indices.Size) / 2uL, 65536uL)) {
      let entry = int32(uint16(Marshal.ReadInt16(indices.Data, index * 2))) * 16
      if uint32(entry) >= formatTableSize { continue }
      let format = WaylandDmaFormat(uint32(Marshal.ReadInt32(formatTable, entry)),
        uint64(Marshal.ReadInt64(formatTable, entry + 8)))
      if (format.FourCC == 0x34324241u || format.FourCC == 0x34325241u) && !formats.Contains(format) {
        formats.Add(format)
      }
    }
  }

  private func Listen(proxy nint, callbacks []Delegate) bool {
    let listener = Marshal.AllocHGlobal(callbacks.Length * IntPtr.Size)
    listeners.Add(listener)
    for index in 0 ... callbacks.Length {
      delegates.Add(callbacks[index])
      Marshal.WriteIntPtr(listener, index * IntPtr.Size, Marshal.GetFunctionPointerForDelegate(callbacks[index]))
    }
    return WaylandBackdrop.wl_proxy_add_listener(proxy, listener, nint(0)) == 0
  }

  private func Roundtrip() bool -> WaylandBackdrop.wl_display_roundtrip_queue(display, queue) >= 0

  internal func SetImage(image VulkanStillImage?) bool {
    var buffer nint
    if let next = image {
      if !formats.Contains(next.Format) { return false }
      buffer = CreateBuffer(next)
      if buffer == nint(0) { return false }
    }
    Destroy(imageBuffer)
    imageBuffer = buffer
    imageWidth = image?.Width ?? 0
    imageHeight = image?.Height ?? 0
    dirty = true
    return true
  }

  private func CreateBuffer(image VulkanStillImage) nint {
    guard let exported = image.Export() else { return nint(0) }
    using let fd = exported
    if fd.IsInvalid { return nint(0) }
    var args = StillImageArguments{}
    let parameters = Construct(dmabuf, 1u, ref args, paramsType, 4u)
    if parameters == nint(0) { return nint(0) }
    let onCreated WaylandStillBufferCreated = (_, _, buffer) -> { createdBuffer = buffer
      bufferDone = true }
    let onFailed WaylandLockEvent = (_, _) -> { bufferDone = true }
    let listener = Marshal.AllocHGlobal(2 * IntPtr.Size)
    try {
      Marshal.WriteIntPtr(listener, Marshal.GetFunctionPointerForDelegate(onCreated))
      Marshal.WriteIntPtr(listener, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(onFailed))
      if WaylandBackdrop.wl_proxy_add_listener(parameters, listener, nint(0)) != 0 { return nint(0) }
      for index in 0 ... image.Planes.Length {
        let plane = image.Planes[index]
        args = StillImageArguments{First: fd.DangerousGetHandle(), Second: nint(index),
          Third: nint(plane.Offset), Fourth: nint(plane.Stride), Fifth: nint(image.Format.Modifier >> 32), Sixth: nint(uint32(image.Format.Modifier))}
        Send(parameters, 1u, ref args)
      }
      args = StillImageArguments{First: nint(image.Width), Second: nint(image.Height), Third: nint(image.Format.FourCC)}
      Send(parameters, 2u, ref args)
      if !Roundtrip() || !bufferDone { return nint(0) }
      let buffer = createdBuffer
      createdBuffer = nint(0)
      return buffer
    } finally {
      Destroy(createdBuffer)
      createdBuffer = nint(0)
      bufferDone = false
      Destroy(parameters)
      Marshal.FreeHGlobal(listener)
      GC.KeepAlive(onCreated)
      GC.KeepAlive(onFailed)
    }
  }

  private func CreateCanvas(pixel uint32) nint {
    let fd = MemFd("goo-layer-canvas", 1u)
    if fd < 0 { return nint(0) }
    using let handle = ExternalNativeHandle(nint(fd), false)
    var packed = pixel
    if Write(fd, ref packed, nuint(4)) != nint(4) { return nint(0) }
    var args = StillImageArguments{Second: nint(fd), Third: nint(4)}
    let pool = Construct(shm, 0u, ref args, Core("wl_shm_pool"), 1u)
    if pool == nint(0) { return nint(0) }
    try {
      args = StillImageArguments{Third: nint(1), Fourth: nint(1), Fifth: nint(4)}
      return Construct(pool, 0u, ref args, bufferType, 1u)
    } finally { Destroy(pool, 1u) }
  }

  internal func SetCanvas(pixel uint32) bool {
    if hasColor && pixel == color { return true }
    let next = CreateCanvas(pixel)
    if next == nint(0) { return false }
    Destroy(canvasBuffer)
    canvasBuffer = next
    color = pixel
    hasColor = true
    dirty = true
    return true
  }

  internal func Invalidate() { dirty = true }

  internal func NeedsCommit(width int32, height int32) bool -> dirty || width != canvasWidth || height != canvasHeight

  internal func PrepareCommit(width int32, height int32, fit ImageFit) {
    canvasWidth = width
    canvasHeight = height
    dirty = false
    var args = StillImageArguments{First: nint(width), Second: nint(height)}
    Send(parentViewport, 2u, ref args)
    args = StillImageArguments{First: canvasBuffer}
    Send(parent, 1u, ref args)
    args = StillImageArguments{Third: nint(width), Fourth: nint(height)}
    Send(parent, 2u, ref args)
    args = StillImageArguments{First: imageBuffer}
    Send(child, 1u, ref args)
    if imageBuffer != nint(0) {
      let (source, destination) = Geometry(imageWidth, imageHeight, width, height, fit)
      args = StillImageArguments{First: nint(int32(destination.X)), Second: nint(int32(destination.Y))}
      Send(subsurface, 1u, ref args)
      args = StillImageArguments{First: nint(int32(source.X)), Second: nint(int32(source.Y)),
        Third: nint(int32(source.Width)), Fourth: nint(int32(source.Height))}
      Send(viewport, 1u, ref args)
      args = StillImageArguments{First: nint(int32(destination.Width)), Second: nint(int32(destination.Height))}
      Send(viewport, 2u, ref args)
      args = StillImageArguments{Third: args.First, Fourth: args.Second}
      Send(child, 2u, ref args)
    }
    WaylandBackdrop.wl_proxy_marshal_array(child, 6u, nil)
  }


  public func Dispose() {
    UnmapFormatTable()
    Destroy(imageBuffer)
    Destroy(canvasBuffer)
    Destroy(feedback)
    Destroy(viewport)
    Destroy(subsurface)
    Destroy(child)
    Destroy(viewporter)
    Destroy(dmabuf)
    Destroy(subcompositor)
    if compositor != nint(0) { WaylandBackdrop.wl_proxy_destroy(compositor) }
    if shm != nint(0) { WaylandBackdrop.wl_proxy_destroy(shm) }
    if registry != nint(0) { WaylandBackdrop.wl_proxy_destroy(registry) }
    if queue != nint(0) { WaylandBackdrop.wl_event_queue_destroy(queue) }
    for listener in listeners { Marshal.FreeHGlobal(listener) }
    GC.KeepAlive(delegates)
  }
}
