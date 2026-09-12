package Goo

import System
import System.Collections.Generic

internal data struct VulkanClipMaskRegionPlacement {
  var Layer uint32
  var X uint32
  var Y uint32
  var Width uint32
  var Height uint32
  var ContentX uint32
  var ContentY uint32
  var ContentWidth uint32
  var ContentHeight uint32
}

private data struct VulkanClipMaskLayerCursor {
  var NextX uint32
  var NextY uint32
  var RowHeight uint32
}

private data struct VulkanClipMaskFreePlacement {
  var Layer uint32
  var X uint32
  var Y uint32
  var Width uint32
  var Height uint32
  var AvailableSerial uint64
}

private sealed class VulkanClipMaskRegionRecord {
  internal let Key uint64
  internal var Generation uint64
  internal var Layer uint32
  internal var PaddedX uint32
  internal var PaddedY uint32
  internal var PaddedWidth uint32
  internal var PaddedHeight uint32
  internal var ContentX uint32
  internal var ContentY uint32
  internal var ContentWidth uint32
  internal var ContentHeight uint32
  internal var ScreenX int32
  internal var ScreenY int32
  internal var ScreenWidth uint32
  internal var ScreenHeight uint32
  internal var Dirty bool
  internal var LastUseSerial uint64
  internal var UsageBatchToken uint64

  internal init(key uint64) {
    Key = key
  }
}

private unsafe sealed class VulkanClipMaskAtlasGeneration : IDisposable {
  internal let Device VkDevice
  internal let Dispatch VkDeviceDispatch
  internal let Allocator VulkanMemoryAllocator
  internal let ObjectAccounting VulkanObjectAccounting?
  internal let Width uint32
  internal let Height uint32
  internal let LayerCount uint32
  internal let Format VulkanClipMaskFormat
  internal let BytesPerPixel uint32
  internal let ResidentBytes VkDeviceSize
  internal var Image VkImage = 0uL
  internal var ImageAccounted bool
  internal var Allocation VulkanMemoryAllocation? = nil
  internal var ImageView VkImageView = 0uL
  internal var LayerViews []VkImageView
  internal var LayerViewAccounted []bool
  internal var Sampler VkSampler = 0uL
  internal var LastUseSerial uint64
  internal var disposed bool
  private var layerLayouts []VkImageLayout

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator,
    nativeObjectAccounting VulkanObjectAccounting?,
    nativeWidth uint32,
    nativeHeight uint32,
    nativeLayerCount uint32,
    nativeFormat VulkanClipMaskFormat) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeWidth == 0u || nativeHeight == 0u
        || nativeLayerCount == 0u || nativeLayerCount > VulkanClipMaskAtlasContract.MaxDepth{
          throw ArgumentOutOfRangeException("nativeLayerCount")
        }
      Device = nativeDevice
      Dispatch = nativeDispatch
      Allocator = nativeAllocator
      ObjectAccounting = nativeObjectAccounting
      Width = nativeWidth
      Height = nativeHeight
      LayerCount = nativeLayerCount
      Format = nativeFormat
      BytesPerPixel = if nativeFormat == VulkanClipMaskFormat.R8Unorm { 1u } else { 4u }
      let texels = uint64(nativeWidth) * uint64(nativeHeight) * uint64(nativeLayerCount)
      if texels == 0uL || texels > uint64.MaxValue / uint64(BytesPerPixel) {
        throw OverflowException("Vulkan clip mask atlas byte size overflow")
      }
      ResidentBytes = texels * uint64(BytesPerPixel)
      layerLayouts = [int32(nativeLayerCount)]VkImageLayout
      LayerViews = [int32(nativeLayerCount)]VkImageView
      LayerViewAccounted = [int32(nativeLayerCount)]bool
      var index int32 = 0
      while index < layerLayouts.Length {
        layerLayouts[index] = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
        index++
      }
      try {
        CreateImageResource()
        CreateLayerViews()
        CreateSampler()
      } catch (error Exception) {
        DestroySampler()
        DestroyLayerViews()
        DestroyImageView()
        DestroyImage()
        throw error
      }
    }

  internal func LayerViewAt(layer uint32) VkImageView {
    EnsureOpen()
    if layer >= LayerCount {
      throw ArgumentOutOfRangeException("layer")
    }
    let value = LayerViews[int32(layer)]
    if value == 0uL {
      throw InvalidOperationException("Vulkan clip mask layer view is unavailable")
    }
    return value
  }

  internal func RecordLayerForColorAttachment(commandBuffer VkCommandBuffer, layer uint32) {
    EnsureOpen()
    if commandBuffer == nint(0) || layer >= LayerCount {
      throw ArgumentException("Vulkan clip mask transition arguments are invalid")
    }
    let index = int32(layer)
    let oldLayout = layerLayouts[index]
    if oldLayout == VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL {
      return
    }
    let srcStageMask = if oldLayout == VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL {
      VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT
    } else {
      VkConstants.VK_PIPELINE_STAGE_2_NONE
    }
    let srcAccessMask = if oldLayout == VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL {
      VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT
    } else {
      VkConstants.VK_ACCESS_2_NONE
    }
    VulkanTransitions.RecordImage(
      commandBuffer,
      Dispatch.vkCmdPipelineBarrier2,
      Image,
      VulkanTransitions.ColorSubresourceRange(layer),
      oldLayout,
      VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
      srcStageMask,
      srcAccessMask,
      VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
      VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT)
    layerLayouts[index] = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
  }

  internal func RecordForSampling(commandBuffer VkCommandBuffer) {
    EnsureOpen()
    if commandBuffer == nint(0) {
      throw ArgumentException("Command buffer is null", "commandBuffer")
    }
    var index int32 = 0
    while index < layerLayouts.Length {
      let oldLayout = layerLayouts[index]
      if oldLayout != VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL {
        let srcStageMask = if oldLayout == VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL {
          VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT
        } else {
          VkConstants.VK_PIPELINE_STAGE_2_NONE
        }
        let srcAccessMask = if oldLayout == VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL {
          VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT
        } else {
          VkConstants.VK_ACCESS_2_NONE
        }
        VulkanTransitions.RecordImage(
          commandBuffer,
          Dispatch.vkCmdPipelineBarrier2,
          Image,
          VulkanTransitions.ColorSubresourceRange(uint32(index)),
          oldLayout,
          VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
          srcStageMask,
          srcAccessMask,
          VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT,
          VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT)
        layerLayouts[index] = VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL
      }
      index++
    }
  }

  internal func InvalidateRecordedLayouts() {
    EnsureOpen()
    var index int32 = 0
    while index < layerLayouts.Length {
      layerLayouts[index] = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
      index++
    }
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    try { DestroySampler() } catch (cleanup Exception) { }
    try { DestroyLayerViews() } catch (cleanup Exception) { }
    try { DestroyImageView() } catch (cleanup Exception) { }
    try { DestroyImage() } catch (cleanup Exception) { }
    LastUseSerial = 0uL
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    DestroySampler()
    DestroyLayerViews()
    DestroyImageView()
    DestroyImage()
  }

  private func CreateImageResource() {
    let creation = VulkanImageFactory.Create2DArray(
      Device,
      Dispatch,
      Allocator,
      ObjectAccounting,
      VkExtent2D{ width: Width, height: Height },
      FormatValue(),
      uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)
      | uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT),
      uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
      LayerCount,
      VulkanMemoryPolicy.DeviceLocalRequired)
    Image = creation.Image
    ImageView = creation.ImageView
    Allocation = creation.Allocation
    ImageAccounted = ObjectAccounting != nil
  }

  private func CreateLayerViews() {
    var layer uint32 = 0u
    try {
      while layer < LayerCount {
        LayerViews[int32(layer)] = VulkanImageFactory.CreateView(
          Device,
          Dispatch,
          ObjectAccounting,
          Image,
          VkConstants.VK_IMAGE_VIEW_TYPE_2D,
          FormatValue(),
          uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
          layer,
          1u)
        LayerViewAccounted[int32(layer)] = ObjectAccounting != nil
        layer++
      }
    } catch (error Exception) {
      DestroyLayerViews()
      throw error
    }
  }

  private func CreateSampler() {
    var samplerInfo = VkSamplerCreateInfo{}
    samplerInfo.sType = VkConstants.VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO
    samplerInfo.magFilter = VkConstants.VK_FILTER_LINEAR
    samplerInfo.minFilter = VkConstants.VK_FILTER_LINEAR
    samplerInfo.mipmapMode = VkConstants.VK_SAMPLER_MIPMAP_MODE_NEAREST
    samplerInfo.addressModeU = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER
    samplerInfo.addressModeV = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER
    samplerInfo.addressModeW = VkConstants.VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_BORDER
    samplerInfo.maxLod = 1.0F
    samplerInfo.borderColor = VkConstants.VK_BORDER_COLOR_FLOAT_TRANSPARENT_BLACK
    let createSampler = Dispatch.vkCreateSampler
    if createSampler(Device, &samplerInfo, nil, &Sampler) != VkConstants.VK_SUCCESS || Sampler == 0uL {
      throw InvalidOperationException("vkCreateSampler failed for Vulkan clip mask atlas")
    }
    if let accounting = ObjectAccounting {
      try {
        accounting.Allocate()
      } catch (error Exception) {
        let destroySampler = Dispatch.vkDestroySampler
        destroySampler(Device, Sampler, nil)
        Sampler = 0uL
        throw error
      }
    }
  }

  private func DestroySampler() {
    if Sampler == 0uL {
      return
    }
    let destroySampler = Dispatch.vkDestroySampler
    destroySampler(Device, Sampler, nil)
    if let accounting = ObjectAccounting {
      accounting.Release()
    }
    Sampler = 0uL
  }

  private func DestroyImageView() {
    if ImageView == 0uL {
      return
    }
    let destroyView = Dispatch.vkDestroyImageView
    destroyView(Device, ImageView, nil)
    if let accounting = ObjectAccounting {
      accounting.Release()
    }
    ImageView = 0uL
  }

  private func DestroyLayerViews() {
    var layer int32 = 0
    while layer < LayerViews.Length {
      let view = LayerViews[layer]
      if view != 0uL {
        let destroyView = Dispatch.vkDestroyImageView
        destroyView(Device, view, nil)
        if LayerViewAccounted[layer] {
          if let accounting = ObjectAccounting {
            accounting.Release()
          }
          LayerViewAccounted[layer] = false
        }
        if view != 0uL {
          LayerViews[layer] = 0uL
        }
      }
      layer++
    }
  }

  private func DestroyImage() {
    if Image != 0uL {
      let destroyImage = Dispatch.vkDestroyImage
      destroyImage(Device, Image, nil)
      if ImageAccounted {
        if let accounting = ObjectAccounting {
          accounting.Release()
        }
        ImageAccounted = false
      }
      Image = 0uL
    }
    if let allocation = Allocation {
      Allocator.Release(allocation)
      Allocation = nil
    }
  }

  private func FormatValue() VkFormat -> if Format == VulkanClipMaskFormat.R8Unorm {
    VkConstants.VK_FORMAT_R8_UNORM
  } else {
    VkConstants.VK_FORMAT_R8G8B8A8_UNORM
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanClipMaskAtlasGeneration")
    }
  }
}

internal unsafe sealed partial class VulkanClipMaskAtlas : IDisposable {
  private const DefaultByteBudget VkDeviceSize = 67108864uL
  private const InitialRegionCapacity int32 = 64
  private const StaleSerialWindow uint64 = 2uL

  private var device VkDevice
  private var dispatch VkDeviceDispatch
  private var allocator VulkanMemoryAllocator
  private var objectAccounting VulkanObjectAccounting?
  private let byteBudget VkDeviceSize
  private var width uint32
  private var height uint32
  private var format VulkanClipMaskFormat
  private var bytesPerPixel uint32
  private var maximumLayerCount uint32
  private var activeLayerCount uint32
  private var generation uint64
  private var completedSerial uint64
  private var current VulkanClipMaskAtlasGeneration?
  private let retired List[VulkanClipMaskAtlasGeneration]
  private let regionMap Dictionary[uint64, VulkanClipMaskRegionRecord]
  private let regionOrder List[VulkanClipMaskRegionRecord]
  private let dirtyRegions List[VulkanClipMaskDirtyRegion]
  private let freePlacements List[VulkanClipMaskFreePlacement]
  private var layerCursors []VulkanClipMaskLayerCursor
  private var nextUsageBatchToken uint64
  private var usageBatchToken uint64
  private var protectedUsageBatchToken uint64
  private var usageBatchOpen bool
  private var evictionCount uint64
  private var pressureEventCount uint64
  private var pressureFailureCount uint64
  private var disposed bool
  private var deviceLost bool

  internal prop Width uint32{ get -> width }
  internal prop Height uint32{ get -> height }
  internal prop Format VulkanClipMaskFormat{ get -> format }
  internal prop Generation uint64{ get -> generation }
  internal prop DirtyRegionCount int32{ get -> dirtyRegions.Count }
  internal prop ImageView VkImageView{ get -> CurrentGeneration().ImageView }
  internal func ImageViewAt(layer uint32) VkImageView {
    EnsureOpen()
    return CurrentGeneration().LayerViewAt(layer)
  }
  internal prop Sampler VkSampler{ get -> CurrentGeneration().Sampler }
  internal prop ResidentBytes VkDeviceSize{
    get {
      var total = CurrentGeneration().ResidentBytes
      var index int32 = 0
      while index < retired.Count {
        if total > uint64.MaxValue - retired[index].ResidentBytes {
          throw OverflowException("Vulkan clip mask atlas resident byte size overflow")
        }
        total = total + retired[index].ResidentBytes
        index++
      }
      return total
    }
  }
  internal prop Stats VulkanClipMaskAtlasStats{
    get {
      let value = CurrentGeneration()
      return VulkanClipMaskAtlasStats{
        Generation: generation,
        Width: width,
        Height: height,
        ActiveLayerCount: activeLayerCount,
        MaximumLayerCount: maximumLayerCount,
        Format: format,
        BytesPerPixel: bytesPerPixel,
        ResidentBytes: ResidentBytes,
        ByteBudget: byteBudget,
        RegionCount: regionOrder.Count,
        DirtyRegionCount: dirtyRegions.Count,
        RetiredGenerationCount: retired.Count,
        FreePlacementCount: freePlacements.Count,
        EvictionCount: evictionCount,
        PressureEventCount: pressureEventCount,
        PressureFailureCount: pressureFailureCount,
        LastUseSerial: value.LastUseSerial,
        CompletedSerial: completedSerial,
        Image: value.Image,
        ImageView: value.ImageView,
        Sampler: value.Sampler,
      }
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator,
    nativeWidth uint32,
    nativeHeight uint32,
    nativeFormatSupport VulkanClipMaskFormatSupport,
    nativeByteBudget VkDeviceSize,
    nativeGeneration uint64,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeWidth == 0u || nativeHeight == 0u {
        throw ArgumentOutOfRangeException("nativeWidth")
      }
      let selectedFormat = SelectFormat(nativeFormatSupport)
      let selectedBudget = if nativeByteBudget == 0uL { DefaultByteBudget } else { nativeByteBudget }
      let selectedBytesPerPixel = if selectedFormat == VulkanClipMaskFormat.R8Unorm { 1u } else { 4u }
      let layerBytes = uint64(nativeWidth) * uint64(nativeHeight) * uint64(selectedBytesPerPixel)
      if layerBytes == 0uL || layerBytes > selectedBudget {
        throw ArgumentOutOfRangeException("nativeByteBudget")
      }
      if nativeGeneration == 0uL {
        throw ArgumentOutOfRangeException("nativeGeneration")
      }
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      objectAccounting = nativeObjectAccounting
      byteBudget = selectedBudget
      width = nativeWidth
      height = nativeHeight
      format = selectedFormat
      bytesPerPixel = selectedBytesPerPixel
      generation = nativeGeneration
      completedSerial = 0uL
      retired = List[VulkanClipMaskAtlasGeneration]()
      regionMap = Dictionary[uint64, VulkanClipMaskRegionRecord]()
      regionOrder = List[VulkanClipMaskRegionRecord](InitialRegionCapacity)
      dirtyRegions = List[VulkanClipMaskDirtyRegion](InitialRegionCapacity)
      freePlacements = List[VulkanClipMaskFreePlacement](InitialRegionCapacity)
      nextUsageBatchToken = 0uL
      usageBatchToken = 0uL
      protectedUsageBatchToken = 0uL
      usageBatchOpen = false
      evictionCount = 0uL
      pressureEventCount = 0uL
      pressureFailureCount = 0uL
      maximumLayerCount = MaximumLayers(nativeWidth, nativeHeight, selectedBytesPerPixel, byteBudget)
      activeLayerCount = 1u
      layerCursors = [int32(VulkanClipMaskAtlasContract.MaxDepth)]VulkanClipMaskLayerCursor
      try {
        current = VulkanClipMaskAtlasGeneration(device, dispatch, allocator, objectAccounting,
          width, height, activeLayerCount, format)
      } catch (error Exception) {
        current = nil
        throw error
      }
    }

  internal func Acquire(key VulkanClipMaskAtlasKey, screenX int32, screenY int32,
    screenWidth uint32, screenHeight uint32) VulkanClipMaskRegion -> Acquire(key.Value, screenX, screenY, screenWidth, screenHeight)

  internal func Acquire(key uint64, screenX int32, screenY int32,
    screenWidth uint32, screenHeight uint32) VulkanClipMaskRegion{
      EnsureOpen()
      if !usageBatchOpen {
        throw InvalidOperationException("Vulkan clip mask atlas usage batch is not open")
      }
      if key == 0uL {
        throw ArgumentOutOfRangeException("key")
      }
      ValidateRegionSize(screenWidth, screenHeight)
      if regionMap.TryGetValue(key, out var existing) {
        existing.UsageBatchToken = CurrentUsageBatchToken()
        if screenWidth > existing.ContentWidth || screenHeight > existing.ContentHeight {
          let oldGeneration = generation
          let oldPlacement = VulkanClipMaskFreePlacement{
            Layer: existing.Layer,
            X: existing.PaddedX,
            Y: existing.PaddedY,
            Width: existing.PaddedWidth,
            Height: existing.PaddedHeight,
            AvailableSerial: existing.LastUseSerial,
          }
          var placement = VulkanClipMaskRegionPlacement{}
          EvictStaleRegions()
          if !TryPlace(screenWidth, screenHeight, ref placement) {
            IncrementPressureEventCount()
            let priorContentWidth = existing.ContentWidth
            let priorContentHeight = existing.ContentHeight
            existing.ContentWidth = screenWidth
            existing.ContentHeight = screenHeight
            try {
              let targetLayerCount = RequiredGrowthLayerCount(0u, 0u, false)
              ReplaceGeneration(targetLayerCount, width, height)
              placement = VulkanClipMaskRegionPlacement{
                Layer: existing.Layer,
                X: existing.PaddedX,
                Y: existing.PaddedY,
                Width: existing.PaddedWidth,
                Height: existing.PaddedHeight,
                ContentX: existing.ContentX,
                ContentY: existing.ContentY,
                ContentWidth: existing.ContentWidth,
                ContentHeight: existing.ContentHeight,
              }
            } catch (error Exception) {
              existing.ContentWidth = priorContentWidth
              existing.ContentHeight = priorContentHeight
              IncrementPressureFailureCount()
              throw error
            }
          }
          existing.Generation = generation
          existing.Layer = placement.Layer
          existing.PaddedX = placement.X
          existing.PaddedY = placement.Y
          existing.PaddedWidth = placement.Width
          existing.PaddedHeight = placement.Height
          existing.ContentX = placement.ContentX
          existing.ContentY = placement.ContentY
          existing.ContentWidth = placement.ContentWidth
          existing.ContentHeight = placement.ContentHeight
          if generation == oldGeneration {
            freePlacements.Add(oldPlacement)
          }
          MarkDirty(existing)
        }
        if existing.ScreenX == screenX && existing.ScreenY == screenY
          && existing.ScreenWidth == screenWidth && existing.ScreenHeight == screenHeight{
            return BuildRegion(existing)
          }
        existing.ScreenX = screenX
        existing.ScreenY = screenY
        existing.ScreenWidth = screenWidth
        existing.ScreenHeight = screenHeight
        MarkDirty(existing)
        return BuildRegion(existing)
      }
      var placement = VulkanClipMaskRegionPlacement{}
      if !TryPlace(screenWidth, screenHeight, ref placement) {
        IncrementPressureEventCount()
        EvictStaleRegions()
        if TryPlace(screenWidth, screenHeight, ref placement) {
          let record = VulkanClipMaskRegionRecord(key)
          record.Generation = generation
          record.Layer = placement.Layer
          record.PaddedX = placement.X
          record.PaddedY = placement.Y
          record.PaddedWidth = placement.Width
          record.PaddedHeight = placement.Height
          record.ContentX = placement.ContentX
          record.ContentY = placement.ContentY
          record.ContentWidth = placement.ContentWidth
          record.ContentHeight = placement.ContentHeight
          record.ScreenX = screenX
          record.ScreenY = screenY
          record.ScreenWidth = screenWidth
          record.ScreenHeight = screenHeight
          record.UsageBatchToken = CurrentUsageBatchToken()
          regionMap.Add(key, record)
          regionOrder.Add(record)
          MarkDirty(record)
          return BuildRegion(record)
        }
        try {
          let targetLayerCount = RequiredGrowthLayerCount(
            screenWidth, screenHeight, true)
          ReplaceGeneration(targetLayerCount, width, height)
        } catch (error Exception) {
          IncrementPressureFailureCount()
          throw error
        }
        if !TryPlace(screenWidth, screenHeight, ref placement) {
          IncrementPressureFailureCount()
          throw InvalidOperationException("Vulkan clip mask atlas region budget is exhausted")
        }
      }
      let record = VulkanClipMaskRegionRecord(key)
      record.Generation = generation
      record.Layer = placement.Layer
      record.PaddedX = placement.X
      record.PaddedY = placement.Y
      record.PaddedWidth = placement.Width
      record.PaddedHeight = placement.Height
      record.ContentX = placement.ContentX
      record.ContentY = placement.ContentY
      record.ContentWidth = placement.ContentWidth
      record.ContentHeight = placement.ContentHeight
      record.ScreenX = screenX
      record.ScreenY = screenY
      record.ScreenWidth = screenWidth
      record.ScreenHeight = screenHeight
      record.UsageBatchToken = CurrentUsageBatchToken()
      regionMap.Add(key, record)
      regionOrder.Add(record)
      MarkDirty(record)
      return BuildRegion(record)
    }

  internal func BeginUsageBatch() {
    EnsureOpen()
    if usageBatchOpen || protectedUsageBatchToken != 0uL {
      throw InvalidOperationException("Vulkan clip mask atlas usage batch is already active")
    }
    if nextUsageBatchToken == uint64.MaxValue {
      throw OverflowException("Vulkan clip mask atlas usage batch token overflow")
    }
    nextUsageBatchToken = nextUsageBatchToken + 1uL
    usageBatchToken = nextUsageBatchToken
    usageBatchOpen = true
  }

  internal func EndUsageBatch() {
    EnsureOpen()
    if !usageBatchOpen {
      throw InvalidOperationException("Vulkan clip mask atlas usage batch is not open")
    }
    usageBatchOpen = false
    protectedUsageBatchToken = usageBatchToken
  }

  internal func AbortUsageBatch() {
    EnsureOpen()
    usageBatchOpen = false
    usageBatchToken = 0uL
    protectedUsageBatchToken = 0uL
  }

  internal func MarkDirty(key VulkanClipMaskAtlasKey) {
    MarkDirty(key.Value)
  }

  internal func MarkDirty(key uint64) {
    EnsureOpen()
    if !regionMap.TryGetValue(key, out var record) {
      throw KeyNotFoundException("Vulkan clip mask key is not resident")
    }
    MarkDirty(record)
  }

  internal func MarkAllDirty() {
    EnsureOpen()
    var index int32 = 0
    while index < regionOrder.Count {
      MarkDirty(regionOrder[index])
      index++
    }
  }

  internal func MarkClean(key uint64) {
    EnsureOpen()
    if !regionMap.TryGetValue(key, out var record) {
      throw KeyNotFoundException("Vulkan clip mask key is not resident")
    }
    record.Dirty = false
    RemoveDirtyEntries(key)
  }

  internal func Resize(nativeWidth uint32, nativeHeight uint32, completedSubmissionSerial uint64) {
    EnsureOpen()
    if nativeWidth == 0u || nativeHeight == 0u {
      throw ArgumentOutOfRangeException("nativeWidth")
    }
    if nativeWidth == width && nativeHeight == height {
      return
    }
    if usageBatchOpen || protectedUsageBatchToken != 0uL {
      throw InvalidOperationException("Vulkan clip mask atlas cannot resize an active generation")
    }
    Collect(completedSubmissionSerial)
    maximumLayerCount = MaximumLayers(nativeWidth, nativeHeight, bytesPerPixel, byteBudget)
    regionMap.Clear()
    regionOrder.Clear()
    dirtyRegions.Clear()
    freePlacements.Clear()
    usageBatchOpen = false
    usageBatchToken = 0uL
    protectedUsageBatchToken = 0uL
    ResetCursors()
    ReplaceGeneration(1u, nativeWidth, nativeHeight)
  }

  internal func RecordLayerForColorAttachment(commandBuffer VkCommandBuffer, layer uint32) {
    EnsureOpen()
    CurrentGeneration().RecordLayerForColorAttachment(commandBuffer, layer)
  }

  internal func RecordForSampling(commandBuffer VkCommandBuffer) {
    EnsureOpen()
    CurrentGeneration().RecordForSampling(commandBuffer)
  }

  internal func InvalidateRecordedLayouts() {
    EnsureOpen()
    CurrentGeneration().InvalidateRecordedLayouts()
    MarkAllDirty()
  }

  internal func MarkUsed(submissionSerial uint64) {
    EnsureOpen()
    if submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    let value = CurrentGeneration()
    if submissionSerial > value.LastUseSerial {
      value.LastUseSerial = submissionSerial
    }
    var index int32 = 0
    while index < regionOrder.Count {
      regionOrder[index].UsageBatchToken = 0uL
      index++
    }
    usageBatchOpen = false
    usageBatchToken = 0uL
    protectedUsageBatchToken = 0uL
  }

  internal func MarkUsed(regions []VulkanClipMaskRegion, regionCount int32,
    submissionSerial uint64) {
      EnsureOpen()
      if regionCount < 0 || regionCount > regions.Length || submissionSerial == 0uL {
        throw ArgumentException("Vulkan clip mask usage arguments are invalid")
      }
      var index int32 = 0
      while index < regionCount {
        let region = regions[index]
        if region.Key == 0uL || region.Generation != generation
          || !regionMap.TryGetValue(region.Key, out var record)
          || record.Generation != generation{
            throw InvalidOperationException("Vulkan clip mask usage region is stale")
          }
        index++
      }
      let value = CurrentGeneration()
      if submissionSerial > value.LastUseSerial {
        value.LastUseSerial = submissionSerial
      }
      index = 0
      while index < regionCount {
        let record = regionMap[regions[index].Key]
        if submissionSerial > record.LastUseSerial {
          record.LastUseSerial = submissionSerial
        }
        record.UsageBatchToken = 0uL
        index++
      }
      usageBatchOpen = false
      usageBatchToken = 0uL
      protectedUsageBatchToken = 0uL
    }

  internal func Collect(completedSubmissionSerial uint64) bool {
    EnsureOpen()
    if completedSubmissionSerial > completedSerial {
      completedSerial = completedSubmissionSerial
    }
    var collected = CollectRetired()
    if EvictStaleRegions() {
      collected = true
    }
    return collected
  }

  private func CollectRetired() bool {
    var collected = false
    var index = retired.Count - 1
    while index >= 0 {
      let candidate = retired[index]
      if candidate.LastUseSerial <= completedSerial {
        candidate.Dispose()
        retired.RemoveAt(index)
        collected = true
      }
      index--
    }
    return collected
  }

  internal func RetireAll(completedSubmissionSerial uint64) {
    EnsureOpen()
    if usageBatchOpen || protectedUsageBatchToken != 0uL {
      throw InvalidOperationException("Vulkan clip mask atlas cannot retire an active generation")
    }
    Collect(completedSubmissionSerial)
    let value = CurrentGeneration()
    if value.LastUseSerial > completedSerial {
      throw InvalidOperationException("Vulkan clip mask atlas is still in use")
    }
    var index int32 = 0
    while index < retired.Count {
      if retired[index].LastUseSerial > completedSerial {
        throw InvalidOperationException("Vulkan clip mask atlas generation is still in use")
      }
      index++
    }
    value.Dispose()
    current = nil
    while retired.Count > 0 {
      let old = retired[retired.Count - 1]
      old.Dispose()
      retired.RemoveAt(retired.Count - 1)
    }
    freePlacements.Clear()
    usageBatchOpen = false
    usageBatchToken = 0uL
    protectedUsageBatchToken = 0uL
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed || deviceLost {
      return
    }
    deviceLost = true
    if let value = current {
      value.DisposeAfterDeviceLoss()
    }
    current = nil
    var index int32 = 0
    while index < retired.Count {
      retired[index].DisposeAfterDeviceLoss()
      index++
    }
    retired.Clear()
    freePlacements.Clear()
    usageBatchOpen = false
    usageBatchToken = 0uL
    protectedUsageBatchToken = 0uL
    completedSerial = 0uL
    var regionIndex int32 = 0
    while regionIndex < regionOrder.Count {
      let record = regionOrder[regionIndex]
      record.Generation = 0uL
      record.Dirty = false
      record.LastUseSerial = 0uL
      record.UsageBatchToken = 0uL
      regionIndex++
    }
    dirtyRegions.Clear()
  }

  internal func Rebuild(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator, nativeFormatSupport VulkanClipMaskFormatSupport,
    nativeObjectAccounting VulkanObjectAccounting?, nativeGeneration uint64) {
      if disposed {
        throw ObjectDisposedException("VulkanClipMaskAtlas")
      }
      if !deviceLost {
        throw InvalidOperationException("Vulkan clip mask atlas is not abandoned")
      }
      if nativeDevice == nint(0) || nativeGeneration == 0uL {
        throw ArgumentException("Vulkan clip mask rebuild arguments are invalid")
      }
      let rebuiltFormat = SelectFormat(nativeFormatSupport)
      let rebuiltBytesPerPixel = if rebuiltFormat == VulkanClipMaskFormat.R8Unorm { 1u } else { 4u }
      let rebuiltMaximumLayers = MaximumLayers(width, height, rebuiltBytesPerPixel, byteBudget)
      let rebuiltLayers = RequiredLayerCount(width, height, rebuiltMaximumLayers)
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      objectAccounting = nativeObjectAccounting
      format = rebuiltFormat
      bytesPerPixel = rebuiltBytesPerPixel
      maximumLayerCount = rebuiltMaximumLayers
      activeLayerCount = rebuiltLayers
      generation = nativeGeneration
      current = VulkanClipMaskAtlasGeneration(device, dispatch, allocator, objectAccounting,
        width, height, activeLayerCount, format)
      deviceLost = false
      freePlacements.Clear()
      usageBatchOpen = false
      usageBatchToken = 0uL
      protectedUsageBatchToken = 0uL
      ResetCursors()
      RepackRecords()
      MarkAllDirty()
    }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    if let value = current {
      try { value.Dispose() } catch (cleanup Exception) { }
    }
    current = nil
    var index int32 = 0
    while index < retired.Count {
      try { retired[index].Dispose() } catch (cleanup Exception) { }
      index++
    }
    retired.Clear()
    freePlacements.Clear()
    usageBatchOpen = false
    usageBatchToken = 0uL
    protectedUsageBatchToken = 0uL
  }

  deinit{
    try {
      Dispose()
    } catch (error Exception) {
    }
  }

  private func CurrentGeneration() VulkanClipMaskAtlasGeneration {
    EnsureOpen()
    if deviceLost || current == nil {
      throw InvalidOperationException("Vulkan clip mask atlas GPU generation is unavailable")
    }
    return current!!
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanClipMaskAtlas")
    }
    if deviceLost {
      throw InvalidOperationException("Vulkan clip mask atlas GPU generation is unavailable")
    }
  }

  private func ValidateRegionSize(regionWidth uint32, regionHeight uint32) {
    if regionWidth == 0u || regionHeight == 0u
      || regionWidth > width || regionHeight > height{
        throw ArgumentOutOfRangeException("region size")
      }
  }

  private func EffectivePadding(regionWidth uint32, regionHeight uint32,
    targetWidth uint32, targetHeight uint32) uint32{
      if regionWidth <= uint32.MaxValue - 2u && regionHeight <= uint32.MaxValue - 2u
        && regionWidth + 2u <= targetWidth && regionHeight + 2u <= targetHeight{
          return VulkanClipMaskAtlasContract.RegionPadding
        }
      return 0u
    }

  private func TryPlace(regionWidth uint32, regionHeight uint32,
    ref placement VulkanClipMaskRegionPlacement) bool{
      let padding = EffectivePadding(regionWidth, regionHeight, width, height)
      let paddedWidth = regionWidth + padding * 2u
      let paddedHeight = regionHeight + padding * 2u
      if TakeFreePlacement(paddedWidth, paddedHeight, padding, ref placement) {
        return true
      }
      var layer uint32 = 0u
      while layer < activeLayerCount {
        var cursor = layerCursors[int32(layer)]
        if cursor.NextX > width || cursor.NextY > height {
          layer++
          continue
        }
        if paddedWidth <= width - cursor.NextX && paddedHeight <= height - cursor.NextY {
          let x = cursor.NextX
          let y = cursor.NextY
          cursor.NextX = x + paddedWidth
          if paddedHeight > cursor.RowHeight {
            cursor.RowHeight = paddedHeight
          }
          layerCursors[int32(layer)] = cursor
          placement = VulkanClipMaskRegionPlacement{
            Layer: layer,
            X: x,
            Y: y,
            Width: paddedWidth,
            Height: paddedHeight,
            ContentX: x + padding,
            ContentY: y + padding,
            ContentWidth: regionWidth,
            ContentHeight: regionHeight,
          }
          return true
        }
        if cursor.NextY > uint32.MaxValue - cursor.RowHeight {
          layer++
          continue
        }
        let nextY = cursor.NextY + cursor.RowHeight
        if nextY > height || paddedHeight > height - nextY {
          layer++
          continue
        }
        cursor.NextX = paddedWidth
        cursor.NextY = nextY
        cursor.RowHeight = paddedHeight
        layerCursors[int32(layer)] = cursor
        placement = VulkanClipMaskRegionPlacement{
          Layer: layer,
          X: 0u,
          Y: nextY,
          Width: paddedWidth,
          Height: paddedHeight,
          ContentX: padding,
          ContentY: nextY + padding,
          ContentWidth: regionWidth,
          ContentHeight: regionHeight,
        }
        return true
      }
      return false
    }

  private func TakeFreePlacement(paddedWidth uint32, paddedHeight uint32,
    padding uint32, ref placement VulkanClipMaskRegionPlacement) bool{
      var index int32 = 0
      while index < freePlacements.Count {
        let free = freePlacements[index]
        if free.Width >= paddedWidth && free.Height >= paddedHeight
          && free.AvailableSerial <= completedSerial
          && !(free.AvailableSerial == 0uL
              && (usageBatchOpen || protectedUsageBatchToken != 0uL)) {
                placement = VulkanClipMaskRegionPlacement{
                  Layer: free.Layer,
                  X: free.X,
                  Y: free.Y,
                  Width: paddedWidth,
                  Height: paddedHeight,
                  ContentX: free.X + padding,
                  ContentY: free.Y + padding,
                  ContentWidth: paddedWidth - padding * 2u,
                  ContentHeight: paddedHeight - padding * 2u,
                }
                let rightWidth = free.Width - paddedWidth
                let bottomHeight = free.Height - paddedHeight
                if rightWidth != 0u && bottomHeight != 0u {
                  freePlacements[index] = VulkanClipMaskFreePlacement{
                    Layer: free.Layer,
                    X: free.X + paddedWidth,
                    Y: free.Y,
                    Width: rightWidth,
                    Height: paddedHeight,
                    AvailableSerial: free.AvailableSerial,
                  }
                  freePlacements.Add(VulkanClipMaskFreePlacement{
                    Layer: free.Layer,
                    X: free.X,
                    Y: free.Y + paddedHeight,
                    Width: free.Width,
                    Height: bottomHeight,
                    AvailableSerial: free.AvailableSerial,
                  })
                } else if rightWidth != 0u {
                  freePlacements[index] = VulkanClipMaskFreePlacement{
                    Layer: free.Layer,
                    X: free.X + paddedWidth,
                    Y: free.Y,
                    Width: rightWidth,
                    Height: free.Height,
                    AvailableSerial: free.AvailableSerial,
                  }
                } else if bottomHeight != 0u {
                  freePlacements[index] = VulkanClipMaskFreePlacement{
                    Layer: free.Layer,
                    X: free.X,
                    Y: free.Y + paddedHeight,
                    Width: free.Width,
                    Height: bottomHeight,
                    AvailableSerial: free.AvailableSerial,
                  }
                } else {
                  freePlacements.RemoveAt(index)
                }
                return true
              }
        index++
      }
      return false
    }

  private func ReplaceGeneration(newLayerCount uint32, newWidth uint32, newHeight uint32) {
    if newLayerCount == 0u || newLayerCount > VulkanClipMaskAtlasContract.MaxDepth {
      throw ArgumentOutOfRangeException("newLayerCount")
    }
    if protectedUsageBatchToken != 0uL {
      throw InvalidOperationException("Vulkan clip mask atlas cannot replace a protected generation")
    }
    let newTexels = uint64(newWidth) * uint64(newHeight)
    if newTexels > uint64.MaxValue / uint64(bytesPerPixel)
      || newTexels * uint64(bytesPerPixel) > uint64.MaxValue / uint64(newLayerCount) {
        throw OverflowException("Vulkan clip mask atlas byte size overflow")
      }
    let newBytes = newTexels * uint64(bytesPerPixel) * uint64(newLayerCount)
    let old = CurrentGeneration()
    if newBytes == 0uL || newBytes > byteBudget {
      throw InvalidOperationException("Vulkan clip mask atlas byte budget is exhausted")
    }
    let requiredLayerCount = RequiredLayerCount(newWidth, newHeight, newLayerCount)
    if requiredLayerCount > newLayerCount {
      throw InvalidOperationException("Vulkan clip mask atlas retained regions exceed the byte budget")
    }
    let created = VulkanClipMaskAtlasGeneration(device, dispatch, allocator, objectAccounting,
      newWidth, newHeight, newLayerCount, format)
    current = created
    width = newWidth
    height = newHeight
    activeLayerCount = newLayerCount
    generation = NextGeneration(generation)
    freePlacements.Clear()
    ResetCursors()
    RepackRecords()
    MarkAllDirty()
    retired.Add(old)
    CollectRetired()
  }

  private func EvictStaleRegions() bool {
    var evicted = false
    var index = regionOrder.Count - 1
    while index >= 0 {
      let record = regionOrder[index]
      if IsStale(record) && !IsProtected(record) {
        regionMap.Remove(record.Key)
        RemoveDirtyEntries(record.Key)
        AddFreePlacement(record)
        IncrementEvictionCount()
        let lastIndex = regionOrder.Count - 1
        if index != lastIndex {
          regionOrder[index] = regionOrder[lastIndex]
        }
        regionOrder.RemoveAt(lastIndex)
        evicted = true
      }
      index--
    }
    return evicted
  }

  private func IsStale(record VulkanClipMaskRegionRecord) bool {
    if record.LastUseSerial == 0uL {
      return true
    }
    if completedSerial <= record.LastUseSerial {
      return false
    }
    return completedSerial - record.LastUseSerial >= StaleSerialWindow
  }

  private func IsProtected(record VulkanClipMaskRegionRecord) bool {
    if record.LastUseSerial > completedSerial {
      return true
    }
    if record.UsageBatchToken == 0uL {
      return false
    }
    return record.UsageBatchToken == usageBatchToken
      || record.UsageBatchToken == protectedUsageBatchToken
  }

  private func CurrentUsageBatchToken() uint64 -> if usageBatchOpen { usageBatchToken } else { protectedUsageBatchToken }

  private func AddFreePlacement(record VulkanClipMaskRegionRecord) {
    freePlacements.Add(VulkanClipMaskFreePlacement{
      Layer: record.Layer,
      X: record.PaddedX,
      Y: record.PaddedY,
      Width: record.PaddedWidth,
      Height: record.PaddedHeight,
      AvailableSerial: record.LastUseSerial,
    })
  }

  private func ResetCursors() {
    var index int32 = 0
    while index < layerCursors.Length {
      layerCursors[index] = VulkanClipMaskLayerCursor{}
      index++
    }
  }

  private func RepackRecords() {
    ResetCursors()
    var index int32 = 0
    while index < regionOrder.Count {
      let record = regionOrder[index]
      var placement = VulkanClipMaskRegionPlacement{}
      if !TryPlace(record.ContentWidth, record.ContentHeight, ref placement) {
        throw InvalidOperationException("Vulkan clip mask atlas cannot repack retained regions")
      }
      record.Generation = generation
      record.Layer = placement.Layer
      record.PaddedX = placement.X
      record.PaddedY = placement.Y
      record.PaddedWidth = placement.Width
      record.PaddedHeight = placement.Height
      record.ContentX = placement.ContentX
      record.ContentY = placement.ContentY
      index++
    }
  }

  private func RequiredLayerCount(targetWidth uint32, targetHeight uint32,
    targetMaximumLayers uint32) uint32 -> PackedLayerCount(
      targetWidth, targetHeight, targetMaximumLayers, 0u, 0u, false)

  private func RequiredGrowthLayerCount(pendingWidth uint32, pendingHeight uint32,
    includePending bool) uint32{
      let required = PackedLayerCount(
        width, height, maximumLayerCount, pendingWidth, pendingHeight, includePending)
      let incremental = if activeLayerCount < maximumLayerCount {
        activeLayerCount + 1u
      } else {
        activeLayerCount
      }
      return if required > incremental { required } else { incremental }
    }

  private func PackedLayerCount(targetWidth uint32, targetHeight uint32,
    targetMaximumLayers uint32, pendingWidth uint32, pendingHeight uint32,
    includePending bool) uint32{
      let cursors = [int32(VulkanClipMaskAtlasContract.MaxDepth)]VulkanClipMaskLayerCursor
      var required uint32 = 1u
      let recordCount = regionOrder.Count
      let totalCount = recordCount + if includePending { 1 } else { 0 }
      var index int32 = 0
      while index < totalCount {
        let contentWidth = if index < recordCount {
          regionOrder[index].ContentWidth
        } else {
          pendingWidth
        }
        let contentHeight = if index < recordCount {
          regionOrder[index].ContentHeight
        } else {
          pendingHeight
        }
        let padding = EffectivePadding(contentWidth, contentHeight,
          targetWidth, targetHeight)
        let paddedWidth = contentWidth + padding * 2u
        let paddedHeight = contentHeight + padding * 2u
        var placed = false
        var layer uint32 = 0u
        while layer < required {
          var cursor = cursors[int32(layer)]
          if cursor.NextX <= targetWidth && cursor.NextY <= targetHeight
            && paddedWidth <= targetWidth - cursor.NextX
            && paddedHeight <= targetHeight - cursor.NextY{
              cursor.NextX = cursor.NextX + paddedWidth
              if paddedHeight > cursor.RowHeight {
                cursor.RowHeight = paddedHeight
              }
              cursors[int32(layer)] = cursor
              placed = true
              break
            }
          if cursor.RowHeight != 0u
            && cursor.NextY <= targetHeight - cursor.RowHeight{
              let nextY = cursor.NextY + cursor.RowHeight
              if paddedWidth <= targetWidth && paddedHeight <= targetHeight - nextY {
                cursor.NextX = paddedWidth
                cursor.NextY = nextY
                cursor.RowHeight = paddedHeight
                cursors[int32(layer)] = cursor
                placed = true
                break
              }
            }
          layer++
        }
        if !placed {
          if required >= targetMaximumLayers {
            throw InvalidOperationException("Vulkan clip mask atlas retained regions exceed the byte budget")
          }
          let newLayer = required
          required = required + 1u
          cursors[int32(newLayer)] = VulkanClipMaskLayerCursor{}
          var cursor = cursors[int32(newLayer)]
          cursor.NextX = paddedWidth
          cursor.RowHeight = paddedHeight
          cursors[int32(newLayer)] = cursor
        }
        index++
      }
      return required
    }

  private func MarkDirty(record VulkanClipMaskRegionRecord) {
    if record.Dirty {
      RemoveDirtyEntries(record.Key)
    }
    record.Dirty = true
    dirtyRegions.Add(VulkanClipMaskDirtyRegion{
      Key: record.Key,
      Generation: record.Generation,
      Layer: record.Layer,
      X: record.PaddedX,
      Y: record.PaddedY,
      Width: record.PaddedWidth,
      Height: record.PaddedHeight,
    })
  }

  private func RemoveDirtyEntries(key uint64) {
    var index = dirtyRegions.Count - 1
    while index >= 0 {
      if dirtyRegions[index].Key == key {
        dirtyRegions.RemoveAt(index)
      }
      index--
    }
  }

  private func BuildRegion(record VulkanClipMaskRegionRecord) VulkanClipMaskRegion {
    let atlasWidth = float32(width)
    let atlasHeight = float32(height)
    let mapping = VulkanClipMaskMapping{
      ScaleX: 1.0F / atlasWidth,
      ScaleY: 1.0F / atlasHeight,
      OffsetX: float32(record.ContentX) / atlasWidth - float32(record.ScreenX) / atlasWidth,
      OffsetY: float32(record.ContentY) / atlasHeight - float32(record.ScreenY) / atlasHeight,
      Layer: record.Layer,
    }
    return VulkanClipMaskRegion{
      Key: record.Key,
      Generation: record.Generation,
      Layer: record.Layer,
      PaddedX: record.PaddedX,
      PaddedY: record.PaddedY,
      PaddedWidth: record.PaddedWidth,
      PaddedHeight: record.PaddedHeight,
      ContentX: record.ContentX,
      ContentY: record.ContentY,
      ContentWidth: record.ContentWidth,
      ContentHeight: record.ContentHeight,
      ScreenX: record.ScreenX,
      ScreenY: record.ScreenY,
      ScreenWidth: record.ScreenWidth,
      ScreenHeight: record.ScreenHeight,
      Dirty: record.Dirty,
      Mapping: mapping,
    }
  }

  private func SelectFormat(support VulkanClipMaskFormatSupport) VulkanClipMaskFormat {
    if support.R8UnormSampledImage && support.R8UnormColorAttachment
      && support.R8UnormLinearFilter{
        return VulkanClipMaskFormat.R8Unorm
      }
    if support.Rgba8UnormSampledImage && support.Rgba8UnormColorAttachment
      && support.Rgba8UnormLinearFilter{
        return VulkanClipMaskFormat.Rgba8Unorm
      }
    throw InvalidOperationException("Vulkan clip mask atlas has no sampled color-attachment format")
  }

  private func MaximumLayers(nativeWidth uint32, nativeHeight uint32,
    nativeBytesPerPixel uint32, maximumBytes VkDeviceSize) uint32{
      let layerBytes = uint64(nativeWidth) * uint64(nativeHeight) * uint64(nativeBytesPerPixel)
      if layerBytes == 0uL {
        throw OverflowException("Vulkan clip mask layer byte size overflow")
      }
      let count = maximumBytes / layerBytes
      if count == 0uL {
        throw InvalidOperationException("Vulkan clip mask atlas byte budget cannot hold one layer")
      }
      return if count < uint64(VulkanClipMaskAtlasContract.MaxDepth) {
        uint32(count)
      } else {
        VulkanClipMaskAtlasContract.MaxDepth
      }
    }

  private func NextGeneration(value uint64) uint64 {
    if value == uint64.MaxValue {
      throw OverflowException("Vulkan clip mask atlas generation overflow")
    }
    return value + 1uL
  }

  private func IncrementEvictionCount() {
    if evictionCount == uint64.MaxValue {
      throw OverflowException("Vulkan clip mask atlas eviction count overflow")
    }
    evictionCount = evictionCount + 1uL
  }

  private func IncrementPressureEventCount() {
    if pressureEventCount == uint64.MaxValue {
      throw OverflowException("Vulkan clip mask atlas pressure event count overflow")
    }
    pressureEventCount = pressureEventCount + 1uL
  }

  private func IncrementPressureFailureCount() {
    if pressureFailureCount == uint64.MaxValue {
      throw OverflowException("Vulkan clip mask atlas pressure failure count overflow")
    }
    pressureFailureCount = pressureFailureCount + 1uL
  }
}
