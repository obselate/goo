package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer : IDisposable {
  internal prop ClipMaskFrameStats VulkanClipMaskFrameStats{
    get {
      guard let frameData = clipMaskFrameData else {
        return VulkanClipMaskFrameStats{}
      }
      return frameData.LastStats
    }
  }

  internal prop ClipMaskFrameTotals VulkanClipMaskFrameTotals{
    get {
      guard let frameData = clipMaskFrameData else {
        return VulkanClipMaskFrameTotals{}
      }
      return frameData.Totals
    }
  }

  internal func InvalidateClipFrameRetention() {
    if let frameData = clipMaskFrameData {
      frameData.InvalidateRetention()
    }
  }

  internal func PrepareClipMasks(frame SceneFrame, extent VkExtent2D,
    slotIndex int32, completedSubmissionSerial uint64) VulkanClipMaskFrameStats -> PrepareClipFrame(frame, extent, slotIndex, completedSubmissionSerial)

  internal func PrepareClipFrame(frame SceneFrame, extent VkExtent2D,
    slotIndex int32, completedSubmissionSerial uint64) VulkanClipMaskFrameStats{
      if disposed {
        throw ObjectDisposedException("VulkanPrimitiveRenderer")
      }
      guard let atlas = clipMaskAtlas, let frameData = clipMaskFrameData else {
        throw NotSupportedException("Vulkan primitive renderer has no clip mask resources")
      }
      if frame == nil {
        throw ArgumentNullException("frame")
      }
      ValidateExtent(extent)
      if frame.ActiveChunk >= 0 {
        throw InvalidOperationException("Vulkan clip frame requires a closed scene frame")
      }
      if preparedClipFrame != nil {
        throw InvalidOperationException("Vulkan clip frame is already prepared")
      }
      EnsureClipRegionCapacity(frame.ClipMaskCount)
      var usageBatchEnded bool = frame.ClipMaskCount == 0
      if !usageBatchEnded {
        atlas.BeginUsageBatch()
      }
      try {
        var index int32 = 0
        while index < frame.ClipMaskCount {
          let value = frame.ClipMasks[index]
          if value.StableId == 0uL {
            throw ArgumentOutOfRangeException("clip mask stable id")
          }
          if !value.PathId.IsValid || value.PathId.Kind != SceneResourceKind.PathBand {
            throw ArgumentException("clip mask path id is invalid")
          }
          if !value.AtlasId.IsValid || value.AtlasId.Kind != SceneResourceKind.Atlas {
            throw ArgumentException("clip mask atlas id is invalid")
          }
          if value.FillRule != 0u && value.FillRule != 1u {
            throw NotSupportedException("Vulkan clip masks support only NonZero and EvenOdd fill rules")
          }
          ValidateBounds(value.Bounds)
          ValidateBounds(value.PathBounds)
          ValidateTransformIndex(frame, value.TransformIndex)
          let transform = ResolveTransform(frame, value.TransformIndex)
          let screenBounds = ClipScreenBounds(value, transform, extent)
          let regionKey = value.StableId
          let region = atlas.Acquire(regionKey, screenBounds.X, screenBounds.Y,
            screenBounds.Width, screenBounds.Height)
          if clipContentKeys.TryGetValue(regionKey, out var previousContentKey)
            && previousContentKey != value.ContentKey{
              atlas.MarkDirty(regionKey)
            }
          clipContentKeys[regionKey] = value.ContentKey
          clipRegions[index] = region
          index++
        }
        index = 0
        while index < frame.ClipMaskCount {
          let current = clipRegions[index]
          clipRegions[index] = atlas.Acquire(current.Key, current.ScreenX, current.ScreenY,
            current.ScreenWidth, current.ScreenHeight)
          index++
        }
        let stats = frameData.Prepare(frame, clipRegions, frame.ClipMaskCount,
          slotIndex, completedSubmissionSerial)
        if !usageBatchEnded {
          atlas.EndUsageBatch()
          usageBatchEnded = true
        }
        preparedClipFrame = frame
        preparedClipExtent = extent
        preparedClipSlot = slotIndex
        preparedClipMaskCount = frame.ClipMaskCount
        return stats
      } catch (error Exception) {
        if !usageBatchEnded {
          try { atlas.AbortUsageBatch() } catch (cleanup Exception) { }
        }
        throw error
      }
    }

  internal func RecordClipMaskPass(commandBuffer VkCommandBuffer, extent VkExtent2D) int32 {
    if disposed {
      throw ObjectDisposedException("VulkanPrimitiveRenderer")
    }
    guard let atlas = clipMaskAtlas, let frameData = clipMaskFrameData else {
      throw NotSupportedException("Vulkan primitive renderer has no clip mask resources")
    }
    guard let frame = preparedClipFrame else {
      throw InvalidOperationException("Vulkan clip frame is not prepared")
    }
    if commandBuffer == nint(0) {
      throw ArgumentException("Command buffer is null", "commandBuffer")
    }
    ValidateExtent(extent)
    if extent.width != preparedClipExtent.width || extent.height != preparedClipExtent.height {
      throw InvalidOperationException("Vulkan clip frame extent changed after preparation")
    }
    if frameData.PreparedSlot != preparedClipSlot {
      throw InvalidOperationException("Vulkan clip frame slot is not prepared")
    }
    if clipMaskPipelineLayout == 0uL {
      throw NotSupportedException("Vulkan clip mask pipeline layout is unavailable")
    }
    let selectedPipeline = primitiveState.ClipMaskPipelineFor(atlas.Format)
    if selectedPipeline == 0uL {
      throw NotSupportedException("Vulkan clip mask pipeline is unavailable")
    }
    pathDescriptorBound = false
    pathAtlasId = ResourceId{}
    activePipeline = 0uL
    clipDescriptorBound = false
    clipDescriptorLayout = 0uL
    clipDescriptorSlot = -1
    var rendered int32 = 0
    var maskIndex int32 = 0
    while maskIndex < frame.ClipMaskCount {
      let region = clipRegions[maskIndex]
      if region.Dirty {
        let dirty = VulkanClipMaskDirtyRegion{
          Key: region.Key,
          Generation: region.Generation,
          Layer: region.Layer,
          X: region.PaddedX,
          Y: region.PaddedY,
          Width: region.PaddedWidth,
          Height: region.PaddedHeight,
        }
        let value = frame.ClipMasks[maskIndex]
        atlas.RecordLayerForColorAttachment(commandBuffer, region.Layer)
        SetClipMaskViewport(commandBuffer, atlas.Width, atlas.Height)
        SetScissor(commandBuffer, PrimitiveClip{
          Left: int32(dirty.X),
          Top: int32(dirty.Y),
          Right: int32(dirty.X + dirty.Width),
          Bottom: int32(dirty.Y + dirty.Height),
        })
        BeginClipMaskRendering(commandBuffer, atlas, dirty)
        try {
          EmitClipMask(commandBuffer, extent, value, region, frame, selectedPipeline)
        } finally {
          let endRendering = dispatch.vkCmdEndRendering
          endRendering(commandBuffer)
        }
        atlas.MarkClean(region.Key)
        rendered++
      }
      maskIndex++
    }
    atlas.RecordForSampling(commandBuffer)
    SetScissor(commandBuffer, PrimitiveClip{
      Left: 0,
      Top: 0,
      Right: int32(extent.width),
      Bottom: int32(extent.height),
    })
    return rendered
  }

  internal func RecordClipMasks(commandBuffer VkCommandBuffer, extent VkExtent2D) int32 -> RecordClipMaskPass(commandBuffer, extent)

  internal func MarkClipFrameSubmitted(slotIndex int32, submissionSerial uint64) {
    guard let frameData = clipMaskFrameData else {
      throw NotSupportedException("Vulkan primitive renderer has no clip mask resources")
    }
    frameData.MarkSubmitted(slotIndex, submissionSerial)
    if slotIndex == preparedClipSlot {
      preparedClipFrame = nil
      preparedClipSlot = -1
      preparedClipExtent = VkExtent2D{}
      preparedClipMaskCount = 0
    }
  }

  internal func ReconcileClipFrameSubmitted(slotIndex int32, submissionSerial uint64) {
    guard let frameData = clipMaskFrameData else {
      throw NotSupportedException("Vulkan primitive renderer has no clip mask resources")
    }
    frameData.ReconcileSubmitted(slotIndex, submissionSerial)
    if slotIndex == preparedClipSlot {
      preparedClipFrame = nil
      preparedClipSlot = -1
      preparedClipExtent = VkExtent2D{}
      preparedClipMaskCount = 0
    }
  }

  internal func CompleteClipFrameRecording() {
    preparedClipFrame = nil
  }

  internal func ValidateClipFrameSubmission(slotIndex int32, submissionSerial uint64) {
    guard let frameData = clipMaskFrameData else {
      throw NotSupportedException("Vulkan primitive renderer has no clip mask resources")
    }
    frameData.ValidateSubmission(slotIndex, submissionSerial)
    ValidatePrimitiveFrameSubmission(submissionSerial)
    if slotIndex != preparedClipSlot || preparedClipSlot < 0 {
      throw InvalidOperationException("Vulkan clip frame is not prepared for submission")
    }
  }

  internal func MarkSubmitted(slotIndex int32, submissionSerial uint64) {
    MarkClipFrameSubmitted(slotIndex, submissionSerial)
  }

  internal func CollectClipFrame(completedSubmissionSerial uint64) {
    if let frameData = clipMaskFrameData {
      frameData.Collect(completedSubmissionSerial)
    }
    if let atlas = clipMaskAtlas {
      atlas.Collect(completedSubmissionSerial)
    }
  }

  internal func Collect(completedSubmissionSerial uint64) {
    CollectClipFrame(completedSubmissionSerial)
    CollectPrimitiveFrame(completedSubmissionSerial)
  }

  internal func AbortClipFrame(slotIndex int32) {
    if let atlas = clipMaskAtlas {
      var index int32 = 0
      while index < preparedClipMaskCount {
        if clipRegions[index].Key != 0uL {
          try { atlas.MarkDirty(clipRegions[index].Key) } catch (cleanup Exception) { }
        }
        index++
      }
    }
    if let atlas = clipMaskAtlas {
      try { atlas.AbortUsageBatch() } catch (cleanup Exception) { }
    }
    if let frameData = clipMaskFrameData {
      frameData.Abort(slotIndex)
    }
    if slotIndex == preparedClipSlot {
      preparedClipFrame = nil
      preparedClipSlot = -1
      preparedClipExtent = VkExtent2D{}
      preparedClipMaskCount = 0
    }
  }

  internal func Abort(slotIndex int32) {
    AbortClipFrame(slotIndex)
    AbortPrimitiveFrame()
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    if let frameData = clipMaskFrameData {
      frameData.DisposeAfterDeviceLoss()
    }
    primitiveFrameData.DisposeAfterDeviceLoss()
    textFrameData.DisposeAfterDeviceLoss()
    if let atlas = clipMaskAtlas {
      try { atlas.AbortUsageBatch() } catch (cleanup Exception) { }
    }
    preparedClipFrame = nil
    preparedClipSlot = -1
    preparedClipMaskCount = 0
    disposed = true
  }

  private func EnsureClipDescriptor(commandBuffer VkCommandBuffer, layout VkPipelineLayout) {
    EnsureClipDescriptorAt(commandBuffer, layout, 1u)
  }

  private func EnsureClipDescriptorAt(
    commandBuffer VkCommandBuffer,
    layout VkPipelineLayout,
    setIndex uint32) {
      guard let frameData = clipMaskFrameData else {
        throw NotSupportedException("Vulkan primitive renderer has no clip mask frame data")
      }
      if !clipDescriptorBound || clipDescriptorLayout != layout
        || clipDescriptorSlot != preparedClipSlot{
          frameData.Bind(commandBuffer, layout, setIndex)
          clipDescriptorBound = true
          clipDescriptorLayout = layout
          clipDescriptorSlot = preparedClipSlot
          recordDescriptorChangeCount++
        }
    }

  private func EnsureClipRegionCapacity(required int32) {
    if required <= clipRegions.Length {
      return
    }
    if required <= 0 || required > Int32.MaxValue / 2 {
      throw ArgumentOutOfRangeException("clip mask count")
    }
    clipRegions = GrowArray(clipRegions, clipRegions.Length, required, 8)
  }

  private func ClipScreenBounds(value ClipMaskRecord, transform PrimitiveTransform,
    extent VkExtent2D) PrimitiveClipBounds{
      let first = TransformBounds(value.Bounds, transform)
      let second = TransformBounds(value.PathBounds, transform)
      let left = Floor(MathF.Max(first.X, second.X))
      let top = Floor(MathF.Max(first.Y, second.Y))
      let right = Ceiling(MathF.Min(first.Right, second.Right))
      let bottom = Ceiling(MathF.Min(first.Bottom, second.Bottom))
      let extentWidth = int32(extent.width)
      let extentHeight = int32(extent.height)
      var x = int32(left)
      var y = int32(top)
      var r = int32(right)
      var b = int32(bottom)
      if x < 0 { x = 0 }
      if y < 0 { y = 0 }
      if x >= extentWidth { x = extentWidth - 1 }
      if y >= extentHeight { y = extentHeight - 1 }
      if r <= x { r = x + 1 }
      if b <= y { b = y + 1 }
      if r > extentWidth { r = extentWidth }
      if b > extentHeight { b = extentHeight }
      if r <= x {
        x = extentWidth - 1 > 0 ? extentWidth - 1 : 0
        r = extentWidth
      }
      if b <= y {
        y = extentHeight - 1 > 0 ? extentHeight - 1 : 0
        b = extentHeight
      }
      return PrimitiveClipBounds{
        X: x,
        Y: y,
        Width: uint32(r - x > 1 ? r - x : 1),
        Height: uint32(b - y > 1 ? b - y : 1),
      }
    }

  private func TransformBounds(value ConservativeBounds,
    transform PrimitiveTransform) ConservativeBounds{
      let x0 = transform.A * value.X + transform.C * value.Y + transform.TX
      let y0 = transform.B * value.X + transform.D * value.Y + transform.TY
      let x1 = transform.A * value.Right + transform.C * value.Y + transform.TX
      let y1 = transform.B * value.Right + transform.D * value.Y + transform.TY
      let x2 = transform.A * value.X + transform.C * value.Bottom + transform.TX
      let y2 = transform.B * value.X + transform.D * value.Bottom + transform.TY
      let x3 = transform.A * value.Right + transform.C * value.Bottom + transform.TX
      let y3 = transform.B * value.Right + transform.D * value.Bottom + transform.TY
      let left = MathF.Min(MathF.Min(x0, x1), MathF.Min(x2, x3))
      let top = MathF.Min(MathF.Min(y0, y1), MathF.Min(y2, y3))
      let right = MathF.Max(MathF.Max(x0, x1), MathF.Max(x2, x3))
      let bottom = MathF.Max(MathF.Max(y0, y1), MathF.Max(y2, y3))
      return ConservativeBounds{ X: left, Y: top, Width: right - left, Height: bottom - top }
    }

  private func SetClipMaskViewport(commandBuffer VkCommandBuffer, width uint32, height uint32) {
    var viewport = VkViewport{}
    viewport.width = float32(width)
    viewport.height = float32(height)
    viewport.minDepth = 0.0F
    viewport.maxDepth = 1.0F
    let setViewport = dispatch.vkCmdSetViewport
    setViewport(commandBuffer, 0u, 1u, &viewport)
  }

  private func BeginClipMaskRendering(commandBuffer VkCommandBuffer,
    atlas VulkanClipMaskAtlas, dirty VulkanClipMaskDirtyRegion) {
      var clear = VkClearValue{}
      clear.color.float32.values[0] = 0.0F
      clear.color.float32.values[1] = 0.0F
      clear.color.float32.values[2] = 0.0F
      clear.color.float32.values[3] = 0.0F
      var attachment = VkRenderingAttachmentInfo{}
      attachment.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO
      attachment.imageView = atlas.ImageViewAt(dirty.Layer)
      attachment.imageLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
      attachment.resolveMode = VkConstants.VK_RESOLVE_MODE_NONE
      attachment.loadOp = VkConstants.VK_ATTACHMENT_LOAD_OP_CLEAR
      attachment.storeOp = VkConstants.VK_ATTACHMENT_STORE_OP_STORE
      attachment.clearValue = clear
      var rendering = VkRenderingInfo{}
      rendering.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_INFO
      rendering.renderArea = VkRect2D{}
      rendering.renderArea.offset = VkOffset2D{
        x: int32(dirty.X),
        y: int32(dirty.Y),
      }
      rendering.renderArea.extent = VkExtent2D{
        width: dirty.Width,
        height: dirty.Height,
      }
      rendering.layerCount = 1u
      rendering.colorAttachmentCount = 1u
      rendering.pColorAttachments = &attachment
      let beginRendering = dispatch.vkCmdBeginRendering
      beginRendering(commandBuffer, &rendering)
    }

  private func EmitClipMask(commandBuffer VkCommandBuffer, extent VkExtent2D,
    value ClipMaskRecord, region VulkanClipMaskRegion, frame SceneFrame,
    pipeline VkPipeline) {
      FlushPendingPrimitiveDraw(commandBuffer)
      let transform = ResolveTransform(frame, value.TransformIndex)
      let width = float32(clipMaskAtlas!!.Width)
      let height = float32(clipMaskAtlas!!.Height)
      let deltaX = float32(region.ContentX) - float32(region.ScreenX)
      let deltaY = float32(region.ContentY) - float32(region.ScreenY)
      var push = ClipMaskPushConstants{}
      push.transform0_x = 2.0F * transform.A * value.ScaleX / width
      push.transform0_y = 2.0F * transform.C * value.ScaleY / width
      push.transform0_z = 2.0F * (transform.A * value.TranslateX
        +transform.C * value.TranslateY + transform.TX + deltaX) / width - 1.0F
      push.transform1_x = 2.0F * transform.B * value.ScaleX / height
      push.transform1_y = 2.0F * transform.D * value.ScaleY / height
      push.transform1_z = 2.0F * (transform.B * value.TranslateX
        +transform.D * value.TranslateY + transform.TY + deltaY) / height - 1.0F
      push.sampleStep_x = 1.0F / width
      push.sampleStep_y = 1.0F / height
      let matrix00 = transform.A * value.ScaleX
      let matrix01 = transform.C * value.ScaleY
      let matrix10 = transform.B * value.ScaleX
      let matrix11 = transform.D * value.ScaleY
      let determinant = matrix00 * matrix11 - matrix01 * matrix10
      var inflationX = 0.0F
      var inflationY = 0.0F
      if MathF.Abs(determinant) > 0.0000001F {
        let inverseDeterminant = 1.0F / MathF.Abs(determinant)
        inflationX = (MathF.Abs(matrix11) + MathF.Abs(matrix01)) * inverseDeterminant
        inflationY = (MathF.Abs(matrix10) + MathF.Abs(matrix00)) * inverseDeterminant
      }
      push.sampleStep_z = inflationX
      push.sampleStep_w = inflationY
      push.borderRect_x = value.Bounds.X
      push.borderRect_y = value.Bounds.Y
      push.borderRect_z = value.Bounds.Width
      push.borderRect_w = value.Bounds.Height
      let nodeDeterminant = transform.A * transform.D - transform.C * transform.B
      if MathF.Abs(nodeDeterminant) > 0.0000001F {
        let inverseA = transform.D / nodeDeterminant
        let inverseC = -transform.C / nodeDeterminant
        let inverseB = -transform.B / nodeDeterminant
        let inverseD = transform.A / nodeDeterminant
        let inverseTX = -(inverseA * transform.TX + inverseC * transform.TY)
        -(inverseA * deltaX + inverseC * deltaY)
        let inverseTY = -(inverseB * transform.TX + inverseD * transform.TY)
        -(inverseB * deltaX + inverseD * deltaY)
        push.borderTransform0_x = inverseA
        push.borderTransform0_y = inverseC
        push.borderTransform0_z = inverseTX
        push.borderTransform1_x = inverseB
        push.borderTransform1_y = inverseD
        push.borderTransform1_z = inverseTY
      } else {
        push.borderRect_z = 0.0F
        push.borderRect_w = 0.0F
        push.borderTransform0_x = 1.0F
        push.borderTransform1_y = 1.0F
      }
      push.params_x = value.AtlasWordOffset
      push.params_y = value.FillRule
      push.params_z = 0u
      push.params_w = 0u
      if !pathDescriptorBound {
        pathAtlas.BindDescriptor(commandBuffer, clipMaskPipelineLayout)
        pathDescriptorBound = true
        recordDescriptorChangeCount++
      }
      if activePipeline != pipeline {
        let bindPipeline = dispatch.vkCmdBindPipeline
        bindPipeline(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline)
        recordPipelineChangeCount++
        activePipeline = pipeline
      }
      let pushConstants = dispatch.vkCmdPushConstants
      pushConstants(commandBuffer, clipMaskPipelineLayout,
        uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
        | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT),
        0u, 112u, *void(&push))
      let draw = dispatch.vkCmdDraw
      draw(commandBuffer, 6u, 1u, 0u, 0u)
    }

  private func ValidateExtent(extent VkExtent2D) {
    if extent.width == 0u || extent.height == 0u
      || uint64(extent.width) > uint64(Int32.MaxValue)
      || uint64(extent.height) > uint64(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("extent")
      }
  }

  private func Floor(value float32) float32 -> MathF.Floor(value)
  private func Ceiling(value float32) float32 -> MathF.Ceiling(value)
}

internal data struct PrimitiveClipBounds {
  var X int32
  var Y int32
  var Width uint32
  var Height uint32
}
