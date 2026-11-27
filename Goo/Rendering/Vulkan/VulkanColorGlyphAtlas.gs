package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Runtime.InteropServices

internal struct VulkanColorGlyphKey : IEquatable[VulkanColorGlyphKey] {
  internal prop Family string{ get; init; }
  internal prop Provider VulkanTextProvider{ get; init; }
  internal prop GlyphId uint32{ get; init; }
  internal prop Ppem int32{ get; init; }

  internal init(family string, provider VulkanTextProvider, glyphId uint32, ppem int32 = 0) {
    Family = family
    Provider = provider
    GlyphId = glyphId
    Ppem = ppem
  }

  public func Equals(other VulkanColorGlyphKey) bool ->
    String.Equals(Family, other.Family, StringComparison.Ordinal)
      && Object.ReferenceEquals(Provider, other.Provider)
      && GlyphId == other.GlyphId
      && Ppem == other.Ppem

  public override func Equals(value object?) bool -> switch value {
    case other is VulkanColorGlyphKey: Equals(other)
    case _: false
  }

  public override func GetHashCode() int32 {
    let familyHash = Family == nil ? 0 : StringComparer.Ordinal.GetHashCode(Family)
    return HashCode.Combine(familyHash, RuntimeHelpers.GetHashCode(Provider), int32(GlyphId), Ppem)
  }
}

internal data struct VulkanColorGlyphPlacement {
  var PageIndex int32
  var ImageId ResourceId
  var SamplerId ResourceId
  var AtlasGeneration uint64
  var PixelWidth uint32
  var PixelHeight uint32
  var ContentX uint32
  var ContentY uint32
  var ContentWidth uint32
  var ContentHeight uint32
  var SourceX float32
  var SourceY float32
  var SourceWidth float32
  var SourceHeight float32
  var Extents VulkanTextGlyphExtents
  var Scale int32
  var Valid bool
}

internal data struct VulkanColorGlyphDirtyUpload {
  var PageIndex int32
  var StagingIndex int32
  var StagingOffset VkDeviceSize
  var ByteCount VkDeviceSize
  var DestX uint32
  var DestY uint32
  var Width uint32
  var Height uint32
}

internal sealed class VulkanColorGlyphStagingChunk {
  internal var Buffer VkBuffer = 0uL
  internal var Allocation VulkanMemoryAllocation? = nil
  internal var Mapped nint = nint(0)
  internal var Capacity VkDeviceSize
  internal var Used VkDeviceSize
  internal var UploadCommandBuffer VkCommandBuffer = nint(0)
  internal var SubmissionSerial uint64
  internal var Pending bool
  internal var Recorded bool
  internal var FlushPrepared bool
  internal var Submitted bool

  internal prop HasFreeRange bool{ get -> !Submitted && !Recorded }
}

internal sealed class VulkanColorGlyphAtlasPage {
  internal var PageIndex int32
  internal var Width uint32
  internal var Height uint32
  internal var Image VkImage = 0uL
  internal var ImageView VkImageView = 0uL
  internal var Allocation VulkanMemoryAllocation? = nil
  internal var ImageId ResourceId
  internal var SamplerId ResourceId
  internal var ProviderId uint64
  internal var SourceId uint64
  internal var Registered bool
  internal var ImageLayout VkImageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
  internal var NextX uint32
  internal var NextY uint32
  internal var RowHeight uint32
  internal var GlyphCount int32
  internal var LastUseSerial uint64
  internal var LastTouch uint64
  internal var Active bool
  internal var ProtectedInBatch bool
  internal var PendingUploadCount int32
  internal var CpuMirror([]uint8)?
}

internal unsafe sealed class VulkanColorGlyphAtlas : IDisposable {
  internal const DefaultPageWidth uint32 = 1024u
  internal const DefaultPageHeight uint32 = 1024u
  internal const MaxPageWidth uint32 = 2048u
  internal const MaxPageHeight uint32 = 2048u
  internal const PaddingPixels uint32 = 1u
  internal const DefaultBudgetBytes VkDeviceSize = 67108864uL
  private const DefaultStagingChunkBytes VkDeviceSize = 1048576uL
  private const StagingOffsetAlignment VkDeviceSize = 16uL

  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private let imageResources VulkanImageResources?
  private let identityRegistry VulkanImageIdentityRegistry?
  private let objectAccounting VulkanObjectAccounting?
  private let diagnostics VulkanDiagnostics?
  private let resourceGeneration uint64
  private let pageWidth uint32
  private let pageHeight uint32
  private let budgetBytes VkDeviceSize
  private let maxPages int32
  private let glyphs Dictionary[VulkanColorGlyphKey, VulkanColorGlyphPlacement]
  private let pages List[VulkanColorGlyphAtlasPage]
  private let stagingChunks List[VulkanColorGlyphStagingChunk]
  private let pendingUploads List[VulkanColorGlyphDirtyUpload]
  private let dirtyPageIndices List[int32]
  private var nextOfflineLogicalId uint64 = 1uL
  private var nextVersion uint64 = 1uL
  private var nextTouch uint64 = 1uL
  private var atlasGeneration uint64 = 1uL
  private var currentPageIndex int32 = -1
  private var activePageCount int32
  private var residentByteSize VkDeviceSize
  private var completedSerial uint64
  private var evictionCount uint64
  private var lastUploadedDirtyCount int32
  private var zeroRowScratch []uint8 = Array.Empty[uint8]()
  private var disposed bool
  private var deviceLost bool

  internal prop PageWidth uint32{ get -> pageWidth }
  internal prop PageHeight uint32{ get -> pageHeight }
  internal prop ActivePageCount int32{ get -> activePageCount }
  internal prop PageSlotCount int32{ get -> pages.Count }
  internal prop CachedGlyphCount int32{ get -> glyphs.Count }
  internal prop EvictionCount uint64{ get -> evictionCount }
  internal prop ResidentByteSize VkDeviceSize{ get -> residentByteSize }
  internal prop PendingUploadCount int32{ get -> pendingUploads.Count }
  internal prop LastUploadedDirtyCount int32{ get -> lastUploadedDirtyCount }
  internal prop AtlasGeneration uint64{ get -> atlasGeneration }
  internal prop HasPendingUploads bool{ get -> pendingUploads.Count > 0 }

  internal init(
    nativePageWidth uint32 = DefaultPageWidth,
    nativePageHeight uint32 = DefaultPageHeight,
    nativeMaxPages int32 = 16,
    nativeBudgetBytes VkDeviceSize = DefaultBudgetBytes) {
      ValidatePageDimensions(nativePageWidth, nativePageHeight)
      if nativeMaxPages <= 0 {
        throw ArgumentOutOfRangeException("nativeMaxPages")
      }
      pageWidth = nativePageWidth
      pageHeight = nativePageHeight
      maxPages = nativeMaxPages
      budgetBytes = Math.Max(nativeBudgetBytes, VkDeviceSize(nativePageWidth) * VkDeviceSize(nativePageHeight) * 4uL)
      resourceGeneration = 1uL
      glyphs = Dictionary[VulkanColorGlyphKey, VulkanColorGlyphPlacement]()
      pages = List[VulkanColorGlyphAtlasPage]()
      stagingChunks = List[VulkanColorGlyphStagingChunk]()
      pendingUploads = List[VulkanColorGlyphDirtyUpload]()
      dirtyPageIndices = List[int32]()
    }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator,
    nativeImageResources VulkanImageResources?,
    nativeIdentityRegistry VulkanImageIdentityRegistry?,
    nativeGeneration uint64,
    nativeObjectAccounting VulkanObjectAccounting?,
    nativeDiagnostics VulkanDiagnostics?,
    nativePageWidth uint32 = DefaultPageWidth,
    nativePageHeight uint32 = DefaultPageHeight,
    nativeBudgetBytes VkDeviceSize = DefaultBudgetBytes) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeGeneration == 0uL {
        throw ArgumentOutOfRangeException("nativeGeneration")
      }
      ValidatePageDimensions(nativePageWidth, nativePageHeight)
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      imageResources = nativeImageResources
      identityRegistry = nativeIdentityRegistry
      resourceGeneration = nativeGeneration
      objectAccounting = nativeObjectAccounting
      diagnostics = nativeDiagnostics
      pageWidth = nativePageWidth
      pageHeight = nativePageHeight
      budgetBytes = Math.Max(nativeBudgetBytes, VkDeviceSize(nativePageWidth) * VkDeviceSize(nativePageHeight) * 4uL)
      maxPages = Math.Max(1, int32(budgetBytes / (VkDeviceSize(nativePageWidth) * VkDeviceSize(nativePageHeight) * 4uL)))
      glyphs = Dictionary[VulkanColorGlyphKey, VulkanColorGlyphPlacement]()
      pages = List[VulkanColorGlyphAtlasPage]()
      stagingChunks = List[VulkanColorGlyphStagingChunk]()
      pendingUploads = List[VulkanColorGlyphDirtyUpload]()
      dirtyPageIndices = List[int32]()
    }

  shared {
    private func ValidatePageDimensions(width uint32, height uint32) {
      if width < 8u || height < 8u || width > MaxPageWidth || height > MaxPageHeight {
        throw ArgumentOutOfRangeException("pageSize")
      }
    }

    internal func PremultiplyRgba(rgba []uint8, width int32, height int32) []uint8 {
      if width <= 0 || height <= 0 || int64(width) * int64(height) * 4L > int64(rgba.Length) {
        throw ArgumentOutOfRangeException("width")
      }
      let total = width * height * 4
      let result = [total]uint8
      var i int32 = 0
      while i < total {
        let r = uint32(rgba[i])
        let g = uint32(rgba[i + 1])
        let b = uint32(rgba[i + 2])
        let a = uint32(rgba[i + 3])
        if a == 255u {
          result[i] = uint8(r)
          result[i + 1] = uint8(g)
          result[i + 2] = uint8(b)
          result[i + 3] = uint8(255)
        } else if a == 0u {
          result[i] = uint8(0)
          result[i + 1] = uint8(0)
          result[i + 2] = uint8(0)
          result[i + 3] = uint8(0)
        } else {
          result[i] = uint8((r * a + 127u) / 255u)
          result[i + 1] = uint8((g * a + 127u) / 255u)
          result[i + 2] = uint8((b * a + 127u) / 255u)
          result[i + 3] = uint8(a)
        }
        i = i + 4
      }
      return result
    }

    private func ResamplePremultipliedRgba(
      source []uint8,
      sourceWidth int32,
      sourceHeight int32,
      targetWidth int32,
      targetHeight int32) []uint8 {
        let output = [targetWidth * targetHeight * 4]uint8
        var y int32 = 0
        while y < targetHeight {
          let sy = int32((int64(y) * int64(sourceHeight)) / int64(targetHeight))
          let clampedSy = Math.Min(sy, sourceHeight - 1)
          var x int32 = 0
          while x < targetWidth {
            let sx = int32((int64(x) * int64(sourceWidth)) / int64(targetWidth))
            let clampedSx = Math.Min(sx, sourceWidth - 1)
            let srcOffset = (clampedSy * sourceWidth + clampedSx) * 4
            let dstOffset = (y * targetWidth + x) * 4
            output[dstOffset] = source[srcOffset]
            output[dstOffset + 1] = source[srcOffset + 1]
            output[dstOffset + 2] = source[srcOffset + 2]
            output[dstOffset + 3] = source[srcOffset + 3]
            x++
          }
          y++
        }
        return output
      }
  }

  internal func BeginCompile(nativeCompletedSerial uint64) {
    if disposed || deviceLost {
      return
    }
    if nativeCompletedSerial > completedSerial {
      completedSerial = nativeCompletedSerial
    }
    var index int32 = 0
    while index < pages.Count {
      let page = pages[index]
      if page.Active {
        page.ProtectedInBatch = false
      }
      index++
    }
  }

  internal func IsPlacementResident(placement VulkanColorGlyphPlacement) bool {
    if disposed || deviceLost || !placement.Valid {
      return false
    }
    if placement.PageIndex < 0 || placement.PageIndex >= pages.Count {
      return false
    }
    let page = pages[placement.PageIndex]
    return page.Active
      && page.ImageId.IsValid
      && page.ImageId.LogicalId == placement.ImageId.LogicalId
      && page.ImageId.Version == placement.ImageId.Version
  }

  internal func TouchPage(imageId ResourceId) {
    if disposed || deviceLost || !imageId.IsValid {
      return
    }
    var index int32 = 0
    while index < pages.Count {
      let page = pages[index]
      if page.Active
        && page.ImageId.LogicalId == imageId.LogicalId
        && page.ImageId.Version == imageId.Version {
          page.ProtectedInBatch = true
          page.LastTouch = TouchValue()
          return
        }
      index++
    }
  }

  internal func TryGetCachedPlacement(
    family string,
    provider VulkanTextProvider,
    glyphId uint32,
    ppem int32,
    out placement VulkanColorGlyphPlacement) bool {
      placement = VulkanColorGlyphPlacement{}
      if disposed || deviceLost || provider == nil {
        return false
      }
      let key = VulkanColorGlyphKey(family, provider, glyphId, ppem)
      if glyphs.TryGetValue(key, out var cached) && IsPlacementResident(cached) {
        let page = pages[cached.PageIndex]
        page.LastTouch = TouchValue()
        page.ProtectedInBatch = true
        placement = cached
        return true
      }
      return false
    }

  internal func TryAcquireGlyph(
    family string,
    provider VulkanTextProvider,
    glyphId uint32,
    ppem int32,
    pixelWidth int32,
    pixelHeight int32,
    premultipliedRgba []uint8,
    extents VulkanTextGlyphExtents,
    scale int32,
    out placement VulkanColorGlyphPlacement) bool {
      placement = VulkanColorGlyphPlacement{}
      if disposed || deviceLost || provider == nil {
        return false
      }
      if pixelWidth <= 0 || pixelHeight <= 0 {
        return false
      }
      if int64(pixelWidth) * int64(pixelHeight) * 4L > int64(premultipliedRgba.Length) {
        return false
      }
      let key = VulkanColorGlyphKey(family, provider, glyphId, ppem)
      if glyphs.TryGetValue(key, out var existing) && IsPlacementResident(existing) {
        let existingPage = pages[existing.PageIndex]
        existingPage.LastTouch = TouchValue()
        existingPage.ProtectedInBatch = true
        placement = existing
        return true
      }
      var uploadPixels = premultipliedRgba
      var contentW = uint32(pixelWidth)
      var contentH = uint32(pixelHeight)
      let maxContentW = pageWidth - PaddingPixels * 2u
      let maxContentH = pageHeight - PaddingPixels * 2u
      if contentW > maxContentW || contentH > maxContentH {
        var scaledW = contentW
        var scaledH = contentH
        if scaledW > maxContentW {
          scaledH = Math.Max(1u, uint32(uint64(scaledH) * uint64(maxContentW) / uint64(scaledW)))
          scaledW = maxContentW
        }
        if scaledH > maxContentH {
          scaledW = Math.Max(1u, uint32(uint64(scaledW) * uint64(maxContentH) / uint64(scaledH)))
          scaledH = maxContentH
        }
        uploadPixels = ResamplePremultipliedRgba(
          premultipliedRgba, pixelWidth, pixelHeight, int32(scaledW), int32(scaledH))
        contentW = scaledW
        contentH = scaledH
      }
      let paddedW = contentW + PaddingPixels * 2u
      let paddedH = contentH + PaddingPixels * 2u
      var targetPageIndex int32 = -1
      var paddedX uint32 = 0u
      var paddedY uint32 = 0u
      if !TryPlaceOnActivePages(paddedW, paddedH, out targetPageIndex, out paddedX, out paddedY) {
        if !TryAllocateOrReclaimPageForGlyph(paddedW, paddedH, out targetPageIndex, out paddedX, out paddedY) {
          return false
        }
      }
      let page = pages[targetPageIndex]
      if !StagePaddedSubRect(page, paddedX, paddedY, paddedW, paddedH, contentW, contentH, uploadPixels) {
        return false
      }
      page.GlyphCount = page.GlyphCount + 1
      page.LastTouch = TouchValue()
      page.ProtectedInBatch = true
      currentPageIndex = targetPageIndex
      let contentX = paddedX + PaddingPixels
      let contentY = paddedY + PaddingPixels
      let placed = VulkanColorGlyphPlacement{
        PageIndex: targetPageIndex,
        ImageId: page.ImageId,
        SamplerId: page.SamplerId,
        AtlasGeneration: atlasGeneration,
        PixelWidth: contentW,
        PixelHeight: contentH,
        ContentX: contentX,
        ContentY: contentY,
        ContentWidth: contentW,
        ContentHeight: contentH,
        SourceX: float32(contentX) / float32(page.Width),
        SourceY: float32(contentY) / float32(page.Height),
        SourceWidth: float32(contentW) / float32(page.Width),
        SourceHeight: float32(contentH) / float32(page.Height),
        Extents: extents,
        Scale: scale,
        Valid: true,
      }
      if glyphs.ContainsKey(key) {
        glyphs[key] = placed
      } else {
        glyphs.Add(key, placed)
      }
      placement = placed
      return true
    }

  internal func ReadOfflinePixelRgba(pageIndex int32, x uint32, y uint32) uint32 {
    if pageIndex < 0 || pageIndex >= pages.Count {
      throw ArgumentOutOfRangeException("pageIndex")
    }
    let page = pages[pageIndex]
    guard let mirror = page.CpuMirror else {
      throw InvalidOperationException("Color glyph atlas page does not have CPU mirror bytes")
    }
    if x >= page.Width || y >= page.Height {
      throw ArgumentOutOfRangeException("x")
    }
    let offset = int32((uint64(y) * uint64(page.Width) + uint64(x)) * 4uL)
    return uint32(mirror[offset])
      | (uint32(mirror[offset + 1]) << 8)
      | (uint32(mirror[offset + 2]) << 16)
      | (uint32(mirror[offset + 3]) << 24)
  }

  internal func MarkUsed(submissionSerial uint64) {
    if disposed || deviceLost || submissionSerial == 0uL {
      return
    }
    var index int32 = 0
    while index < pages.Count {
      let page = pages[index]
      if page.Active && page.ProtectedInBatch {
        if submissionSerial > page.LastUseSerial {
          page.LastUseSerial = submissionSerial
        }
        page.LastTouch = TouchValue()
      }
      index++
    }
  }

  internal func RecordUploads(commandBuffer VkCommandBuffer) {
    if disposed || deviceLost || commandBuffer == nint(0) {
      return
    }
    if pendingUploads.Count == 0 {
      lastUploadedDirtyCount = 0
      return
    }
    if device == nint(0) {
      lastUploadedDirtyCount = pendingUploads.Count
      var clearIndex int32 = 0
      while clearIndex < pages.Count {
        pages[clearIndex].PendingUploadCount = 0
        clearIndex++
      }
      pendingUploads.Clear()
      return
    }
    let pipelineBarrier = dispatch.vkCmdPipelineBarrier2
    let copyBufferToImage = dispatch.vkCmdCopyBufferToImage
    dirtyPageIndices.Clear()
    var uploadIndex int32 = 0
    while uploadIndex < pendingUploads.Count {
      let pageIdx = pendingUploads[uploadIndex].PageIndex
      if !dirtyPageIndices.Contains(pageIdx) {
        dirtyPageIndices.Add(pageIdx)
      }
      uploadIndex++
    }
    var dirtyIdx int32 = 0
    while dirtyIdx < dirtyPageIndices.Count {
      let page = pages[dirtyPageIndices[dirtyIdx]]
      if page.Active && page.Image != 0uL {
        let oldLayout = page.ImageLayout
        let fromUndefined = oldLayout == VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
        VulkanTransitions.RecordImage(
          commandBuffer,
          pipelineBarrier,
          page.Image,
          VulkanTransitions.ColorSubresourceRange(),
          oldLayout,
          VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
          if fromUndefined { VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT } else { VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT },
          if fromUndefined { 0uL } else { VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT },
          VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT,
          VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT)
        page.ImageLayout = VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL
      }
      dirtyIdx++
    }
    uploadIndex = 0
    while uploadIndex < pendingUploads.Count {
      let item = pendingUploads[uploadIndex]
      let page = pages[item.PageIndex]
      let chunk = stagingChunks[item.StagingIndex]
      if page.Active && page.Image != 0uL && chunk.Buffer != 0uL {
        var copy = VkBufferImageCopy{
          bufferOffset: item.StagingOffset,
          bufferRowLength: item.Width,
          bufferImageHeight: item.Height,
          imageSubresource: VkImageSubresourceLayers{
            aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
            mipLevel: 0u,
            baseArrayLayer: 0u,
            layerCount: 1u,
          },
          imageOffset: VkOffset3D{ x: int32(item.DestX), y: int32(item.DestY), z: 0 },
          imageExtent: VkExtent3D{ width: item.Width, height: item.Height, depth: 1u },
        }
        copyBufferToImage(commandBuffer, chunk.Buffer, page.Image,
          VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1u, &copy)
        chunk.UploadCommandBuffer = commandBuffer
        chunk.Recorded = true
      }
      uploadIndex++
    }
    dirtyIdx = 0
    while dirtyIdx < dirtyPageIndices.Count {
      let page = pages[dirtyPageIndices[dirtyIdx]]
      if page.Active && page.Image != 0uL {
        VulkanTransitions.RecordImage(
          commandBuffer,
          pipelineBarrier,
          page.Image,
          VulkanTransitions.ColorSubresourceRange(),
          VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
          VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
          VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT,
          VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
          VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT,
          VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT)
        page.ImageLayout = VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL
      }
      page.PendingUploadCount = 0
      dirtyIdx++
    }
    lastUploadedDirtyCount = pendingUploads.Count
    pendingUploads.Clear()
    dirtyPageIndices.Clear()
  }

  internal func FlushBeforeSubmit() VkResult {
    if disposed || deviceLost || device == nint(0) {
      return VkConstants.VK_SUCCESS
    }
    var index int32 = 0
    while index < stagingChunks.Count {
      let chunk = stagingChunks[index]
      if chunk.Pending && !chunk.FlushPrepared && chunk.Used > 0uL {
        if let allocation = chunk.Allocation {
          let result = allocator.FlushBeforeSubmit(allocation, 0uL, chunk.Used)
          if result != VkConstants.VK_SUCCESS {
            return result
          }
        }
        chunk.FlushPrepared = true
      }
      index++
    }
    return VkConstants.VK_SUCCESS
  }

  internal func MarkSubmitted(commandBuffer VkCommandBuffer, submissionSerial uint64) {
    if disposed || deviceLost || submissionSerial == 0uL {
      return
    }
    var index int32 = 0
    while index < stagingChunks.Count {
      let chunk = stagingChunks[index]
      if chunk.Pending && chunk.Recorded && !chunk.Submitted && chunk.UploadCommandBuffer == commandBuffer {
        chunk.Submitted = true
        chunk.SubmissionSerial = submissionSerial
      }
      index++
    }
    var pageIndex int32 = 0
    while pageIndex < dirtyPageIndices.Count {
      pageIndex++
    }
    MarkUsed(submissionSerial)
  }

  internal func AbortUploads() {
    if disposed {
      return
    }
    pendingUploads.Clear()
    dirtyPageIndices.Clear()
    var pageIndex int32 = 0
    while pageIndex < pages.Count {
      pages[pageIndex].PendingUploadCount = 0
      pageIndex++
    }
    var chunkIndex int32 = 0
    while chunkIndex < stagingChunks.Count {
      let chunk = stagingChunks[chunkIndex]
      if !chunk.Submitted {
        chunk.Pending = false
        chunk.Recorded = false
        chunk.FlushPrepared = false
        chunk.UploadCommandBuffer = nint(0)
        chunk.Used = 0uL
      }
      chunkIndex++
    }
  }

  internal func Collect(nativeCompletedSerial uint64) bool {
    if disposed || deviceLost {
      return false
    }
    if nativeCompletedSerial > completedSerial {
      completedSerial = nativeCompletedSerial
    }
    var collected = false
    var chunkIndex int32 = 0
    while chunkIndex < stagingChunks.Count {
      let chunk = stagingChunks[chunkIndex]
      if chunk.Submitted && chunk.SubmissionSerial <= completedSerial {
        chunk.Pending = false
        chunk.Recorded = false
        chunk.FlushPrepared = false
        chunk.Submitted = false
        chunk.SubmissionSerial = 0uL
        chunk.UploadCommandBuffer = nint(0)
        chunk.Used = 0uL
        collected = true
      }
      chunkIndex++
    }
    while residentByteSize > budgetBytes {
      if !TryEvictLruPage(completedSerial) {
        break
      }
      collected = true
    }
    return collected
  }

  internal func PublishCompletedUploads() {
    Collect(completedSerial)
  }

  private func TryPlaceOnActivePages(
    paddedWidth uint32,
    paddedHeight uint32,
    out pageIndex int32,
    out placedX uint32,
    out placedY uint32) bool {
      pageIndex = -1
      placedX = 0u
      placedY = 0u
      if currentPageIndex >= 0 && currentPageIndex < pages.Count {
        let current = pages[currentPageIndex]
        if current.Active && TryPlaceOnPageShelf(current, paddedWidth, paddedHeight, out placedX, out placedY) {
          pageIndex = currentPageIndex
          return true
        }
      }
      var index int32 = 0
      while index < pages.Count {
        if index != currentPageIndex {
          let page = pages[index]
          if page.Active && TryPlaceOnPageShelf(page, paddedWidth, paddedHeight, out placedX, out placedY) {
            pageIndex = index
            return true
          }
        }
        index++
      }
      return false
    }

  private func TryPlaceOnPageShelf(
    page VulkanColorGlyphAtlasPage,
    paddedWidth uint32,
    paddedHeight uint32,
    out x uint32,
    out y uint32) bool {
      x = 0u
      y = 0u
      if paddedWidth > page.Width || paddedHeight > page.Height {
        return false
      }
      if page.NextX <= page.Width && page.NextY <= page.Height
        && paddedWidth <= page.Width - page.NextX
        && paddedHeight <= page.Height - page.NextY {
          x = page.NextX
          y = page.NextY
          page.NextX = page.NextX + paddedWidth
          if paddedHeight > page.RowHeight {
            page.RowHeight = paddedHeight
          }
          return true
        }
      if page.RowHeight == 0u || page.NextY > page.Height
        || page.RowHeight > page.Height - page.NextY {
          return false
        }
      let nextRowY = page.NextY + page.RowHeight
      if paddedHeight > page.Height - nextRowY {
        return false
      }
      x = 0u
      y = nextRowY
      page.NextX = paddedWidth
      page.NextY = nextRowY
      page.RowHeight = paddedHeight
      return true
    }

  private func TryAllocateOrReclaimPageForGlyph(
    paddedWidth uint32,
    paddedHeight uint32,
    out pageIndex int32,
    out placedX uint32,
    out placedY uint32) bool {
      pageIndex = -1
      placedX = 0u
      placedY = 0u
      let singlePageBytes = VkDeviceSize(pageWidth) * VkDeviceSize(pageHeight) * 4uL
      let underBudget = activePageCount < maxPages && residentByteSize + singlePageBytes <= budgetBytes
      if underBudget {
        if TryCreatePage(out let createdIndex) {
          let created = pages[createdIndex]
          if TryPlaceOnPageShelf(created, paddedWidth, paddedHeight, out placedX, out placedY) {
            pageIndex = createdIndex
            return true
          }
        }
      }
      while TryEvictLruPage(completedSerial) {
        if activePageCount < maxPages && residentByteSize + singlePageBytes <= budgetBytes {
          if TryCreatePage(out let createdIndex) {
            let created = pages[createdIndex]
            if TryPlaceOnPageShelf(created, paddedWidth, paddedHeight, out placedX, out placedY) {
              pageIndex = createdIndex
              return true
            }
          }
        }
      }
      if TryCreatePage(out let emergencyIndex) {
        let created = pages[emergencyIndex]
        if TryPlaceOnPageShelf(created, paddedWidth, paddedHeight, out placedX, out placedY) {
          pageIndex = emergencyIndex
          return true
        }
      }
      return false
    }

  private func TryCreatePage(out createdIndex int32) bool {
    createdIndex = -1
    var slot int32 = 0
    while slot < pages.Count && pages[slot].Active {
      slot++
    }
    let page = if slot < pages.Count {
      pages[slot]
    } else {
      let added = VulkanColorGlyphAtlasPage{ PageIndex: pages.Count }
      pages.Add(added)
      added
    }
    page.PageIndex = slot
    page.Width = pageWidth
    page.Height = pageHeight
    page.ImageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
    page.NextX = 0u
    page.NextY = 0u
    page.RowHeight = 0u
    page.GlyphCount = 0
    page.LastUseSerial = 0uL
    page.LastTouch = TouchValue()
    page.PendingUploadCount = 0
    let pageBytes = VkDeviceSize(pageWidth) * VkDeviceSize(pageHeight) * 4uL
    let version = NextVersion()
    if device == nint(0) {
      let id = NextOfflineId()
      page.ImageId = ResourceId{ Kind: SceneResourceKind.Image, LogicalId: id, Version: version }
      page.SamplerId = ResourceId{ Kind: SceneResourceKind.Sampler, LogicalId: 1uL, Version: 1uL }
      page.CpuMirror = [int32(pageBytes)]uint8
      page.Active = true
      activePageCount = activePageCount + 1
      residentByteSize = residentByteSize + pageBytes
      currentPageIndex = slot
      atlasGeneration = atlasGeneration + 1uL
      createdIndex = slot
      return true
    }
    guard let registry = identityRegistry, let resources = imageResources else {
      return false
    }
    var providerId uint64 = 0uL
    var sourceId uint64 = 0uL
    let imageId = registry.AcquireColorAtlasPageId(out providerId, out sourceId, version)
    let growth = activePageCount > 0
    if growth {
      allocator.BeginCacheGrowth()
    }
    var created VulkanImageCreation
    var haveImage = false
    try {
      created = VulkanImageFactory.Create2D(
        device,
        dispatch,
        allocator,
        objectAccounting,
        VkExtent2D{ width: pageWidth, height: pageHeight },
        VkConstants.VK_FORMAT_R8G8B8A8_UNORM,
        uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT),
        uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
        VulkanMemoryPolicy.DeviceLocalRequired,
        VulkanMemoryOwnerKind.GlyphAtlas)
      haveImage = true
      let samplerId = registry.LinearSamplerId
      let lookup = resources.RegisterColorAtlasPage(
        imageId, providerId, sourceId, samplerId,
        created.Image, created.ImageView, pageWidth, pageHeight)
      if !lookup.Renderable {
        DestroyVulkanPageResources(created.Image, created.ImageView, created.Allocation)
        return false
      }
      page.Image = created.Image
      page.ImageView = created.ImageView
      page.Allocation = created.Allocation
      page.ImageId = imageId
      page.SamplerId = samplerId
      page.ProviderId = providerId
      page.SourceId = sourceId
      page.Registered = true
      page.Active = true
      activePageCount = activePageCount + 1
      residentByteSize = residentByteSize + pageBytes
      currentPageIndex = slot
      atlasGeneration = atlasGeneration + 1uL
      createdIndex = slot
      return true
    } catch (pressure VulkanMemoryPressureException) {
      if haveImage {
        DestroyVulkanPageResources(created.Image, created.ImageView, created.Allocation)
      }
      return false
    } catch (error Exception) {
      if haveImage {
        DestroyVulkanPageResources(created.Image, created.ImageView, created.Allocation)
      }
      return false
    } finally {
      if growth {
        allocator.EndCacheGrowth()
      }
    }
  }

  internal func TryEvictLruPage(nativeCompletedSerial uint64) bool {
    var victimIndex int32 = -1
    var oldestTouch uint64 = uint64.MaxValue
    var index int32 = 0
    while index < pages.Count {
      let page = pages[index]
      if page.Active
        && !page.ProtectedInBatch
        && page.PendingUploadCount == 0
        && page.LastUseSerial <= nativeCompletedSerial
        && (index != currentPageIndex || activePageCount > 1) {
          if page.LastTouch < oldestTouch {
            oldestTouch = page.LastTouch
            victimIndex = index
          }
        }
      index++
    }
    if victimIndex < 0 {
      var fallbackIndex int32 = 0
      while fallbackIndex < pages.Count {
        let page = pages[fallbackIndex]
        if page.Active
          && !page.ProtectedInBatch
          && page.PendingUploadCount == 0
          && page.LastUseSerial <= nativeCompletedSerial {
            if page.LastTouch < oldestTouch {
              oldestTouch = page.LastTouch
              victimIndex = fallbackIndex
            }
          }
        fallbackIndex++
      }
    }
    if victimIndex < 0 {
      return false
    }
    RetirePage(victimIndex, nativeCompletedSerial, false)
    evictionCount = evictionCount + 1uL
    atlasGeneration = atlasGeneration + 1uL
    return true
  }

  private func RetirePage(pageIndex int32, retireFence uint64, lost bool) {
    let page = pages[pageIndex]
    if !page.Active {
      return
    }
    let staleKeys = List[VulkanColorGlyphKey]()
    for entry in glyphs {
      if entry.Value.PageIndex == pageIndex {
        staleKeys.Add(entry.Key)
      }
    }
    var keyIdx int32 = 0
    while keyIdx < staleKeys.Count {
      glyphs.Remove(staleKeys[keyIdx])
      keyIdx++
    }
    if page.Registered {
      if let resources = imageResources {
        try { resources.RemoveColorAtlasPage(page.ImageId, retireFence, lost) } catch (cleanup Exception) { }
      }
      page.Registered = false
    }
    if device != nint(0) {
      DestroyVulkanPageResources(page.Image, page.ImageView, page.Allocation)
    }
    let pageBytes = VkDeviceSize(page.Width) * VkDeviceSize(page.Height) * 4uL
    page.Image = 0uL
    page.ImageView = 0uL
    page.Allocation = nil
    page.ImageId = ResourceId{}
    page.SamplerId = ResourceId{}
    page.CpuMirror = nil
    page.Active = false
    page.ProtectedInBatch = false
    page.PendingUploadCount = 0
    page.GlyphCount = 0
    activePageCount = activePageCount - 1
    if residentByteSize >= pageBytes {
      residentByteSize = residentByteSize - pageBytes
    } else {
      residentByteSize = 0uL
    }
    if currentPageIndex == pageIndex {
      currentPageIndex = -1
      var i int32 = 0
      while i < pages.Count {
        if pages[i].Active {
          currentPageIndex = i
          break
        }
        i++
      }
    }
  }

  private func StagePaddedSubRect(
    page VulkanColorGlyphAtlasPage,
    paddedX uint32,
    paddedY uint32,
    paddedWidth uint32,
    paddedHeight uint32,
    contentWidth uint32,
    contentHeight uint32,
    premultipliedRgba []uint8) bool {
      let byteCount = VkDeviceSize(paddedWidth) * VkDeviceSize(paddedHeight) * 4uL
      if device == nint(0) {
        guard let mirror = page.CpuMirror else {
          return false
        }
        let pageStride = int32(page.Width * 4u)
        var py uint32 = 0u
        while py < paddedHeight {
          let dstRowStart = int32((uint64(paddedY + py) * uint64(page.Width) + uint64(paddedX)) * 4uL)
          let rowBytes = int32(paddedWidth * 4u)
          Array.Clear(mirror, dstRowStart, rowBytes)
          if py >= PaddingPixels && py < PaddingPixels + contentHeight {
            let srcRow = int32(py - PaddingPixels) * int32(contentWidth * 4u)
            let dstContent = dstRowStart + int32(PaddingPixels * 4u)
            Array.Copy(premultipliedRgba, srcRow, mirror, dstContent, int32(contentWidth * 4u))
          }
          py++
        }
        let _ = pageStride
        page.PendingUploadCount = page.PendingUploadCount + 1
        pendingUploads.Add(VulkanColorGlyphDirtyUpload{
          PageIndex: page.PageIndex,
          StagingIndex: -1,
          StagingOffset: 0uL,
          ByteCount: byteCount,
          DestX: paddedX,
          DestY: paddedY,
          Width: paddedWidth,
          Height: paddedHeight,
        })
        return true
      }
      if !TryReserveStaging(byteCount, out var chunkIndex, out var offset) {
        return false
      }
      let chunk = stagingChunks[chunkIndex]
      let stagingBase = nint(chunk.Mapped) + nint(offset)
      let paddedRowBytes = int32(paddedWidth * 4u)
      let contentRowBytes = int32(contentWidth * 4u)
      if zeroRowScratch.Length < paddedRowBytes {
        zeroRowScratch = [paddedRowBytes]uint8
      }
      let paddingBytes = int32(PaddingPixels * 4u)
      var py uint32 = 0u
      while py < paddedHeight {
        let dstRow = stagingBase + nint(py * paddedWidth * 4u)
        Marshal.Copy(zeroRowScratch, 0, dstRow, paddedRowBytes)
        if py >= PaddingPixels && py < PaddingPixels + contentHeight {
          let srcRow = int32(py - PaddingPixels) * contentRowBytes
          Marshal.Copy(premultipliedRgba, srcRow, dstRow + nint(paddingBytes), contentRowBytes)
        }
        py++
      }
      chunk.Pending = true
      page.PendingUploadCount = page.PendingUploadCount + 1
      pendingUploads.Add(VulkanColorGlyphDirtyUpload{
        PageIndex: page.PageIndex,
        StagingIndex: chunkIndex,
        StagingOffset: offset,
        ByteCount: byteCount,
        DestX: paddedX,
        DestY: paddedY,
        Width: paddedWidth,
        Height: paddedHeight,
      })
      return true
    }

  private func TryReserveStaging(
    byteCount VkDeviceSize,
    out chunkIndex int32,
    out offset VkDeviceSize) bool {
      chunkIndex = -1
      offset = 0uL
      var index int32 = 0
      while index < stagingChunks.Count {
        let candidate = stagingChunks[index]
        if candidate.HasFreeRange {
          let aligned = AlignStagingOffset(candidate.Used)
          if aligned <= candidate.Capacity && byteCount <= candidate.Capacity - aligned {
            offset = aligned
            candidate.Used = aligned + byteCount
            chunkIndex = index
            return true
          }
        }
        index++
      }
      let requiredCapacity = Math.Max(DefaultStagingChunkBytes, AlignStagingOffset(byteCount))
      try {
        let creation = VulkanBufferFactory.CreateMapped(
          device,
          dispatch,
          allocator,
          objectAccounting,
          requiredCapacity,
          uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT),
          VulkanMemoryPolicy.HostVisibleCoherentCached)
        let chunk = VulkanColorGlyphStagingChunk{
          Buffer: creation.Buffer,
          Allocation: creation.Allocation,
          Mapped: nint(creation.Allocation.mapped),
          Capacity: requiredCapacity,
          Used: byteCount,
        }
        chunkIndex = stagingChunks.Count
        offset = 0uL
        stagingChunks.Add(chunk)
        return true
      } catch (error Exception) {
        return false
      }
    }

  private func AlignStagingOffset(value VkDeviceSize) VkDeviceSize {
    let rem = value % StagingOffsetAlignment
    if rem == 0uL {
      return value
    }
    return value + (StagingOffsetAlignment - rem)
  }

  private func DestroyVulkanPageResources(image VkImage, view VkImageView,
    allocation VulkanMemoryAllocation?) {
      if view != 0uL {
        let destroyView = dispatch.vkDestroyImageView
        try { destroyView(device, view, nil) } catch (cleanup Exception) { }
        if let accounting = objectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
      }
      if image != 0uL {
        let destroyImage = dispatch.vkDestroyImage
        try { destroyImage(device, image, nil) } catch (cleanup Exception) { }
        if let accounting = objectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
      }
      if let mem = allocation {
        try { allocator.Release(mem) } catch (cleanup Exception) { }
      }
    }

  private func DestroyStagingChunks() {
    var index int32 = 0
    while index < stagingChunks.Count {
      let chunk = stagingChunks[index]
      if chunk.Buffer != 0uL {
        let destroyBuffer = dispatch.vkDestroyBuffer
        try { destroyBuffer(device, chunk.Buffer, nil) } catch (cleanup Exception) { }
        if let accounting = objectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
        chunk.Buffer = 0uL
      }
      if let allocation = chunk.Allocation {
        try { allocator.Release(allocation) } catch (cleanup Exception) { }
        chunk.Allocation = nil
      }
      chunk.Mapped = nint(0)
      index++
    }
    stagingChunks.Clear()
  }

  private func TouchValue() uint64 {
    let current = nextTouch
    nextTouch = nextTouch + 1uL
    return current
  }

  private func NextVersion() uint64 {
    let current = nextVersion
    nextVersion = nextVersion + 1uL
    return current
  }

  private func NextOfflineId() uint64 {
    let current = nextOfflineLogicalId
    nextOfflineLogicalId = nextOfflineLogicalId + 1uL
    return current
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    deviceLost = true
    pendingUploads.Clear()
    dirtyPageIndices.Clear()
    var index int32 = 0
    while index < pages.Count {
      if pages[index].Active {
        RetirePage(index, completedSerial, true)
      }
      index++
    }
    glyphs.Clear()
    if device != nint(0) {
      DestroyStagingChunks()
    }
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    pendingUploads.Clear()
    dirtyPageIndices.Clear()
    var index int32 = 0
    while index < pages.Count {
      if pages[index].Active {
        RetirePage(index, completedSerial, false)
      }
      index++
    }
    glyphs.Clear()
    if device != nint(0) {
      DestroyStagingChunks()
    }
  }

  deinit {
    try { Dispose() } catch (error Exception) { }
  }
}
