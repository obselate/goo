package Goo

import System
import System.Runtime.CompilerServices

internal struct VulkanSceneRangePosition {
    internal var Chunks int32
    internal var DrawRefs int32
    internal var ResourceRefs int32
    internal var SolidBoxes int32
    internal var RoundedBoxes int32
    internal var PerEdgeBorders int32
    internal var GradientStops int32
    internal var LinearGradients int32
    internal var RadialGradients int32
    internal var CachedImages int32
    internal var AnalyticPathBands int32
    internal var Transforms int32
    internal var RectClips int32
    internal var ClipMasks int32
    internal var ClipChains int32
    internal var Shadows int32
    internal var Underlines int32
    internal var Layers int32
    internal var LayerCoverage int32
    internal var Text int32
    internal var Effects int32
}

internal sealed class VulkanRetainedSceneData {
    internal var Extent VulkanSceneRangePosition
    internal var Chunks[]SceneChunk = Array.Empty[SceneChunk]()
    internal var DrawRefs[]DrawRef = Array.Empty[DrawRef]()
    internal var ResourceRefs[]ResourceId = Array.Empty[ResourceId]()
    internal var SolidBoxes[]SolidBoxRecord = Array.Empty[SolidBoxRecord]()
    internal var RoundedBoxes[]RoundedBoxRecord = Array.Empty[RoundedBoxRecord]()
    internal var PerEdgeBorders[]PerEdgeBorderRecord = Array.Empty[PerEdgeBorderRecord]()
    internal var GradientStops[]GradientStopRecord = Array.Empty[GradientStopRecord]()
    internal var LinearGradients[]LinearGradientRecord = Array.Empty[LinearGradientRecord]()
    internal var RadialGradients[]RadialGradientRecord = Array.Empty[RadialGradientRecord]()
    internal var CachedImages[]CachedImageRefRecord = Array.Empty[CachedImageRefRecord]()
    internal var AnalyticPathBands[]AnalyticPathBandRecord = Array.Empty[AnalyticPathBandRecord]()
    internal var Transforms[]TransformRecord = Array.Empty[TransformRecord]()
    internal var RectClips[]RectClipRecord = Array.Empty[RectClipRecord]()
    internal var ClipMasks[]ClipMaskRecord = Array.Empty[ClipMaskRecord]()
    internal var ClipChains[]ClipChainRecord = Array.Empty[ClipChainRecord]()
    internal var Shadows[]ShadowRecord = Array.Empty[ShadowRecord]()
    internal var Underlines[]UnderlineRecord = Array.Empty[UnderlineRecord]()
    internal var Layers[]LayerRecord = Array.Empty[LayerRecord]()
    internal var LayerCoverage[]VulkanSceneLayerCoverage = Array.Empty[VulkanSceneLayerCoverage]()
    internal var Text[]CachedTextSegmentRefRecord = Array.Empty[CachedTextSegmentRefRecord]()
    internal var Effects[]ShaderEffectRecord = Array.Empty[ShaderEffectRecord]()
    internal var EffectPrograms[]WeakReference[ShaderEffect]? = Array.Empty[WeakReference[ShaderEffect]?]()
    internal var CapturedEffects[]ShaderEffectSnapshot = Array.Empty[ShaderEffectSnapshot]()
    internal var Segments[]WeakReference[VulkanRetainedTextSegment]? = Array.Empty[
        WeakReference[VulkanRetainedTextSegment]?
    ]()
    internal var PathDashes[]WeakReference[DashPattern]? = Array.Empty[WeakReference[DashPattern]?]()
    internal var MaskDashes[]WeakReference[DashPattern]? = Array.Empty[WeakReference[DashPattern]?]()
    internal var PathDashPresent[]bool = Array.Empty[bool]()
    internal var MaskDashPresent[]bool = Array.Empty[bool]()
    internal var PathDashRevisions[]uint64 = Array.Empty[uint64]()
    internal var MaskDashRevisions[]uint64 = Array.Empty[uint64]()

    internal func CapacityBytes(required VulkanSceneRangePosition) int64 -> 4096L
    + ArrayBytes(Chunks, required.Chunks)
    + ArrayBytes(DrawRefs, required.DrawRefs)
    + ArrayBytes(ResourceRefs, required.ResourceRefs)
    + ArrayBytes(SolidBoxes, required.SolidBoxes)
    + ArrayBytes(RoundedBoxes, required.RoundedBoxes)
    + ArrayBytes(PerEdgeBorders, required.PerEdgeBorders)
    + ArrayBytes(GradientStops, required.GradientStops)
    + ArrayBytes(LinearGradients, required.LinearGradients)
    + ArrayBytes(RadialGradients, required.RadialGradients)
    + ArrayBytes(CachedImages, required.CachedImages)
    + ArrayBytes(AnalyticPathBands, required.AnalyticPathBands)
    + ArrayBytes(Transforms, required.Transforms)
    + ArrayBytes(RectClips, required.RectClips)
    + ArrayBytes(ClipMasks, required.ClipMasks)
    + ArrayBytes(ClipChains, required.ClipChains)
    + ArrayBytes(Shadows, required.Shadows)
    + ArrayBytes(Underlines, required.Underlines)
    + ArrayBytes(Layers, required.Layers)
    + ArrayBytes(LayerCoverage, required.LayerCoverage)
    + ArrayBytes(Text, required.Text)
    + ArrayBytes(Effects, required.Effects)
    + ArrayBytes(CapturedEffects, required.Effects)
    + ArrayBytes(EffectPrograms, required.Effects)
    + 64L * int64(Math.Max(EffectPrograms.Length, required.Effects))
    + ArrayBytes(Segments, required.Text) + 64L * int64(Math.Max(Segments.Length, required.Text))
    +
        ArrayBytes(PathDashes, required.AnalyticPathBands) +
        64L * int64(Math.Max(PathDashes.Length, required.AnalyticPathBands))
    + ArrayBytes(MaskDashes, required.ClipMasks) + 64L * int64(Math.Max(MaskDashes.Length, required.ClipMasks))
    + ArrayBytes(PathDashPresent, required.AnalyticPathBands)
    + ArrayBytes(MaskDashPresent, required.ClipMasks)
    + ArrayBytes(PathDashRevisions, required.AnalyticPathBands)
    + ArrayBytes(MaskDashRevisions, required.ClipMasks)

    private func ArrayBytes[T any](values[]T, required int32) int64 -> 64L
    + int64(Math.Max(values.Length, required)) * int64(Unsafe.SizeOf[T]())

    private func EnsureValues[T any](values[]T, count int32)[]T {
        if values.Length >= count {
            return values
        }
        let result = [count]T
        Array.Copy(values, result, values.Length)
        return result
    }

    private func CopyValues[T any](values[]T, source[]T, count int32)[]T {
        let result = values.Length >= count ? values: [count]T
        Array.Copy(source, result, count)
        return result
    }

    internal func Capture(frame SceneFrame) {
        let end = frame.RangePosition()
        Chunks = CopyValues(Chunks, frame.Chunks, end.Chunks)
        DrawRefs = CopyValues(DrawRefs, frame.DrawRefs, end.DrawRefs)
        ResourceRefs = CopyValues(ResourceRefs, frame.ResourceRefs, end.ResourceRefs)
        SolidBoxes = CopyValues(SolidBoxes, frame.SolidBoxes, end.SolidBoxes)
        RoundedBoxes = CopyValues(RoundedBoxes, frame.RoundedBoxes, end.RoundedBoxes)
        PerEdgeBorders = CopyValues(PerEdgeBorders, frame.PerEdgeBorders, end.PerEdgeBorders)
        GradientStops = CopyValues(GradientStops, frame.GradientStops, end.GradientStops)
        LinearGradients = CopyValues(LinearGradients, frame.LinearGradients, end.LinearGradients)
        RadialGradients = CopyValues(RadialGradients, frame.RadialGradients, end.RadialGradients)
        CachedImages = CopyValues(CachedImages, frame.CachedImages, end.CachedImages)
        AnalyticPathBands = CopyValues(AnalyticPathBands, frame.AnalyticPathBands, end.AnalyticPathBands)
        Transforms = CopyValues(Transforms, frame.Transforms, end.Transforms)
        RectClips = CopyValues(RectClips, frame.RectClips, end.RectClips)
        ClipMasks = CopyValues(ClipMasks, frame.ClipMasks, end.ClipMasks)
        ClipChains = CopyValues(ClipChains, frame.ClipChains, end.ClipChains)
        Shadows = CopyValues(Shadows, frame.Shadows, end.Shadows)
        Underlines = CopyValues(Underlines, frame.Underlines, end.Underlines)
        Layers = CopyValues(Layers, frame.Layers, end.Layers)
        LayerCoverage = CopyValues(LayerCoverage, frame.LayerCoverage, end.LayerCoverage)
        Text = CopyValues(Text, frame.CachedTextSegments, end.Text)
        Segments = EnsureValues(Segments, end.Text)
        PathDashes = EnsureValues(PathDashes, end.AnalyticPathBands)
        MaskDashes = EnsureValues(MaskDashes, end.ClipMasks)
        Effects = CopyValues(Effects, frame.ShaderEffects, end.Effects)
        EffectPrograms = EnsureValues(EffectPrograms, end.Effects)
        CapturedEffects = EnsureValues(CapturedEffects, end.Effects)
        for index in 0 ... end.Effects {
            guard let program = Effects[index].Program else {
                throw InvalidOperationException("Retained scene effect is unavailable")
            }
            if let weak = EffectPrograms[index] {
                weak.SetTarget(program)
            } else {
                EffectPrograms[index] = WeakReference[ShaderEffect](program)
            }
            Effects[index].Program = nil
        }
        for index in 0 ... end.Text {
            guard let segment = Text[index].Segment else {
                throw InvalidOperationException("Retained scene text segment is unavailable")
            }
            if let weak = Segments[index] {
                weak.SetTarget(segment)
            } else {
                Segments[index] = WeakReference[VulkanRetainedTextSegment](segment)
            }
            Text[index].Segment = nil
            Text[index].FirstInstance = -1
        }
        PathDashPresent = EnsureValues(PathDashPresent, end.AnalyticPathBands)
        MaskDashPresent = EnsureValues(MaskDashPresent, end.ClipMasks)
        PathDashRevisions = EnsureValues(PathDashRevisions, end.AnalyticPathBands)
        MaskDashRevisions = EnsureValues(MaskDashRevisions, end.ClipMasks)
        for index in 0 ... end.AnalyticPathBands {
            let dashes = AnalyticPathBands[index].Stroke.Dashes
            PathDashPresent[index] = dashes != nil
            PathDashRevisions[index] = dashes?.Revision ?? 0uL
            if let value = dashes {
                if let weak = PathDashes[index] {
                    weak.SetTarget(value)
                } else {
                    PathDashes[index] = WeakReference[DashPattern](value)
                }
            }
            AnalyticPathBands[index].Stroke = AnalyticPathBands[index].Stroke with{Dashes = nil}
        }
        for index in 0 ... end.ClipMasks {
            let dashes = ClipMasks[index].Stroke.Dashes
            MaskDashPresent[index] = dashes != nil
            MaskDashRevisions[index] = dashes?.Revision ?? 0uL
            if let value = dashes {
                if let weak = MaskDashes[index] {
                    weak.SetTarget(value)
                } else {
                    MaskDashes[index] = WeakReference[DashPattern](value)
                }
            }
            ClipMasks[index].Stroke = ClipMasks[index].Stroke with{Dashes = nil}
        }
        Extent = end
    }

    internal func Release() {
        Extent = VulkanSceneRangePosition{}
        Chunks = Array.Empty[SceneChunk]()
        DrawRefs = Array.Empty[DrawRef]()
        ResourceRefs = Array.Empty[ResourceId]()
        SolidBoxes = Array.Empty[SolidBoxRecord]()
        RoundedBoxes = Array.Empty[RoundedBoxRecord]()
        PerEdgeBorders = Array.Empty[PerEdgeBorderRecord]()
        GradientStops = Array.Empty[GradientStopRecord]()
        LinearGradients = Array.Empty[LinearGradientRecord]()
        RadialGradients = Array.Empty[RadialGradientRecord]()
        CachedImages = Array.Empty[CachedImageRefRecord]()
        AnalyticPathBands = Array.Empty[AnalyticPathBandRecord]()
        Transforms = Array.Empty[TransformRecord]()
        RectClips = Array.Empty[RectClipRecord]()
        ClipMasks = Array.Empty[ClipMaskRecord]()
        ClipChains = Array.Empty[ClipChainRecord]()
        Shadows = Array.Empty[ShadowRecord]()
        Underlines = Array.Empty[UnderlineRecord]()
        Layers = Array.Empty[LayerRecord]()
        LayerCoverage = Array.Empty[VulkanSceneLayerCoverage]()
        Text = Array.Empty[CachedTextSegmentRefRecord]()
        Effects = Array.Empty[ShaderEffectRecord]()
        EffectPrograms = Array.Empty[WeakReference[ShaderEffect]?]()
        CapturedEffects = Array.Empty[ShaderEffectSnapshot]()
        Segments = Array.Empty[WeakReference[VulkanRetainedTextSegment]?]()
        PathDashes = Array.Empty[WeakReference[DashPattern]?]()
        MaskDashes = Array.Empty[WeakReference[DashPattern]?]()
        PathDashPresent = Array.Empty[bool]()
        MaskDashPresent = Array.Empty[bool]()
        PathDashRevisions = Array.Empty[uint64]()
        MaskDashRevisions = Array.Empty[uint64]()
    }
}
