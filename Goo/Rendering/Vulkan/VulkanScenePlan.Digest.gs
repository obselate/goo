package Goo

import System

internal partial class SceneFrame {
  internal func SemanticDigest() uint64 {
    RequireClosedChunk()
    var hash = HashOffset
    hash = Mix(hash, uint64(chunkCount))
    for index in 0 ... chunkCount {
      let chunk = chunks[index]
      hash = HashBounds(hash, chunk.Bounds)
      hash = Mix(hash, uint64(chunk.DrawCount))
      hash = Mix(hash, uint64(chunk.ResourceCount))
    }
    hash = Mix(hash, uint64(drawRefCount))
    for index in 0 ... drawRefCount {
      let value = drawRefs[index]
      hash = Mix(hash, uint64(int32(value.Kind)))
      hash = Mix(hash, uint64(value.Index))
      hash = Mix(hash, uint64(value.Flags))
      hash = Mix(hash, uint64(value.ClipChainId))
    }
    hash = Mix(hash, uint64(resourceRefCount))
    for index in 0 ... resourceRefCount {
      hash = HashResource(hash, resourceRefs[index])
    }
    hash = Mix(hash, uint64(solidBoxCount))
    for index in 0 ... solidBoxCount {
      hash = HashSolidBox(hash, solidBoxes[index])
    }
    hash = Mix(hash, uint64(roundedBoxCount))
    for index in 0 ... roundedBoxCount {
      hash = HashRoundedBox(hash, roundedBoxes[index])
    }
    hash = Mix(hash, uint64(perEdgeBorderCount))
    for index in 0 ... perEdgeBorderCount {
      let value = perEdgeBorders[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.TopWidth)
      hash = HashFloat(hash, value.RightWidth)
      hash = HashFloat(hash, value.BottomWidth)
      hash = HashFloat(hash, value.LeftWidth)
      if value.RadiusTopLeft != 0.0F || value.RadiusTopRight != 0.0F
        || value.RadiusBottomRight != 0.0F || value.RadiusBottomLeft != 0.0F {
          hash = Mix(hash, 1uL)
          hash = HashFloat(hash, value.RadiusTopLeft)
          hash = HashFloat(hash, value.RadiusTopRight)
          hash = HashFloat(hash, value.RadiusBottomRight)
          hash = HashFloat(hash, value.RadiusBottomLeft)
        }
      hash = Mix(hash, uint64(value.TopColor))
      hash = Mix(hash, uint64(value.RightColor))
      hash = Mix(hash, uint64(value.BottomColor))
      hash = Mix(hash, uint64(value.LeftColor))
      hash = Mix(hash, uint64(value.Style))
      hash = Mix(hash, uint64(value.TransformIndex))
    }
    hash = Mix(hash, uint64(gradientStopCount))
    for index in 0 ... gradientStopCount {
      let value = gradientStops[index]
      hash = HashFloat(hash, value.Offset)
      hash = Mix(hash, uint64(value.Color))
    }
    hash = Mix(hash, uint64(linearGradientCount))
    for index in 0 ... linearGradientCount {
      let value = linearGradients[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.RadiusTopLeft)
      hash = HashFloat(hash, value.RadiusTopRight)
      hash = HashFloat(hash, value.RadiusBottomRight)
      hash = HashFloat(hash, value.RadiusBottomLeft)
      hash = HashFloat(hash, value.StartX)
      hash = HashFloat(hash, value.StartY)
      hash = HashFloat(hash, value.EndX)
      hash = HashFloat(hash, value.EndY)
      hash = Mix(hash, uint64(value.StopStart))
      hash = Mix(hash, uint64(value.StopCount))
      hash = HashFloat(hash, value.Opacity)
      hash = Mix(hash, uint64(value.TransformIndex))
    }
    hash = Mix(hash, uint64(radialGradientCount))
    for index in 0 ... radialGradientCount {
      let value = radialGradients[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.RadiusTopLeft)
      hash = HashFloat(hash, value.RadiusTopRight)
      hash = HashFloat(hash, value.RadiusBottomRight)
      hash = HashFloat(hash, value.RadiusBottomLeft)
      hash = HashFloat(hash, value.CenterX)
      hash = HashFloat(hash, value.CenterY)
      hash = HashFloat(hash, value.RadiusX)
      hash = HashFloat(hash, value.RadiusY)
      hash = Mix(hash, uint64(value.StopStart))
      hash = Mix(hash, uint64(value.StopCount))
      hash = HashFloat(hash, value.Opacity)
      hash = Mix(hash, uint64(value.TransformIndex))
    }
    hash = Mix(hash, uint64(cachedImageCount))
    for index in 0 ... cachedImageCount {
      hash = HashCachedImage(hash, cachedImages[index])
    }
    hash = Mix(hash, uint64(cachedTextSegmentCount))
    for index in 0 ... cachedTextSegmentCount {
      hash = HashCachedTextSegment(hash, cachedTextSegments[index])
    }
    hash = Mix(hash, uint64(analyticPathBandCount))
    for index in 0 ... analyticPathBandCount {
      hash = HashAnalyticPathBand(hash, analyticPathBands[index])
    }
    hash = Mix(hash, uint64(transformCount))
    for index in 0 ... transformCount {
      hash = HashTransform(hash, transforms[index])
    }
    hash = Mix(hash, uint64(rectClipCount))
    for index in 0 ... rectClipCount {
      hash = HashRectClip(hash, rectClips[index])
    }
    hash = Mix(hash, uint64(clipMaskCount))
    for index in 0 ... clipMaskCount {
      let value = clipMasks[index]
      hash = Mix(hash, value.StableId)
      hash = HashResource(hash, value.PathId)
      hash = HashResource(hash, value.AtlasId)
      hash = Mix(hash, uint64(value.AtlasWordOffset))
      hash = Mix(hash, uint64(value.AtlasWordCount))
      hash = HashBounds(hash, value.Bounds)
      hash = HashBounds(hash, value.PathBounds)
      hash = Mix(hash, uint64(int32(value.Fit)))
      hash = Mix(hash, uint64(value.FillRule))
      hash = HashFloat(hash, value.ScaleX)
      hash = HashFloat(hash, value.ScaleY)
      hash = HashFloat(hash, value.TranslateX)
      hash = HashFloat(hash, value.TranslateY)
      hash = Mix(hash, uint64(value.TransformIndex))
      hash = Mix(hash, value.ContentKey)
    }
    hash = Mix(hash, uint64(clipChainCount))
    for index in 0 ... clipChainCount {
      let value = clipChains[index]
      hash = Mix(hash, value.StableId)
      hash = Mix(hash, uint64(value.ParentIndex))
      hash = Mix(hash, uint64(value.MaskIndex))
      hash = Mix(hash, uint64(value.Depth))
      hash = Mix(hash, uint64(value.Flags))
      hash = Mix(hash, value.ContentKey)
    }
    hash = Mix(hash, uint64(shadowCount))
    for index in 0 ... shadowCount {
      hash = HashShadow(hash, shadows[index])
    }
    hash = Mix(hash, uint64(underlineCount))
    for index in 0 ... underlineCount {
      hash = HashUnderline(hash, underlines[index])
    }
    hash = Mix(hash, uint64(lavaCount))
    for index in 0 ... lavaCount {
      hash = HashLava(hash, lavas[index])
    }
    hash = Mix(hash, uint64(layerCount))
    for index in 0 ... layerCount {
      let value = layers[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.OriginX)
      hash = HashFloat(hash, value.OriginY)
      hash = Mix(hash, uint64(value.ExtentWidth))
      hash = Mix(hash, uint64(value.ExtentHeight))
      hash = HashFloat(hash, value.Opacity)
      hash = Mix(hash, uint64(value.BlendMode))
      hash = HashResource(hash, value.OffscreenTargetId)
      hash = Mix(hash, uint64(value.Flags))
      hash = Mix(hash, uint64(value.TransformIndex))
    }
    return hash
  }

  internal func AppendPlaceholderChunk(
    ownerId uint64,
    version uint64,
    bounds ConservativeBounds) int32{
      RequireClosedChunk()
      Grow[SceneChunk](&chunks, chunkCount, NextCount(chunkCount))
      let index = chunkCount
      var contentKey = HashBounds(HashOffset, bounds)
      contentKey = Mix(contentKey, 0uL)
      contentKey = Mix(contentKey, 0uL)
      var topologyKey = Mix(HashOffset, 0uL)
      topologyKey = Mix(topologyKey, 0uL)
      chunks[index] = SceneChunk{
        OwnerId: ownerId,
        Version: version,
        Bounds: bounds,
        FirstDraw: drawRefCount,
        DrawCount: 0,
        FirstResource: resourceRefCount,
        ResourceCount: 0,
        ContentKey: contentKey,
        TopologyKey: topologyKey,
        Dirty: true,
        RetentionState: SceneChunkRetentionState.Generic,
      }
      chunkCount = NextCount(chunkCount)
      chunkOperations = chunkOperations + 1uL
      return index
    }

  internal func ChunkTopologyDigest(chunkIndex int32) uint64 {
    RequireClosedChunk()
    if chunkIndex < 0 || chunkIndex >= chunkCount {
      throw ArgumentOutOfRangeException("chunkIndex")
    }
    let chunk = chunks[chunkIndex]
    var hash = HashOffset
    hash = Mix(hash, uint64(chunk.DrawCount))
    hash = Mix(hash, uint64(chunk.ResourceCount))
    for index in chunk.FirstDraw ... chunk.FirstDraw + chunk.DrawCount {
      let reference = drawRefs[index]
      hash = Mix(hash, uint64(int32(reference.Kind)))
      hash = Mix(hash, uint64(reference.Flags))
      hash = Mix(hash, uint64(reference.ClipChainId))
    }
    for index in chunk.FirstResource ... chunk.FirstResource + chunk.ResourceCount {
      hash = Mix(hash, uint64(int32(resourceRefs[index].Kind)))
    }
    return hash
  }

  internal func ChunkContentDigest(chunkIndex int32) uint64 {
    RequireClosedChunk()
    if chunkIndex < 0 || chunkIndex >= chunkCount {
      throw ArgumentOutOfRangeException("chunkIndex")
    }
    let chunk = chunks[chunkIndex]
    var hash = HashOffset
    hash = HashBounds(hash, chunk.Bounds)
    hash = Mix(hash, uint64(chunk.DrawCount))
    hash = Mix(hash, uint64(chunk.ResourceCount))
    for index in chunk.FirstDraw ... chunk.FirstDraw + chunk.DrawCount {
      let reference = drawRefs[index]
      hash = Mix(hash, uint64(int32(reference.Kind)))
      hash = Mix(hash, uint64(reference.Flags))
      hash = Mix(hash, uint64(reference.ClipChainId))
      hash = HashDrawContent(hash, reference)
    }
    for index in chunk.FirstResource ... chunk.FirstResource + chunk.ResourceCount {
      hash = HashResource(hash, resourceRefs[index])
    }
    return hash
  }

  private func HashDrawContent(hash uint64, reference DrawRef) uint64 {
    var result = hash
    switch reference.Kind {
      case SceneDrawKind.SolidBox {
        return HashSolidBox(result, solidBoxes[reference.Index])
      }
      case SceneDrawKind.RoundedBox {
        return HashRoundedBox(result, roundedBoxes[reference.Index])
      }
      case SceneDrawKind.PerEdgeBorder {
        let value = perEdgeBorders[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = HashFloat(result, value.TopWidth)
        result = HashFloat(result, value.RightWidth)
        result = HashFloat(result, value.BottomWidth)
        result = HashFloat(result, value.LeftWidth)
        result = HashFloat(result, value.RadiusTopLeft)
        result = HashFloat(result, value.RadiusTopRight)
        result = HashFloat(result, value.RadiusBottomRight)
        result = HashFloat(result, value.RadiusBottomLeft)
        result = Mix(result, uint64(value.TopColor))
        result = Mix(result, uint64(value.RightColor))
        result = Mix(result, uint64(value.BottomColor))
        result = Mix(result, uint64(value.LeftColor))
        result = Mix(result, uint64(value.Style))
        return HashTransformIndex(result, value.TransformIndex)
      }
      case SceneDrawKind.LinearGradient {
        let value = linearGradients[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = HashFloat(result, value.RadiusTopLeft)
        result = HashFloat(result, value.RadiusTopRight)
        result = HashFloat(result, value.RadiusBottomRight)
        result = HashFloat(result, value.RadiusBottomLeft)
        result = HashFloat(result, value.StartX)
        result = HashFloat(result, value.StartY)
        result = HashFloat(result, value.EndX)
        result = HashFloat(result, value.EndY)
        result = HashFloat(result, value.Opacity)
        result = HashGradientStops(result, value.StopStart, value.StopCount)
        return HashTransformIndex(result, value.TransformIndex)
      }
      case SceneDrawKind.RadialGradient {
        let value = radialGradients[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = HashFloat(result, value.RadiusTopLeft)
        result = HashFloat(result, value.RadiusTopRight)
        result = HashFloat(result, value.RadiusBottomRight)
        result = HashFloat(result, value.RadiusBottomLeft)
        result = HashFloat(result, value.CenterX)
        result = HashFloat(result, value.CenterY)
        result = HashFloat(result, value.RadiusX)
        result = HashFloat(result, value.RadiusY)
        result = HashFloat(result, value.Opacity)
        result = HashGradientStops(result, value.StopStart, value.StopCount)
        return HashTransformIndex(result, value.TransformIndex)
      }
      case SceneDrawKind.CachedImage {
        return HashCachedImage(result, cachedImages[reference.Index])
      }
      case SceneDrawKind.CachedTextSegment {
        return HashCachedTextSegment(result, cachedTextSegments[reference.Index])
      }
      case SceneDrawKind.AnalyticPathBand {
        return HashAnalyticPathBand(result, analyticPathBands[reference.Index])
      }
      case SceneDrawKind.Transform {
        return HashTransform(result, transforms[reference.Index])
      }
      case SceneDrawKind.RectClipBegin {
        return HashRectClip(result, rectClips[reference.Index])
      }
      case SceneDrawKind.RectClipEnd {
        return HashRectClip(result, rectClips[reference.Index])
      }
      case SceneDrawKind.Shadow {
        return HashShadow(result, shadows[reference.Index])
      }
      case SceneDrawKind.Underline {
        return HashUnderline(result, underlines[reference.Index])
      }
      case SceneDrawKind.Lava {
        return HashLava(result, lavas[reference.Index])
      }
      case SceneDrawKind.LayerBegin {
        return HashLayerContent(result, reference.Index)
      }
      case SceneDrawKind.LayerEnd {
        return HashLayerContent(result, reference.Index)
      }
      default {
        return result
      }
    }
  }

  private func HashSolidBox(hash uint64, value SolidBoxRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = Mix(result, uint64(value.Color))
    result = HashFloat(result, value.Opacity)
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashRoundedBox(hash uint64, value RoundedBoxRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = HashFloat(result, value.RadiusTopLeft)
    result = HashFloat(result, value.RadiusTopRight)
    result = HashFloat(result, value.RadiusBottomRight)
    result = HashFloat(result, value.RadiusBottomLeft)
    result = HashFloat(result, value.OpaqueBorderWidth)
    result = HashFloat(result, value.OpaqueBorderHeight)
    result = Mix(result, uint64(value.Color))
    result = HashFloat(result, value.Opacity)
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashCachedImage(hash uint64, value CachedImageRefRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = HashResource(result, value.ImageId)
    result = HashResource(result, value.SamplerId)
    result = HashFloat(result, value.SourceX)
    result = HashFloat(result, value.SourceY)
    result = HashFloat(result, value.SourceWidth)
    result = HashFloat(result, value.SourceHeight)
    result = HashFloat(result, value.Opacity)
    result = Mix(result, uint64(value.Sampling))
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashCachedTextSegment(hash uint64, value CachedTextSegmentRefRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = Mix(result, value.SegmentId)
    result = Mix(result, value.SegmentVersion)
    result = Mix(result, uint64(value.GlyphCount))
    return Mix(result, uint64(value.ClipChainId))
  }

  private func HashAnalyticPathBand(hash uint64, value AnalyticPathBandRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = HashResource(result, value.PathId)
    result = HashResource(result, value.AtlasId)
    result = Mix(result, uint64(value.AtlasWordOffset))
    result = Mix(result, uint64(value.AtlasWordCount))
    result = Mix(result, uint64(value.FillColor))
    result = Mix(result, uint64(value.FillRule))
    result = HashFloat(result, value.Opacity)
    result = HashFloat(result, value.ScaleX)
    result = HashFloat(result, value.ScaleY)
    result = HashFloat(result, value.TranslateX)
    result = HashFloat(result, value.TranslateY)
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashTransform(hash uint64, value TransformRecord) uint64 {
    var result = HashFloat(hash, value.A)
    result = HashFloat(result, value.B)
    result = HashFloat(result, value.C)
    result = HashFloat(result, value.D)
    result = HashFloat(result, value.TX)
    result = HashFloat(result, value.TY)
    return Mix(result, uint64(value.ParentIndex))
  }

  private func HashRectClip(hash uint64, value RectClipRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = HashTransformIndex(result, value.TransformIndex)
    return Mix(result, uint64(value.ParentIndex))
  }

  private func HashShadow(hash uint64, value ShadowRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = HashFloat(result, value.RadiusTopLeft)
    result = HashFloat(result, value.RadiusTopRight)
    result = HashFloat(result, value.RadiusBottomRight)
    result = HashFloat(result, value.RadiusBottomLeft)
    result = HashFloat(result, value.OffsetX)
    result = HashFloat(result, value.OffsetY)
    result = HashFloat(result, value.Spread)
    result = HashFloat(result, value.Blur)
    result = Mix(result, uint64(value.Color))
    result = HashResource(result, value.MaskId)
    result = Mix(result, uint64(value.MaskIndex))
    result = Mix(result, value.Inset ? 1uL : 0uL)
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashUnderline(hash uint64, value UnderlineRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = HashFloat(result, value.Thickness)
    result = Mix(result, uint64(value.Color))
    result = Mix(result, uint64(value.Mode))
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashLava(hash uint64, value LavaRecord) uint64 {
    var result = HashBounds(hash, value.Bounds)
    result = HashFloat(result, value.Flow)
    result = HashFloat(result, value.Form)
    result = HashFloat(result, value.Blend)
    result = HashFloat(result, value.Light)
    result = HashFloat(result, value.Hue)
    result = Mix(result, uint64(value.Rainbow))
    result = HashFloat(result, float32(value.Rotation.X))
    result = HashFloat(result, float32(value.Rotation.Y))
    result = Mix(result, uint64(value.Seed))
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashTransformIndex(hash uint64, index int32) uint64 -> Mix(hash, uint64(index))

  private func HashLayerContent(hash uint64, index int32) uint64 {
    let value = layers[index]
    var result = HashBounds(hash, value.Bounds)
    result = HashFloat(result, value.OriginX)
    result = HashFloat(result, value.OriginY)
    result = Mix(result, uint64(value.ExtentWidth))
    result = Mix(result, uint64(value.ExtentHeight))
    result = HashFloat(result, value.Opacity)
    result = Mix(result, uint64(value.BlendMode))
    result = HashResource(result, value.OffscreenTargetId)
    result = Mix(result, value.EffectProgramId)
    result = Mix(result, value.EffectVersion)
    result = Mix(result, uint64(value.EffectIndex))
    if value.EffectIndex >= 0 {
      let effect = shaderEffects[value.EffectIndex]
      result = HashFloat(result, effect.ElapsedSeconds)
      result = HashVector4(result, effect.Parameter0)
      result = HashVector4(result, effect.Parameter1)
      result = HashVector4(result, effect.Parameter2)
      result = HashVector4(result, effect.Parameter3)
      result = HashVector4(result, effect.Parameter4)
      result = HashVector4(result, effect.Parameter5)
      result = HashVector4(result, effect.Parameter6)
      result = HashVector4(result, effect.Parameter7)
    }
    result = Mix(result, uint64(value.Flags))
    return HashTransformIndex(result, value.TransformIndex)
  }

  private func HashVector4(hash uint64, value System.Numerics.Vector4) uint64 {
    var result = HashFloat(hash, value.X)
    result = HashFloat(result, value.Y)
    result = HashFloat(result, value.Z)
    return HashFloat(result, value.W)
  }

  private func HashGradientStops(hash uint64, start int32, count int32) uint64 {
    var result = Mix(hash, uint64(start))
    result = Mix(result, uint64(count))
    for index in start ... start + count {
      let stop = gradientStops[index]
      result = HashFloat(result, stop.Offset)
      result = Mix(result, uint64(stop.Color))
    }
    return result
  }

  private func AddRectClip(value RectClipRecord, begin bool) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    ValidateRectClipParentIndex(value.ParentIndex)
    let index = AppendRecord(&rectClips, &rectClipCount, value)
    AppendDrawRef(DrawRef{
      Kind: begin ? SceneDrawKind.RectClipBegin : SceneDrawKind.RectClipEnd,
      Index: index,
      Flags: 0u,
      ClipChainId: 0,
    })
    return index
  }

  private func AddLayer(value LayerRecord, begin bool) int32 {
    RequireOpenChunk()
    ValidateLayer(value)
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&layers, &layerCount, value)
    AppendResourceIfValid(value.OffscreenTargetId)
    if value.EffectIndex >= 0 {
      AppendResourceIfValid(ResourceId{
        Kind: SceneResourceKind.Pipeline,
        LogicalId: value.EffectProgramId,
        Version: 1uL,
      })
    }
    AppendDrawRef(DrawRef{
      Kind: begin ? SceneDrawKind.LayerBegin : SceneDrawKind.LayerEnd,
      Index: index,
      Flags: 0u,
      ClipChainId: 0,
    })
    return index
  }

  private func ValidateLayer(value LayerRecord) {
    if !value.OffscreenTargetId.IsValid
      || value.OffscreenTargetId.Kind != SceneResourceKind.OffscreenTarget{
        throw ArgumentException("layer target resource is invalid")
      }
    if value.ExtentWidth == 0u || value.ExtentHeight == 0u {
      throw ArgumentOutOfRangeException("layer extent")
    }
    if Single.IsNaN(value.OriginX) || Single.IsInfinity(value.OriginX)
      || Single.IsNaN(value.OriginY) || Single.IsInfinity(value.OriginY) {
        throw ArgumentException("layer origin")
      }
    if Single.IsNaN(value.Opacity) || Single.IsInfinity(value.Opacity)
      || value.Opacity < 0.0F || value.Opacity > 1.0F {
        throw ArgumentOutOfRangeException("layer opacity")
      }
    if value.BlendMode > uint32(int32(BlendMode.Luminosity)) {
      throw NotSupportedException("unknown layer blend mode")
    }
    if value.EffectIndex < -1 || value.EffectIndex >= shaderEffectCount {
      throw ArgumentOutOfRangeException("layer effect index")
    }
    if value.EffectIndex >= 0 {
      let effect = shaderEffects[value.EffectIndex]
      if effect.Program == nil || effect.ProgramId != value.EffectProgramId
        || effect.Version != value.EffectVersion{
          throw ArgumentException("layer effect identity is invalid")
        }
      let dataOffset = uint64(effect.DataWordOffset) * 4uL
      if effect.DataByteCount < 32
        || dataOffset + uint64(effect.DataByteCount) > uint64(shaderEffectDataCount) {
          throw ArgumentException("layer effect data is invalid")
        }
    } else if value.EffectProgramId != 0uL || value.EffectVersion != 0uL {
      throw ArgumentException("layer effect identity is unexpected")
    }
  }

  private func AppendDrawRef(value DrawRef) int32 {
    RequireOpenChunk()
    Grow[DrawRef](&drawRefs, drawRefCount, NextCount(drawRefCount))
    let index = drawRefCount
    drawRefs[index] = DrawRef{
      Kind: value.Kind,
      Index: value.Index,
      Flags: value.Flags,
      ClipChainId: activeClipChainId,
    }
    drawRefCount = NextCount(drawRefCount)
    drawReferenceOperations = drawReferenceOperations + 1uL
    return index
  }

  private func AppendResourceReference(value ResourceId) int32 {
    RequireOpenChunk()
    Grow[ResourceId](&resourceRefs, resourceRefCount, NextCount(resourceRefCount))
    let index = resourceRefCount
    resourceRefs[index] = value
    resourceRefCount = NextCount(resourceRefCount)
    resourceReferenceOperations = resourceReferenceOperations + 1uL
    return index
  }

  private func AppendResourceIfValid(value ResourceId) {
    if value.IsValid {
      AppendResourceReference(value)
    }
  }

  private func RequireOpenChunk() {
    if activeChunk < 0 || activeChunk >= chunkCount {
      throw InvalidOperationException("SceneFrame requires an open chunk")
    }
  }

  private func RequireClosedChunk() {
    if activeChunk >= 0 {
      throw InvalidOperationException("SceneFrame has an open chunk")
    }
  }

  private func NextCount(current int32) int32 {
    if current >= Int32.MaxValue {
      throw OverflowException("SceneFrame count overflow")
    }
    return current + 1
  }

  private func ValidateGradientRange(start int32, count int32) {
    if start < 0 || count < 2
      || start > gradientStopCount || count > gradientStopCount - start{
        throw ArgumentOutOfRangeException("gradient stop range")
      }
  }

  private func ValidateTransformIndex(index int32) {
    if index == -1 { return }
    if index < 0 || index >= transformCount {
      throw ArgumentOutOfRangeException("transform index")
    }
  }

  private func ValidateTransformParentIndex(index int32) {
    ValidateTransformIndex(index)
  }

  private func ValidateRectClipParentIndex(index int32) {
    if index == -1 { return }
    if index < 0 || index >= rectClipCount {
      throw ArgumentOutOfRangeException("rect clip parent index")
    }
  }

  private func ValidateClipChainIndex(index int32) {
    if index < 0 || index >= clipChainCount {
      throw ArgumentOutOfRangeException("clip chain index")
    }
  }

  private func ValidateClipChainParentIndex(index int32) {
    ValidateClipChainIndex(index)
  }

  private func GrowthCapacity(current int32, required int32) int32 {
    if required <= current { return current }
    var next = current
    while next < required {
      if next > Int32.MaxValue / 2 {
        next = required
        break
      }
      next = next * 2
    }
    return next
  }

  private func Mix(hash uint64, value uint64) uint64 -> (hash ^ value) * HashPrime

  private func HashFloat(hash uint64, value float32) uint64 -> Mix(hash, uint64(uint32(BitConverter.SingleToInt32Bits(value))))

  private func HashResource(hash uint64, value ResourceId) uint64 {
    var result = Mix(hash, uint64(int32(value.Kind)))
    result = Mix(result, value.LogicalId)
    return Mix(result, value.Version)
  }

  private func HashBounds(hash uint64, value ConservativeBounds) uint64 {
    var result = HashFloat(hash, value.X)
    result = HashFloat(result, value.Y)
    result = HashFloat(result, value.Width)
    return HashFloat(result, value.Height)
  }
}
