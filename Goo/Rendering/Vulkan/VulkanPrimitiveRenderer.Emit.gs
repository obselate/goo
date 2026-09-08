package Goo

import System
import System.IO
import System.Runtime.InteropServices

internal unsafe partial class VulkanPrimitiveRenderer : IDisposable {
  private func ValidateChunk(frame SceneFrame, value SceneChunk) {
    if value.FirstDraw < 0 || value.DrawCount < 0
      || value.FirstDraw > frame.DrawRefCount
      || value.DrawCount > frame.DrawRefCount - value.FirstDraw{
        throw ArgumentOutOfRangeException("scene chunk draw range")
      }
    if value.FirstResource < 0 || value.ResourceCount < 0
      || value.FirstResource > frame.ResourceRefCount
      || value.ResourceCount > frame.ResourceRefCount - value.FirstResource{
        throw ArgumentOutOfRangeException("scene chunk resource range")
      }
    ValidateBounds(value.Bounds)
  }

  private func ValidateRectClip(frame SceneFrame, value RectClipRecord, extent VkExtent2D) {
    ResolveRectClip(frame, value, extent)
  }

  private func ResolveRectClip(frame SceneFrame, value RectClipRecord, extent VkExtent2D) PrimitiveClip {
    ValidateBounds(value.Bounds)
    ValidateTransformIndex(frame, value.TransformIndex)
    if value.ParentIndex < -1 || value.ParentIndex >= frame.RectClipCount {
      throw ArgumentOutOfRangeException("clip parent index")
    }
    let transform = ResolveTransform(frame, value.TransformIndex)
    if transform.B != 0.0F || transform.C != 0.0F {
      throw NotSupportedException("Vulkan primitive renderer requires axis-aligned rectangular clips")
    }
    return ResolveClip(value.Bounds, transform, extent)
  }

  private func ValidateGradientStops(frame SceneFrame, start int32, count int32) {
    if count < 2 || start < 0 || start > frame.GradientStopCount - count {
      throw ArgumentOutOfRangeException("gradient stop range")
    }
    var previous float32 = 0.0F
    for index in 0 ... count {
      let offset = frame.GradientStops[start + index].Offset
      ValidateFinite(offset, "gradient stop offset")
      if offset < previous || offset > 1.0F {
        throw ArgumentOutOfRangeException("gradient stop range")
      }
      previous = offset
    }
  }

  private func ValidateTransformRecord(value TransformRecord, count int32) {
    ValidateFinite(value.A, "transform a")
    ValidateFinite(value.B, "transform b")
    ValidateFinite(value.C, "transform c")
    ValidateFinite(value.D, "transform d")
    ValidateFinite(value.TX, "transform tx")
    ValidateFinite(value.TY, "transform ty")
    if value.ParentIndex < -1 || value.ParentIndex >= count {
      throw ArgumentOutOfRangeException("transform parent index")
    }
  }

  private func ValidateTransformIndex(frame SceneFrame, index int32) {
    if index < -1 || index >= frame.TransformCount {
      throw ArgumentOutOfRangeException("transform index")
    }
  }

  private func ValidateBounds(value ConservativeBounds) {
    ValidateFinite(value.X, "bounds x")
    ValidateFinite(value.Y, "bounds y")
    ValidateFinite(value.Width, "bounds width")
    ValidateFinite(value.Height, "bounds height")
    ValidateFinite(value.Right, "bounds right")
    ValidateFinite(value.Bottom, "bounds bottom")
    if value.Width < 0.0F || value.Height < 0.0F {
      throw ArgumentOutOfRangeException("bounds size")
    }
  }

  private func ValidateOpacity(value float32) {
    ValidateFinite(value, "opacity")
    if value < 0.0F || value > 1.0F {
      throw ArgumentOutOfRangeException("opacity")
    }
  }

  private func ValidateRadius(value float32) {
    ValidateFinite(value, "radius")
    if value < 0.0F {
      throw ArgumentOutOfRangeException("radius")
    }
  }

  private func ValidateFinite(value float32, name string) {
    if Single.IsNaN(value) || Single.IsInfinity(value) {
      throw ArgumentException("Vulkan primitive renderer requires finite values", name)
    }
  }

  private func RequireRecordIndex(index int32, count int32, name string) {
    if index < 0 || index >= count {
      throw ArgumentOutOfRangeException(name)
    }
  }

  private func EmitSolid(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    bounds ConservativeBounds,
    radiusTopLeft float32,
    radiusTopRight float32,
    radiusBottomRight float32,
    radiusBottomLeft float32,
    color uint32,
    opacity float32,
    transformIndex int32,
    frame SceneFrame) {
      ValidateBounds(bounds)
      ValidateRadius(radiusTopLeft)
      ValidateRadius(radiusTopRight)
      ValidateRadius(radiusBottomRight)
      ValidateRadius(radiusBottomLeft)
      ValidateOpacity(opacity)
      ValidateTransformIndex(frame, transformIndex)
      let transform = ResolveTransform(frame, transformIndex)
      if bounds.IsEmpty {
        return
      }
      EmitSolidResolved(commandBuffer, extent, bounds, radiusTopLeft, radiusTopRight,
        radiusBottomRight, radiusBottomLeft, color, opacity, transform)
    }

  private func EmitSolidResolved(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    bounds ConservativeBounds,
    radiusTopLeft float32,
    radiusTopRight float32,
    radiusBottomRight float32,
    radiusBottomLeft float32,
    color uint32,
    opacity float32,
    transform PrimitiveTransform) {
      var push = AnalyticSolidPushConstants{}
      FillTransform(&push, bounds, transform, extent)
      push.radii_x = radiusTopLeft
      push.radii_y = radiusTopRight
      push.radii_z = radiusBottomRight
      push.radii_w = radiusBottomLeft
      let packed = PackColor(color, opacity)
      push.packedColors_x = packed.Rgb
      push.packedColors_w = packed.Alpha
      BindAndDraw(commandBuffer, primitivePipelines.SolidPipeline, *void(&push))
    }

  private func EmitLava(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value LavaRecord,
    frame SceneFrame) {
      ValidateBounds(value.Bounds)
      ValidateFinite(value.Flow, "lava flow")
      ValidateFinite(value.Form, "lava form")
      ValidateFinite(value.Blend, "lava blend")
      ValidateFinite(value.Light, "lava light")
      ValidateFinite(value.Hue, "lava hue")
      if value.Flow < 0.0F || value.Flow > 1.0F
        || value.Form < 0.0F || value.Form > 1.0F
        || value.Blend < 0.0F || value.Blend > 1.0F
        || value.Light < 0.0F || value.Light > 1.0F
        || value.Hue < 0.0F || value.Hue > 1.0F
        || value.Rainbow > 1u
        || Double.IsNaN(value.Rotation.X) || Double.IsInfinity(value.Rotation.X)
        || Double.IsNaN(value.Rotation.Y) || Double.IsInfinity(value.Rotation.Y) {
          throw ArgumentOutOfRangeException("lava state")
        }
      ValidateTransformIndex(frame, value.TransformIndex)
      if value.Bounds.IsEmpty {
        return
      }
      let transform = ResolveTransform(frame, value.TransformIndex)
      var push = AnalyticSolidPushConstants{}
      FillTransform(&push, value.Bounds, transform, extent)
      push.radii_x = value.Flow
      push.radii_y = value.Form
      push.radii_z = value.Blend
      push.radii_w = value.Bounds.Width / value.Bounds.Height
      let phase = lavaFrameSeconds - Math.Floor(lavaFrameSeconds / 4096.0) * 4096.0
      push.params_x = float32(phase)
      push.params_y = value.Light
      push.params_z = value.Hue
      push.params_w = value.Rainbow == 1u ? 1.0F : 0.0F
      push.stopPositions_x = float32(value.Rotation.X)
      push.stopPositions_y = float32(value.Rotation.Y)
      push.stopPositions_z = 0.0F
      push.packedColorsExtra_x = value.Seed
      BindAndDraw(commandBuffer, primitivePipelines.LavaPipeline, *void(&push))
    }

  private func EmitShadow(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value ShadowRecord,
    frame SceneFrame) {
      ValidateBounds(value.Bounds)
      ValidateRadius(value.RadiusTopLeft)
      ValidateRadius(value.RadiusTopRight)
      ValidateRadius(value.RadiusBottomRight)
      ValidateRadius(value.RadiusBottomLeft)
      ValidateFinite(value.OffsetX, "shadow offset x")
      ValidateFinite(value.OffsetY, "shadow offset y")
      ValidateFinite(value.Spread, "shadow spread")
      ValidateFinite(value.Blur, "shadow blur")
      if value.Blur < 0.0F {
        throw ArgumentOutOfRangeException("shadow blur")
      }
      if value.MaskId.IsValid && value.MaskIndex < 0 {
        throw NotSupportedException("Vulkan primitive renderer does not support external shadow masks")
      }
      ValidateTransformIndex(frame, value.TransformIndex)
      let transform = ResolveTransform(frame, value.TransformIndex)
      if value.Bounds.IsEmpty {
        return
      }
      let sourceWidth = value.Bounds.Width + value.Spread + value.Spread
      let sourceHeight = value.Bounds.Height + value.Spread + value.Spread
      if !value.Inset && (sourceWidth <= 0.0F || sourceHeight <= 0.0F) {
        return
      }
      let spread = value.Spread
      let blurExtent = value.Blur > 0.0F ? value.Blur * 2.0F + 2.0F : 0.0F
      let offsetExtent = MathF.Max(MathF.Abs(value.OffsetX), MathF.Abs(value.OffsetY))
      let expansion = value.Inset
      ? MathF.Max(blurExtent, offsetExtent) : blurExtent + MathF.Max(spread, 0.0F)
      let shadowBounds = ConservativeBounds{
        X: value.Bounds.X + value.OffsetX - expansion,
        Y: value.Bounds.Y + value.OffsetY - expansion,
        Width: value.Bounds.Width + expansion + expansion,
        Height: value.Bounds.Height + expansion + expansion,
      }
      if shadowBounds.IsEmpty {
        return
      }
      var push = AnalyticSolidPushConstants{}
      FillTransform(&push, shadowBounds, transform, extent)
      push.radii_x = value.RadiusTopLeft
      push.radii_y = value.RadiusTopRight
      push.radii_z = value.RadiusBottomRight
      push.radii_w = value.RadiusBottomLeft
      push.params_x = spread
      push.params_y = value.Blur
      push.params_z = value.OffsetX
      push.params_w = value.OffsetY
      let packed = PackColor(value.Color, 1.0F)
      push.packedColors_x = packed.Rgb
      push.packedColors_w = packed.Alpha
      push.packedColorsExtra_x = value.Inset ? 1u : 0u
      if value.MaskIndex >= 0 {
        guard let _ = preparedClipFrame else {
          throw InvalidOperationException("Vulkan masked shadow requires a prepared clip frame")
        }
        if value.MaskIndex >= clipRegions.Length || value.MaskIndex >= frame.ClipMaskCount {
          throw ArgumentOutOfRangeException("shadow mask index")
        }
        let region = clipRegions[value.MaskIndex]
        push.stopPositions_x = region.Mapping.ScaleX
        push.stopPositions_y = region.Mapping.ScaleY
        push.stopPositions_z = region.Mapping.OffsetX
        push.stopPositions_w = region.Mapping.OffsetY
        push.packedColors_y = uint32(BitConverter.SingleToInt32Bits(float32(region.ScreenWidth)))
        push.packedColors_z = uint32(BitConverter.SingleToInt32Bits(float32(region.ScreenHeight)))
        push.packedColorsExtra_y = region.Mapping.Layer * 2u | 1u
        push.packedColorsExtra_z = uint32(BitConverter.SingleToInt32Bits(float32(region.ScreenX)))
        push.packedColorsExtra_w = uint32(BitConverter.SingleToInt32Bits(float32(region.ScreenY)))
      }
      BindAndDraw(commandBuffer, primitivePipelines.ShadowPipeline, *void(&push))
    }

  private func EmitBorder(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value PerEdgeBorderRecord,
    frame SceneFrame) {
      let bounds = value.Bounds
      ValidateBounds(bounds)
      ValidateRadius(value.TopWidth)
      ValidateRadius(value.RightWidth)
      ValidateRadius(value.BottomWidth)
      ValidateRadius(value.LeftWidth)
      ValidateRadius(value.RadiusTopLeft)
      ValidateRadius(value.RadiusTopRight)
      ValidateRadius(value.RadiusBottomRight)
      ValidateRadius(value.RadiusBottomLeft)
      ValidateTransformIndex(frame, value.TransformIndex)
      let transform = ResolveTransform(frame, value.TransformIndex)
      if bounds.IsEmpty {
        return
      }
      let topWidth = ClampLength(value.TopWidth, bounds.Height)
      let bottomWidth = ClampLength(value.BottomWidth, MathF.Max(bounds.Height - topWidth, 0.0F))
      let rightWidth = ClampLength(value.RightWidth, bounds.Width)
      let leftWidth = ClampLength(value.LeftWidth, MathF.Max(bounds.Width - rightWidth, 0.0F))
      if value.Style != uint32(int32(BorderStyle.Solid))
        && value.Style != uint32(int32(BorderStyle.Dashed))
        && value.Style != uint32(int32(BorderStyle.Dotted)) {
          throw NotSupportedException("Vulkan primitive renderer received an unknown border style")
        }
      let rounded = value.RadiusTopLeft > 0.0F || value.RadiusTopRight > 0.0F
        || value.RadiusBottomRight > 0.0F || value.RadiusBottomLeft > 0.0F
      if value.Style != uint32(int32(BorderStyle.Solid)) || rounded {
        var push = AnalyticBorderPushConstants{}
        FillTransform(&push, bounds, transform, extent)
        push.widths_x = topWidth
        push.widths_y = rightWidth
        push.widths_z = bottomWidth
        push.widths_w = leftWidth
        push.radii_x = value.RadiusTopLeft
        push.radii_y = value.RadiusTopRight
        push.radii_z = value.RadiusBottomRight
        push.radii_w = value.RadiusBottomLeft
        push.params_x = 0.0F
        push.params_y = bounds.Width
        push.params_z = bounds.Width + bounds.Height
        push.params_w = bounds.Width + bounds.Height + bounds.Width
        let top = PackColor(value.TopColor, 1.0F)
        let right = PackColor(value.RightColor, 1.0F)
        let bottom = PackColor(value.BottomColor, 1.0F)
        let left = PackColor(value.LeftColor, 1.0F)
        push.packedColors_x = top.Rgb
        push.packedColors_y = right.Rgb
        push.packedColors_z = bottom.Rgb
        push.packedColors_w = PackAlphaTriplet(top.Alpha, right.Alpha, bottom.Alpha)
        push.packedColorsExtra_x = left.Rgb
        push.packedColorsExtra_y = left.Alpha
        push.packedColorsExtra_z = 0u
        push.packedColorsExtra_w = value.Style
        BindAndDraw(commandBuffer, primitivePipelines.BorderPipeline, *void(&push))
        return
      }
      let interiorHeight = MathF.Max(bounds.Height - topWidth - bottomWidth, 0.0F)
      if topWidth > 0.0F {
        EmitSolidResolved(commandBuffer, extent, ConservativeBounds{
          X: bounds.X,
          Y: bounds.Y,
          Width: bounds.Width,
          Height: topWidth,
        }, 0.0F, 0.0F, 0.0F, 0.0F, value.TopColor, 1.0F, transform)
      }
      if rightWidth > 0.0F && interiorHeight > 0.0F {
        EmitSolidResolved(commandBuffer, extent, ConservativeBounds{
          X: bounds.X + bounds.Width - rightWidth,
          Y: bounds.Y + topWidth,
          Width: rightWidth,
          Height: interiorHeight,
        }, 0.0F, 0.0F, 0.0F, 0.0F, value.RightColor, 1.0F, transform)
      }
      if bottomWidth > 0.0F {
        EmitSolidResolved(commandBuffer, extent, ConservativeBounds{
          X: bounds.X,
          Y: bounds.Y + bounds.Height - bottomWidth,
          Width: bounds.Width,
          Height: bottomWidth,
        }, 0.0F, 0.0F, 0.0F, 0.0F, value.BottomColor, 1.0F, transform)
      }
      if leftWidth > 0.0F && interiorHeight > 0.0F {
        EmitSolidResolved(commandBuffer, extent, ConservativeBounds{
          X: bounds.X,
          Y: bounds.Y + topWidth,
          Width: leftWidth,
          Height: interiorHeight,
        }, 0.0F, 0.0F, 0.0F, 0.0F, value.LeftColor, 1.0F, transform)
      }
    }

  private func EmitLinear(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value LinearGradientRecord,
    frame SceneFrame) {
      ValidateBounds(value.Bounds)
      ValidateFinite(value.StartX, "linear gradient start x")
      ValidateFinite(value.StartY, "linear gradient start y")
      ValidateFinite(value.EndX, "linear gradient end x")
      ValidateFinite(value.EndY, "linear gradient end y")
      ValidateRadius(value.RadiusTopLeft)
      ValidateRadius(value.RadiusTopRight)
      ValidateRadius(value.RadiusBottomRight)
      ValidateRadius(value.RadiusBottomLeft)
      ValidateOpacity(value.Opacity)
      ValidateTransformIndex(frame, value.TransformIndex)
      ValidateGradientStops(frame, value.StopStart, value.StopCount)
      let transform = ResolveTransform(frame, value.TransformIndex)
      if value.Bounds.IsEmpty {
        return
      }
      var push = AnalyticLinear4PushConstants{}
      FillTransform(&push, value.Bounds, transform, extent)
      push.radii_x = value.RadiusTopLeft
      push.radii_y = value.RadiusTopRight
      push.radii_z = value.RadiusBottomRight
      push.radii_w = value.RadiusBottomLeft
      let width = MathF.Max(value.Bounds.Width, 0.0001F)
      let height = MathF.Max(value.Bounds.Height, 0.0001F)
      push.params_x = (value.StartX - value.Bounds.X) / width
      push.params_y = (value.StartY - value.Bounds.Y) / height
      push.params_z = (value.EndX - value.Bounds.X) / width
      push.params_w = (value.EndY - value.Bounds.Y) / height
      FillLinearStops(&push, frame, value.StopStart, value.StopCount, value.Opacity)
      BindAndDraw(commandBuffer, primitivePipelines.LinearPipeline, *void(&push))
      WriteGradientStopRecords(frame, value.StopStart, value.StopCount, value.Opacity)
    }

  private func EmitRadial(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value RadialGradientRecord,
    frame SceneFrame) {
      ValidateBounds(value.Bounds)
      ValidateFinite(value.CenterX, "radial gradient center x")
      ValidateFinite(value.CenterY, "radial gradient center y")
      ValidateRadius(value.RadiusX)
      ValidateRadius(value.RadiusY)
      ValidateRadius(value.RadiusTopLeft)
      ValidateRadius(value.RadiusTopRight)
      ValidateRadius(value.RadiusBottomRight)
      ValidateRadius(value.RadiusBottomLeft)
      ValidateOpacity(value.Opacity)
      ValidateTransformIndex(frame, value.TransformIndex)
      ValidateGradientStops(frame, value.StopStart, value.StopCount)
      let transform = ResolveTransform(frame, value.TransformIndex)
      if value.Bounds.IsEmpty {
        return
      }
      var push = AnalyticRadial4PushConstants{}
      FillTransform(&push, value.Bounds, transform, extent)
      push.radii_x = value.RadiusTopLeft
      push.radii_y = value.RadiusTopRight
      push.radii_z = value.RadiusBottomRight
      push.radii_w = value.RadiusBottomLeft
      let width = MathF.Max(value.Bounds.Width, 0.0001F)
      let height = MathF.Max(value.Bounds.Height, 0.0001F)
      push.params_x = (value.CenterX - value.Bounds.X) / width
      push.params_y = (value.CenterY - value.Bounds.Y) / height
      push.params_z = MathF.Max(value.RadiusX / width, 0.0001F)
      push.params_w = MathF.Max(value.RadiusY / height, 0.0001F)
      FillRadialStops(&push, frame, value.StopStart, value.StopCount, value.Opacity)
      BindAndDraw(commandBuffer, primitivePipelines.RadialPipeline, *void(&push))
      WriteGradientStopRecords(frame, value.StopStart, value.StopCount, value.Opacity)
    }

  private func EmitImage(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value CachedImageRefRecord,
    frame SceneFrame) {
      if imageResources == nil {
        throw NotSupportedException("Vulkan primitive renderer has no image resources")
      }
      ValidateBounds(value.Bounds)
      ValidateOpacity(value.Opacity)
      ValidateTransformIndex(frame, value.TransformIndex)
      if !value.ImageId.IsValid || value.ImageId.Kind != SceneResourceKind.Image {
        throw ArgumentException("cached image id is not an image")
      }
      if !value.SamplerId.IsValid || value.SamplerId.Kind != SceneResourceKind.Sampler {
        throw ArgumentException("cached image sampler id is not a sampler")
      }
      if value.Sampling != 0u && value.Sampling != 1u {
        throw ArgumentOutOfRangeException("sampling")
      }
      let samplerMode = if value.Sampling == 0u {
        VulkanImageSamplerMode.Nearest
      } else {
        VulkanImageSamplerMode.Linear
      }
      ValidateFinite(value.SourceX, "cached image source x")
      ValidateFinite(value.SourceY, "cached image source y")
      ValidateFinite(value.SourceWidth, "cached image source width")
      ValidateFinite(value.SourceHeight, "cached image source height")
      if value.SourceX < 0.0F || value.SourceY < 0.0F
        || value.SourceWidth <= 0.0F || value.SourceHeight <= 0.0F
        || value.SourceX + value.SourceWidth > 1.0F
        || value.SourceY + value.SourceHeight > 1.0F {
          throw ArgumentOutOfRangeException("cached image source rectangle")
        }
      let lookup = imageResources!!.Lookup(value.ImageId, value.SamplerId, samplerMode,
        resourceGeneration)
      if !lookup.Found || !lookup.Renderable {
        throw InvalidOperationException("Vulkan cached image is not renderable")
      }
      if value.Bounds.IsEmpty {
        return
      }
      let transform = ResolveTransform(frame, value.TransformIndex)
      var push = SampledImagePushConstants{}
      FillTransform(&push, value.Bounds, transform, extent)
      push.radii_x = value.Opacity
      push.params_x = value.SourceX
      push.params_y = value.SourceY
      push.params_z = value.SourceWidth
      push.params_w = value.SourceHeight
      if !primitivePrepass {
        EnsureDescriptorLayout(pipelineLayout)
        let sameDescriptor = sampledDescriptorBound
          && SameResourceId(sampledImageId, value.ImageId)
          && SameResourceId(sampledSamplerId, value.SamplerId)
          && sampledSamplerMode == samplerMode
          && sampledGeneration == resourceGeneration
        if !sameDescriptor {
          FlushPendingPrimitiveDraw(commandBuffer)
          imageResources!!.BindDescriptor(commandBuffer, pipelineLayout, value.ImageId,
            value.SamplerId, samplerMode, resourceGeneration)
          recordDescriptorChangeCount++
          sampledDescriptorBound = true
          sampledImageId = value.ImageId
          sampledSamplerId = value.SamplerId
          sampledSamplerMode = samplerMode
          sampledGeneration = resourceGeneration
        }
      }
      BindPrimitiveAndDraw(commandBuffer, primitivePipelines.SampledPipeline,
        pipelineLayout, *void(&push), 1u)
    }

  private func EmitLayer(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value LayerRecord,
    target VulkanOffscreenLayerTarget?,
    backdrop VulkanOffscreenLayerTarget?,
    frame SceneFrame) {
      ValidateBounds(value.Bounds)
      ValidateOpacity(value.Opacity)
      ValidateFinite(value.OriginX, "layer origin x")
      ValidateFinite(value.OriginY, "layer origin y")
      if !primitivePrepass && (target == nil || target!!.DescriptorSet == 0uL) {
        throw InvalidOperationException("Vulkan layer target descriptor is unavailable")
      }
      if value.Bounds.IsEmpty {
        return
      }
      if value.EffectIndex >= 0 {
        EmitShaderEffectLayer(commandBuffer, extent, value, target, backdrop, frame)
        return
      }
      if value.BlendMode != 0u {
        guard let backdropTarget = backdrop else {
          if !primitivePrepass {
            throw InvalidOperationException("Vulkan blend layer backdrop is unavailable")
          }
          EmitBlendLayer(commandBuffer, extent, value, nil, nil)
          return
        }
        EmitBlendLayer(commandBuffer, extent, value, target, backdropTarget)
        return
      }
      var push = SampledImagePushConstants{}
      FillTransform(&push, value.Bounds, PrimitiveTransform{ A: 1.0F, D: 1.0F }, extent)
      push.radii_x = value.Opacity
      let targetWidth = float32(value.ExtentWidth)
      let targetHeight = float32(value.ExtentHeight)
      push.params_x = (value.Bounds.X - value.OriginX) / targetWidth
      push.params_y = (value.Bounds.Y - value.OriginY) / targetHeight
      push.params_z = value.Bounds.Width / targetWidth
      push.params_w = value.Bounds.Height / targetHeight
      if !primitivePrepass {
        FlushPendingPrimitiveDraw(commandBuffer)
        EnsureDescriptorLayout(pipelineLayout)
        var descriptorSet = target!!.DescriptorSet
        let bindDescriptors = dispatch.vkCmdBindDescriptorSets
        bindDescriptors(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
          pipelineLayout, 0u, 1u, &descriptorSet, 0u, nil)
        recordDescriptorChangeCount++
        sampledDescriptorBound = false
        sampledImageId = ResourceId{}
        sampledSamplerId = ResourceId{}
        sampledSamplerMode = VulkanImageSamplerMode.Nearest
        sampledGeneration = 0uL
        pathDescriptorBound = false
        pathAtlasId = ResourceId{}
        textDescriptorBound = false
        textAtlasId = ResourceId{}
      }
      BindPrimitiveAndDraw(commandBuffer, primitivePipelines.SampledPipeline,
        pipelineLayout, *void(&push), 1u)
    }

  private func EmitShaderEffectLayer(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value LayerRecord,
    target VulkanOffscreenLayerTarget?,
    backdrop VulkanOffscreenLayerTarget?,
    frame SceneFrame) {
      RequireRecordIndex(value.EffectIndex, frame.ShaderEffectCount, "shader effect index")
      let effect = frame.ShaderEffects[value.EffectIndex]
      guard let program = effect.Program else {
        throw InvalidOperationException("Vulkan shader effect program is unavailable")
      }
      if effect.ProgramId != value.EffectProgramId || effect.Version != value.EffectVersion {
        throw InvalidOperationException("Vulkan shader effect snapshot does not match its layer")
      }
      if value.BlendMode != 0u {
        throw NotSupportedException("ShaderEffect cannot be combined with a non-normal BlendMode")
      }
      if !primitivePrepass && (target == nil || target!!.DescriptorSet == 0uL) {
        throw InvalidOperationException("Vulkan shader effect source is unavailable")
      }
      if effect.SamplesBackdrop && !primitivePrepass
        && (backdrop == nil || backdrop!!.DescriptorSet == 0uL) {
          throw InvalidOperationException("Vulkan shader effect backdrop is unavailable")
        }
      let effectPipeline = primitivePipelines.ResolveShaderEffectPipeline(program)
      var primitive = SampledImagePushConstants{}
      FillTransform(&primitive, value.Bounds,
        PrimitiveTransform{ A: 1.0F, D: 1.0F }, extent)
      primitive.radii_x = value.Opacity
      let targetWidth = float32(value.ExtentWidth)
      let targetHeight = float32(value.ExtentHeight)
      primitive.params_x = (value.Bounds.X - value.OriginX) / targetWidth
      primitive.params_y = (value.Bounds.Y - value.OriginY) / targetHeight
      primitive.params_z = value.Bounds.Width / targetWidth
      primitive.params_w = value.Bounds.Height / targetHeight
      primitive.packedColorsExtra_w = primitiveFrameData.EffectDataWordOffset
      +effect.DataWordOffset
      primitive.stopPositions_x = effect.ElapsedSeconds
      if !primitivePrepass {
        FlushPendingPrimitiveDraw(commandBuffer)
        EnsureDescriptorLayout(blendPipelineLayout)
        var descriptorSets = stackalloc[2]VkDescriptorSet
        descriptorSets[0] = target!!.DescriptorSet
        descriptorSets[1] = if let backdropTarget = backdrop {
          backdropTarget.DescriptorSet
        } else { target!!.DescriptorSet }
        let bindDescriptors = dispatch.vkCmdBindDescriptorSets
        bindDescriptors(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
          blendPipelineLayout, 0u, 2u, &descriptorSets[0], 0u, nil)
        recordDescriptorChangeCount++
        var parameters = VulkanShaderEffectPushConstants{
          Parameter0: effect.Parameter0,
          Parameter1: effect.Parameter1,
          Parameter2: effect.Parameter2,
          Parameter3: effect.Parameter3,
          Parameter4: effect.Parameter4,
          Parameter5: effect.Parameter5,
          Parameter6: effect.Parameter6,
          Parameter7: effect.Parameter7,
        }
        let pushConstants = dispatch.vkCmdPushConstants
        pushConstants(commandBuffer, blendPipelineLayout,
          uint32(VkConstants.VK_SHADER_STAGE_FRAGMENT_BIT),
          0u, 128u, *void(&parameters))
        sampledDescriptorBound = false
        sampledImageId = ResourceId{}
        sampledSamplerId = ResourceId{}
        sampledSamplerMode = VulkanImageSamplerMode.Nearest
        sampledGeneration = 0uL
        pathDescriptorBound = false
        pathAtlasId = ResourceId{}
        textDescriptorBound = false
        textAtlasId = ResourceId{}
      }
      if !primitivePrepass {
        primitiveFrameData.BindEffectData(commandBuffer, blendPipelineLayout, 4u)
        recordDescriptorChangeCount++
      }
      BindPrimitiveAndDraw(commandBuffer, effectPipeline, blendPipelineLayout,
        *void(&primitive), 3u)
    }

  private func EmitBlendLayer(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value LayerRecord,
    target VulkanOffscreenLayerTarget?,
    backdrop VulkanOffscreenLayerTarget?) {
      if !primitivePrepass && (target == nil || backdrop == nil
          || target!!.DescriptorSet == 0uL || backdrop!!.DescriptorSet == 0uL) {
            throw InvalidOperationException("Vulkan blend layer descriptor is unavailable")
          }
      if value.BlendMode > uint32(int32(BlendMode.Luminosity)) {
        throw NotSupportedException("Vulkan blend mode is unavailable")
      }
      var push = SampledImagePushConstants{}
      FillTransform(&push, value.Bounds, PrimitiveTransform{ A: 1.0F, D: 1.0F }, extent)
      push.radii_x = value.Opacity
      let targetWidth = float32(value.ExtentWidth)
      let targetHeight = float32(value.ExtentHeight)
      push.params_x = (value.Bounds.X - value.OriginX) / targetWidth
      push.params_y = (value.Bounds.Y - value.OriginY) / targetHeight
      push.params_z = value.Bounds.Width / targetWidth
      push.params_w = value.Bounds.Height / targetHeight
      push.packedColorsExtra_w = value.BlendMode
      if !primitivePrepass {
        FlushPendingPrimitiveDraw(commandBuffer)
        EnsureDescriptorLayout(blendPipelineLayout)
        var descriptorSets = stackalloc[2]VkDescriptorSet
        descriptorSets[0] = target!!.DescriptorSet
        descriptorSets[1] = backdrop!!.DescriptorSet
        let bindDescriptors = dispatch.vkCmdBindDescriptorSets
        bindDescriptors(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
          blendPipelineLayout, 0u, 2u, &descriptorSets[0], 0u, nil)
        recordDescriptorChangeCount++
        sampledDescriptorBound = false
        sampledImageId = ResourceId{}
        sampledSamplerId = ResourceId{}
        sampledSamplerMode = VulkanImageSamplerMode.Nearest
        sampledGeneration = 0uL
        pathDescriptorBound = false
        pathAtlasId = ResourceId{}
        textDescriptorBound = false
        textAtlasId = ResourceId{}
      }
      BindPrimitiveAndDraw(commandBuffer, primitivePipelines.BlendPipeline,
        blendPipelineLayout, *void(&push), 3u)
    }

  private func EmitTextSegment(
    commandBuffer VkCommandBuffer,
    extent VkExtent2D,
    value CachedTextSegmentRefRecord,
    drawClipChainId int32,
    frame SceneFrame) {
      if primitivePrepass {
        return
      }
      guard let atlases = textAtlases else {
        throw NotSupportedException("Vulkan primitive renderer has no text atlas pipeline")
      }
      let segment = ValidateTextSegment(value, drawClipChainId, frame)
      if value.Bounds.IsEmpty {
        return
      }
      FlushPendingPrimitiveBatch(commandBuffer)
      var runIndex int32 = 0
      while runIndex < segment.RunCount {
        let run = segment.Runs[runIndex]
        let selectedPipeline = if run.PipelineKind == 0u {
          primitivePipelines.TextPipeline
        } else {
          primitivePipelines.TextPaintPipeline
        }
        if selectedPipeline == 0uL {
          throw NotSupportedException("Vulkan primitive renderer has no selected text pipeline")
        }
        let globalFirst = uint64(value.FirstInstance) + uint64(run.FirstInstance)
        if globalFirst > uint64(uint32.MaxValue) {
          throw ArgumentOutOfRangeException("cached text global first instance")
        }
        let firstInstance = uint32(globalFirst)
        let instanceCount = uint32(run.InstanceCount)
        if CanAppendTextDraw(selectedPipeline, run.AtlasId, firstInstance) {
          AppendTextDraw(instanceCount)
        } else {
          FlushPendingTextDraw(commandBuffer)
          EnsureDescriptorLayout(textPipelineLayout)
          EnsureClipDescriptorAt(commandBuffer, textPipelineLayout, 1u)
          EnsureTextInstanceDescriptor(commandBuffer, textPipelineLayout)
          var framePush = HbGpuTextFrameConstants{}
          framePush.viewport_x = float32(extent.width)
          framePush.viewport_y = float32(extent.height)
          framePush.viewport_z = textFrameScaleX
          framePush.viewport_w = textFrameScaleY
          framePush.origin_x = currentOriginX
          framePush.origin_y = currentOriginY
          framePush.origin_z = 0.0F
          framePush.origin_w = 0.0F
          let pushConstants = dispatch.vkCmdPushConstants
          pushConstants(commandBuffer, textPipelineLayout,
            uint32(VkConstants.VK_SHADER_STAGE_VERTEX_BIT),
            0u, TextPushConstantSize, *void(&framePush))
          let atlas = atlases.Resolve(run.AtlasId)
          if !textDescriptorBound || !SameResourceId(textAtlasId, run.AtlasId) {
            atlas.BindDescriptor(commandBuffer, textPipelineLayout)
            recordDescriptorChangeCount++
            textDescriptorBound = true
            textAtlasId = run.AtlasId
          }
          if activePipeline != selectedPipeline {
            let bindPipeline = dispatch.vkCmdBindPipeline
            bindPipeline(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
              selectedPipeline)
            recordPipelineChangeCount++
            activePipeline = selectedPipeline
          }
          BeginTextDraw(selectedPipeline, run.AtlasId, firstInstance,
            instanceCount)
        }
        runIndex = runIndex + 1
      }
    }

  private func ValidateTextSegment(
    value CachedTextSegmentRefRecord,
    drawClipChainId int32,
    frame SceneFrame) VulkanRetainedTextSegment{
      guard let atlases = textAtlases else {
        throw NotSupportedException("Vulkan primitive renderer has no text atlas pipeline")
      }
      if textPipelineLayout == 0uL {
        throw NotSupportedException("Vulkan primitive renderer has no text atlas pipeline")
      }
      ValidateBounds(value.Bounds)
      if drawClipChainId < 0 || value.ClipChainId != drawClipChainId
        || value.ClipChainId >= frame.ClipChainCount{
          throw ArgumentException("cached text segment clip chain is invalid")
        }
      if value.SegmentId == 0uL || value.SegmentVersion == 0uL
        || value.GlyphCount <= 0 || value.FirstInstance < 0
        || uint64(value.FirstInstance) > uint64(uint32.MaxValue) {
          throw ArgumentException("cached text segment reference is invalid")
        }
      guard let segment = value.Segment else {
        throw ArgumentNullException("segment")
      }
      if segment.Id == 0uL || segment.Version == 0uL
        || segment.Id != value.SegmentId
        || segment.Version != value.SegmentVersion
        || segment.GlyphCount != value.GlyphCount
        || segment.ClipChainId != value.ClipChainId
        || segment.AtlasGeneration != resourceGeneration
        || segment.RecordCount != segment.GlyphCount
        || segment.RecordCount <= 0
        || segment.RecordCount > segment.Records.Length
        || segment.GlyphResourceCount != segment.GlyphCount
        || segment.GlyphResourceCount > segment.GlyphResources.Length
        || segment.GlyphAtlasTexelOffsets.Length < segment.GlyphCount
        || segment.GlyphAtlasTexelCounts.Length < segment.GlyphCount
        || segment.GlyphEffectAtlasTexelOffsets.Length < segment.GlyphCount
        || segment.GlyphEffectAtlasTexelCounts.Length < segment.GlyphCount
        || segment.RunCount <= 0 || segment.RunCount > segment.Runs.Length{
          throw ArgumentException("cached text segment is invalid")
        }
      ValidateBounds(segment.Bounds)
      if value.Bounds.X != segment.Bounds.X || value.Bounds.Y != segment.Bounds.Y
        || value.Bounds.Width != segment.Bounds.Width
        || value.Bounds.Height != segment.Bounds.Height{
          throw ArgumentException("cached text segment bounds do not match")
        }
      if uint64(value.FirstInstance) + uint64(segment.RecordCount)
      > uint64(uint32.MaxValue) + 1uL {
        throw ArgumentOutOfRangeException("cached text global instance range")
      }
      if segment.RendererValidationCacheEligible
        && segment.RendererValidationValid
        && segment.RendererValidationVersion == segment.Version
        && segment.RendererValidationAtlasGeneration == resourceGeneration{
          return segment
        }
      var expectedFirst int32 = 0
      var runIndex int32 = 0
      while runIndex < segment.RunCount {
        let run = segment.Runs[runIndex]
        if run.FirstInstance < 0 || run.FirstInstance != expectedFirst
          || run.InstanceCount <= 0
          || run.InstanceCount > segment.RecordCount - expectedFirst
          || run.PipelineKind > 1u
          || !run.AtlasId.IsValid || run.AtlasId.Kind != SceneResourceKind.Atlas{
            throw ArgumentException("cached text segment run is invalid")
          }
        let atlas = atlases.Resolve(run.AtlasId)
        let runEnd = run.FirstInstance + run.InstanceCount
        var glyphIndex = run.FirstInstance
        while glyphIndex < runEnd {
          let glyphResource = segment.GlyphResources[glyphIndex]
          if !glyphResource.IsValid || glyphResource.Kind != SceneResourceKind.GlyphRun
            || glyphResource.LogicalId != run.AtlasId.LogicalId
            || glyphResource.Version == 0uL {
              throw ArgumentException("cached text segment glyph resource is invalid")
            }
          let record = segment.Records[glyphIndex]
          if record.glyphInput_z != uint32(value.ClipChainId)
            || record.glyphInput_y > 3u {
              throw ArgumentException("cached text segment instance mirror is invalid")
            }
          let texelOffset = if record.glyphInput_y == 0u {
            segment.GlyphAtlasTexelOffsets[glyphIndex]
          } else {
            segment.GlyphEffectAtlasTexelOffsets[glyphIndex]
          }
          let texelCount = if record.glyphInput_y == 0u {
            segment.GlyphAtlasTexelCounts[glyphIndex]
          } else {
            segment.GlyphEffectAtlasTexelCounts[glyphIndex]
          }
          let texelTotal = uint64(atlas.TexelCount)
          if texelCount == 0u || uint64(texelOffset) >= texelTotal
            || uint64(texelCount) > texelTotal - uint64(texelOffset) {
              throw ArgumentOutOfRangeException("cached text atlas range")
            }
          glyphIndex = glyphIndex + 1
        }
        expectedFirst = runEnd
        runIndex = runIndex + 1
      }
      if expectedFirst != segment.RecordCount {
        throw ArgumentException("cached text segment runs do not partition records")
      }
      segment.RendererValidationVersion = segment.Version
      segment.RendererValidationAtlasGeneration = resourceGeneration
      segment.RendererValidationValid = true
      return segment
    }

  private func EnsureTextInstanceDescriptor(
    commandBuffer VkCommandBuffer,
    layout VkPipelineLayout) {
      if textInstanceDescriptorBound && textInstanceDescriptorLayout == layout
        && textInstanceDescriptorSlot == primitiveFrameSlot{
          return
        }
      textFrameData.Bind(commandBuffer, layout, 2u)
      textInstanceDescriptorBound = true
      textInstanceDescriptorLayout = layout
      textInstanceDescriptorSlot = primitiveFrameSlot
      recordDescriptorChangeCount++
    }

  private func LocalizeTransform(transform PrimitiveTransform) PrimitiveTransform -> PrimitiveTransform {
    A: transform.A,
    B: transform.B,
    C: transform.C,
    D: transform.D,
    TX: transform.TX - currentOriginX,
    TY: transform.TY - currentOriginY,
  }

  private func FillTransform(
    push * AnalyticSolidPushConstants,
    bounds ConservativeBounds,
    transform PrimitiveTransform,
    extent VkExtent2D) {
      let localized = LocalizeTransform(transform)
      push -> rect_x = bounds.X
      push -> rect_y = bounds.Y
      push -> rect_z = bounds.Width
      push -> rect_w = bounds.Height
      let width = float32(extent.width)
      let height = float32(extent.height)
      push -> transform0_x = 2.0F * localized.A / width
      push -> transform0_y = 2.0F * localized.C / width
      push -> transform0_z = 2.0F * localized.TX / width - 1.0F
      push -> transform0_w = 0.0F
      push -> transform1_x = 2.0F * localized.B / height
      push -> transform1_y = 2.0F * localized.D / height
      push -> transform1_z = 2.0F * localized.TY / height - 1.0F
      push -> transform1_w = 0.0F
    }

  private func FillTransform(
    push * AnalyticBorderPushConstants,
    bounds ConservativeBounds,
    transform PrimitiveTransform,
    extent VkExtent2D) {
      let localized = LocalizeTransform(transform)
      push -> rect_x = bounds.X
      push -> rect_y = bounds.Y
      push -> rect_z = bounds.Width
      push -> rect_w = bounds.Height
      let width = float32(extent.width)
      let height = float32(extent.height)
      push -> transform0_x = 2.0F * localized.A / width
      push -> transform0_y = 2.0F * localized.C / width
      push -> transform0_z = 2.0F * localized.TX / width - 1.0F
      push -> transform0_w = 0.0F
      push -> transform1_x = 2.0F * localized.B / height
      push -> transform1_y = 2.0F * localized.D / height
      push -> transform1_z = 2.0F * localized.TY / height - 1.0F
      push -> transform1_w = 0.0F
    }

  private func FillTransform(
    push * AnalyticLinear4PushConstants,
    bounds ConservativeBounds,
    transform PrimitiveTransform,
    extent VkExtent2D) {
      let localized = LocalizeTransform(transform)
      push -> rect_x = bounds.X
      push -> rect_y = bounds.Y
      push -> rect_z = bounds.Width
      push -> rect_w = bounds.Height
      let width = float32(extent.width)
      let height = float32(extent.height)
      push -> transform0_x = 2.0F * localized.A / width
      push -> transform0_y = 2.0F * localized.C / width
      push -> transform0_z = 2.0F * localized.TX / width - 1.0F
      push -> transform0_w = 0.0F
      push -> transform1_x = 2.0F * localized.B / height
      push -> transform1_y = 2.0F * localized.D / height
      push -> transform1_z = 2.0F * localized.TY / height - 1.0F
      push -> transform1_w = 0.0F
    }

  private func FillTransform(
    push * AnalyticRadial4PushConstants,
    bounds ConservativeBounds,
    transform PrimitiveTransform,
    extent VkExtent2D) {
      let localized = LocalizeTransform(transform)
      push -> rect_x = bounds.X
      push -> rect_y = bounds.Y
      push -> rect_z = bounds.Width
      push -> rect_w = bounds.Height
      let width = float32(extent.width)
      let height = float32(extent.height)
      push -> transform0_x = 2.0F * localized.A / width
      push -> transform0_y = 2.0F * localized.C / width
      push -> transform0_z = 2.0F * localized.TX / width - 1.0F
      push -> transform0_w = 0.0F
      push -> transform1_x = 2.0F * localized.B / height
      push -> transform1_y = 2.0F * localized.D / height
      push -> transform1_z = 2.0F * localized.TY / height - 1.0F
      push -> transform1_w = 0.0F
    }

  private func FillTransform(
    push * SampledImagePushConstants,
    bounds ConservativeBounds,
    transform PrimitiveTransform,
    extent VkExtent2D) {
      let localized = LocalizeTransform(transform)
      push -> rect_x = bounds.X
      push -> rect_y = bounds.Y
      push -> rect_z = bounds.Width
      push -> rect_w = bounds.Height
      let width = float32(extent.width)
      let height = float32(extent.height)
      push -> transform0_x = 2.0F * localized.A / width
      push -> transform0_y = 2.0F * localized.C / width
      push -> transform0_z = 2.0F * localized.TX / width - 1.0F
      push -> transform0_w = 0.0F
      push -> transform1_x = 2.0F * localized.B / height
      push -> transform1_y = 2.0F * localized.D / height
      push -> transform1_z = 2.0F * localized.TY / height - 1.0F
      push -> transform1_w = 0.0F
    }

  private func GradientRecordCount(count int32) uint64 -> if count <= 4 { 1uL } else { 1uL + (uint64(count) + 3uL) / 4uL }

  // Long gradients store packed stop groups after their draw record in the same SSBO.
  private func WriteGradientStopRecords(frame SceneFrame, start int32, count int32, opacity float32) {
    if !primitivePrepass || count <= 4 { return }
    var offset int32 = 0
    while offset < count {
      let groupCount = Math.Min(4, count - offset)
      var group = AnalyticLinear4PushConstants{}
      FillLinearStops(&group, frame, start + offset, groupCount, opacity)
      primitiveFrameData.WriteRecord(primitiveRecordCount, *void(&group))
      primitiveRecordCount++
      offset += groupCount
    }
  }

  private func FillLinearStops(
    push * AnalyticLinear4PushConstants,
    frame SceneFrame,
    start int32,
    count int32,
    opacity float32) {
      let first = frame.GradientStops[start]
      let second = frame.GradientStops[start + Math.Min(1, count - 1)]
      var third = second
      var fourth = second
      if count >= 3 {
        third = frame.GradientStops[start + 2]
      }
      if count >= 4 {
        fourth = frame.GradientStops[start + 3]
      }
      push -> stopPositions_x = first.Offset
      push -> stopPositions_y = second.Offset
      push -> stopPositions_z = third.Offset
      push -> stopPositions_w = fourth.Offset
      let packedFirst = PackColor(first.Color, opacity)
      let packedSecond = PackColor(second.Color, opacity)
      let packedThird = PackColor(third.Color, opacity)
      let packedFourth = PackColor(fourth.Color, opacity)
      push -> packedColors_x = packedFirst.Rgb
      push -> packedColors_y = packedSecond.Rgb
      push -> packedColors_z = packedThird.Rgb
      push -> packedColors_w = PackAlphaTriplet(packedFirst.Alpha, packedSecond.Alpha, packedThird.Alpha)
      push -> packedColorsExtra_x = packedFourth.Rgb
      push -> packedColorsExtra_y = packedFourth.Alpha
      push -> packedColorsExtra_z = uint32(count)
      push -> packedColorsExtra_w = if count > 4 { uint32(primitiveRecordCount + 1) } else { 0u }
    }

  private func FillRadialStops(
    push * AnalyticRadial4PushConstants,
    frame SceneFrame,
    start int32,
    count int32,
    opacity float32) {
      let first = frame.GradientStops[start]
      let second = frame.GradientStops[start + Math.Min(1, count - 1)]
      var third = second
      var fourth = second
      if count >= 3 {
        third = frame.GradientStops[start + 2]
      }
      if count >= 4 {
        fourth = frame.GradientStops[start + 3]
      }
      push -> stopPositions_x = first.Offset
      push -> stopPositions_y = second.Offset
      push -> stopPositions_z = third.Offset
      push -> stopPositions_w = fourth.Offset
      let packedFirst = PackColor(first.Color, opacity)
      let packedSecond = PackColor(second.Color, opacity)
      let packedThird = PackColor(third.Color, opacity)
      let packedFourth = PackColor(fourth.Color, opacity)
      push -> packedColors_x = packedFirst.Rgb
      push -> packedColors_y = packedSecond.Rgb
      push -> packedColors_z = packedThird.Rgb
      push -> packedColors_w = PackAlphaTriplet(packedFirst.Alpha, packedSecond.Alpha, packedThird.Alpha)
      push -> packedColorsExtra_x = packedFourth.Rgb
      push -> packedColorsExtra_y = packedFourth.Alpha
      push -> packedColorsExtra_z = uint32(count)
      push -> packedColorsExtra_w = if count > 4 { uint32(primitiveRecordCount + 1) } else { 0u }
    }

  private func BindAndDraw(commandBuffer VkCommandBuffer, pipeline VkPipeline, pushData * void) {
    BindPrimitiveAndDraw(commandBuffer, pipeline, pipelineLayout, pushData, 1u)
  }

  private func BindPrimitiveAndDraw(
    commandBuffer VkCommandBuffer,
    pipeline VkPipeline,
    layout VkPipelineLayout,
    pushData * void,
    clipSetIndex uint32) {
      if pushData == nil {
        throw ArgumentNullException("pushData")
      }
      if primitivePrepass {
        let primitiveWords = *uint32(nint(pushData))
        primitiveWords[PrimitiveClipDrawOrdinalWord] = currentDrawOrdinal
        primitiveFrameData.WriteRecord(primitiveRecordCount, pushData)
        primitiveRecordCount = primitiveRecordCount + 1
        return
      }
      QueuePrimitiveDraw(commandBuffer, pipeline, layout, clipSetIndex)
    }

  private func EnsurePrimitiveDescriptor(commandBuffer VkCommandBuffer, layout VkPipelineLayout) {
    if primitiveDescriptorBound && primitiveDescriptorLayout == layout
      && primitiveDescriptorSlot == primitiveFrameSlot{
        return
      }
    primitiveFrameData.Bind(commandBuffer, layout, 2u)
    primitiveDescriptorBound = true
    primitiveDescriptorLayout = layout
    primitiveDescriptorSlot = primitiveFrameSlot
    recordDescriptorChangeCount++
  }

  private func EnsureDescriptorLayout(layout VkPipelineLayout) {
    if boundDescriptorLayout == layout {
      return
    }
    boundDescriptorLayout = layout
    clipDescriptorBound = false
    clipDescriptorLayout = 0uL
    clipDescriptorSlot = -1
    primitiveDescriptorBound = false
    primitiveDescriptorLayout = 0uL
    primitiveDescriptorSlot = -1
    textInstanceDescriptorBound = false
    textInstanceDescriptorLayout = 0uL
    textInstanceDescriptorSlot = -1
    sampledDescriptorBound = false
    sampledImageId = ResourceId{}
    sampledSamplerId = ResourceId{}
    sampledSamplerMode = VulkanImageSamplerMode.Nearest
    sampledGeneration = 0uL
    textDescriptorBound = false
    textAtlasId = ResourceId{}
  }

  private func SameResourceId(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind
    && left.LogicalId == right.LogicalId
    && left.Version == right.Version

  private func PushClip(commandBuffer VkCommandBuffer, clip PrimitiveClip) {
    if clipDepth >= clipStack.Length {
      throw InvalidOperationException("Vulkan primitive clip stack capacity exceeded")
    }
    var combined = clip
    if clipDepth > 0 {
      let parent = clipStack[clipDepth - 1]
      combined = Intersect(parent, clip)
    }
    clipStack[clipDepth] = combined
    clipDepth = clipDepth + 1
    if !primitivePrepass {
      SetScissor(commandBuffer, combined)
    }
  }

  private func PopClip(commandBuffer VkCommandBuffer) {
    if clipDepth <= 0 {
      throw InvalidOperationException("Vulkan primitive clip stack underflow")
    }
    clipDepth = clipDepth - 1
    if primitivePrepass {
      return
    }
    if clipDepth > 0 {
      SetScissor(commandBuffer, clipStack[clipDepth - 1])
    } else {
      let full = PrimitiveClip{
        Left: 0,
        Top: 0,
        Right: int32(activeExtent.width),
        Bottom: int32(activeExtent.height),
      }
      SetScissor(commandBuffer, full)
    }
  }

  private func ResolveClip(
    bounds ConservativeBounds,
    transform PrimitiveTransform,
    extent VkExtent2D) PrimitiveClip{
      if bounds.IsEmpty {
        return PrimitiveClip{ Left: 0, Top: 0, Right: 0, Bottom: 0 }
      }
      let localized = LocalizeTransform(transform)
      let x0 = localized.A * bounds.X + localized.C * bounds.Y + localized.TX
      let y0 = localized.B * bounds.X + localized.D * bounds.Y + localized.TY
      let x1 = localized.A * bounds.Right + localized.C * bounds.Bottom + localized.TX
      let y1 = localized.B * bounds.Right + localized.D * bounds.Bottom + localized.TY
      ValidateFinite(x0, "clip x0")
      ValidateFinite(y0, "clip y0")
      ValidateFinite(x1, "clip x1")
      ValidateFinite(y1, "clip y1")
      var leftValue = MathF.Floor(MathF.Min(x0, x1))
      var topValue = MathF.Floor(MathF.Min(y0, y1))
      var rightValue = MathF.Ceiling(MathF.Max(x0, x1))
      var bottomValue = MathF.Ceiling(MathF.Max(y0, y1))
      let width = float32(extent.width)
      let height = float32(extent.height)
      if leftValue < 0.0F { leftValue = 0.0F }
      if topValue < 0.0F { topValue = 0.0F }
      if rightValue < 0.0F { rightValue = 0.0F }
      if bottomValue < 0.0F { bottomValue = 0.0F }
      if leftValue > width { leftValue = width }
      if topValue > height { topValue = height }
      if rightValue > width { rightValue = width }
      if bottomValue > height { bottomValue = height }
      if rightValue < leftValue { rightValue = leftValue }
      if bottomValue < topValue { bottomValue = topValue }
      return PrimitiveClip{
        Left: int32(leftValue),
        Top: int32(topValue),
        Right: int32(rightValue),
        Bottom: int32(bottomValue),
      }
    }

  private func Intersect(first PrimitiveClip, second PrimitiveClip) PrimitiveClip {
    var result = PrimitiveClip{}
    result.Left = first.Left > second.Left ? first.Left : second.Left
    result.Top = first.Top > second.Top ? first.Top : second.Top
    result.Right = first.Right < second.Right ? first.Right : second.Right
    result.Bottom = first.Bottom < second.Bottom ? first.Bottom : second.Bottom
    if result.Right < result.Left { result.Right = result.Left }
    if result.Bottom < result.Top { result.Bottom = result.Top }
    return result
  }

  private func SetScissor(commandBuffer VkCommandBuffer, value PrimitiveClip) {
    FlushPendingPrimitiveDraw(commandBuffer)
    var scissor = VkRect2D{}
    scissor.offset = VkOffset2D{}
    scissor.offset.x = value.Left
    scissor.offset.y = value.Top
    var width int32 = value.Right - value.Left
    var height int32 = value.Bottom - value.Top
    if width < 0 { width = 0 }
    if height < 0 { height = 0 }
    scissor.extent.width = uint32(width)
    scissor.extent.height = uint32(height)
    let setScissor = dispatch.vkCmdSetScissor
    setScissor(commandBuffer, 0u, 1u, &scissor)
  }

  private func ResolveTransform(frame SceneFrame, index int32) PrimitiveTransform {
    if index < -1 || index >= frame.TransformCount {
      throw ArgumentOutOfRangeException("transform index")
    }
    var result = PrimitiveTransform{ A: 1.0F, B: 0.0F, C: 0.0F, D: 1.0F, TX: 0.0F, TY: 0.0F }
    var current = index
    var steps int32 = 0
    while current >= 0 {
      if current >= frame.TransformCount || steps >= frame.TransformCount {
        throw InvalidOperationException("Vulkan primitive transform chain is invalid")
      }
      let value = frame.Transforms[current]
      ValidateTransformRecord(value, frame.TransformCount)
      result = Compose(value, result)
      current = value.ParentIndex
      steps = steps + 1
    }
    ValidateFinite(result.A, "resolved transform a")
    ValidateFinite(result.B, "resolved transform b")
    ValidateFinite(result.C, "resolved transform c")
    ValidateFinite(result.D, "resolved transform d")
    ValidateFinite(result.TX, "resolved transform tx")
    ValidateFinite(result.TY, "resolved transform ty")
    return result
  }

  private func Compose(outer TransformRecord, inner PrimitiveTransform) PrimitiveTransform -> PrimitiveTransform {
    A: outer.A * inner.A + outer.C * inner.B,
    B: outer.B * inner.A + outer.D * inner.B,
    C: outer.A * inner.C + outer.C * inner.D,
    D: outer.B * inner.C + outer.D * inner.D,
    TX: outer.A * inner.TX + outer.C * inner.TY + outer.TX,
    TY: outer.B * inner.TX + outer.D * inner.TY + outer.TY,
  }

  private func PackColor(value uint32, opacity float32) PackedPrimitiveColor {
    let rgba = int32(value)
    let red = (rgba >> int32(24)) & int32(255)
    let green = (rgba >> int32(16)) & int32(255)
    let blue = (rgba >> int32(8)) & int32(255)
    let alpha = float32(rgba & int32(255)) / 255.0F
    let effectiveAlpha = Clamp01(alpha * opacity)
    let packedRed = Quantize(linearChannels[red] * effectiveAlpha, 2047u)
    let packedGreen = Quantize(linearChannels[green] * effectiveAlpha, 2047u)
    let packedBlue = Quantize(linearChannels[blue] * effectiveAlpha, 1023u)
    let packedAlpha = Quantize(effectiveAlpha, 1023u)
    let packedRgb = uint32(int32(packedRed)
      | (int32(packedGreen) << int32(11))
      | (int32(packedBlue) << int32(22)))
    return PackedPrimitiveColor{ Rgb: packedRgb, Alpha: packedAlpha }
  }

  private func PackAlphaTriplet(first uint32, second uint32, third uint32) uint32 -> uint32((int32(first) & int32(1023))
    | ((int32(second) & int32(1023)) << int32(10))
    | ((int32(third) & int32(1023)) << int32(20)))

  private func Quantize(value float32, maximum uint32) uint32 {
    let bounded = Clamp01(value)
    return uint32(int32(bounded * float32(maximum) + 0.5F))
  }

  private func Clamp01(value float32) float32 {
    if value <= 0.0F { return 0.0F }
    if value >= 1.0F { return 1.0F }
    return value
  }

  private func ClampLength(value float32, limit float32) float32 {
    if value <= 0.0F { return 0.0F }
    if value >= limit { return limit }
    return value
  }

}
