package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer : IDisposable {
  private func EmitPath(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value AnalyticPathBandRecord,
    frame SceneFrame, index int32) {
      if pathAtlas == nil || pathPipelineLayout == 0uL {
        throw NotSupportedException("Vulkan primitive renderer has no path atlas pipeline")
      }
      let stroke = value.Stroke.Width > 0.0F
      let layout = if stroke { primitiveState.StrokePipelineLayout } else { pathPipelineLayout }
      let selectedPipeline = if stroke { primitiveState.StrokePipelineFor(targetFormat) } else { primitivePipelines.PathPipeline }
      ValidateBounds(value.Bounds)
      ValidateTransformIndex(frame, value.TransformIndex)
      if !value.PathId.IsValid || value.PathId.Kind != SceneResourceKind.PathBand {
        throw ArgumentException("analytic path id is not a path band")
      }
      if !value.AtlasId.IsValid || value.AtlasId.Kind != SceneResourceKind.Atlas {
        throw ArgumentException("analytic path atlas id is not an atlas")
      }
      if value.FillRule != 0u && value.FillRule != 1u {
        throw NotSupportedException("Vulkan path renderer supports only NonZero and EvenOdd fill rules")
      }
      ValidateFinite(value.ScaleX, "path scale x")
      ValidateFinite(value.ScaleY, "path scale y")
      ValidateFinite(value.TranslateX, "path translate x")
      ValidateFinite(value.TranslateY, "path translate y")
      if value.ScaleX == 0.0F || value.ScaleY == 0.0F {
        throw ArgumentOutOfRangeException("path scale")
      }
      ValidateOpacity(value.Opacity)
      let atlasCapacity = uint64(pathAtlas.WordCapacity)
      let atlasOffset = uint64(value.AtlasWordOffset)
      let atlasCount = uint64(value.AtlasWordCount)
      if atlasCount == 0uL || atlasOffset >= atlasCapacity
        || atlasCount > atlasCapacity - atlasOffset{
          throw ArgumentOutOfRangeException("analytic path atlas range")
        }
      if value.Bounds.IsEmpty {
        return
      }
      FlushPendingPrimitiveDraw(commandBuffer)
      let transform = LocalizeTransform(ResolveTransform(frame, value.TransformIndex))
      let width = float32(extent.width)
      let height = float32(extent.height)
      var push = PathBandPushConstants{}
      push.transform0_x = 2.0F * transform.A * value.ScaleX / width
      push.transform0_y = 2.0F * transform.C * value.ScaleY / width
      push.transform0_z = 2.0F * (transform.A * value.TranslateX
        +transform.C * value.TranslateY + transform.TX) / width - 1.0F
      push.transform0_w = 0.0F
      push.transform1_x = 2.0F * transform.B * value.ScaleX / height
      push.transform1_y = 2.0F * transform.D * value.ScaleY / height
      push.transform1_z = 2.0F * (transform.B * value.TranslateX
        +transform.D * value.TranslateY + transform.TY) / height - 1.0F
      push.transform1_w = 0.0F
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
      if stroke {
        let padding = StrokePixelPadding(value.Stroke)
        inflationX *= padding
        inflationY *= padding
      }
      push.sampleStep_z = inflationX
      push.sampleStep_w = inflationY
      let rgba = int32(value.FillColor)
      let red = (rgba >> int32(24)) & int32(255)
      let green = (rgba >> int32(16)) & int32(255)
      let blue = (rgba >> int32(8)) & int32(255)
      let alpha = float32(rgba & int32(255)) / 255.0F
      let effectiveAlpha = Clamp01(alpha * value.Opacity)
      push.color_x = linearChannels[red] * effectiveAlpha
      push.color_y = linearChannels[green] * effectiveAlpha
      push.color_z = linearChannels[blue] * effectiveAlpha
      push.color_w = effectiveAlpha
      push.params_x = value.AtlasWordOffset
      push.params_y = value.FillRule == 1u ? 1u : 0u
      push.params_z = 1u
      push.params_w = if stroke { pathStrokeFrameData!!.StyleOffset(index, false) } else { 0u }
      EnsurePathDescriptorLayout(layout)
      if !pathDescriptorBound || !SameResourceId(pathAtlasId, value.AtlasId) {
        pathAtlas.BindDescriptor(commandBuffer, layout)
        recordDescriptorChangeCount++
        pathDescriptorBound = true
        pathAtlasId = value.AtlasId
      }
      if stroke && !strokeDescriptorBound {
        pathStrokeFrameData!!.Bind(commandBuffer, layout, 2u)
        strokeDescriptorBound = true
        recordDescriptorChangeCount++
      }
      if activePipeline != selectedPipeline {
        let bindPipeline = dispatch.vkCmdBindPipeline
        bindPipeline(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
          selectedPipeline)
        recordPipelineChangeCount++
        activePipeline = selectedPipeline
      }
      let pushConstants = dispatch.vkCmdPushConstants
      pushConstants(commandBuffer, layout,
        uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT)
        | uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT),
        0u, PathPushConstantSize, *void(&push))
      EnsureClipDescriptor(commandBuffer, layout)
      let draw = dispatch.vkCmdDraw
      draw(commandBuffer, 6u, 1u, 0u, currentDrawOrdinal)
      RecordImmediateDraw()
    }

  private func EnsurePathDescriptorLayout(layout VkPipelineLayout) {
    let changed = boundDescriptorLayout != layout
    EnsureDescriptorLayout(layout)
    if changed {
      pathDescriptorBound = false
      pathAtlasId = ResourceId{}
    }
  }
}
