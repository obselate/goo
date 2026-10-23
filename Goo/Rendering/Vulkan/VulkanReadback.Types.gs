package Goo

internal data struct VulkanReadbackRegion {
  internal var X uint32
  internal var Y uint32
  internal var Width uint32
  internal var Height uint32
}

internal data struct VulkanReadbackPlan {
  internal let Region VulkanReadbackRegion
  internal let Extent VkExtent2D
  internal let RowBytes VkDeviceSize
  internal let ByteSize VkDeviceSize
  internal let ImageByteSize VkDeviceSize
  internal let ResourceByteSize VkDeviceSize

  shared {
    internal func Full(extent VkExtent2D) VulkanReadbackPlan -> Create(VulkanReadbackRegion {
      X: 0u,
      Y: 0u,
      Width: extent.width,
      Height: extent.height,
    }, extent)

    internal func Create(region VulkanReadbackRegion,
      extent VkExtent2D) VulkanReadbackPlan{
        if extent.width == 0u || extent.height == 0u {
          throw ArgumentOutOfRangeException("extent")
        }
        if region.Width == 0u || region.Height == 0u {
          throw ArgumentOutOfRangeException("region")
        }
        if region.X >= extent.width || region.Y >= extent.height
          || region.Width > extent.width - region.X
          || region.Height > extent.height - region.Y{
            throw ArgumentOutOfRangeException("region")
          }
        let imageRowBytes = uint64(extent.width) * 4uL
        if uint64(extent.height) > uint64.MaxValue / imageRowBytes {
          throw OverflowException("Vulkan readback image byte size overflow")
        }
        let imageByteSize = imageRowBytes * uint64(extent.height)
        let rowBytes = uint64(region.Width) * 4uL
        if uint64(region.Height) > uint64.MaxValue / rowBytes {
          throw OverflowException("Vulkan readback byte size overflow")
        }
        let byteSize = rowBytes * uint64(region.Height)
        if imageByteSize > uint64.MaxValue - byteSize {
          throw OverflowException("Vulkan readback resource byte size overflow")
        }
        return VulkanReadbackPlan{
          Region: region,
          Extent: extent,
          RowBytes: VkDeviceSize(rowBytes),
          ByteSize: VkDeviceSize(byteSize),
          ImageByteSize: VkDeviceSize(imageByteSize),
          ResourceByteSize: VkDeviceSize(imageByteSize + byteSize),
        }
      }
  }
}

internal enum VulkanReadbackState {
  Idle;
  Pending;
  Complete;
  Failed;
  Abandoned;
}

internal data struct VulkanReadbackTimingSnapshot {
  internal var RequestStartTicks int64
  internal var RecordTicks int64
  internal var SubmitTicks int64
  internal var ReadyTicks int64
  internal var CpuCopyStartTicks int64
  internal var CpuCopyEndTicks int64
  internal var RequestedByteSize VkDeviceSize
  internal var ResidentResourceBytes VkDeviceSize
  internal var ObjectCreateDelta uint64
  internal var ObjectDestroyDelta uint64
  internal var GpuTimingAvailable bool
  internal var GpuSceneReplayNanoseconds uint64
  internal var GpuCopyNanoseconds uint64
}

internal sealed class VulkanReadbackResult : WindowReadbackResult {
  private let pixels []uint8
  private let width uint32
  private let height uint32
  private let rowBytes uint32
  private let format VkFormat
  private let generation uint64
  private let submissionSerial uint64

  public prop Width uint32{ get -> width }
  public prop Height uint32{ get -> height }
  public prop RowBytes uint32{ get -> rowBytes }
  internal prop Format VkFormat{ get -> format }
  internal prop Generation uint64{ get -> generation }
  internal prop SubmissionSerial uint64{ get -> submissionSerial }
  internal prop OwnedPixels []uint8{ get -> pixels }
  public prop Premultiplied bool{ get -> true }
  public prop OriginBottomLeft bool{ get -> false }
  public prop SrgbEncoded bool{ get -> true }
  public prop Pixels []uint8{
    get {
      let copy = [pixels.Length]uint8
      Array.Copy(pixels, copy, pixels.Length)
      return copy
    }
  }

  internal init(nativePixels []uint8, nativeWidth uint32, nativeHeight uint32,
    nativeRowBytes uint32, nativeFormat VkFormat, nativeGeneration uint64,
    nativeSubmissionSerial uint64) {
      if nativeWidth == 0u || nativeHeight == 0u || nativeRowBytes == 0u
        || nativeGeneration == 0uL || nativeSubmissionSerial == 0uL {
          throw ArgumentOutOfRangeException("nativeWidth")
        }
      width = nativeWidth
      height = nativeHeight
      rowBytes = nativeRowBytes
      format = nativeFormat
      generation = nativeGeneration
      submissionSerial = nativeSubmissionSerial
      pixels = nativePixels
    }
}
