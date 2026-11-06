package Goo

import System

internal partial class VulkanSceneCompiler {
    private func SameRangeBounds(left ConservativeBounds, right ConservativeBounds) bool ->
    ExactFloat(left.X, right.X) && ExactFloat(left.Y, right.Y)
    && ExactFloat(left.Width, right.Width) && ExactFloat(left.Height, right.Height)

    private func SameRangeTransform(left PrimitiveTransform, right PrimitiveTransform) bool ->
    ExactFloat(left.A, right.A) && ExactFloat(left.B, right.B)
    && ExactFloat(left.C, right.C) && ExactFloat(left.D, right.D)
    && ExactFloat(left.TX, right.TX) && ExactFloat(left.TY, right.TY)

    private func ResolveRangeTransform(index int32) PrimitiveTransform {
        var result = PrimitiveTransform{A: 1.0F, D: 1.0F}
        var current = index
        var remaining = rangeData.Extent.Transforms
        while current >= 0 {
            if current >= rangeData.Extent.Transforms || remaining <= 0 {
                throw InvalidOperationException("Retained scene transform chain is invalid")
            }
            let value = rangeData.Transforms[current]
            if !value.IsScrollPlacement {
                result = ComposeCompilerTransform(
                    PrimitiveTransform{A: value.A, B: value.B, C: value.C, D: value.D, TX: value.TX, TY: value.TY,},
                    result
                )
            }
            current = value.ParentIndex
            remaining--
        }
        return result
    }

    private func RangeTransformMatches(previous int32, current int32) bool ->
    (previous < 0) == (current < 0)
    && SameRangeTransform(ResolveRangeTransform(previous), ResolveCompilerFrameTransform(current))

    private func RangeContextMatches(entry VulkanSceneRangeEntry, current VulkanSceneTraversalContext) bool {
        let previous = entry.Context
        if !ExactFloat(previous.ParentOpacity, current.ParentOpacity)
        || previous.ParentAxisAligned != current.ParentAxisAligned
        || previous.ParentRectClipDepth != current.ParentRectClipDepth
        || previous.ParentIsolation != current.ParentIsolation
        || previous.ExactCullContextSafe != current.ExactCullContextSafe
        || (previous.ParentTransformIndex < 0) != (current.ParentTransformIndex < 0)
        || (previous.RoundedOverflowLayerId == 0) != (current.RoundedOverflowLayerId == 0)
        || !SameRangeBounds(previous.ActiveClipBounds, current.ActiveClipBounds)
        || !SameRangeTransform(entry.ParentTransform, ResolveCompilerFrameTransform(current.ParentTransformIndex)) {
            return false
        }
        let roundedId = if let node = current.RoundedOverflowOwner {
            OwnerId(node)
        } else {
            0uL
        }
        if entry.RoundedOwnerId != roundedId {
            return false
        }
        if roundedId != 0uL
        && !RangeTransformMatches(previous.RoundedOverflowTransformIndex, current.RoundedOverflowTransformIndex) {
            return false
        }
        return RangeRectClipsMatch(previous.ParentRectClipIndex, current.ParentRectClipIndex)
        && RangePathClipsMatch(previous.ParentPathClipChainId, current.ParentPathClipChainId)
    }

    private func RangeRectClipsMatch(previous int32, current int32) bool {
        var prior = previous
        var index = current
        while prior >= 0 && index >= 0 {
            let old = rangeData.RectClips[prior]
            let value = frame.RectClips[index]
            if !SameRangeBounds(old.Bounds, value.Bounds)
            || !RangeTransformMatches(old.TransformIndex, value.TransformIndex) {
                return false
            }
            prior = old.ParentIndex
            index = value.ParentIndex
        }
        return prior < 0 && index < 0
    }

    private func RangePathClipsMatch(previous int32, current int32) bool {
        var prior = previous
        var index = current
        while prior > 0 && index > 0 {
            let old = rangeData.ClipChains[prior]
            let value = frame.ClipChains[index]
            if old.StableId != value.StableId || old.Flags != value.Flags || old.Depth != value.Depth
            || (old.MaskIndex < 0) != (value.MaskIndex < 0) {
                return false
            }
            if old.MaskIndex >= 0 && !RangeMasksMatch(old.MaskIndex, value.MaskIndex) {
                return false
            }
            prior = old.ParentIndex
            index = value.ParentIndex
        }
        return prior == 0 && index == 0
    }

    private func RangeMasksMatch(previous int32, current int32) bool {
        let old = rangeData.ClipMasks[previous]
        let value = frame.ClipMasks[current]
        if old.StableId != value.StableId || !SameResource(old.PathId, value.PathId)
        || !SameResource(old.AtlasId, value.AtlasId)
        || old.AtlasWordOffset != value.AtlasWordOffset || old.AtlasWordCount != value.AtlasWordCount
        || old.CurveCount != value.CurveCount || old.FillRule != value.FillRule || old.Fit != value.Fit
        || !SameRangeBounds(old.Bounds, value.Bounds) || !SameRangeBounds(old.PathBounds, value.PathBounds)
        || !ExactFloat(old.ScaleX, value.ScaleX) || !ExactFloat(old.ScaleY, value.ScaleY)
        || !ExactFloat(old.TranslateX, value.TranslateX) || !ExactFloat(old.TranslateY, value.TranslateY)
        || !ExactFloat(old.Stroke.Width, value.Stroke.Width) || old.Stroke.Cap != value.Stroke.Cap
        || old.Stroke.Join != value.Stroke.Join || !ExactFloat(old.Stroke.MiterLimit, value.Stroke.MiterLimit)
        || !ExactFloat(old.Stroke.Start, value.Stroke.Start) || !ExactFloat(old.Stroke.End, value.Stroke.End)
        || rangeData.MaskDashPresent[previous] != (value.Stroke.Dashes != nil)
        || !RangeTransformMatches(old.TransformIndex, value.TransformIndex) {
            return false
        }
        if rangeData.MaskDashPresent[previous] {
            guard let weak = rangeData.MaskDashes[previous] else {
                return false
            }
            if !weak.TryGetTarget(out var dashes)
            || !Object.ReferenceEquals(dashes, value.Stroke.Dashes)
            || dashes.Revision != rangeData.MaskDashRevisions[previous] {
                return false
            }
        }
        return true
    }

    private func ProtectRangeResources(start VulkanSceneRangePosition, end VulkanSceneRangePosition) bool {
        for index in start.CachedImages ... end.CachedImages {
            guard let scene = imageScene else {
                return false
            }
            if !scene.TryRetain(rangeData.CachedImages[index]) {
                return false
            }
        }
        for index in start.AnalyticPathBands ... end.AnalyticPathBands {
            guard let scene = pathScene else {
                return false
            }
            let value = rangeData.AnalyticPathBands[index]
            if !scene.TryRetain(
                value.PathId,
                value.AtlasId,
                value.AtlasWordOffset,
                value.AtlasWordCount,
                value.FillRule
            ) {
                return false
            }
        }
        for index in start.ClipMasks ... end.ClipMasks {
            guard let scene = pathScene else {
                return false
            }
            let value = rangeData.ClipMasks[index]
            if !scene.TryRetain(
                value.PathId,
                value.AtlasId,
                value.AtlasWordOffset,
                value.AtlasWordCount,
                value.FillRule
            ) {
                return false
            }
        }
        for index in start.Text ... end.Text {
            guard let scene = textScene else {
                return false
            }
            guard let weak = rangeData.Segments[index] else {
                return false
            }
            if !weak.TryGetTarget(out var segment) {
                return false
            }
            if !VulkanRetainedTextValidation.ValidReferenceStorage(rangeData.Text[index], segment) {
                return false
            }
            for runIndex in 0 ... segment.RunCount {
                let run = segment.Runs[runIndex]
                if !scene.TryMarkAtlasActive(run.AtlasId) || run.ByteRangeEnd == 0uL
                || !scene.IsAtlasRangeResident(run.AtlasId, run.ByteRangeEnd) {
                    return false
                }
            }
        }
        return true
    }
}
