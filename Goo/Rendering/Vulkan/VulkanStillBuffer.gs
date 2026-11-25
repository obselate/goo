package Goo

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct StillPrimeHandle {
  var Handle uint32
  var Flags uint32
  var Descriptor int32
}

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillCreateGbmBuffer(device nint, width uint32, height uint32, format uint32,
  ref modifier uint64, count uint32, flags uint32) nint;

internal sealed class VulkanStillBuffer : IDisposable {
  private const CloseOnExec uint32 = 0x80000u
  private const PrimeHandleToFd uint32 = 0xc00c642du
  private const ReadWrite uint32 = 2u
  private let library nint
  private let renderFd int32
  private let device nint
  private let buffer nint
  private var handle uint32
  internal let Planes []WaylandDmaPlane

  private init(library nint, renderFd int32, device nint, buffer nint, planes int32) {
    this.library = library
    this.renderFd = renderFd
    this.device = device
    this.buffer = buffer
    Planes = [planes]WaylandDmaPlane
  }

  shared {
    @DllImport("libc", EntryPoint: "open")
    private func Open(path string, flags uint32) int32;
    @DllImport("libc", EntryPoint: "close")
    private func Close(fd int32) int32;
    @DllImport("libc", EntryPoint: "ioctl")
    private func Prime(fd int32, request nuint, ref data StillPrimeHandle) int32;
    @DllImport("libc", EntryPoint: "lseek")
    private func Seek(fd int32, offset int64, whence int32) int64;

    @DllImport("libgbm.so.1") private func gbm_create_device(fd int32) nint;
    @DllImport("libgbm.so.1") private func gbm_device_destroy(device nint);
    @DllImport("libgbm.so.1") private func gbm_bo_create(device nint, width uint32, height uint32, format uint32, flags uint32) nint;
    @DllImport("libgbm.so.1") private func gbm_bo_destroy(buffer nint);
    @DllImport("libgbm.so.1") private func gbm_bo_get_modifier(buffer nint) uint64;
    @DllImport("libgbm.so.1") private func gbm_bo_get_plane_count(buffer nint) int32;
    @DllImport("libgbm.so.1") private func gbm_bo_get_handle_for_plane(buffer nint, plane int32) uint64;
    @DllImport("libgbm.so.1") private func gbm_bo_get_offset(buffer nint, plane int32) uint32;
    @DllImport("libgbm.so.1") private func gbm_bo_get_stride_for_plane(buffer nint, plane int32) uint32;

    internal func TryCreate(renderNode string, width uint32, height uint32, format WaylandDmaFormat) VulkanStillBuffer? {
      if !NativeLibrary.TryLoad("libgbm.so.1", out var library) { return nil }
      var renderFd = -1
      var device nint
      var buffer nint
      var retained bool
      try {
        renderFd = Open(renderNode, CloseOnExec | ReadWrite)
        if renderFd < 0 { return nil }
        device = gbm_create_device(renderFd)
        if device == nint(0) { return nil }
        var modifier = format.Modifier
        if NativeLibrary.TryGetExport(library, "gbm_bo_create_with_modifiers2", out var create) {
          let allocate = Marshal.GetDelegateForFunctionPointer[StillCreateGbmBuffer](create)
          buffer = allocate(device, width, height, format.FourCC, ref modifier, 1u, 4u)
        }
        if buffer == nint(0) && modifier == 0uL {
          buffer = gbm_bo_create(device, width, height, format.FourCC, 4u | 16u)
        }
        if buffer == nint(0) || gbm_bo_get_modifier(buffer) != format.Modifier { return nil }
        let planes = gbm_bo_get_plane_count(buffer)
        if planes < 1 || planes > 4 { return nil }
        let result = VulkanStillBuffer(library, renderFd, device, buffer, planes)
        result.handle = uint32(gbm_bo_get_handle_for_plane(buffer, 0))
        if result.handle == 0u || result.handle == uint32.MaxValue { return nil }
        for index in 0 ... planes {
          if uint32(gbm_bo_get_handle_for_plane(buffer, index)) != result.handle { return nil }
          let offset = gbm_bo_get_offset(buffer, index)
          let stride = gbm_bo_get_stride_for_plane(buffer, index)
          if stride == 0u { return nil }
          result.Planes[index] = WaylandDmaPlane(offset, stride)
        }
        retained = true
        return result
      } catch (_ EntryPointNotFoundException) { return nil }
        finally {
          if !retained {
            if buffer != nint(0) { gbm_bo_destroy(buffer) }
            if device != nint(0) { gbm_device_destroy(device) }
            if renderFd >= 0 { Close(renderFd) }
            NativeLibrary.Free(library)
          }
        }
    }

    internal func ByteSize(fd ExternalNativeHandle) int64 -> Seek(int32(fd.DangerousGetHandle()), 0L, 2)
  }

  internal func Export() ExternalNativeHandle? {
    var result = StillPrimeHandle{Handle: handle, Flags: CloseOnExec, Descriptor: -1}
    if Prime(renderFd, nuint(PrimeHandleToFd), ref result) != 0 { return nil }
    return ExternalNativeHandle(nint(result.Descriptor), false)
  }

  public func Dispose() {
    gbm_bo_destroy(buffer)
    gbm_device_destroy(device)
    Close(renderFd)
    NativeLibrary.Free(library)
  }
}
