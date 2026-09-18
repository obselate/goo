package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
  private func EmitShapeWithStyle(
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    fillColor Color,
    opacity float32,
    parentTransformIndex int32,
    strokeWidth float32,
    strokeColor Color,
    shadows BoxShadowStack?) bool{
      var complete bool = true
      return EmitShapeWithStyle(frame, shape, fontSize, lineX, baseline, fillColor,
        opacity, parentTransformIndex, strokeWidth, strokeColor, shadows, ref complete)
    }

  private func EmitShapeWithStyle(
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    fillColor Color,
    opacity float32,
    parentTransformIndex int32,
    strokeWidth float32,
    strokeColor Color,
    shadows BoxShadowStack?,
    ref complete bool) bool{
      let shadowCount = textShadowCount(shadows)
      var shadowIndex = shadowCount - 1
      while shadowIndex >= 0 {
        let shadow = textShadowAt(shadows, shadowIndex)
        if shadow.Color.A > 0.0F {
          let effectMode = if shadow.Blur.Px > 0.0F {
            TextEffectBlurShadow
          } else {
            TextEffectShadow
          }
          if !EmitGlyphPass(frame, shape, fontSize, lineX, baseline,
            PackedColor(shadow.Color, opacity), effectMode, shadow.Blur.Px,
            shadow.OffsetX.Px, shadow.OffsetY.Px, parentTransformIndex,
            ref complete) {
              return false
            }
        }
        shadowIndex = shadowIndex - 1
      }
      if strokeWidth > 0.0F && strokeWidth <= MaximumStrokeWidth
        && strokeColor.A > 0.0F {
          if !EmitGlyphPass(frame, shape, fontSize, lineX, baseline,
            PackedColor(strokeColor, opacity), TextEffectStroke, strokeWidth * 0.5F,
            0.0F, 0.0F, parentTransformIndex, ref complete) {
              return false
            }
        }
      if fillColor.A <= 0.0F {
        return true
      }
      return EmitGlyphPass(frame, shape, fontSize, lineX, baseline,
        PackedColor(fillColor, opacity), TextEffectFill, 0.0F, 0.0F, 0.0F,
        parentTransformIndex, ref complete)
    }

  private func EmitGlyphPass(
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    color uint32,
    effectMode uint32,
    effectRadiusPixels float32,
    effectOffsetX float32,
    effectOffsetY float32,
    parentTransformIndex int32,
    ref complete bool) bool{
      let segment = BeginSegment(frame)
      var parentTransform TransformRecord
      let identity = TransformRecord{
        A: 1.0F,
        B: 0.0F,
        C: 0.0F,
        D: 1.0F,
        TX: 0.0F,
        TY: 0.0F,
        ParentIndex: -1,
      }
      let parentTransformValid = ComposeLogicalTransform(frame, parentTransformIndex,
        identity, out parentTransform)
      if activeSegmentReuse && parentTransformValid
        && IsExactSegmentHit(segment, frame, shape,
          fontSize, lineX, baseline, color, effectMode, effectRadiusPixels,
          effectOffsetX, effectOffsetY, parentTransform)
        && ProtectSegmentAtlases(segment) {
          frame.AddCachedTextSegment(segment.CreateReference())
          return true
        }
      buildWorkspace.BeginBuild(ResourceGeneration, frame.ActiveClipChainId)
      let workspace = buildWorkspace
      let parentScale = ParentTransformMinimumScale(frame, parentTransformIndex)
      var hasBounds bool = false
      var result bool = true
      var runIndex int32 = 0
      while runIndex < shape.Runs.Count {
        let run = shape.Runs[runIndex]
        var glyphIndex int32 = 0
        while glyphIndex < run.Glyphs.Length {
          let glyphId = run.Glyphs[glyphIndex]
          if glyphId != 0u {
            guard let glyph = GetGlyph(run, glyphId) else {
              redrawRequired = true
              publicationPending = true
              complete = false
              result = false
              glyphIndex = glyphIndex + 1
              continue
            }
            MarkActiveAtlas(glyph)
            if !CanRender(glyph) {
              redrawRequired = true
              publicationPending = true
              complete = false
              result = false
              glyphIndex = glyphIndex + 1
              continue
            }
            if effectMode != TextEffectFill && glyph.RenderMode == 3u
              && glyph.EffectByteLength == 0u {
                colorEffectSkipped = true
                emissionFailed = true
                complete = false
                result = false
                glyphIndex = glyphIndex + 1
                continue
              }
            let extents = if effectMode == TextEffectFill {
              glyph.Extents
            } else {
              glyph.EffectExtents
            }
            let minX = float32(extents.XBearing)
            let minY = float32(extents.YBearing + extents.Height)
            let maxX = float32(extents.XBearing + extents.Width)
            let maxY = float32(extents.YBearing)
            if glyph.ByteLength != 0u && maxX > minX && maxY > minY {
              if glyph.Scale <= 0 {
                emissionFailed = true
                complete = false
                result = false
                return false
              }
              let scale = fontSize / float32(glyph.Scale)
              if scale <= 0.0F || !FiniteValue(scale) {
                emissionFailed = true
                complete = false
                result = false
                return false
              }
              let point = run.Points[glyphIndex]
              let originX = lineX + point.X
              let originY = baseline - point.Y
              let effectRadius = if effectMode == TextEffectStroke
                || effectMode == TextEffectBlurShadow{
                  effectRadiusPixels / (scale * parentScale)
                } else { 0.0F }
              let shaderEffectRadius = if effectMode == TextEffectBlurShadow {
                effectRadiusPixels
              } else { effectRadius }
              let localMinX = minX - effectRadius
              let localMinY = minY - effectRadius
              let localMaxX = maxX + effectRadius
              let localMaxY = maxY + effectRadius
              let glyphOriginX = if effectMode == TextEffectShadow
                || effectMode == TextEffectBlurShadow{
                  originX + effectOffsetX
                } else { originX }
              let glyphOriginY = if effectMode == TextEffectShadow
                || effectMode == TextEffectBlurShadow{
                  originY + effectOffsetY
                } else { originY }
              let inner = TransformRecord{
                A: scale,
                B: 0.0F,
                C: 0.0F,
                D: -scale,
                TX: glyphOriginX,
                TY: glyphOriginY,
                ParentIndex: -1,
              }
              var composed TransformRecord
              if !ComposeLogicalTransform(frame, parentTransformIndex, inner,
                out composed) {
                  emissionFailed = true
                  complete = false
                  result = false
                  return false
                }
              var glyphBounds ConservativeBounds
              if !TransformGlyphBounds(composed, localMinX, localMinY,
                localMaxX, localMaxY, out glyphBounds) {
                  emissionFailed = true
                  complete = false
                  result = false
                  return false
                }
              var pipelineKind uint32
              if effectMode != TextEffectFill
                || glyph.RenderMode == 2u {
                  pipelineKind = 0u
                } else if glyph.RenderMode == 3u {
                  pipelineKind = 1u
                } else {
                  emissionFailed = true
                  complete = false
                  result = false
                  return false
                }
              let glyphRunId = ResourceId{
                Kind: SceneResourceKind.GlyphRun,
                LogicalId: glyph.AtlasId.LogicalId,
                Version: uint64(glyph.ByteOffset / 8u) + 1uL,
              }
              let recordIndex = workspace.RecordCount
              workspace.EnsureRecordCapacity(recordIndex + 1)
              var foregroundR float32
              var foregroundG float32
              var foregroundB float32
              var foregroundA float32
              LinearForeground(color, pipelineKind, effectMode,
                out foregroundR, out foregroundG, out foregroundB,
                out foregroundA)
              workspace.Records[recordIndex] = HbGpuTextInstanceRecord{
                transform_m00: composed.A,
                transform_m01: composed.B,
                transform_m02: 0.0F,
                transform_m03: 0.0F,
                transform_m10: composed.C,
                transform_m11: composed.D,
                transform_m12: 0.0F,
                transform_m13: 0.0F,
                transform_m20: 0.0F,
                transform_m21: 0.0F,
                transform_m22: 1.0F,
                transform_m23: 0.0F,
                transform_m30: composed.TX,
                transform_m31: composed.TY,
                transform_m32: 0.0F,
                transform_m33: 1.0F,
                glyphBounds_x: localMinX,
                glyphBounds_y: localMinY,
                glyphBounds_z: localMaxX,
                glyphBounds_w: localMaxY,
                glyphInput_x: if effectMode == TextEffectFill {
                  glyph.ByteOffset / 8u
                } else { glyph.EffectByteOffset / 8u },
                glyphInput_y: effectMode,
                glyphInput_z: uint32(frame.ActiveClipChainId),
                glyphInput_w: uint32(BitConverter.SingleToInt32Bits(shaderEffectRadius)),
                foreground_x: foregroundR,
                foreground_y: foregroundG,
                foreground_z: foregroundB,
                foreground_w: foregroundA,
              }
              workspace.GlyphResources[recordIndex] = glyphRunId
              workspace.GlyphAtlasTexelOffsets[recordIndex] =
              glyph.ByteOffset / 8u
              workspace.GlyphAtlasTexelCounts[recordIndex] =
              glyph.ByteLength / 8u
              workspace.GlyphEffectAtlasTexelOffsets[recordIndex] =
              glyph.EffectByteOffset / 8u
              workspace.GlyphEffectAtlasTexelCounts[recordIndex] =
              glyph.EffectByteLength / 8u
              workspace.RecordCount = recordIndex + 1
              workspace.GlyphResourceCount = workspace.RecordCount
              workspace.GlyphCount = workspace.RecordCount
              var byteRangeEnd = uint64(glyph.ByteOffset)
              +uint64(glyph.ByteLength)
              let effectByteEnd = uint64(glyph.EffectByteOffset)
              +uint64(glyph.EffectByteLength)
              if effectByteEnd > byteRangeEnd {
                byteRangeEnd = effectByteEnd
              }
              AddSegmentRun(workspace, recordIndex, glyph.AtlasId, pipelineKind,
                byteRangeEnd)
              if !hasBounds {
                workspace.Bounds = glyphBounds
                hasBounds = true
              } else {
                workspace.Bounds = UnionBounds(workspace.Bounds, glyphBounds)
              }
            }
          }
          glyphIndex = glyphIndex + 1
        }
        runIndex = runIndex + 1
      }
      if result && workspace.RecordCount > 0 {
        CommitSegment(segment)
        segment.Shape = shape
        segment.RendererValidationCacheEligible = activeSegmentReuse
        segment.FontSize = fontSize
        segment.LineX = lineX
        segment.Baseline = baseline
        segment.Color = color
        segment.EffectMode = effectMode
        segment.EffectRadiusPixels = effectRadiusPixels
        segment.EffectOffsetX = effectOffsetX
        segment.EffectOffsetY = effectOffsetY
        segment.ParentTransform = parentTransform
        frame.AddCachedTextSegment(segment.CreateReference())
      }
      return result
    }

}
