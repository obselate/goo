package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
  internal func EmitShapeForTest(
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
    cacheOverride VulkanTextNodeSegmentCache? = nil) bool{
      let cache = cacheOverride ?? VulkanTextNodeSegmentCache()
      cache.BeginBuild()
      activeNodeSegments = cache
      activeSegmentReuse = true
      try {
        return EmitShapeWithStyle(frame, shape, fontSize, lineX, baseline, fillColor,
          opacity, parentTransformIndex, strokeWidth, strokeColor, shadows)
      } finally {
        activeNodeSegments = nil
      }
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

  private func EstimateRemainingVectorGlyphs(shape ShapedText, startRunIndex int32, startGlyphIndex int32) int32 {
    var count int32 = 0
    var runIndex = startRunIndex
    while runIndex < shape.Runs.Count {
      let run = shape.Runs[runIndex]
      let glyphs = run.Glyphs
      let clusters = run.Clusters
      let text = run.Text
      var glyphIndex = if runIndex == startRunIndex { startGlyphIndex } else { 0 }
      while glyphIndex < glyphs.Length {
        if glyphs[glyphIndex] != 0u {
          var isWhitespace = false
          if glyphIndex < clusters.Length {
            let charIndex = int32(clusters[glyphIndex])
            if charIndex >= 0 && charIndex < text.Length {
              let ch = text[charIndex]
              if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
                isWhitespace = true
              }
            }
          }
          if !isWhitespace {
            count = count + 1
          }
        }
        glyphIndex = glyphIndex + 1
      }
      runIndex = runIndex + 1
    }
    return count > 0 ? count : 1
  }

  private func ApplySegmentMetadata(
    segment VulkanRetainedTextSegment,
    shape ShapedText,
    fontSize float32,
    sizeChanged bool,
    unfitted bool,
    lineX float32,
    baseline float32,
    color uint32,
    effectMode uint32,
    effectRadiusPixels float32,
    effectOffsetX float32,
    effectOffsetY float32,
    parentTransform PrimitiveTransform,
    parentTransformIndex int32,
    usedExternalColorOrSkipped bool) {
      segment.Shape = shape
      segment.RendererValidationCacheEligible = activeSegmentReuse && !usedExternalColorOrSkipped
      segment.FontSize = fontSize
      segment.SizeChanged = sizeChanged
      segment.Unfitted = unfitted
      segment.LineX = lineX
      segment.Baseline = baseline
      segment.Color = color
      segment.EffectMode = effectMode
      segment.EffectRadiusPixels = effectRadiusPixels
      segment.EffectOffsetX = effectOffsetX
      segment.EffectOffsetY = effectOffsetY
      segment.ParentTransform = parentTransform
      segment.BaselineReusable = parentTransformIndex == -1 && !usedExternalColorOrSkipped
      segment.HasExternalColorGlyphs = usedExternalColorOrSkipped
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
      let existingSegment = PeekSegment(frame)
      let sizeChanged = if let existing = existingSegment {
        existing.Version != 0uL && !SameTextFloat(existing.FontSize, fontSize)
      } else { false }
      let unfitted = scaleAnimating || (sizeChanged && existingSegment!!.SizeChanged)
      var parentTransform PrimitiveTransform
      var parentTransformValid bool
      if parentTransformIndex == -1 {
        parentTransform = PrimitiveTransform{
          A: 1.0F,
          B: 0.0F,
          C: 0.0F,
          D: 1.0F,
          TX: 0.0F,
          TY: 0.0F,
        }
        parentTransformValid = true
      } else {
        parentTransformValid = ComposeLogicalTransform(frame, parentTransformIndex, PrimitiveTransform{
          A: 1.0F,
          B: 0.0F,
          C: 0.0F,
          D: 1.0F,
          TX: 0.0F,
          TY: 0.0F,
        }, out parentTransform)
      }
      if activeSegmentReuse && parentTransformValid {
        if let existing = existingSegment {
          if IsExactSegmentHit(existing, frame, shape,
            fontSize, lineX, baseline, color, effectMode, effectRadiusPixels,
            effectOffsetX, effectOffsetY, parentTransform)
            && ProtectSegmentAtlases(existing) {
              existing.SizeChanged = false
              AdvanceSegmentCursor()
              frame.AddCachedTextSegment(existing.CreateReference())
              return true
            }
          if parentTransformIndex == -1
            && existing.BaselineReusable && effectMode == TextEffectFill
            && IsExactSegmentHit(existing, frame, shape,
              fontSize, lineX, existing.Baseline, color, effectMode, effectRadiusPixels,
              effectOffsetX, effectOffsetY, parentTransform)
            && ProtectSegmentAtlases(existing)
            && MoveSegmentBaseline(existing, baseline) {
              existing.SizeChanged = false
              AdvanceSegmentCursor()
              frame.AddCachedTextSegment(existing.CreateReference())
              return true
            }
        }
      }
      if shape.GlyphCount <= 0 || shape.Runs.Count == 0 {
        if existingSegment != nil { AdvanceSegmentCursor() }
        return true
      }

      let useDirectSegment = existingSegment == nil || existingSegment.Version == 0uL
      var directSegment = if useDirectSegment { existingSegment } else { nil }
      var targetStorage VulkanTextSegmentStorage? = if useDirectSegment {
        nil
      } else {
        buildWorkspace.BeginBuild(ResourceGeneration, frame.ActiveClipChainId)
        buildWorkspace
      }

      let parentScale = if parentTransformIndex == -1 {
        1.0F
      } else if parentTransformValid {
        MinimumTransformScale(parentTransform.A, parentTransform.B,
          parentTransform.C, parentTransform.D)
      } else {
        ParentTransformMinimumScale(frame, parentTransformIndex)
      }
      EncodedForeground(color, 0u, effectMode,
        out var premulR, out var premulG, out var premulB, out var fgAlpha)
      var straightR = premulR
      var straightG = premulG
      var straightB = premulB
      if effectMode == TextEffectFill {
        EncodedForeground(color, 1u, effectMode,
          out straightR, out straightG, out straightB, out _)
      }
      let passInputsValid = parentTransformValid
        && FiniteValue(fontSize) && fontSize > 0.0F
        && FiniteValue(lineX) && FiniteValue(baseline)
        && FiniteValue(effectRadiusPixels) && effectRadiusPixels >= 0.0F
        && FiniteValue(effectOffsetX) && FiniteValue(effectOffsetY)
      let applyEffectOffset = effectMode == TextEffectShadow || effectMode == TextEffectBlurShadow
      let hasEffectRadius = effectMode == TextEffectStroke || effectMode == TextEffectBlurShadow
      let effectRadiusNumerator = hasEffectRadius ? (effectRadiusPixels / parentScale) : 0.0F
      let clipChainUint = uint32(frame.ActiveClipChainId)
      let bitmapPpem = BitmapPpem(fontSize)
      let colorOpacity = float32(int32(color) & int32(255)) / 255.0F

      var fallbackBounds = ConservativeBounds{}
      var hasBounds bool = false
      var usedExternalColorOrSkipped bool = false
      var result bool = true
      var runIndex int32 = 0
      while runIndex < shape.Runs.Count {
        let run = shape.Runs[runIndex]
        let provider = run.Provider
        let providerTable = GetProviderGlyphTable(provider)
        let ppem = if unfitted { 0 } else { HintPpem(provider, fontSize) }
        let runX = lineX + MathF.Min(run.VisualStart, run.VisualEnd)
        let runOriginX = parentTransform.A * runX + parentTransform.C * baseline + parentTransform.TX
        let runOriginY = parentTransform.B * runX + parentTransform.D * baseline + parentTransform.TY
        let runValid = passInputsValid && FiniteValue(runOriginX) && FiniteValue(runOriginY)
        var glyphIndex int32 = 0
        while glyphIndex < run.Glyphs.Length {
          let glyphId = run.Glyphs[glyphIndex]
          if glyphId != 0u {
            guard let fillGlyph = GetGlyph(providerTable, run, glyphId, ppem, bitmapPpem) else {
              resourceDeferred = true
              publicationPending = true
              complete = false
              result = false
              glyphIndex = glyphIndex + 1
              continue
            }
            var glyph = fillGlyph
            if effectMode != TextEffectFill && fillGlyph.RenderMode != GlyphRenderModeMonochrome {
              if fillGlyph.RenderMode == GlyphRenderModeEmptySkip {
                usedExternalColorOrSkipped = true
                glyphIndex = glyphIndex + 1
                continue
              }
              if fillGlyph.RenderMode == GlyphRenderModeEmptyInk {
                glyphIndex = glyphIndex + 1
                continue
              }
              guard let effectGlyph = GetEffectOutlineGlyph(providerTable, run, glyphId, ppem) else {
                resourceDeferred = true
                publicationPending = true
                complete = false
                result = false
                glyphIndex = glyphIndex + 1
                continue
              }
              if effectGlyph.RenderMode == GlyphRenderModeEmptySkip {
                usedExternalColorOrSkipped = true
                colorEffectSkipped = true
                glyphIndex = glyphIndex + 1
                continue
              }
              if effectGlyph.RenderMode == GlyphRenderModeEmptyInk || effectGlyph.ByteLength == 0u {
                usedExternalColorOrSkipped = true
                colorEffectSkipped = true
                glyphIndex = glyphIndex + 1
                continue
              }
              glyph = effectGlyph
            }
            if glyph.RenderMode == GlyphRenderModeEmptySkip {
              usedExternalColorOrSkipped = true
              glyphIndex = glyphIndex + 1
              continue
            }
            if glyph.RenderMode == GlyphRenderModeEmptyInk {
              glyphIndex = glyphIndex + 1
              continue
            }
            if glyph.RenderMode == GlyphRenderModeColorAtlas {
              MarkActiveAtlas(glyph)
              if !CanRender(glyph) {
                resourceDeferred = true
                publicationPending = true
                complete = false
                result = false
                glyphIndex = glyphIndex + 1
                continue
              }
              usedExternalColorOrSkipped = true
              let extents = glyph.Extents
              let minX = float32(extents.XBearing)
              let minY = float32(extents.YBearing + extents.Height)
              let maxX = float32(extents.XBearing + extents.Width)
              let maxY = float32(extents.YBearing)
              if maxX > minX && maxY > minY && glyph.Scale > 0 {
                let scale = fontSize / float32(glyph.Scale)
                if scale > 0.0F && FiniteValue(scale) {
                  let point = run.Points[glyphIndex]
                  let originX = lineX + point.X
                  let originY = baseline - point.Y
                  let quadMinX = originX + minX * scale
                  let quadMinY = originY - maxY * scale
                  let quadMaxX = originX + maxX * scale
                  let quadMaxY = originY - minY * scale
                  if FiniteValue(quadMinX) && FiniteValue(quadMinY)
                    && FiniteValue(quadMaxX) && FiniteValue(quadMaxY)
                    && quadMaxX > quadMinX && quadMaxY > quadMinY {
                      let quadBounds = ConservativeBounds{
                        X: quadMinX,
                        Y: quadMinY,
                        Width: quadMaxX - quadMinX,
                        Height: quadMaxY - quadMinY,
                      }
                      frame.AddCachedImage(CachedImageRefRecord{
                        Bounds: quadBounds,
                        ImageId: glyph.ColorPlacement.ImageId,
                        SamplerId: glyph.ColorPlacement.SamplerId,
                        SourceX: glyph.ColorPlacement.SourceX,
                        SourceY: glyph.ColorPlacement.SourceY,
                        SourceWidth: glyph.ColorPlacement.SourceWidth,
                        SourceHeight: glyph.ColorPlacement.SourceHeight,
                        Opacity: colorOpacity,
                        Sampling: 1u,
                        TransformIndex: parentTransformIndex,
                      })
                      if TransformGlyphBounds(parentTransform, quadMinX, quadMinY,
                        quadMaxX, quadMaxY, out var colorWorldBounds) {
                          if !hasBounds {
                            if let activeTarget = targetStorage {
                              activeTarget.Bounds = colorWorldBounds
                            } else {
                              fallbackBounds = colorWorldBounds
                            }
                            hasBounds = true
                          } else if let activeTarget = targetStorage {
                            activeTarget.Bounds = UnionBounds(activeTarget.Bounds, colorWorldBounds)
                          } else {
                            fallbackBounds = UnionBounds(fallbackBounds, colorWorldBounds)
                          }
                        }
                    }
                }
              }
              glyphIndex = glyphIndex + 1
              continue
            }
            if glyph.ByteLength == 0u {
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
            if maxX > minX && maxY > minY {
              MarkActiveAtlas(glyph)
              if !CanRender(glyph) {
                resourceDeferred = true
                publicationPending = true
                complete = false
                result = false
                glyphIndex = glyphIndex + 1
                continue
              }
              if !runValid || glyph.Scale <= 0 {
                return AbortGlyphPassEmission(ref emissionFailed, ref complete,
                  useDirectSegment, directSegment, existingSegment)
              }
              let scale = fontSize / float32(glyph.Scale)
              if scale <= 0.0F || !FiniteValue(scale) {
                return AbortGlyphPassEmission(ref emissionFailed, ref complete,
                  useDirectSegment, directSegment, existingSegment)
              }
              let point = run.Points[glyphIndex]
              let originX = lineX + point.X
              let originY = baseline - point.Y
              let effectRadius = if hasEffectRadius {
                effectRadiusNumerator / scale
              } else { 0.0F }
              let shaderEffectRadius = if effectMode == TextEffectBlurShadow {
                effectRadiusPixels
              } else { effectRadius }
              let localMinX = minX - effectRadius
              let localMinY = minY - effectRadius
              let localMaxX = maxX + effectRadius
              let localMaxY = maxY + effectRadius
              let glyphOriginX = if applyEffectOffset {
                originX + effectOffsetX
              } else { originX }
              let glyphOriginY = if applyEffectOffset {
                originY + effectOffsetY
              } else { originY }
              let composed = PrimitiveTransform{
                A: parentTransform.A * scale,
                B: parentTransform.B * scale,
                C: -parentTransform.C * scale,
                D: -parentTransform.D * scale,
                TX: parentTransform.A * glyphOriginX + parentTransform.C * glyphOriginY + parentTransform.TX,
                TY: parentTransform.B * glyphOriginX + parentTransform.D * glyphOriginY + parentTransform.TY,
              }
              var glyphBounds ConservativeBounds
              if !TransformGlyphBounds(composed, localMinX, localMinY,
                localMaxX, localMaxY, out glyphBounds) {
                  return AbortGlyphPassEmission(ref emissionFailed, ref complete,
                    useDirectSegment, directSegment, existingSegment)
                }
              var pipelineKind uint32
              var fgR float32
              var fgG float32
              var fgB float32
              if effectMode != TextEffectFill || glyph.RenderMode == 2u {
                pipelineKind = 0u
                fgR = premulR
                fgG = premulG
                fgB = premulB
              } else if glyph.RenderMode == 3u {
                pipelineKind = 1u
                fgR = straightR
                fgG = straightG
                fgB = straightB
              } else {
                return AbortGlyphPassEmission(ref emissionFailed, ref complete,
                  useDirectSegment, directSegment, existingSegment)
              }
              let storage = if let existingStorage = targetStorage {
                existingStorage
              } else {
                let estimatedCount = EstimateRemainingVectorGlyphs(shape, runIndex, glyphIndex)
                let initialized = if let existingDirect = directSegment {
                  existingDirect.EnsureRecordCapacity(estimatedCount)
                  existingDirect.ResetBuildState(ResourceGeneration, frame.ActiveClipChainId)
                  if hasBounds {
                    existingDirect.Bounds = fallbackBounds
                  }
                  existingDirect
                } else {
                  let pooled = AcquireSegmentFromPoolOrNew(estimatedCount)
                  pooled.ResetBuildState(ResourceGeneration, frame.ActiveClipChainId)
                  if hasBounds {
                    pooled.Bounds = fallbackBounds
                  }
                  directSegment = pooled
                  pooled
                }
                targetStorage = initialized
                initialized
              }
              let recordIndex = storage.RecordCount
              storage.EnsureRecordCapacity(recordIndex + 1)
              storage.GlyphPointY[recordIndex] = point.Y
              storage.Records[recordIndex] = HbGpuTextInstanceRecord{
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
                glyphInput_z: clipChainUint,
                glyphInput_w: uint32(BitConverter.SingleToInt32Bits(shaderEffectRadius)),
                foreground_x: fgR,
                foreground_y: fgG,
                foreground_z: fgB,
                foreground_w: fgAlpha,
                runOrigin_x: runOriginX,
                runOrigin_y: runOriginY,
              }
              storage.RecordCount = recordIndex + 1
              storage.GlyphCount = storage.RecordCount
              var byteRangeEnd = uint64(glyph.ByteOffset) + uint64(glyph.ByteLength)
              let effectByteEnd = uint64(glyph.EffectByteOffset) + uint64(glyph.EffectByteLength)
              if effectByteEnd > byteRangeEnd {
                byteRangeEnd = effectByteEnd
              }
              AddSegmentRun(storage, recordIndex, glyph.AtlasId, pipelineKind,
                byteRangeEnd, glyph.AtlasSlotIndex)
              if !hasBounds {
                storage.Bounds = glyphBounds
                hasBounds = true
              } else {
                storage.Bounds = UnionBounds(storage.Bounds, glyphBounds)
              }
            }
          }
          glyphIndex = glyphIndex + 1
        }
        runIndex = runIndex + 1
      }
      if unfitted {
        complete = false
        redrawRequired = true
      }
      if useDirectSegment {
        if let finalized = directSegment {
          if result && finalized.RecordCount > 0 {
            if finalized.Id == 0uL {
              finalized.Id = AllocateSegmentId()
            }
            finalized.Version = 1uL
            ApplySegmentMetadata(finalized, shape, fontSize, sizeChanged, unfitted,
              lineX, baseline, color, effectMode, effectRadiusPixels,
              effectOffsetX, effectOffsetY, parentTransform, parentTransformIndex,
              usedExternalColorOrSkipped)
            if existingSegment == nil {
              CommitSegmentSlot(finalized)
            } else {
              AdvanceSegmentCursor()
            }
            frame.AddCachedTextSegment(finalized.CreateReference())
          } else {
            RecycleOrAdvanceSegment(finalized, existingSegment)
          }
        } else if existingSegment != nil {
          AdvanceSegmentCursor()
        }
      } else {
        let segment = existingSegment!!
        if result && buildWorkspace.RecordCount > 0 {
          CommitSegment(segment)
          ApplySegmentMetadata(segment, shape, fontSize, sizeChanged, unfitted,
            lineX, baseline, color, effectMode, effectRadiusPixels,
            effectOffsetX, effectOffsetY, parentTransform, parentTransformIndex,
            usedExternalColorOrSkipped)
          frame.AddCachedTextSegment(segment.CreateReference())
        }
        AdvanceSegmentCursor()
      }
      return result
    }

  private func RecycleOrAdvanceSegment(
    segment VulkanRetainedTextSegment?,
    existingSegment VulkanRetainedTextSegment?) {
      if let direct = segment {
        direct.ResetForReuse()
        if existingSegment == nil {
          ReturnSegmentToPool(direct)
        } else {
          AdvanceSegmentCursor()
        }
      } else if existingSegment != nil {
        AdvanceSegmentCursor()
      }
    }

  private func AbortGlyphPassEmission(
    ref emissionFailed bool,
    ref complete bool,
    useDirectSegment bool,
    directSegment VulkanRetainedTextSegment?,
    existingSegment VulkanRetainedTextSegment?) bool {
      emissionFailed = true
      complete = false
      if useDirectSegment {
        RecycleOrAdvanceSegment(directSegment, existingSegment)
      } else if existingSegment != nil {
        AdvanceSegmentCursor()
      }
      return false
    }

}
