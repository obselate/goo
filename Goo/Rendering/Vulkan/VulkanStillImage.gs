package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Runtime.InteropServices
import System.Threading

internal data struct WaylandDmaFormat(FourCC uint32, Modifier uint64) { }
internal data struct WaylandDmaPlane(Offset uint32, Stride uint32) { }

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillImageFormat(physical VkPhysicalDevice, ref info VkPhysicalDeviceImageFormatInfo2,
  ref properties VkImageFormatProperties2) VkResult;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillCreateImage(device VkDevice, ref info VkImageCreateInfo, allocator nint, out image VkImage) VkResult;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillImageRequirements(device VkDevice, ref info VkImageMemoryRequirementsInfo2, ref requirements VkMemoryRequirements2);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillAllocateMemory(device VkDevice, ref info VkMemoryAllocateInfo, allocator nint, out memory VkDeviceMemory) VkResult;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillBindImage(device VkDevice, count uint32, ref info VkBindImageMemoryInfo) VkResult;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillMemoryFdProperties(device VkDevice, handleType uint32, fd int32, ref properties VkMemoryFdPropertiesKHR) VkResult;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillBeginCommands(command VkCommandBuffer, ref info VkCommandBufferBeginInfo) VkResult;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillCopyImage(command VkCommandBuffer, buffer VkBuffer, image VkImage, layout VkImageLayout,
  count uint32, ref region VkBufferImageCopy);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillImageBarrier(command VkCommandBuffer, ref info VkDependencyInfo);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillEndCommands(command VkCommandBuffer) VkResult;
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate StillDestroyHandle(device VkDevice, handle uint64, allocator nint);

@StructLayout(LayoutKind.Sequential)
internal unsafe struct StillImageScratch {
  var externalQuery VkPhysicalDeviceExternalImageFormatInfo
  var modifierQuery VkPhysicalDeviceImageDrmFormatModifierInfoEXT
  var externalProperties VkExternalImageFormatProperties
  var modifierInfo VkImageDrmFormatModifierExplicitCreateInfoEXT
  var externalImage VkExternalMemoryImageCreateInfo
  var dedicated VkMemoryDedicatedAllocateInfo
  var memoryImport VkImportMemoryFdInfoKHR
  var plane0 VkSubresourceLayout
  var plane1 VkSubresourceLayout
  var plane2 VkSubresourceLayout
  var plane3 VkSubresourceLayout
  var barrier VkImageMemoryBarrier2
}

internal unsafe sealed class VulkanStillImage : IDisposable {
  private const DmaBuf uint32 = 0x200u
  private const DrmTiling int32 = 1000158000
  private const TransferDestination uint32 = uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT)
  private let runtime VulkanSharedLease
  private let buffer VulkanStillBuffer
  private var image VkImage
  private var memory VkDeviceMemory
  private var staging VulkanBufferCreation
  private var initialized bool
  internal let Width int32
  internal let Height int32
  internal let Format WaylandDmaFormat
  internal prop Planes []WaylandDmaPlane { get -> buffer.Planes }

  private init(runtime VulkanSharedLease, width int32, height int32, format WaylandDmaFormat, buffer VulkanStillBuffer) {
    this.runtime = runtime
    Width = width
    Height = height
    Format = format
    this.buffer = buffer
  }

  shared {
    internal func Supports(runtime VulkanSharedLease) bool ->
      (runtime.Dispatch.ExternalMemoryKinds & DmaBuf) != 0u && runtime.Dispatch.ForeignQueueFamily

    internal func TryImport(source ImageSource, renderNode string, offered List[WaylandDmaFormat],
      ref nextCandidate int32) VulkanStillImage? {
      guard let runtime = VulkanSharedRuntime.TryAcquire() else { return nil }
      var keepLease = false
      var scratch nint
      try {
        if !Supports(runtime) || uint32(source.Width) > runtime.Facts.MaxImageDimension2D
          || uint32(source.Height) > runtime.Facts.MaxImageDimension2D { return nil }
        scratch = Marshal.AllocHGlobal(Unsafe.SizeOf[StillImageScratch]())
        while nextCandidate < offered.Count {
          let candidate = offered[nextCandidate]
          nextCandidate++
          let format = if candidate.FourCC == 0x34324241u { VkConstants.VK_FORMAT_R8G8B8A8_UNORM }
            else { VkConstants.VK_FORMAT_B8G8R8A8_UNORM }
          if !CanImport(runtime, format, candidate.Modifier, source.Width, source.Height, scratch) { continue }
          guard let buffer = VulkanStillBuffer.TryCreate(renderNode, uint32(source.Width), uint32(source.Height), candidate) else {
            continue
          }
          let result = VulkanStillImage(runtime, source.Width, source.Height, candidate, buffer)
          try {
            result.Import(format, scratch)
            keepLease = true
            return result
          } catch (_ ExternalException) {
          } finally {
            if !keepLease { result.Destroy() }
          }
        }
        return nil
      } finally {
        Marshal.FreeHGlobal(scratch)
        if !keepLease { runtime.Release() }
      }
    }

    private func PushNative[T](ref next nint, value T) nint {
      let address = next
      Unsafe.Write(*void(address), value)
      next += nint((Unsafe.SizeOf[T]() + 7) & ~7)
      return address
    }

    private func CanImport(runtime VulkanSharedLease, format VkFormat, modifier uint64,
      width int32, height int32, scratch nint) bool {
      var next = scratch
      let tiling = PushNative(ref next, VkPhysicalDeviceImageDrmFormatModifierInfoEXT{sType: 1000158002,
        drmFormatModifier: modifier, sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE})
      let external = PushNative(ref next, VkPhysicalDeviceExternalImageFormatInfo{sType: 1000071000,
        pNext: *void(tiling), handleType: DmaBuf})
      let properties = PushNative(ref next, VkExternalImageFormatProperties{sType: 1000071001})
      var query = VkPhysicalDeviceImageFormatInfo2{sType: 1000059004, pNext: *void(external), format: format,
        imageType: VkConstants.VK_IMAGE_TYPE_2D, tiling: DrmTiling, usage: TransferDestination}
      var result = VkImageFormatProperties2{sType: 1000059003, pNext: *void(properties)}
      let get = Marshal.GetDelegateForFunctionPointer[StillImageFormat](nint(runtime.InstanceDispatch.vkGetPhysicalDeviceImageFormatProperties2))
      return get(runtime.PhysicalDevice, ref query, ref result) == VkConstants.VK_SUCCESS
        && (Unsafe.Read[VkExternalImageFormatProperties](*void(properties)).externalMemoryProperties.externalMemoryFeatures & 4u) != 0u
        && uint32(width) <= result.maxExtent.width && uint32(height) <= result.maxExtent.height
    }

    private func Check(result VkResult, operation string) {
      if result != VkConstants.VK_SUCCESS { throw ExternalException(operation, int32(result)) }
    }
  }

  private func Import(format VkFormat, scratch nint) {
    let native = runtime.Dispatch
    let device = runtime.Device
    var next = scratch
    let planeData = next
    for plane in Planes {
      PushNative(ref next, VkSubresourceLayout{offset: uint64(plane.Offset), rowPitch: uint64(plane.Stride)})
    }
    let external = PushNative(ref next, VkExternalMemoryImageCreateInfo{sType: 1000072001, handleTypes: DmaBuf})
    let tiling = PushNative(ref next, VkImageDrmFormatModifierExplicitCreateInfoEXT{sType: 1000158004, pNext: *void(external),
      drmFormatModifier: Format.Modifier, drmFormatModifierPlaneCount: uint32(Planes.Length),
      pPlaneLayouts: *VkSubresourceLayout(planeData)})
    let extent = VkExtent3D{width: uint32(Width), height: uint32(Height), depth: 1u}
    var info = VkImageCreateInfo{sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO, pNext: *void(tiling),
      imageType: VkConstants.VK_IMAGE_TYPE_2D, format: format, extent: extent, mipLevels: 1u, arrayLayers: 1u,
      samples: VkConstants.VK_SAMPLE_COUNT_1_BIT, tiling: DrmTiling, usage: TransferDestination,
      sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE, initialLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED}
    let create = Marshal.GetDelegateForFunctionPointer[StillCreateImage](nint(native.vkCreateImage))
    Check(create(device, ref info, nint(0), out var created), "Cannot create the still-image import")
    image = created
    var needs = VkMemoryRequirements2{sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2}
    var request = VkImageMemoryRequirementsInfo2{sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_REQUIREMENTS_INFO_2, image: image}
    let requirements = Marshal.GetDelegateForFunctionPointer[StillImageRequirements](nint(native.vkGetImageMemoryRequirements2))
    requirements(device, ref request, ref needs)
    guard let exported = buffer.Export() else { throw ExternalException("Cannot obtain a GBM DMA-BUF") }
    using let fd = exported
    let size = VulkanStillBuffer.ByteSize(fd)
    if size <= 0L || uint64(size) < needs.memoryRequirements.size { throw ExternalException("GBM DMA-BUF is too small") }
    let handle = int32(fd.DangerousGetHandle())
    var properties = VkMemoryFdPropertiesKHR{sType: 1000074001}
    let getProperties = Marshal.GetDelegateForFunctionPointer[StillMemoryFdProperties](nint(native.vkGetMemoryFdPropertiesKHR))
    Check(getProperties(device, DmaBuf, handle, ref properties), "Cannot query the GBM DMA-BUF")
    let available = needs.memoryRequirements.memoryTypeBits & properties.memoryTypeBits
    if available == 0u { throw ExternalException("The GBM DMA-BUF has no compatible memory type") }
    let selection = runtime.MemoryAllocator.SelectMemoryType(available, VulkanMemoryPolicy.DeviceLocalRequired)
    next = scratch
    let dedicated = PushNative(ref next, VkMemoryDedicatedAllocateInfo{sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO, image: image})
    let imported = PushNative(ref next, VkImportMemoryFdInfoKHR{sType: 1000074000, pNext: *void(dedicated),
      handleType: DmaBuf, fd: handle})
    var allocation = VkMemoryAllocateInfo{sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO, pNext: *void(imported),
      allocationSize: uint64(size), memoryTypeIndex: selection.memoryTypeIndex}
    let allocate = Marshal.GetDelegateForFunctionPointer[StillAllocateMemory](nint(native.vkAllocateMemory))
    Check(allocate(device, ref allocation, nint(0), out var allocated), "Cannot import the still-image DMA-BUF")
    fd.SetHandleAsInvalid()
    memory = allocated
    var binding = VkBindImageMemoryInfo{sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO, image: image, memory: memory}
    if memory == 0uL { throw ExternalException("The still image requires a dedicated import") }
    let bind = Marshal.GetDelegateForFunctionPointer[StillBindImage](nint(native.vkBindImageMemory2))
    staging = VulkanBufferFactory.CreateMapped(device, native, runtime.MemoryAllocator, nil, uint64(Width) * uint64(Height) * 4uL,
      uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT), VulkanMemoryPolicy(
        uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT) | uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_COHERENT_BIT),
        uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_CACHED_BIT)))
    Check(bind(device, 1u, ref binding), "Cannot bind the still-image DMA-BUF")
  }

  internal func Export() ExternalNativeHandle? -> initialized ? buffer.Export() : nil

  internal func Upload(source ImageSource) bool {
    let scratch = Marshal.AllocHGlobal(Unsafe.SizeOf[StillImageScratch]())
    try {
      let format = if Format.FourCC == 0x34324241u { VkConstants.VK_FORMAT_R8G8B8A8_UNORM }
        else { VkConstants.VK_FORMAT_B8G8R8A8_UNORM }
      UploadPixels(source, format, VkExtent3D{width: uint32(Width), height: uint32(Height), depth: 1u}, scratch)
      initialized = true
      return true
    } catch (_ ExternalException) { return false }
      catch (_ InvalidOperationException) { return false }
      finally { Marshal.FreeHGlobal(scratch) }
  }

  private func UploadPixels(source ImageSource, format VkFormat, extent VkExtent3D, scratch nint) {
    guard let decoded = source.retainImage() else { throw ExternalException("Still image is disposed") }
    try {
      guard let pixels = decoded.Pixels() else { throw ExternalException("Still image has no pixels") }
      let dispatch = runtime.Dispatch
      let device = runtime.Device
      if pixels.Length != Width * Height * 4 { throw ExternalException("Still image has an invalid pixel length") }
      let target = Span[uint8](staging.Allocation.mapped, pixels.Length)
      if format == VkConstants.VK_FORMAT_R8G8B8A8_UNORM {
        ReadOnlySpan[uint8](pixels).CopyTo(target)
      } else {
        var index = 0
        while index < pixels.Length {
          target[index] = pixels[index + 2]
          target[index + 1] = pixels[index + 1]
          target[index + 2] = pixels[index]
          target[index + 3] = pixels[index + 3]
          index += 4
        }
      }
      let commands = VulkanCommandFactory.CreatePoolAndAllocate(device, dispatch, nil, runtime.GraphicsFamilyIndex,
        uint32(VkConstants.VK_COMMAND_POOL_CREATE_TRANSIENT_BIT), VkConstants.VK_COMMAND_BUFFER_LEVEL_PRIMARY, 1u, *VkCommandBuffer(scratch))
      try { SubmitUpload(Marshal.ReadIntPtr(scratch), staging.Buffer, extent, scratch) }
      finally { DestroyHandle(nint(dispatch.vkDestroyCommandPool), commands.Pool) }
    } finally { decoded.Release() }
  }

  private func SubmitUpload(command VkCommandBuffer, staging VkBuffer, extent VkExtent3D, scratch nint) {
    let dispatch = runtime.Dispatch
    let begin = Marshal.GetDelegateForFunctionPointer[StillBeginCommands](nint(dispatch.vkBeginCommandBuffer))
    var beginInfo = VkCommandBufferBeginInfo{sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
      flags: uint32(VkConstants.VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT)}
    Check(begin(command, ref beginInfo), "Cannot begin still image upload")
    let subresource = VulkanTransitions.ColorSubresourceRange()
    let pipelineBarrier = Marshal.GetDelegateForFunctionPointer[StillImageBarrier](nint(dispatch.vkCmdPipelineBarrier2))
    let acquire = VkImageMemoryBarrier2{sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2,
      dstStageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_TRANSFER_BIT, dstAccessMask: VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
      oldLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED, newLayout: VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
      srcQueueFamilyIndex: VkConstants.VK_QUEUE_FAMILY_FOREIGN_EXT, dstQueueFamilyIndex: runtime.GraphicsFamilyIndex,
      image: image, subresourceRange: subresource}
    Unsafe.Write(*void(scratch), acquire)
    var dependency = VkDependencyInfo{sType: VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
      imageMemoryBarrierCount: 1u, pImageMemoryBarriers: *VkImageMemoryBarrier2(scratch)}
    pipelineBarrier(command, ref dependency)
    var region = VkBufferImageCopy{imageSubresource: VkImageSubresourceLayers{
      aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT), layerCount: 1u}, imageExtent: extent}
    let copy = Marshal.GetDelegateForFunctionPointer[StillCopyImage](nint(dispatch.vkCmdCopyBufferToImage))
    copy(command, staging, image, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1u, ref region)
    let release = VkImageMemoryBarrier2{sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2,
      srcStageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_TRANSFER_BIT, srcAccessMask: VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
      oldLayout: VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, newLayout: VkConstants.VK_IMAGE_LAYOUT_GENERAL,
      srcQueueFamilyIndex: runtime.GraphicsFamilyIndex, dstQueueFamilyIndex: VkConstants.VK_QUEUE_FAMILY_FOREIGN_EXT,
      image: image, subresourceRange: subresource}
    Unsafe.Write(*void(scratch), release)
    pipelineBarrier(command, ref dependency)
    let end = Marshal.GetDelegateForFunctionPointer[StillEndCommands](nint(dispatch.vkEndCommandBuffer))
    Check(end(command), "Cannot end still image upload")
    let mailbox = VulkanQueueMailbox(nil)
    mailbox.PrepareSubmit(command, 0uL, 0uL)
    if !mailbox.BeginSubmit() { throw InvalidOperationException("Still-image upload mailbox was not idle") }
    var enqueued = false
    try {
      while !enqueued {
        enqueued = runtime.EnqueueGraphicsSubmission(mailbox, (serial uint64) -> {})
        if !enqueued { Thread.Sleep(1) }
      }
    } finally {
      if !enqueued { mailbox.CancelSubmit() }
    }
    var submitted VkResult
    while !mailbox.TakeSubmitCompletion(out submitted) { Thread.Sleep(1) }
    mailbox.ResetSubmitCompletion()
    if submitted == VkConstants.VK_ERROR_DEVICE_LOST { runtime.MarkDeviceLost() }
    Check(submitted, "Cannot submit still image upload")
    Check(runtime.WaitGraphicsSubmission(mailbox.SubmitSerial, uint64.MaxValue), "Still image upload did not complete")
  }

  private func DestroyHandle(address nint, handle uint64) {
    if handle == 0uL { return }
    let destroy = Marshal.GetDelegateForFunctionPointer[StillDestroyHandle](address)
    destroy(runtime.Device, handle, nint(0))
  }

  internal func ReleaseStaging() {
    if staging.Buffer == 0uL { return }
    DestroyHandle(nint(runtime.Dispatch.vkDestroyBuffer), staging.Buffer)
    runtime.MemoryAllocator.Release(staging.Allocation)
    staging = VulkanBufferCreation{}
  }

  private func Destroy() {
    ReleaseStaging()
    let dispatch = runtime.Dispatch
    DestroyHandle(nint(dispatch.vkDestroyImage), image)
    DestroyHandle(nint(dispatch.vkFreeMemory), memory)
    buffer.Dispose()
  }

  public func Dispose() {
    Destroy()
    runtime.Release()
  }
}
