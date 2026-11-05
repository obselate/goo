package Goo

import System

internal struct VulkanSceneRangeBinding {
    internal var Start VulkanSceneRangePosition
    internal var End VulkanSceneRangePosition
    internal var Destination VulkanSceneRangePosition
    internal var PreviousContext VulkanSceneTraversalContext
    internal var Context VulkanSceneTraversalContext

    internal func Index(value int32, first int32, end int32, destination int32) int32 ->
    value >= first && value < end ? destination + value - first: value

    internal func Transform(value int32) int32 {
        if value >= Start.Transforms && value < End.Transforms {
            return Destination.Transforms + value - Start.Transforms
        }
        if value == PreviousContext.ParentTransformIndex {
            return Context.ParentTransformIndex
        }
        return value == PreviousContext.RoundedOverflowTransformIndex
        ? Context.RoundedOverflowTransformIndex: value
    }

    internal func RectClip(value int32) int32 -> value == PreviousContext.ParentRectClipIndex
    ? Context.ParentRectClipIndex: Index(value, Start.RectClips, End.RectClips, Destination.RectClips)

    internal func ClipChain(value int32) int32 -> value == PreviousContext.ParentPathClipChainId
    ? Context.ParentPathClipChainId: Index(value, Start.ClipChains, End.ClipChains, Destination.ClipChains)

    internal func Layer(value int32) int32 -> value == PreviousContext.RoundedOverflowLayerId
    ? Context.RoundedOverflowLayerId: value > 0
    ? Index(value - 1, Start.Layers, End.Layers, Destination.Layers) + 1: 0

    internal func Position(value VulkanSceneRangePosition) VulkanSceneRangePosition -> VulkanSceneRangePosition{
        Chunks: Destination.Chunks + value.Chunks - Start.Chunks,
        DrawRefs: Destination.DrawRefs + value.DrawRefs - Start.DrawRefs,
        ResourceRefs: Destination.ResourceRefs + value.ResourceRefs - Start.ResourceRefs,
        SolidBoxes: Destination.SolidBoxes + value.SolidBoxes - Start.SolidBoxes,
        RoundedBoxes: Destination.RoundedBoxes + value.RoundedBoxes - Start.RoundedBoxes,
        PerEdgeBorders: Destination.PerEdgeBorders + value.PerEdgeBorders - Start.PerEdgeBorders,
        GradientStops: Destination.GradientStops + value.GradientStops - Start.GradientStops,
        LinearGradients: Destination.LinearGradients + value.LinearGradients - Start.LinearGradients,
        RadialGradients: Destination.RadialGradients + value.RadialGradients - Start.RadialGradients,
        CachedImages: Destination.CachedImages + value.CachedImages - Start.CachedImages,
        AnalyticPathBands: Destination.AnalyticPathBands + value.AnalyticPathBands - Start.AnalyticPathBands,
        Transforms: Destination.Transforms + value.Transforms - Start.Transforms,
        RectClips: Destination.RectClips + value.RectClips - Start.RectClips,
        ClipMasks: Destination.ClipMasks + value.ClipMasks - Start.ClipMasks,
        ClipChains: Destination.ClipChains + value.ClipChains - Start.ClipChains,
        Shadows: Destination.Shadows + value.Shadows - Start.Shadows,
        Underlines: Destination.Underlines + value.Underlines - Start.Underlines,
        Layers: Destination.Layers + value.Layers - Start.Layers,
        Text: Destination.Text + value.Text - Start.Text,
        Effects: Destination.Effects + value.Effects - Start.Effects,
    }

    internal func Traversal(value VulkanSceneTraversalContext) VulkanSceneTraversalContext {
        var result = value
        result.ParentTransformIndex = Transform(value.ParentTransformIndex)
        result.ParentRectClipIndex = RectClip(value.ParentRectClipIndex)
        result.ParentPathClipChainId = ClipChain(value.ParentPathClipChainId)
        result.RoundedOverflowTransformIndex = Transform(value.RoundedOverflowTransformIndex)
        result.RoundedOverflowLayerId = Layer(value.RoundedOverflowLayerId)
        return result
    }

    internal func Draw(value DrawRef) DrawRef {
        var result = value
        result.ClipChainId = ClipChain(value.ClipChainId)
        switch value.Kind {
            case SceneDrawKind.SolidBox {
                result.Index = Index(value.Index, Start.SolidBoxes, End.SolidBoxes, Destination.SolidBoxes)
            }
            case SceneDrawKind.RoundedBox {
                result.Index = Index(value.Index, Start.RoundedBoxes, End.RoundedBoxes, Destination.RoundedBoxes)
            }
            case SceneDrawKind.PerEdgeBorder {
                result.Index = Index(value.Index, Start.PerEdgeBorders, End.PerEdgeBorders, Destination.PerEdgeBorders)
            }
            case SceneDrawKind.LinearGradient {
                result.Index = Index(
                    value.Index,
                    Start.LinearGradients,
                    End.LinearGradients,
                    Destination.LinearGradients
                )
            }
            case SceneDrawKind.RadialGradient {
                result.Index = Index(
                    value.Index,
                    Start.RadialGradients,
                    End.RadialGradients,
                    Destination.RadialGradients
                )
            }
            case SceneDrawKind.CachedImage {
                result.Index = Index(value.Index, Start.CachedImages, End.CachedImages, Destination.CachedImages)
            }
            case SceneDrawKind.CachedTextSegment {
                result.Index = Index(value.Index, Start.Text, End.Text, Destination.Text)
            }
            case SceneDrawKind.AnalyticPathBand {
                result.Index = Index(
                    value.Index,
                    Start.AnalyticPathBands,
                    End.AnalyticPathBands,
                    Destination.AnalyticPathBands
                )
            }
            case SceneDrawKind.Transform {
                result.Index = Index(value.Index, Start.Transforms, End.Transforms, Destination.Transforms)
            }
            case SceneDrawKind.RectClipBegin {
                result.Index = Index(value.Index, Start.RectClips, End.RectClips, Destination.RectClips)
            }
            case SceneDrawKind.RectClipEnd {
                result.Index = Index(value.Index, Start.RectClips, End.RectClips, Destination.RectClips)
            }
            case SceneDrawKind.Shadow {
                result.Index = Index(value.Index, Start.Shadows, End.Shadows, Destination.Shadows)
            }
            case SceneDrawKind.Underline {
                result.Index = Index(value.Index, Start.Underlines, End.Underlines, Destination.Underlines)
            }
            case SceneDrawKind.LayerBegin {
                result.Index = Index(value.Index, Start.Layers, End.Layers, Destination.Layers)
            }
            case SceneDrawKind.LayerEnd {
                result.Index = Index(value.Index, Start.Layers, End.Layers, Destination.Layers)
            }
            case SceneDrawKind.GeneratorEffect {
                result.Index = Index(value.Index, Start.Layers, End.Layers, Destination.Layers)
            }
            default {
                throw InvalidOperationException("Unknown retained scene drawing kind")
            }
        }
        return result
    }
}

internal partial class SceneFrame {
    internal prop RangeActiveTransformIndex int32 {
        get -> activeTransformIndex
    }

    internal func RangePosition() VulkanSceneRangePosition -> VulkanSceneRangePosition{
        Chunks: chunkCount,
        DrawRefs: drawRefCount,
        ResourceRefs: resourceRefCount,
        SolidBoxes: solidBoxCount,
        RoundedBoxes: roundedBoxCount,
        PerEdgeBorders: perEdgeBorderCount,
        GradientStops: gradientStopCount,
        LinearGradients: linearGradientCount,
        RadialGradients: radialGradientCount,
        CachedImages: cachedImageCount,
        AnalyticPathBands: analyticPathBandCount,
        Transforms: transformCount,
        RectClips: rectClipCount,
        ClipMasks: clipMaskCount,
        ClipChains: clipChainCount,
        Shadows: shadowCount,
        Underlines: underlineCount,
        Layers: layerCount,
        Text: cachedTextSegmentCount,
        Effects: shaderEffectCount,
    }

    internal func AppendRange(
        data VulkanRetainedSceneData,
        binding VulkanSceneRangeBinding,
        activeClip int32,
        activeTransform int32,
        version uint64
    ) bool {
        RequireClosedChunk()
        let start = binding.Start
        let end = binding.End
        let destination = binding.Destination
        let next = binding.Position(end)
        Grow[SceneChunk](&chunks, chunkCount, next.Chunks)
        Grow[DrawRef](&drawRefs, drawRefCount, next.DrawRefs)
        Grow[ResourceId](&resourceRefs, resourceRefCount, next.ResourceRefs)
        Grow[SolidBoxRecord](&solidBoxes, solidBoxCount, next.SolidBoxes)
        Grow[RoundedBoxRecord](&roundedBoxes, roundedBoxCount, next.RoundedBoxes)
        Grow[PerEdgeBorderRecord](&perEdgeBorders, perEdgeBorderCount, next.PerEdgeBorders)
        Grow[GradientStopRecord](&gradientStops, gradientStopCount, next.GradientStops)
        Grow[LinearGradientRecord](&linearGradients, linearGradientCount, next.LinearGradients)
        Grow[RadialGradientRecord](&radialGradients, radialGradientCount, next.RadialGradients)
        Grow[CachedImageRefRecord](&cachedImages, cachedImageCount, next.CachedImages)
        Grow[AnalyticPathBandRecord](&analyticPathBands, analyticPathBandCount, next.AnalyticPathBands)
        Grow[TransformRecord](&transforms, transformCount, next.Transforms)
        Grow[RectClipRecord](&rectClips, rectClipCount, next.RectClips)
        Grow[ClipMaskRecord](&clipMasks, clipMaskCount, next.ClipMasks)
        Grow[ClipChainRecord](&clipChains, clipChainCount, next.ClipChains)
        Grow[ShadowRecord](&shadows, shadowCount, next.Shadows)
        Grow[UnderlineRecord](&underlines, underlineCount, next.Underlines)
        Grow[LayerRecord](&layers, layerCount, next.Layers)
        Grow[CachedTextSegmentRefRecord](&cachedTextSegments, cachedTextSegmentCount, next.Text)
        var completed = false
        try {
            for index in start.Text ... end.Text {
                guard let weak = data.Segments[index] else {
                    return false
                }
                if !weak.TryGetTarget(out var segment) {
                    return false
                }
                var value = data.Text[index]
                if segment.Id != value.SegmentId || segment.Version != value.SegmentVersion {
                    return false
                }
                value.Segment = segment
                value.FirstInstance = -1
                value.ClipChainId = binding.ClipChain(value.ClipChainId)
                cachedTextSegments[destination.Text + index - start.Text] = value
            }
            for index in start.AnalyticPathBands ... end.AnalyticPathBands {
                var value = data.AnalyticPathBands[index]
                if data.PathDashPresent[index] {
                    guard let weak = data.PathDashes[index] else {
                        return false
                    }
                    if !weak.TryGetTarget(out var dashes) {
                        return false
                    }
                    if dashes.Revision != data.PathDashRevisions[index] {
                        return false
                    }
                    value.Stroke = value.Stroke with{Dashes = dashes}
                }
                value.TransformIndex = binding.Transform(value.TransformIndex)
                analyticPathBands[destination.AnalyticPathBands + index - start.AnalyticPathBands] = value
            }
            for index in start.ClipMasks ... end.ClipMasks {
                var value = data.ClipMasks[index]
                if data.MaskDashPresent[index] {
                    guard let weak = data.MaskDashes[index] else {
                        return false
                    }
                    if !weak.TryGetTarget(out var dashes) {
                        return false
                    }
                    if dashes.Revision != data.MaskDashRevisions[index] {
                        return false
                    }
                    value.Stroke = value.Stroke with{Dashes = dashes}
                }
                value.TransformIndex = binding.Transform(value.TransformIndex)
                clipMasks[destination.ClipMasks + index - start.ClipMasks] = value
            }
            for index in start.Chunks ... end.Chunks {
                var value = data.Chunks[index]
                value.FirstDraw += destination.DrawRefs - start.DrawRefs
                value.FirstResource += destination.ResourceRefs - start.ResourceRefs
                value.TransformIndex = binding.Transform(value.TransformIndex)
                value.Version = version
                if value.RetentionState == SceneChunkRetentionState.ExactLeafRebuild {
                    value.RetentionState = SceneChunkRetentionState.ExactLeafHit
                }
                chunks[destination.Chunks + index - start.Chunks] = value
            }
            for index in start.DrawRefs ... end.DrawRefs {
                drawRefs[destination.DrawRefs + index - start.DrawRefs] = binding.Draw(data.DrawRefs[index])
            }
            Array.Copy(
                data.ResourceRefs,
                start.ResourceRefs,
                resourceRefs,
                destination.ResourceRefs,
                end.ResourceRefs - start.ResourceRefs
            )
            Array.Copy(
                data.GradientStops,
                start.GradientStops,
                gradientStops,
                destination.GradientStops,
                end.GradientStops - start.GradientStops
            )
            for index in start.SolidBoxes ... end.SolidBoxes {
                var value = data.SolidBoxes[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                solidBoxes[destination.SolidBoxes + index - start.SolidBoxes] = value
            }
            for index in start.RoundedBoxes ... end.RoundedBoxes {
                var value = data.RoundedBoxes[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                roundedBoxes[destination.RoundedBoxes + index - start.RoundedBoxes] = value
            }
            for index in start.PerEdgeBorders ... end.PerEdgeBorders {
                var value = data.PerEdgeBorders[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                perEdgeBorders[destination.PerEdgeBorders + index - start.PerEdgeBorders] = value
            }
            for index in start.LinearGradients ... end.LinearGradients {
                var value = data.LinearGradients[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                value.StopStart += destination.GradientStops - start.GradientStops
                linearGradients[destination.LinearGradients + index - start.LinearGradients] = value
            }
            for index in start.RadialGradients ... end.RadialGradients {
                var value = data.RadialGradients[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                value.StopStart += destination.GradientStops - start.GradientStops
                radialGradients[destination.RadialGradients + index - start.RadialGradients] = value
            }
            for index in start.CachedImages ... end.CachedImages {
                var value = data.CachedImages[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                cachedImages[destination.CachedImages + index - start.CachedImages] = value
            }
            for index in start.Transforms ... end.Transforms {
                var value = data.Transforms[index]
                value.ParentIndex = binding.Transform(value.ParentIndex)
                transforms[destination.Transforms + index - start.Transforms] = value
            }
            for index in start.RectClips ... end.RectClips {
                var value = data.RectClips[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                value.ParentIndex = binding.RectClip(value.ParentIndex)
                rectClips[destination.RectClips + index - start.RectClips] = value
            }
            for index in start.ClipChains ... end.ClipChains {
                var value = data.ClipChains[index]
                value.ParentIndex = binding.ClipChain(value.ParentIndex)
                value.MaskIndex = binding.Index(value.MaskIndex, start.ClipMasks, end.ClipMasks, destination.ClipMasks)
                clipChains[destination.ClipChains + index - start.ClipChains] = value
            }
            for index in start.Shadows ... end.Shadows {
                var value = data.Shadows[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                shadows[destination.Shadows + index - start.Shadows] = value
            }
            for index in start.Underlines ... end.Underlines {
                var value = data.Underlines[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                underlines[destination.Underlines + index - start.Underlines] = value
            }
            for index in start.Layers ... end.Layers {
                var value = data.Layers[index]
                value.TransformIndex = binding.Transform(value.TransformIndex)
                value.ParentClipLayerId = binding.Layer(value.ParentClipLayerId)
                value.DrawOrdinal = binding.Index(value.DrawOrdinal, start.DrawRefs, end.DrawRefs, destination.DrawRefs)
                layers[destination.Layers + index - start.Layers] = value
            }
            chunkCount = next.Chunks
            drawRefCount = next.DrawRefs
            resourceRefCount = next.ResourceRefs
            solidBoxCount = next.SolidBoxes
            roundedBoxCount = next.RoundedBoxes
            perEdgeBorderCount = next.PerEdgeBorders
            gradientStopCount = next.GradientStops
            linearGradientCount = next.LinearGradients
            radialGradientCount = next.RadialGradients
            cachedImageCount = next.CachedImages
            analyticPathBandCount = next.AnalyticPathBands
            transformCount = next.Transforms
            rectClipCount = next.RectClips
            clipMaskCount = next.ClipMasks
            clipChainCount = next.ClipChains
            shadowCount = next.Shadows
            underlineCount = next.Underlines
            layerCount = next.Layers
            cachedTextSegmentCount = next.Text
            activeClipChainId = binding.ClipChain(activeClip)
            activeTransformIndex = binding.Transform(activeTransform)
            chunkOperations += uint64(end.Chunks - start.Chunks)
            drawReferenceOperations += uint64(end.DrawRefs - start.DrawRefs)
            resourceReferenceOperations += uint64(end.ResourceRefs - start.ResourceRefs)
            completed = true
            return true
        } finally {
            if !completed {
                Array.Clear(cachedTextSegments, destination.Text, next.Text - destination.Text)
                Array.Clear(
                    analyticPathBands,
                    destination.AnalyticPathBands,
                    next.AnalyticPathBands - destination.AnalyticPathBands
                )
                Array.Clear(clipMasks, destination.ClipMasks, next.ClipMasks - destination.ClipMasks)
            }
        }
    }
}
