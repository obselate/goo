package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices

internal data struct VulkanPrimitiveRecordResult {
  var drawCallCount uint64
  var pipelineChangeCount uint64
  var descriptorChangeCount uint64
}

internal unsafe partial class VulkanPrimitiveRenderer : IDisposable {
  private const DefaultClipDepth int32 = 64
  private const PathPushConstantSize uint32 = 80u
  private const TextPushConstantSize uint32 = 32u
  private const MaxLayerDepth int32 = 32

  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let targetFormat VkFormat
  private let imageResources VulkanImageResources?
  private var pathAtlas VulkanPathAtlas
  private let textAtlases VulkanTextAtlasSet?
  private let clipMaskAtlas VulkanClipMaskAtlas?
  private let clipMaskFrameData VulkanClipMaskFrameData?
  private let primitiveState VulkanSharedPrimitiveState
  private let primitivePipelines VulkanSharedPrimitiveFormatState
  private let primitiveFrameData VulkanPrimitiveFrameData
  private let textFrameData VulkanTextFrameData
  private let primitiveFrameSlotCount int32
  private var primitiveFrameSlot int32
  private var textFrameScaleX float32
  private var textFrameScaleY float32
  private let resourceGeneration uint64
  private let maxStorageBufferRange VkDeviceSize
  private let objectAccounting VulkanObjectAccounting?
  private let clipStack []PrimitiveClip
  private let layerStates []VulkanLayerRenderState
  private let layerClipSnapshots []PrimitiveClip
  private let linearChannels []float32
  private var pipelineLayout VkPipelineLayout
  private var blendPipelineLayout VkPipelineLayout
  private var pathPipelineLayout VkPipelineLayout
  private var textPipelineLayout VkPipelineLayout
  private var clipMaskPipelineLayout VkPipelineLayout
  private var activePipeline VkPipeline
  private var boundDescriptorLayout VkPipelineLayout
  private var clipDescriptorLayout VkPipelineLayout
  private var clipDescriptorBound bool
  private var clipDescriptorSlot int32
  private var sampledDescriptorBound bool
  private var sampledImageId ResourceId
  private var sampledSamplerId ResourceId
  private var sampledSamplerMode VulkanImageSamplerMode
  private var sampledGeneration uint64
  private var pathDescriptorBound bool
  private var pathAtlasId ResourceId
  private var textDescriptorBound bool
  private var textAtlasId ResourceId
  private var textInstanceDescriptorBound bool
  private var textInstanceDescriptorLayout VkPipelineLayout
  private var textInstanceDescriptorSlot int32 = -1
  private var clipDepth int32
  private var activeExtent VkExtent2D
  private var rootCommandBuffer VkCommandBuffer
  private var rootImage VkImage
  private var rootImageView VkImageView
  private var rootExtent VkExtent2D
  private var rootLayout VkImageLayout
  private var layerPool VulkanOffscreenLayerPool?
  private var currentTarget VulkanOffscreenLayerTarget?
  private var currentOriginX float32
  private var currentOriginY float32
  private var layerDepth int32
  private var completedLayerSerial uint64
  private var timestampState VulkanDiagnosticTimestampState? = nil
  private var timestampSlot int32 = -1
  private var timestampContext VulkanDiagnosticTimestampContext
  private var currentDrawOrdinal uint32
  private var primitiveRecordOrdinal uint32
  private var primitiveRecordCount int32
  private var primitiveRecordPlan []uint32
  private var primitivePrepass bool
  private var primitivePrepared bool
  private let lavaStartSeconds float64
  private var lavaFrameSeconds float64
  private var primitiveDescriptorBound bool
  private var primitiveDescriptorLayout VkPipelineLayout
  private var primitiveDescriptorSlot int32 = -1
  private var preparedClipFrame SceneFrame?
  private var preparedClipExtent VkExtent2D
  private var preparedClipSlot int32 = -1
  private var preparedClipMaskCount int32
  private var clipRegions []VulkanClipMaskRegion
  private let clipContentKeys Dictionary[uint64, uint64]
  private var recordPipelineChangeCount uint64
  private var recordDescriptorChangeCount uint64
  private var disposed bool

  internal prop ClipCapacity int32{ get -> clipStack.Length }
  internal prop LiveObjectCount uint32{
    get {
      var count uint64 = primitiveFrameData.LiveObjectCount
      count = count + textFrameData.LiveObjectCount
      if let data = clipMaskFrameData {
        count = count + data.LiveObjectCount
      }
      return uint32(count)
    }
  }

  internal prop PrimitiveFrameStats VulkanPrimitiveFrameStats{
    get -> primitiveFrameData.LastStats
  }
  internal prop TextFrameStats VulkanTextFrameStats{
    get -> textFrameData.LastStats
  }

  internal func SetPathAtlas(value VulkanPathAtlas) {
    if value == nil {
      throw ArgumentNullException("value")
    }
    if Object.ReferenceEquals(pathAtlas, value) {
      return
    }
    pathAtlas = value
    pathDescriptorBound = false
    pathAtlasId = ResourceId{}
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    colorFormat VkFormat,
    maxClipDepth int32,
    nativeImageResources VulkanImageResources?,
    expectedGeneration uint64,
    nativeMaxStorageBufferRange VkDeviceSize,
    nativePrimitiveState VulkanSharedPrimitiveState?,
    nativePrimitiveFrameSlotCount int32,
    nativePathAtlas VulkanPathAtlas,
    nativeTextAtlases VulkanTextAtlasSet?,
    nativeObjectAccounting VulkanObjectAccounting?,
    nativeAllocator VulkanMemoryAllocator?,
    nativeClipMaskAtlas VulkanClipMaskAtlas?) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if colorFormat != VkConstants.VK_FORMAT_R8G8B8A8_SRGB
        && colorFormat != VkConstants.VK_FORMAT_B8G8R8A8_SRGB{
          throw ArgumentException("Vulkan primitive renderer requires an sRGB RGBA target", "colorFormat")
        }
      if maxClipDepth <= 0 || maxClipDepth > Int32.MaxValue {
        throw ArgumentOutOfRangeException("maxClipDepth")
      }
      if nativeMaxStorageBufferRange == 0uL {
        throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
      }
      guard let sharedState = nativePrimitiveState else {
        throw ArgumentNullException("nativePrimitiveState")
      }
      if nativePrimitiveFrameSlotCount < 1 || nativePrimitiveFrameSlotCount > 2 {
        throw ArgumentOutOfRangeException("nativePrimitiveFrameSlotCount")
      }
      guard let sharedImages = nativeImageResources else {
        throw ArgumentNullException("nativeImageResources")
      }
      if nativePathAtlas == nil {
        throw ArgumentNullException("nativePathAtlas")
      }
      if (nativeAllocator == nil) != (nativeClipMaskAtlas == nil) {
        throw ArgumentException("Vulkan clip mask allocator and atlas must be supplied together")
      }
      guard let suppliedAllocator = nativeAllocator else {
        throw ArgumentNullException("nativeAllocator")
      }
      let suppliedPathAtlas = nativePathAtlas
      if expectedGeneration == 0uL
        || sharedImages.Generation != expectedGeneration
        || sharedState.Generation != expectedGeneration{
          throw ArgumentOutOfRangeException("expectedGeneration")
        }
      if let suppliedAtlases = nativeTextAtlases {
        if suppliedAtlases.Generation != expectedGeneration {
          throw ArgumentOutOfRangeException("expectedGeneration")
        }
      }
      if let suppliedClipAtlas = nativeClipMaskAtlas {
        if suppliedClipAtlas.Generation == 0uL {
          throw ArgumentOutOfRangeException("nativeClipMaskAtlas")
        }
      }
      let pipelines = sharedState.PipelinesFor(colorFormat)
      this.device = nativeDevice
      this.dispatch = nativeDispatch
      this.targetFormat = colorFormat
      this.imageResources = sharedImages
      this.pathAtlas = suppliedPathAtlas
      this.textAtlases = nativeTextAtlases
      this.clipMaskAtlas = nativeClipMaskAtlas
      this.primitiveState = sharedState
      this.primitivePipelines = pipelines
      this.primitiveFrameData = VulkanPrimitiveFrameData(device, dispatch, suppliedAllocator,
        sharedState.PrimitiveDescriptorSetLayout, sharedState.EffectDataDescriptorSetLayout,
        nativeMaxStorageBufferRange, nativePrimitiveFrameSlotCount, nativeObjectAccounting)
      this.textFrameData = VulkanTextFrameData(device, dispatch, suppliedAllocator,
        sharedState.PrimitiveDescriptorSetLayout, nativeMaxStorageBufferRange,
        nativePrimitiveFrameSlotCount, nativeObjectAccounting)
      primitiveFrameSlotCount = nativePrimitiveFrameSlotCount
      primitiveFrameSlot = 0
      textFrameScaleX = 1.0F
      textFrameScaleY = 1.0F
      this.resourceGeneration = expectedGeneration
      maxStorageBufferRange = nativeMaxStorageBufferRange
      objectAccounting = nativeObjectAccounting
      pipelineLayout = pipelines.PipelineLayout
      blendPipelineLayout = pipelines.BlendPipelineLayout
      pathPipelineLayout = pipelines.PathPipelineLayout
      textPipelineLayout = pipelines.TextPipelineLayout
      clipMaskPipelineLayout = sharedState.ClipMaskPipelineLayout
      if let suppliedAllocator = nativeAllocator, let suppliedClipAtlas = nativeClipMaskAtlas {
        clipMaskFrameData = VulkanClipMaskFrameData(device, dispatch, suppliedAllocator,
          suppliedClipAtlas, sharedState.ClipDescriptorSetLayout,
          maxStorageBufferRange, nativeObjectAccounting)
      } else {
        clipMaskFrameData = nil
      }
      this.clipStack = [maxClipDepth]PrimitiveClip
      this.layerStates = [MaxLayerDepth]VulkanLayerRenderState
      this.layerClipSnapshots = [MaxLayerDepth * maxClipDepth]PrimitiveClip
      this.linearChannels = [256]float32
      this.primitiveRecordPlan = [1]uint32
      this.clipRegions = [64]VulkanClipMaskRegion
      this.clipContentKeys = Dictionary[uint64, uint64]()
      lavaStartSeconds = float64(Stopwatch.GetTimestamp()) / float64(Stopwatch.Frequency)
      lavaFrameSeconds = 0.0
      BuildLinearChannelTable()
    }

  internal func SetLayerPool(value VulkanOffscreenLayerPool?) {
    if disposed {
      throw ObjectDisposedException("VulkanPrimitiveRenderer")
    }
    layerPool = value
  }

  internal func SetPrimitiveFrameSlot(value int32) {
    if value < 0 || value >= primitiveFrameSlotCount {
      throw ArgumentOutOfRangeException("value")
    }
    primitiveFrameSlot = value
  }

  internal func ConfigureLayerFrame(
    commandBuffer VkCommandBuffer,
    image VkImage,
    imageView VkImageView,
    extent VkExtent2D,
    completedSubmissionSerial uint64) {
      if disposed {
        throw ObjectDisposedException("VulkanPrimitiveRenderer")
      }
      if commandBuffer == nint(0) || image == 0uL || imageView == 0uL {
        throw ArgumentException("Vulkan layer frame target is invalid")
      }
      if extent.width == 0u || extent.height == 0u {
        throw ArgumentOutOfRangeException("extent")
      }
      rootCommandBuffer = commandBuffer
      rootImage = image
      rootImageView = imageView
      rootExtent = extent

      completedLayerSerial = completedSubmissionSerial
      rootLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
    }
  internal func ConfigureTimestampRecording(
    state VulkanDiagnosticTimestampState?,
    slot int32,
    context VulkanDiagnosticTimestampContext) {
      timestampState = state
      timestampSlot = slot
      timestampContext = context
    }

  internal func ClearTimestampRecording() {
    timestampState = nil
    timestampSlot = -1
    timestampContext = VulkanDiagnosticTimestampContext{}
  }

  private func BeginLayerTimestamp(stage VulkanDiagnosticTimestampStage,
    pipelineStage VkPipelineStageFlags2) int32{
      if primitivePrepass {
        return -1
      }
      guard let state = timestampState else {
        return -1
      }
      return state.BeginTimestampScope(
        rootCommandBuffer, timestampSlot, stage, pipelineStage, timestampContext)
    }

  private func EndLayerTimestamp(handle int32,
    pipelineStage VkPipelineStageFlags2) {
      if primitivePrepass || handle < 0 {
        return
      }
      if let state = timestampState {
        state.EndTimestampScope(
          rootCommandBuffer, handle, pipelineStage, timestampContext)
      }
    }

  internal func ReserveImageReferences(frame SceneFrame) {
    if disposed {
      throw ObjectDisposedException("VulkanPrimitiveRenderer")
    }
    if frame == nil {
      throw ArgumentNullException("frame")
    }
    guard let resources = imageResources else {
      return
    }
    var index int32 = 0
    try {
      while index < frame.CachedImageCount {
        let image = frame.CachedImages[index]
        if image.ImageId.IsValid {
          resources.ReserveRecording(image.ImageId, resourceGeneration)
        }
        index++
      }
    } catch (error Exception) {
      var rollbackIndex int32 = 0
      while rollbackIndex < index {
        let image = frame.CachedImages[rollbackIndex]
        if image.ImageId.IsValid {
          try { resources.ReleaseRecording(image.ImageId, resourceGeneration) } catch (cleanup Exception) { }
        }
        rollbackIndex++
      }
      throw error
    }
  }

  internal func ReleaseImageReferences(frame SceneFrame) {
    if frame == nil {
      return
    }
    guard let resources = imageResources else {
      return
    }
    var index int32 = 0
    while index < frame.CachedImageCount {
      let image = frame.CachedImages[index]
      if image.ImageId.IsValid {
        try { resources.ReleaseRecording(image.ImageId, resourceGeneration) } catch (cleanup Exception) { }
      }
      index++
    }
  }

  internal func PreparePrimitiveFrame(frame SceneFrame, extent VkExtent2D,
    scaleX float32, scaleY float32, completedSubmissionSerial uint64) VulkanPrimitiveFrameStats{
      if disposed {
        throw ObjectDisposedException("VulkanPrimitiveRenderer")
      }
      if frame == nil {
        throw ArgumentNullException("frame")
      }
      if extent.width == 0u || extent.height == 0u {
        throw ArgumentOutOfRangeException("extent")
      }
      if Single.IsNaN(scaleX) || Single.IsInfinity(scaleX) || scaleX <= 0.0F {
        throw ArgumentOutOfRangeException("scaleX")
      }
      if Single.IsNaN(scaleY) || Single.IsInfinity(scaleY) || scaleY <= 0.0F {
        throw ArgumentOutOfRangeException("scaleY")
      }
      EnsurePrimitivePlanCapacity(frame.DrawRefCount)
      let maximumRecordCount = ComputeMaximumAnalyticRecordCount(frame)
      lavaFrameSeconds = float64(Stopwatch.GetTimestamp()) / float64(Stopwatch.Frequency)
      -lavaStartSeconds
      primitivePrepass = true
      primitivePrepared = false
      primitiveRecordCount = 0
      primitiveRecordOrdinal = 0u
      currentDrawOrdinal = 0u
      clipDepth = 0
      layerDepth = 0
      currentTarget = nil
      currentOriginX = 0.0F
      currentOriginY = 0.0F
      activeExtent = extent
      try {
        textFrameData.Prepare(frame, primitiveFrameSlot, completedSubmissionSerial)
        primitiveFrameData.BeginPrepare(primitiveFrameSlot, maximumRecordCount,
          frame.ShaderEffectDataByteCount, frame.ShaderEffectDataVersion,
          completedSubmissionSerial)
        primitiveFrameData.WriteEffectData(frame.ShaderEffectDataBytes,
          frame.ShaderEffectDataByteCount)
        var drawIndex int32 = 0
        while drawIndex < frame.DrawRefCount {
          currentDrawOrdinal = uint32(drawIndex)
          primitiveRecordPlan[drawIndex] = uint32(primitiveRecordCount)
          let reference = frame.DrawRefs[drawIndex]
          switch reference.Kind {
            case SceneDrawKind.SolidBox {
              RequireRecordIndex(reference.Index, frame.SolidBoxCount, "solid box index")
              let value = frame.SolidBoxes[reference.Index]
              EmitSolid(nint(0), activeExtent, value.Bounds, 0.0F, 0.0F, 0.0F, 0.0F,
                0.0F, 0.0F, value.Color, value.Opacity, value.TransformIndex, frame)
            }
            case SceneDrawKind.RoundedBox {
              RequireRecordIndex(reference.Index, frame.RoundedBoxCount, "rounded box index")
              let value = frame.RoundedBoxes[reference.Index]
              EmitSolid(nint(0), activeExtent, value.Bounds, value.RadiusTopLeft,
                value.RadiusTopRight, value.RadiusBottomRight, value.RadiusBottomLeft,
                value.OpaqueBorderWidth, value.OpaqueBorderHeight, value.Color, value.Opacity,
                value.TransformIndex, frame)
            }
            case SceneDrawKind.PerEdgeBorder {
              RequireRecordIndex(reference.Index, frame.PerEdgeBorderCount, "border index")
              EmitBorder(nint(0), activeExtent, frame.PerEdgeBorders[reference.Index], frame)
            }
            case SceneDrawKind.LinearGradient {
              RequireRecordIndex(reference.Index, frame.LinearGradientCount, "linear gradient index")
              EmitLinear(nint(0), activeExtent, frame.LinearGradients[reference.Index], frame)
            }
            case SceneDrawKind.RadialGradient {
              RequireRecordIndex(reference.Index, frame.RadialGradientCount, "radial gradient index")
              EmitRadial(nint(0), activeExtent, frame.RadialGradients[reference.Index], frame)
            }
            case SceneDrawKind.RectClipBegin {
              RequireRecordIndex(reference.Index, frame.RectClipCount, "clip index")
              PushClip(nint(0), ResolveRectClip(frame, frame.RectClips[reference.Index], activeExtent))
            }
            case SceneDrawKind.RectClipEnd {
              RequireRecordIndex(reference.Index, frame.RectClipCount, "clip index")
              ValidateRectClip(frame, frame.RectClips[reference.Index], activeExtent)
              PopClip(nint(0))
            }
            case SceneDrawKind.Underline {
              RequireRecordIndex(reference.Index, frame.UnderlineCount, "underline index")
              let value = frame.Underlines[reference.Index]
              ValidateRadius(value.Thickness)
              EmitSolid(nint(0), activeExtent, value.Bounds, 0.0F, 0.0F, 0.0F, 0.0F,
                0.0F, 0.0F, value.Color, 1.0F, value.TransformIndex, frame)
            }
            case SceneDrawKind.LayerBegin {
              RequireRecordIndex(reference.Index, frame.LayerCount, "layer index")
              BeginLayer(nint(0), frame.Layers[reference.Index])
            }
            case SceneDrawKind.LayerEnd {
              RequireRecordIndex(reference.Index, frame.LayerCount, "layer index")
              EndLayer(nint(0), frame.Layers[reference.Index], frame)
            }
            case SceneDrawKind.Transform {
              RequireRecordIndex(reference.Index, frame.TransformCount, "transform index")
              ResolveTransform(frame, reference.Index)
            }
            case SceneDrawKind.CachedImage {
              RequireRecordIndex(reference.Index, frame.CachedImageCount, "cached image index")
              EmitImage(nint(0), activeExtent, frame.CachedImages[reference.Index], frame)
            }
            case SceneDrawKind.CachedTextSegment {
              RequireRecordIndex(reference.Index, frame.CachedTextSegmentCount, "cached text segment index")
              let value = frame.CachedTextSegments[reference.Index]
              EmitTextSegment(nint(0), activeExtent, value, reference.ClipChainId, frame)
            }
            case SceneDrawKind.AnalyticPathBand {
              RequireRecordIndex(reference.Index, frame.AnalyticPathBandCount, "analytic path band index")
            }
            case SceneDrawKind.Shadow {
              RequireRecordIndex(reference.Index, frame.ShadowCount, "shadow index")
              EmitShadow(nint(0), activeExtent, frame.Shadows[reference.Index], frame)
            }
            case SceneDrawKind.Lava {
              RequireRecordIndex(reference.Index, frame.LavaCount, "lava index")
              EmitLava(nint(0), activeExtent, frame.Lavas[reference.Index], frame)
            }
            case SceneDrawKind.CustomMesh {
              throw NotSupportedException("Vulkan primitive renderer does not support custom meshes")
            }
            default {
              throw NotSupportedException("Vulkan primitive renderer received an unknown draw kind")
            }
          }
          drawIndex = drawIndex + 1
        }
        if clipDepth != 0 || layerDepth != 0 || currentTarget != nil {
          throw InvalidOperationException("Vulkan primitive prepass stack is not balanced")
        }
        primitiveFrameData.FinishPrepare()
        textFrameScaleX = scaleX
        textFrameScaleY = scaleY
        primitivePrepared = true
        return primitiveFrameData.LastStats
      } catch (error Exception) {
        try { primitiveFrameData.Abort(primitiveFrameSlot) } catch (cleanup Exception) { }
        try { textFrameData.Abort(primitiveFrameSlot) } catch (cleanup Exception) { }
        textFrameScaleX = 1.0F
        textFrameScaleY = 1.0F
        primitivePrepared = false
        throw error
      } finally {
        primitivePrepass = false
      }
    }

  internal func RecordPrimitiveFrameUpload(commandBuffer VkCommandBuffer) {
    if !primitivePrepared {
      throw InvalidOperationException("Vulkan primitive frame data was not prepared")
    }
    primitiveFrameData.RecordUpload(commandBuffer)
    textFrameData.RecordUpload(commandBuffer)
  }

  internal func FlushPrimitiveFrameBeforeSubmit() VkResult {
    let primitiveResult = primitiveFrameData.FlushBeforeSubmit()
    let textResult = textFrameData.FlushBeforeSubmit()
    if primitiveResult != VkConstants.VK_SUCCESS {
      return primitiveResult
    }
    return textResult
  }

  internal func ValidatePrimitiveFrameSubmission(submissionSerial uint64) {
    primitiveFrameData.ValidateSubmission(primitiveFrameSlot, submissionSerial)
    textFrameData.ValidateSubmission(primitiveFrameSlot, submissionSerial)
  }

  internal func MarkPrimitiveFrameSubmitted(submissionSerial uint64) {
    primitiveFrameData.MarkSubmitted(primitiveFrameSlot, submissionSerial)
    textFrameData.MarkSubmitted(primitiveFrameSlot, submissionSerial)
    primitivePrepared = false
    textFrameScaleX = 1.0F
    textFrameScaleY = 1.0F
  }

  internal func ReconcilePrimitiveFrameSubmitted(submissionSerial uint64) {
    primitiveFrameData.ReconcileSubmitted(primitiveFrameSlot, submissionSerial)
    textFrameData.ReconcileSubmitted(primitiveFrameSlot, submissionSerial)
    primitivePrepared = false
    textFrameScaleX = 1.0F
    textFrameScaleY = 1.0F
  }

  internal func AbortPrimitiveFrame() {
    try {
      try {
        primitiveFrameData.Abort(primitiveFrameSlot)
      } finally {
        textFrameData.Abort(primitiveFrameSlot)
      }
    } finally {
      primitivePrepared = false
      textFrameScaleX = 1.0F
      textFrameScaleY = 1.0F
    }
  }

  internal func CollectPrimitiveFrame(completedSubmissionSerial uint64) {
    primitiveFrameData.Collect(completedSubmissionSerial)
    textFrameData.Collect(completedSubmissionSerial)
  }

  internal func RecordInsideRendering(
    commandBuffer VkCommandBuffer,
    frame SceneFrame,
    extent VkExtent2D) VulkanPrimitiveRecordResult -> RecordInsideRendering(commandBuffer, frame, extent,
      VulkanDamageRegion{
        X: 0,
        Y: 0,
        Width: int32(extent.width),
        Height: int32(extent.height),
      }, false)

  internal func RecordInsideRendering(
    commandBuffer VkCommandBuffer,
    frame SceneFrame,
    extent VkExtent2D,
    damage VulkanDamageRegion,
    partial bool) VulkanPrimitiveRecordResult{
      if disposed {
        throw ObjectDisposedException("VulkanPrimitiveRenderer")
      }
      if commandBuffer == nint(0) {
        throw ArgumentException("Command buffer is null", "commandBuffer")
      }
      if extent.width == 0u || extent.height == 0u {
        throw ArgumentOutOfRangeException("extent")
      }
      if uint64(extent.width) > uint64(Int32.MaxValue)
        || uint64(extent.height) > uint64(Int32.MaxValue) {
          throw ArgumentOutOfRangeException("extent")
        }
      if frame == nil {
        throw ArgumentNullException("frame")
      }
      if frame.ActiveChunk >= 0 {
        throw InvalidOperationException("Vulkan primitive renderer requires a closed scene frame")
      }
      if !primitivePrepared || primitiveFrameData.PreparedSlot != primitiveFrameSlot
        || textFrameData.PreparedSlot != primitiveFrameSlot{
          throw InvalidOperationException("Vulkan primitive and text frame data must be prepared before scene recording")
        }
      if rootCommandBuffer != commandBuffer || rootImage == 0uL || rootImageView == 0uL {
        throw InvalidOperationException("Vulkan layer frame target was not configured")
      }
      if rootExtent.width != extent.width || rootExtent.height != extent.height {
        throw InvalidOperationException("Vulkan layer frame extent changed after configuration")
      }
      if damage.IsEmpty || damage.X < 0 || damage.Y < 0
        || damage.Right > int32(extent.width)
        || damage.Bottom > int32(extent.height) {
          throw ArgumentOutOfRangeException("damage")
        }

      clipDepth = 0
      layerDepth = 0
      currentTarget = nil
      currentOriginX = 0.0F
      currentOriginY = 0.0F
      activePipeline = 0uL
      boundDescriptorLayout = 0uL
      clipDescriptorLayout = 0uL
      clipDescriptorBound = false
      clipDescriptorSlot = -1
      currentDrawOrdinal = 0u
      primitiveRecordOrdinal = 0u
      sampledDescriptorBound = false
      sampledImageId = ResourceId{}
      sampledSamplerId = ResourceId{}
      sampledSamplerMode = VulkanImageSamplerMode.Nearest
      sampledGeneration = 0uL
      pathDescriptorBound = false
      pathAtlasId = ResourceId{}
      textDescriptorBound = false
      textAtlasId = ResourceId{}
      textInstanceDescriptorBound = false
      textInstanceDescriptorLayout = 0uL
      textInstanceDescriptorSlot = -1
      recordPipelineChangeCount = 0uL
      recordDescriptorChangeCount = 0uL
      ResetPrimitiveBatching()
      guard let clipData = clipMaskFrameData else {
        throw NotSupportedException("Vulkan primitive renderer has no clip mask frame data")
      }
      if !Object.ReferenceEquals(preparedClipFrame, frame) {
        throw InvalidOperationException("Vulkan clip frame data must be prepared before scene recording")
      }
      if preparedClipSlot < 0 || clipData.PreparedSlot != preparedClipSlot {
        throw InvalidOperationException("Vulkan clip frame slot is not prepared")
      }
      var viewport = VkViewport{}
      viewport.x = 0.0F
      viewport.y = 0.0F
      viewport.width = float32(extent.width)
      viewport.height = float32(extent.height)
      viewport.minDepth = 0.0F
      viewport.maxDepth = 1.0F
      let setViewport = dispatch.vkCmdSetViewport
      setViewport(commandBuffer, 0u, 1u, &viewport)
      let baseClip = PrimitiveClip{
        Left: damage.X,
        Top: damage.Y,
        Right: damage.Right,
        Bottom: damage.Bottom,
      }
      activeExtent = extent
      SetScissor(commandBuffer, baseClip)

      var drawIndex int32 = 0
      var chunkIndex int32 = 0
      var validatedChunkIndex int32 = -1
      while drawIndex < frame.DrawRefCount {
        while chunkIndex < frame.ChunkCount
          && drawIndex >= frame.Chunks[chunkIndex].FirstDraw
        +frame.Chunks[chunkIndex].DrawCount{
          if validatedChunkIndex != chunkIndex {
            ValidateChunk(frame, frame.Chunks[chunkIndex])
            validatedChunkIndex = chunkIndex
          }
          chunkIndex = chunkIndex + 1
        }
        if chunkIndex >= frame.ChunkCount
          || drawIndex < frame.Chunks[chunkIndex].FirstDraw{
            throw InvalidOperationException("Vulkan scene draw reference is outside its chunk")
          }
        if validatedChunkIndex != chunkIndex {
          ValidateChunk(frame, frame.Chunks[chunkIndex])
          validatedChunkIndex = chunkIndex
        }
        let drawChunk = frame.Chunks[chunkIndex]
        let emitDraw = !partial || ChunkIntersectsDamage(drawChunk, damage)
        let reference = frame.DrawRefs[drawIndex]
        if emitDraw {
          currentDrawOrdinal = uint32(drawIndex)
          primitiveRecordOrdinal = primitiveRecordPlan[drawIndex]
        }
        if emitDraw {
          switch reference.Kind {
            case SceneDrawKind.SolidBox {
              RequireRecordIndex(reference.Index, frame.SolidBoxCount, "solid box index")
              let value = frame.SolidBoxes[reference.Index]
              EmitSolid(commandBuffer, activeExtent, value.Bounds, 0.0F, 0.0F, 0.0F, 0.0F,
                0.0F, 0.0F, value.Color, value.Opacity, value.TransformIndex, frame)
            }
            case SceneDrawKind.RoundedBox {
              RequireRecordIndex(reference.Index, frame.RoundedBoxCount, "rounded box index")
              let value = frame.RoundedBoxes[reference.Index]
              EmitSolid(commandBuffer, activeExtent, value.Bounds, value.RadiusTopLeft,
                value.RadiusTopRight, value.RadiusBottomRight, value.RadiusBottomLeft,
                value.OpaqueBorderWidth, value.OpaqueBorderHeight, value.Color, value.Opacity,
                value.TransformIndex, frame)
            }
            case SceneDrawKind.PerEdgeBorder {
              RequireRecordIndex(reference.Index, frame.PerEdgeBorderCount, "border index")
              let value = frame.PerEdgeBorders[reference.Index]
              EmitBorder(commandBuffer, activeExtent, value, frame)
            }
            case SceneDrawKind.LinearGradient {
              RequireRecordIndex(reference.Index, frame.LinearGradientCount, "linear gradient index")
              let value = frame.LinearGradients[reference.Index]
              EmitLinear(commandBuffer, activeExtent, value, frame)
            }
            case SceneDrawKind.RadialGradient {
              RequireRecordIndex(reference.Index, frame.RadialGradientCount, "radial gradient index")
              let value = frame.RadialGradients[reference.Index]
              EmitRadial(commandBuffer, activeExtent, value, frame)
            }
            case SceneDrawKind.RectClipBegin {
              RequireRecordIndex(reference.Index, frame.RectClipCount, "clip index")
              let clip = ResolveRectClip(frame, frame.RectClips[reference.Index], activeExtent)
              PushClip(commandBuffer, clip)
            }
            case SceneDrawKind.RectClipEnd {
              RequireRecordIndex(reference.Index, frame.RectClipCount, "clip index")
              ValidateRectClip(frame, frame.RectClips[reference.Index], activeExtent)
              PopClip(commandBuffer)
            }
            case SceneDrawKind.Underline {
              RequireRecordIndex(reference.Index, frame.UnderlineCount, "underline index")
              let value = frame.Underlines[reference.Index]
              ValidateRadius(value.Thickness)
              EmitSolid(commandBuffer, activeExtent, value.Bounds, 0.0F, 0.0F, 0.0F, 0.0F,
                0.0F, 0.0F, value.Color, 1.0F, value.TransformIndex, frame)
            }
            case SceneDrawKind.LayerBegin {
              RequireRecordIndex(reference.Index, frame.LayerCount, "layer index")
              BeginLayer(commandBuffer, frame.Layers[reference.Index])
            }
            case SceneDrawKind.LayerEnd {
              RequireRecordIndex(reference.Index, frame.LayerCount, "layer index")
              EndLayer(commandBuffer, frame.Layers[reference.Index], frame)
            }
            case SceneDrawKind.Transform {
              RequireRecordIndex(reference.Index, frame.TransformCount, "transform index")
              ResolveTransform(frame, reference.Index)
            }
            case SceneDrawKind.CachedImage {
              RequireRecordIndex(reference.Index, frame.CachedImageCount, "cached image index")
              let value = frame.CachedImages[reference.Index]
              EmitImage(commandBuffer, activeExtent, value, frame)
            }
            case SceneDrawKind.CachedTextSegment {
              RequireRecordIndex(reference.Index, frame.CachedTextSegmentCount, "cached text segment index")
              let value = frame.CachedTextSegments[reference.Index]
              EmitTextSegment(commandBuffer, activeExtent, value, reference.ClipChainId, frame)
            }
            case SceneDrawKind.AnalyticPathBand {
              RequireRecordIndex(reference.Index, frame.AnalyticPathBandCount, "analytic path band index")
              let value = frame.AnalyticPathBands[reference.Index]
              EmitPath(commandBuffer, activeExtent, value, frame)
            }
            case SceneDrawKind.Shadow {
              RequireRecordIndex(reference.Index, frame.ShadowCount, "shadow index")
              let value = frame.Shadows[reference.Index]
              EmitShadow(commandBuffer, activeExtent, value, frame)
            }
            case SceneDrawKind.Lava {
              RequireRecordIndex(reference.Index, frame.LavaCount, "lava index")
              EmitLava(commandBuffer, activeExtent, frame.Lavas[reference.Index], frame)
            }
            case SceneDrawKind.CustomMesh {
              throw NotSupportedException("Vulkan primitive renderer does not support custom meshes")
            }
            default {
              throw NotSupportedException("Vulkan primitive renderer received an unknown draw kind")
            }
          }
        }
        drawIndex = drawIndex + 1
      }

      while chunkIndex < frame.ChunkCount {
        ValidateChunk(frame, frame.Chunks[chunkIndex])
        chunkIndex = chunkIndex + 1
      }

      if clipDepth != 0 {
        throw InvalidOperationException("Vulkan primitive clip stack is not balanced")
      }
      if layerDepth != 0 || currentTarget != nil {
        throw InvalidOperationException("Vulkan layer stack is not balanced")
      }
      FlushPendingPrimitiveDraw(commandBuffer)
      return VulkanPrimitiveRecordResult{
        drawCallCount: recordDrawCallCount,
        pipelineChangeCount: recordPipelineChangeCount,
        descriptorChangeCount: recordDescriptorChangeCount,
      }
    }

  private func ChunkIntersectsDamage(chunk SceneChunk, damage VulkanDamageRegion) bool {
    if chunk.Bounds.IsEmpty {
      return false
    }
    return chunk.Bounds.Right > float32(damage.X)
      && chunk.Bounds.X < float32(damage.Right)
      && chunk.Bounds.Bottom > float32(damage.Y)
      && chunk.Bounds.Y < float32(damage.Bottom)
  }

  private func EnsurePrimitivePlanCapacity(required int32) {
    if required < 0 || required > Int32.MaxValue - 1 {
      throw ArgumentOutOfRangeException("draw count")
    }
    let needed = required + 1
    if needed <= primitiveRecordPlan.Length {
      return
    }
    var next = if primitiveRecordPlan.Length == 0 { 8 } else { primitiveRecordPlan.Length }
    while next < needed {
      if next > Int32.MaxValue / 2 {
        next = needed
        break
      }
      next = next * 2
    }
    let replacement = [next]uint32
    var index int32 = 0
    while index < primitiveRecordPlan.Length {
      replacement[index] = primitiveRecordPlan[index]
      index++
    }
    primitiveRecordPlan = replacement
  }
  private func ComputeMaximumAnalyticRecordCount(frame SceneFrame) uint64 {
    if frame.DrawRefCount < 0 || frame.DrawRefCount > Int32.MaxValue {
      throw ArgumentOutOfRangeException("draw count")
    }
    var total uint64 = 0uL
    var index int32 = 0
    while index < frame.DrawRefCount {
      let kind = frame.DrawRefs[index].Kind
      var count uint64 = 0uL
      switch kind {
        case SceneDrawKind.SolidBox { count = 1uL }
        case SceneDrawKind.RoundedBox { count = 1uL }
        case SceneDrawKind.PerEdgeBorder { count = 4uL }
        case SceneDrawKind.LinearGradient {
          RequireRecordIndex(frame.DrawRefs[index].Index, frame.LinearGradientCount, "linear gradient index")
          let value = frame.LinearGradients[frame.DrawRefs[index].Index]
          ValidateGradientStops(frame, value.StopStart, value.StopCount)
          count = GradientRecordCount(value.StopCount)
        }
        case SceneDrawKind.RadialGradient {
          RequireRecordIndex(frame.DrawRefs[index].Index, frame.RadialGradientCount, "radial gradient index")
          let value = frame.RadialGradients[frame.DrawRefs[index].Index]
          ValidateGradientStops(frame, value.StopStart, value.StopCount)
          count = GradientRecordCount(value.StopCount)
        }
        case SceneDrawKind.Underline { count = 1uL }
        case SceneDrawKind.LayerEnd { count = 1uL }
        case SceneDrawKind.CachedImage { count = 1uL }
        case SceneDrawKind.Shadow { count = 1uL }
        case SceneDrawKind.Lava { count = 1uL }
        default { count = 0uL }
      }
      if count > 0uL {
        if total > uint64(Int32.MaxValue) - count {
          throw ArgumentOutOfRangeException("draw count")
        }
        total = total + count
      }
      index = index + 1
    }
    if total == 0uL {
      return 1uL
    }
    return total
  }

  private func ValidateBorrowedBackdrop(
    record LayerRecord) VulkanOffscreenLayerTarget? {
      if (record.Flags & uint32(LayerRecordFlags.BorrowsParentBackdrop)) == 0u {
        return nil
      }
      if record.EffectIndex < 0
        || (record.Flags & uint32(LayerRecordFlags.SamplesBackdrop)) == 0u {
          throw InvalidOperationException(
            "Vulkan borrowed backdrop requires a sampling effect")
        }
      if layerDepth <= 0 {
        throw InvalidOperationException(
          "Vulkan borrowed backdrop has no outer layer")
      }
      let outer = layerStates[layerDepth - 1]
      let outerHasBackdrop = outer.Record.BlendMode != 0u
        || (outer.Record.Flags & uint32(LayerRecordFlags.SamplesBackdrop)) != 0u
      if !outerHasBackdrop {
        throw InvalidOperationException(
          "Vulkan borrowed backdrop outer layer has no backdrop")
      }
      if outer.Record.OriginX != record.OriginX
        || outer.Record.OriginY != record.OriginY
        || outer.Record.ExtentWidth != record.ExtentWidth
        || outer.Record.ExtentHeight != record.ExtentHeight{
          throw InvalidOperationException(
            "Vulkan borrowed backdrop geometry does not match outer layer")
        }
      if primitivePrepass {
        return nil
      }
      guard let backdrop = outer.BackdropTarget else {
        throw InvalidOperationException(
          "Vulkan borrowed backdrop target is unavailable")
      }
      return backdrop
    }

  private func BeginLayer(
    commandBuffer VkCommandBuffer,
    record LayerRecord) {
      let borrowedBackdrop = ValidateBorrowedBackdrop(record)
      if !primitivePrepass {
        FlushPendingPrimitiveDraw(commandBuffer)
      }
      if primitivePrepass {
        if layerDepth >= layerStates.Length {
          throw InvalidOperationException("Vulkan layer depth exceeded")
        }
        if record.ExtentWidth == 0u || record.ExtentHeight == 0u {
          throw ArgumentOutOfRangeException("layer extent")
        }
        let state = VulkanLayerRenderState{
          Record: record,
          Target: nil,
          BackdropTarget: nil,
          ParentTarget: currentTarget,
          ParentOriginX: currentOriginX,
          ParentOriginY: currentOriginY,
          ParentExtent: activeExtent,
          ParentClipDepth: clipDepth,
          ClipSnapshotOffset: layerDepth * clipStack.Length,
          TimestampHandle: -1,
        }
        var snapshotIndex int32 = 0
        while snapshotIndex < clipDepth {
          layerClipSnapshots[state.ClipSnapshotOffset + snapshotIndex] = clipStack[snapshotIndex]
          snapshotIndex++
        }
        layerStates[layerDepth] = state
        layerDepth = layerDepth + 1
        currentTarget = nil
        currentOriginX = record.OriginX
        currentOriginY = record.OriginY
        activeExtent = VkExtent2D{ width: record.ExtentWidth, height: record.ExtentHeight }
        var clipIndex int32 = 0
        while clipIndex < clipDepth {
          clipStack[clipIndex] = TranslateClip(
            layerClipSnapshots[state.ClipSnapshotOffset + clipIndex],
            record.OriginX - state.ParentOriginX,
            record.OriginY - state.ParentOriginY,
            activeExtent)
          clipIndex++
        }
        return
      }
      guard let pool = layerPool else {
        throw NotSupportedException("Vulkan layer pool is unavailable")
      }
      if layerDepth >= layerStates.Length {
        throw InvalidOperationException("Vulkan layer depth exceeded")
      }
      if record.ExtentWidth == 0u || record.ExtentHeight == 0u {
        throw ArgumentOutOfRangeException("layer extent")
      }
      let borrowsParentBackdrop =
      (record.Flags & uint32(LayerRecordFlags.BorrowsParentBackdrop)) != 0u
      let target = pool.Acquire(record.ExtentWidth, record.ExtentHeight, completedLayerSerial)
      let needsBackdrop = record.BlendMode != 0u
        || (record.EffectIndex >= 0
            && (record.Flags & uint32(LayerRecordFlags.SamplesBackdrop)) != 0u)
      let backdropTarget = if borrowsParentBackdrop {
        borrowedBackdrop
      } else if needsBackdrop {
        pool.Acquire(record.ExtentWidth, record.ExtentHeight, completedLayerSerial)
      } else { nil }
      pool.RecordLayerPass(uint64(record.ExtentWidth), uint64(record.ExtentHeight))
      var state = VulkanLayerRenderState{
        Record: record,
        Target: target,
        BackdropTarget: backdropTarget,
        ParentTarget: currentTarget,
        ParentOriginX: currentOriginX,
        ParentOriginY: currentOriginY,
        ParentExtent: activeExtent,
        ParentClipDepth: clipDepth,
        ClipSnapshotOffset: layerDepth * clipStack.Length,
        TimestampHandle: -1,
      }
      var snapshotIndex int32 = 0
      while snapshotIndex < clipDepth {
        layerClipSnapshots[state.ClipSnapshotOffset + snapshotIndex] = clipStack[snapshotIndex]
        snapshotIndex = snapshotIndex + 1
      }
      let endRendering = dispatch.vkCmdEndRendering
      endRendering(commandBuffer)
      if needsBackdrop && !borrowsParentBackdrop {
        guard let capturedBackdrop = backdropTarget else {
          throw InvalidOperationException("Vulkan layer backdrop target is unavailable")
        }
        let effectHandle = BeginLayerTimestamp(
          VulkanDiagnosticTimestampStage.Effects,
          VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT)
        CopyBackdrop(commandBuffer, record, capturedBackdrop)
        EndLayerTimestamp(effectHandle, VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT)
      }
      target.TransitionToColorAttachment(commandBuffer)
      BeginLayerRendering(commandBuffer, target.Extent, target.ImageView, false)
      state.TimestampHandle = BeginLayerTimestamp(
        VulkanDiagnosticTimestampStage.Offscreen,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT)
      currentTarget = target
      currentOriginX = record.OriginX
      currentOriginY = record.OriginY
      activeExtent = target.Extent
      var clipIndex int32 = 0
      while clipIndex < clipDepth {
        clipStack[clipIndex] = TranslateClip(
          layerClipSnapshots[state.ClipSnapshotOffset + clipIndex],
          record.OriginX - state.ParentOriginX,
          record.OriginY - state.ParentOriginY,
          activeExtent)
        clipIndex = clipIndex + 1
      }
      layerStates[layerDepth] = state
      layerDepth = layerDepth + 1
      SetLayerViewport(commandBuffer)
      if clipDepth > 0 {
        SetScissor(commandBuffer, clipStack[clipDepth - 1])
      } else {
        SetScissor(commandBuffer, FullClip())
      }
    }

  private func EndLayer(
    commandBuffer VkCommandBuffer,
    record LayerRecord,
    frame SceneFrame) {
      if layerDepth <= 0 {
        throw InvalidOperationException("Vulkan layer stack underflow")
      }
      let state = layerStates[layerDepth - 1]
      if state.Record.OffscreenTargetId.Kind != record.OffscreenTargetId.Kind
        || state.Record.OffscreenTargetId.LogicalId != record.OffscreenTargetId.LogicalId
        || state.Record.OffscreenTargetId.Version != record.OffscreenTargetId.Version{
          throw InvalidOperationException("Vulkan layer record does not match layer stack")
        }
      if !primitivePrepass {
        FlushPendingPrimitiveDraw(commandBuffer)
      }
      if primitivePrepass {
        layerDepth = layerDepth - 1
        currentTarget = state.ParentTarget
        currentOriginX = state.ParentOriginX
        currentOriginY = state.ParentOriginY
        activeExtent = state.ParentExtent
        clipDepth = state.ParentClipDepth
        var clipIndex int32 = 0
        while clipIndex < clipDepth {
          clipStack[clipIndex] = layerClipSnapshots[state.ClipSnapshotOffset + clipIndex]
          clipIndex++
        }
        EmitLayer(commandBuffer, activeExtent, state.Record, nil, nil, frame)
        return
      }
      guard let target = state.Target else {
        throw InvalidOperationException("Vulkan layer target is unavailable")
      }
      let borrowedBackdrop =
      (state.Record.Flags & uint32(LayerRecordFlags.BorrowsParentBackdrop)) != 0u
      EndLayerTimestamp(
        state.TimestampHandle,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT)
      let endRendering = dispatch.vkCmdEndRendering
      endRendering(commandBuffer)
      target.TransitionToShaderRead(commandBuffer)
      if !borrowedBackdrop {
        if let backdrop = state.BackdropTarget {
          backdrop.TransitionToShaderRead(commandBuffer)
        }
      }
      layerDepth = layerDepth - 1
      currentTarget = state.ParentTarget
      currentOriginX = state.ParentOriginX
      currentOriginY = state.ParentOriginY
      activeExtent = state.ParentExtent
      clipDepth = state.ParentClipDepth
      var clipIndex int32 = 0
      while clipIndex < clipDepth {
        clipStack[clipIndex] = layerClipSnapshots[state.ClipSnapshotOffset + clipIndex]
        clipIndex = clipIndex + 1
      }
      let parentImageView = if let parent = state.ParentTarget {
        parent.ImageView
      } else {
        rootImageView
      }
      BeginLayerRendering(commandBuffer, activeExtent, parentImageView, true)
      SetLayerViewport(commandBuffer)
      if clipDepth > 0 {
        SetScissor(commandBuffer, clipStack[clipDepth - 1])
      } else {
        SetScissor(commandBuffer, FullClip())
      }
      if let pool = layerPool {
        pool.RecordLayerComposite(uint64(record.ExtentWidth), uint64(record.ExtentHeight))
      }
      let effectHandle = BeginLayerTimestamp(
        VulkanDiagnosticTimestampStage.Effects,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT)
      EmitLayer(commandBuffer, activeExtent, state.Record, target, state.BackdropTarget, frame)
      FlushPendingPrimitiveDraw(commandBuffer)
      EndLayerTimestamp(
        effectHandle,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT)
      if let pool = layerPool {
        pool.ReleaseForReuse(target)
        if !borrowedBackdrop {
          if let backdrop = state.BackdropTarget {
            pool.ReleaseForReuse(backdrop)
          }
        }
      }
    }

  private func BeginLayerRendering(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    imageView VkImageView,
    loadExisting bool) {
      var clear = VkClearValue{}
      clear.color.float32.values[0] = 0.0F
      clear.color.float32.values[1] = 0.0F
      clear.color.float32.values[2] = 0.0F
      clear.color.float32.values[3] = 0.0F
      var attachment = VkRenderingAttachmentInfo{}
      attachment.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO
      attachment.imageView = imageView
      attachment.imageLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
      attachment.resolveMode = VkConstants.VK_RESOLVE_MODE_NONE
      attachment.loadOp = if loadExisting {
        VkConstants.VK_ATTACHMENT_LOAD_OP_LOAD
      } else {
        VkConstants.VK_ATTACHMENT_LOAD_OP_CLEAR
      }
      attachment.storeOp = VkConstants.VK_ATTACHMENT_STORE_OP_STORE
      attachment.clearValue = clear
      var rendering = VkRenderingInfo{}
      rendering.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_INFO
      rendering.renderArea.offset = VkOffset2D{ x: 0, y: 0 }
      rendering.renderArea.extent = extent
      rendering.layerCount = 1u
      rendering.colorAttachmentCount = 1u
      rendering.pColorAttachments = &attachment
      let beginRendering = dispatch.vkCmdBeginRendering
      beginRendering(commandBuffer, &rendering)
    }

  private func CopyBackdrop(
    commandBuffer VkCommandBuffer,
    record LayerRecord,
    destination VulkanOffscreenLayerTarget) {
      let sourceImage = if let parent = currentTarget {
        parent.Image
      } else { rootImage }
      let sourceWidth = if let parent = currentTarget {
        int32(parent.Extent.width)
      } else { int32(rootExtent.width) }
      let sourceHeight = if let parent = currentTarget {
        int32(parent.Extent.height)
      } else { int32(rootExtent.height) }
      let sourceX = int32(MathF.Floor(record.OriginX - currentOriginX))
      let sourceY = int32(MathF.Floor(record.OriginY - currentOriginY))
      var copySourceX = sourceX
      var copySourceY = sourceY
      var copyDestinationX int32 = 0
      var copyDestinationY int32 = 0
      var copyWidth = int32(record.ExtentWidth)
      var copyHeight = int32(record.ExtentHeight)
      if copySourceX < 0 {
        copyDestinationX = -copySourceX
        copyWidth = copyWidth + copySourceX
        copySourceX = 0
      }
      if copySourceY < 0 {
        copyDestinationY = -copySourceY
        copyHeight = copyHeight + copySourceY
        copySourceY = 0
      }
      if copySourceX + copyWidth > sourceWidth {
        copyWidth = sourceWidth - copySourceX
      }
      if copySourceY + copyHeight > sourceHeight {
        copyHeight = sourceHeight - copySourceY
      }
      destination.TransitionToTransferDestination(commandBuffer)
      var clear = VkClearColorValue{}
      clear.float32.values[0] = 0.0F
      clear.float32.values[1] = 0.0F
      clear.float32.values[2] = 0.0F
      clear.float32.values[3] = 0.0F
      var subresourceRange = VkImageSubresourceRange{}
      subresourceRange.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
      subresourceRange.baseMipLevel = 0u
      subresourceRange.levelCount = 1u
      subresourceRange.baseArrayLayer = 0u
      subresourceRange.layerCount = 1u
      let clearImage = dispatch.vkCmdClearColorImage
      clearImage(commandBuffer, destination.Image,
        VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, &clear, 1u, &subresourceRange)
      if let parent = currentTarget {
        parent.TransitionToTransferSource(commandBuffer)
      } else {
        TransitionRootToTransferSource(commandBuffer)
      }
      if copyWidth > 0 && copyHeight > 0 {
        var region = VkImageCopy{}
        region.srcSubresource = VkImageSubresourceLayers{
          aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
          mipLevel: 0u,
          baseArrayLayer: 0u,
          layerCount: 1u,
        }
        region.srcOffset = VkOffset3D{ x: copySourceX, y: copySourceY, z: 0 }
        region.dstSubresource = region.srcSubresource
        region.dstOffset = VkOffset3D{ x: copyDestinationX, y: copyDestinationY, z: 0 }
        region.extent = VkExtent3D{
          width: uint32(copyWidth),
          height: uint32(copyHeight),
          depth: 1u,
        }
        let copyImage = dispatch.vkCmdCopyImage
        copyImage(commandBuffer, sourceImage,
          VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
          destination.Image, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
          1u, &region)
      }
      destination.TransitionToShaderRead(commandBuffer)
      if let parent = currentTarget {
        parent.TransitionToColorAttachment(commandBuffer)
      } else {
        TransitionRootToColorAttachment(commandBuffer)
      }
    }

  private func TransitionRootToTransferSource(commandBuffer VkCommandBuffer) {
    if rootLayout == VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL {
      return
    }
    VulkanTransitions.RecordImage(
      commandBuffer,
      dispatch.vkCmdPipelineBarrier2,
      rootImage,
      VulkanTransitions.ColorSubresourceRange(),
      rootLayout,
      VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
      VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
      VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
      VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT,
      VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT)
    rootLayout = VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL
  }

  private func TransitionRootToColorAttachment(commandBuffer VkCommandBuffer) {
    if rootLayout == VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL {
      return
    }
    VulkanTransitions.RecordImage(
      commandBuffer,
      dispatch.vkCmdPipelineBarrier2,
      rootImage,
      VulkanTransitions.ColorSubresourceRange(),
      rootLayout,
      VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
      VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT,
      VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT,
      VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
      VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT)
    rootLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
  }

  private func SetLayerViewport(commandBuffer VkCommandBuffer) {
    var viewport = VkViewport{}
    viewport.width = float32(activeExtent.width)
    viewport.height = float32(activeExtent.height)
    viewport.minDepth = 0.0F
    viewport.maxDepth = 1.0F
    let setViewport = dispatch.vkCmdSetViewport
    setViewport(commandBuffer, 0u, 1u, &viewport)
  }

  private func FullClip() PrimitiveClip -> PrimitiveClip {
    Left: 0,
    Top: 0,
    Right: int32(activeExtent.width),
    Bottom: int32(activeExtent.height),
  }

  private func TranslateClip(
    value PrimitiveClip,
    deltaX float32,
    deltaY float32,
    extent VkExtent2D) PrimitiveClip{
      var result = PrimitiveClip{
        Left: int32(MathF.Floor(float32(value.Left) - deltaX)),
        Top: int32(MathF.Floor(float32(value.Top) - deltaY)),
        Right: int32(MathF.Ceiling(float32(value.Right) - deltaX)),
        Bottom: int32(MathF.Ceiling(float32(value.Bottom) - deltaY)),
      }
      let width = int32(extent.width)
      let height = int32(extent.height)
      result.Left = result.Left < 0 ? 0 : result.Left > width ? width : result.Left
      result.Top = result.Top < 0 ? 0 : result.Top > height ? height : result.Top
      result.Right = result.Right < 0 ? 0 : result.Right > width ? width : result.Right
      result.Bottom = result.Bottom < 0 ? 0 : result.Bottom > height ? height : result.Bottom
      if result.Right < result.Left { result.Right = result.Left }
      if result.Bottom < result.Top { result.Bottom = result.Top }
      return result
    }

  public func Dispose() {
    if disposed {
      return
    }
    if let data = clipMaskFrameData {
      data.Dispose()
    }
    primitiveFrameData.Dispose()
    textFrameData.Dispose()
    disposed = true
  }

  deinit{
    Dispose()
  }

  private func BuildLinearChannelTable() {
    var index int32 = 0
    while index < 256 {
      let encoded = float32(index) / 255.0F
      if encoded <= 0.04045F {
        linearChannels[index] = encoded / 12.92F
      } else {
        linearChannels[index] = MathF.Pow((encoded + 0.055F) / 1.055F, 2.4F)
      }
      index = index + 1
    }
  }

}
