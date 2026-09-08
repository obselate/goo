package Goo

import System

internal partial class SceneFrame {
  internal func SemanticDigest() uint64 {
    RequireClosedChunk()
    var hash = HashOffset
    hash = Mix(hash, uint64(chunkCount))
    var index int32 = 0
    while index < chunkCount {
      let chunk = chunks[index]
      hash = HashBounds(hash, chunk.Bounds)
      hash = Mix(hash, uint64(chunk.DrawCount))
      hash = Mix(hash, uint64(chunk.ResourceCount))
      index = index + 1
    }
    hash = Mix(hash, uint64(drawRefCount))
    index = 0
    while index < drawRefCount {
      let value = drawRefs[index]
      hash = Mix(hash, uint64(int32(value.Kind)))
      hash = Mix(hash, uint64(value.Index))
      hash = Mix(hash, uint64(value.Flags))
      hash = Mix(hash, uint64(value.ClipChainId))
      index = index + 1
    }
    hash = Mix(hash, uint64(resourceRefCount))
    index = 0
    while index < resourceRefCount {
      hash = HashResource(hash, resourceRefs[index])
      index = index + 1
    }
    hash = Mix(hash, uint64(solidBoxCount))
    index = 0
    while index < solidBoxCount {
      let value = solidBoxes[index]
      hash = HashBounds(hash, value.Bounds)
      hash = Mix(hash, uint64(value.Color))
      hash = HashFloat(hash, value.Opacity)
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(roundedBoxCount))
    index = 0
    while index < roundedBoxCount {
      let value = roundedBoxes[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.RadiusTopLeft)
      hash = HashFloat(hash, value.RadiusTopRight)
      hash = HashFloat(hash, value.RadiusBottomRight)
      hash = HashFloat(hash, value.RadiusBottomLeft)
      hash = Mix(hash, uint64(value.Color))
      hash = HashFloat(hash, value.Opacity)
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(perEdgeBorderCount))
    index = 0
    while index < perEdgeBorderCount {
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
      index = index + 1
    }
    hash = Mix(hash, uint64(gradientStopCount))
    index = 0
    while index < gradientStopCount {
      let value = gradientStops[index]
      hash = HashFloat(hash, value.Offset)
      hash = Mix(hash, uint64(value.Color))
      index = index + 1
    }
    hash = Mix(hash, uint64(linearGradientCount))
    index = 0
    while index < linearGradientCount {
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
      index = index + 1
    }
    hash = Mix(hash, uint64(radialGradientCount))
    index = 0
    while index < radialGradientCount {
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
      index = index + 1
    }
    hash = Mix(hash, uint64(cachedImageCount))
    index = 0
    while index < cachedImageCount {
      let value = cachedImages[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashResource(hash, value.ImageId)
      hash = HashResource(hash, value.SamplerId)
      hash = HashFloat(hash, value.SourceX)
      hash = HashFloat(hash, value.SourceY)
      hash = HashFloat(hash, value.SourceWidth)
      hash = HashFloat(hash, value.SourceHeight)
      hash = HashFloat(hash, value.Opacity)
      hash = Mix(hash, uint64(value.Sampling))
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(cachedTextSegmentCount))
    index = 0
    while index < cachedTextSegmentCount {
      let value = cachedTextSegments[index]
      hash = HashBounds(hash, value.Bounds)
      hash = Mix(hash, value.SegmentId)
      hash = Mix(hash, value.SegmentVersion)
      hash = Mix(hash, uint64(value.GlyphCount))
      hash = Mix(hash, uint64(value.ClipChainId))
      index = index + 1
    }
    hash = Mix(hash, uint64(analyticPathBandCount))
    index = 0
    while index < analyticPathBandCount {
      let value = analyticPathBands[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashResource(hash, value.PathId)
      hash = HashResource(hash, value.AtlasId)
      hash = Mix(hash, uint64(value.AtlasWordOffset))
      hash = Mix(hash, uint64(value.AtlasWordCount))
      hash = Mix(hash, uint64(value.FillColor))
      hash = Mix(hash, uint64(value.FillRule))
      hash = HashFloat(hash, value.Opacity)
      hash = HashFloat(hash, value.ScaleX)
      hash = HashFloat(hash, value.ScaleY)
      hash = HashFloat(hash, value.TranslateX)
      hash = HashFloat(hash, value.TranslateY)
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(transformCount))
    index = 0
    while index < transformCount {
      let value = transforms[index]
      hash = HashFloat(hash, value.A)
      hash = HashFloat(hash, value.B)
      hash = HashFloat(hash, value.C)
      hash = HashFloat(hash, value.D)
      hash = HashFloat(hash, value.TX)
      hash = HashFloat(hash, value.TY)
      hash = Mix(hash, uint64(value.ParentIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(rectClipCount))
    index = 0
    while index < rectClipCount {
      let value = rectClips[index]
      hash = HashBounds(hash, value.Bounds)
      hash = Mix(hash, uint64(value.TransformIndex))
      hash = Mix(hash, uint64(value.ParentIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(clipMaskCount))
    index = 0
    while index < clipMaskCount {
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
      index = index + 1
    }
    hash = Mix(hash, uint64(clipChainCount))
    index = 0
    while index < clipChainCount {
      let value = clipChains[index]
      hash = Mix(hash, value.StableId)
      hash = Mix(hash, uint64(value.ParentIndex))
      hash = Mix(hash, uint64(value.MaskIndex))
      hash = Mix(hash, uint64(value.Depth))
      hash = Mix(hash, uint64(value.Flags))
      hash = Mix(hash, value.ContentKey)
      index = index + 1
    }
    hash = Mix(hash, uint64(shadowCount))
    index = 0
    while index < shadowCount {
      let value = shadows[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.RadiusTopLeft)
      hash = HashFloat(hash, value.RadiusTopRight)
      hash = HashFloat(hash, value.RadiusBottomRight)
      hash = HashFloat(hash, value.RadiusBottomLeft)
      hash = HashFloat(hash, value.OffsetX)
      hash = HashFloat(hash, value.OffsetY)
      hash = HashFloat(hash, value.Spread)
      hash = HashFloat(hash, value.Blur)
      hash = Mix(hash, uint64(value.Color))
      hash = HashResource(hash, value.MaskId)
      hash = Mix(hash, uint64(value.MaskIndex))
      hash = Mix(hash, value.Inset ? 1uL : 0uL)
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(underlineCount))
    index = 0
    while index < underlineCount {
      let value = underlines[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.Thickness)
      hash = Mix(hash, uint64(value.Color))
      hash = Mix(hash, uint64(value.Mode))
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(lavaCount))
    index = 0
    while index < lavaCount {
      let value = lavas[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashFloat(hash, value.Flow)
      hash = HashFloat(hash, value.Form)
      hash = HashFloat(hash, value.Blend)
      hash = HashFloat(hash, value.Light)
      hash = HashFloat(hash, value.Hue)
      hash = Mix(hash, uint64(value.Rainbow))
      hash = HashFloat(hash, float32(value.Rotation.X))
      hash = HashFloat(hash, float32(value.Rotation.Y))
      hash = Mix(hash, uint64(value.Seed))
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(customMeshCount))
    index = 0
    while index < customMeshCount {
      let value = customMeshes[index]
      hash = HashBounds(hash, value.Bounds)
      hash = HashResource(hash, value.MeshId)
      hash = HashResource(hash, value.PipelineId)
      hash = Mix(hash, uint64(value.VertexCount))
      hash = Mix(hash, uint64(value.IndexCount))
      hash = Mix(hash, uint64(value.Topology))
      hash = HashFloat(hash, value.Opacity)
      hash = Mix(hash, uint64(value.TransformIndex))
      index = index + 1
    }
    hash = Mix(hash, uint64(layerCount))
    index = 0
    while index < layerCount {
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
      index = index + 1
    }
    return hash
  }

  internal func AppendPlaceholderChunk(
    ownerId uint64,
    version uint64,
    bounds ConservativeBounds) int32{
      RequireClosedChunk()
      GrowChunks(NextCount(chunkCount))
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
    var index = chunk.FirstDraw
    let end = chunk.FirstDraw + chunk.DrawCount
    while index < end {
      let reference = drawRefs[index]
      hash = Mix(hash, uint64(int32(reference.Kind)))
      hash = Mix(hash, uint64(reference.Flags))
      hash = Mix(hash, uint64(reference.ClipChainId))
      index = index + 1
    }
    index = chunk.FirstResource
    let resourceEnd = chunk.FirstResource + chunk.ResourceCount
    while index < resourceEnd {
      hash = Mix(hash, uint64(int32(resourceRefs[index].Kind)))
      index = index + 1
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
    var index = chunk.FirstDraw
    let end = chunk.FirstDraw + chunk.DrawCount
    while index < end {
      let reference = drawRefs[index]
      hash = Mix(hash, uint64(int32(reference.Kind)))
      hash = Mix(hash, uint64(reference.Flags))
      hash = Mix(hash, uint64(reference.ClipChainId))
      hash = HashDrawContent(hash, reference)
      index = index + 1
    }
    index = chunk.FirstResource
    let resourceEnd = chunk.FirstResource + chunk.ResourceCount
    while index < resourceEnd {
      hash = HashResource(hash, resourceRefs[index])
      index = index + 1
    }
    return hash
  }

  private func HashDrawContent(hash uint64, reference DrawRef) uint64 {
    var result = hash
    switch reference.Kind {
      case SceneDrawKind.SolidBox {
        let value = solidBoxes[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = Mix(result, uint64(value.Color))
        result = HashFloat(result, value.Opacity)
        return HashTransformIndex(result, value.TransformIndex)
      }
      case SceneDrawKind.RoundedBox {
        let value = roundedBoxes[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = HashFloat(result, value.RadiusTopLeft)
        result = HashFloat(result, value.RadiusTopRight)
        result = HashFloat(result, value.RadiusBottomRight)
        result = HashFloat(result, value.RadiusBottomLeft)
        result = Mix(result, uint64(value.Color))
        result = HashFloat(result, value.Opacity)
        return HashTransformIndex(result, value.TransformIndex)
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
        let value = cachedImages[reference.Index]
        result = HashBounds(result, value.Bounds)
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
      case SceneDrawKind.CachedTextSegment {
        let value = cachedTextSegments[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = Mix(result, value.SegmentId)
        result = Mix(result, value.SegmentVersion)
        result = Mix(result, uint64(value.GlyphCount))
        return Mix(result, uint64(value.ClipChainId))
      }
      case SceneDrawKind.AnalyticPathBand {
        let value = analyticPathBands[reference.Index]
        result = HashBounds(result, value.Bounds)
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
      case SceneDrawKind.Transform {
        let value = transforms[reference.Index]
        result = HashFloat(result, value.A)
        result = HashFloat(result, value.B)
        result = HashFloat(result, value.C)
        result = HashFloat(result, value.D)
        result = HashFloat(result, value.TX)
        result = HashFloat(result, value.TY)
        return Mix(result, uint64(value.ParentIndex))
      }
      case SceneDrawKind.RectClipBegin {
        return HashRectClipContent(result, reference.Index)
      }
      case SceneDrawKind.RectClipEnd {
        return HashRectClipContent(result, reference.Index)
      }
      case SceneDrawKind.Shadow {
        let value = shadows[reference.Index]
        result = HashBounds(result, value.Bounds)
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
      case SceneDrawKind.Underline {
        let value = underlines[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = HashFloat(result, value.Thickness)
        result = Mix(result, uint64(value.Color))
        result = Mix(result, uint64(value.Mode))
        return HashTransformIndex(result, value.TransformIndex)
      }
      case SceneDrawKind.Lava {
        let value = lavas[reference.Index]
        result = HashBounds(result, value.Bounds)
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
      case SceneDrawKind.CustomMesh {
        let value = customMeshes[reference.Index]
        result = HashBounds(result, value.Bounds)
        result = HashResource(result, value.MeshId)
        result = HashResource(result, value.PipelineId)
        result = Mix(result, uint64(value.VertexCount))
        result = Mix(result, uint64(value.IndexCount))
        result = Mix(result, uint64(value.Topology))
        result = HashFloat(result, value.Opacity)
        return HashTransformIndex(result, value.TransformIndex)
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

  private func HashTransformIndex(hash uint64, index int32) uint64 -> Mix(hash, uint64(index))

  private func HashRectClipContent(hash uint64, index int32) uint64 {
    let value = rectClips[index]
    var result = HashBounds(hash, value.Bounds)
    result = HashTransformIndex(result, value.TransformIndex)
    return Mix(result, uint64(value.ParentIndex))
  }

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
    var index = start
    let end = start + count
    while index < end {
      let stop = gradientStops[index]
      result = HashFloat(result, stop.Offset)
      result = Mix(result, uint64(stop.Color))
      index = index + 1
    }
    return result
  }

  private func AddRectClip(value RectClipRecord, begin bool) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    ValidateRectClipParentIndex(value.ParentIndex)
    GrowRectClips(NextCount(rectClipCount))
    let index = rectClipCount
    rectClips[index] = value
    rectClipCount = NextCount(rectClipCount)
    recordOperations = recordOperations + 1uL
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
    GrowLayers(NextCount(layerCount))
    let index = layerCount
    layers[index] = value
    layerCount = NextCount(layerCount)
    recordOperations = recordOperations + 1uL
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
    GrowDrawRefs(NextCount(drawRefCount))
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
    GrowResourceRefs(NextCount(resourceRefCount))
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
