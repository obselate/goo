package Goo

import System

internal sealed class VulkanRetainedTextSnapshot {
  private var segments []CachedTextSegmentRefRecord

  internal var ChunkBounds ConservativeBounds
  internal var SegmentCount int32
  internal var ResourceCount int32

  internal init() {
    segments = [1]CachedTextSegmentRefRecord
  }

  internal prop Segments []CachedTextSegmentRefRecord{ get -> segments }

  internal func EnsureCapacity(requiredSegments int32) {
    if requiredSegments > segments.Length {
      let expanded = [GrowthCapacity(segments.Length,
        requiredSegments)]CachedTextSegmentRefRecord
      Array.Copy(segments, expanded, SegmentCount)
      segments = expanded
    }
  }

  private func GrowthCapacity(current int32, required int32) int32 {
    var next = current
    while next < required {
      if next > Int32.MaxValue / 2 {
        return required
      }
      next = next * 2
    }
    return next
  }

}

internal partial class VulkanSceneCompiler {
  internal func Snapshot(owner VulkanSceneOwnerId) VulkanRetainedTextSnapshot ? -> owner.RetainedTextSnapshot

  internal func Capture(
    frame SceneFrame,
    owner VulkanSceneOwnerId,
    chunkIndex int32) bool{
      if chunkIndex < 0 || chunkIndex >= frame.ChunkCount || frame.ActiveChunk >= 0 {
        return false
      }
      let chunk = frame.Chunks[chunkIndex]
      if chunk.OwnerId != owner.Value
        || chunk.FirstDraw < 0 || chunk.DrawCount <= 0
        || chunk.FirstDraw > frame.DrawRefCount
        || chunk.DrawCount > frame.DrawRefCount - chunk.FirstDraw
        || chunk.FirstResource < 0 || chunk.ResourceCount < 0
        || chunk.FirstResource > frame.ResourceRefCount
        || chunk.ResourceCount > frame.ResourceRefCount - chunk.FirstResource{
          return false
        }
      var firstSegmentDraw = chunk.FirstDraw
      var segmentCount = chunk.DrawCount
      let firstReference = frame.DrawRefs[firstSegmentDraw]
      if firstReference.Kind == SceneDrawKind.RectClipBegin {
        if firstReference.Index < 0 || firstReference.Index >= frame.RectClipCount {
          return false
        }
        let lastReference = frame.DrawRefs[chunk.FirstDraw + chunk.DrawCount - 1]
        if lastReference.Kind == SceneDrawKind.RectClipEnd {
          if lastReference.Index < 0 || lastReference.Index >= frame.RectClipCount
            || !SameRectClip(frame.RectClips[firstReference.Index],
              frame.RectClips[lastReference.Index]) {
                return false
              }
          segmentCount = segmentCount - 1
        }
        firstSegmentDraw = firstSegmentDraw + 1
        segmentCount = segmentCount - 1
      }
      if segmentCount <= 0 {
        return false
      }
      var expectedResources int32 = 0
      var index int32 = 0
      while index < segmentCount {
        let reference = frame.DrawRefs[firstSegmentDraw + index]
        if reference.Kind != SceneDrawKind.CachedTextSegment
          || reference.Index < 0
          || reference.Index >= frame.CachedTextSegmentCount{
            return false
          }
        let value = frame.CachedTextSegments[reference.Index]
        guard let segment = value.Segment else {
          return false
        }
        if reference.ClipChainId != 0
          || reference.ClipChainId != value.ClipChainId
          || !ValidSegmentReference(value, segment)
          || segment.GlyphCount > Int32.MaxValue - segment.RunCount{
            return false
          }
        let segmentResourceCount = segment.GlyphCount + segment.RunCount
        if expectedResources > chunk.ResourceCount
          || segmentResourceCount > chunk.ResourceCount - expectedResources{
            return false
          }
        var glyphIndex int32 = 0
        while glyphIndex < segment.GlyphCount {
          if !segment.GlyphResources[glyphIndex].IsValid
            || segment.GlyphResources[glyphIndex].Kind != SceneResourceKind.GlyphRun
            || !SameResource(
              frame.ResourceRefs[chunk.FirstResource + expectedResources],
              segment.GlyphResources[glyphIndex]) {
                return false
              }
          expectedResources = expectedResources + 1
          glyphIndex = glyphIndex + 1
        }
        var runIndex int32 = 0
        while runIndex < segment.RunCount {
          let run = segment.Runs[runIndex]
          if !run.AtlasId.IsValid
            || run.AtlasId.Kind != SceneResourceKind.Atlas
            || !SameResource(
              frame.ResourceRefs[chunk.FirstResource + expectedResources],
              run.AtlasId) {
                return false
              }
          expectedResources = expectedResources + 1
          runIndex = runIndex + 1
        }
        index = index + 1
      }
      if expectedResources != chunk.ResourceCount {
        return false
      }
      var snapshot = owner.RetainedTextSnapshot
      if snapshot == nil {
        snapshot = VulkanRetainedTextSnapshot()
        owner.RetainedTextSnapshot = snapshot
      }
      let resolved = snapshot
      resolved.EnsureCapacity(segmentCount)
      index = 0
      while index < segmentCount {
        let reference = frame.DrawRefs[firstSegmentDraw + index]
        resolved.Segments[index] = frame.CachedTextSegments[reference.Index]
        index = index + 1
      }
      resolved.ChunkBounds = chunk.Bounds
      resolved.SegmentCount = segmentCount
      resolved.ResourceCount = chunk.ResourceCount
      return true
    }

  internal func ValidSegmentReference(
    value CachedTextSegmentRefRecord,
    segment VulkanRetainedTextSegment) bool ->
  VulkanRetainedTextValidation.ValidReferenceStorage(value, segment)
    && value.ClipChainId == segment.ClipChainId
    && value.FirstInstance == -1
    && segment.AtlasGeneration != 0uL
    && VulkanRetainedTextValidation.ValidBounds(value.Bounds)
    && VulkanRetainedTextValidation.SameBounds(value.Bounds, segment.Bounds)
    && VulkanRetainedTextValidation.ValidRuns(segment)

  private func SameResource(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind && left.LogicalId == right.LogicalId
    && left.Version == right.Version

  private func SameRectClip(left RectClipRecord, right RectClipRecord) bool ->
  left.Bounds.X == right.Bounds.X
    && left.Bounds.Y == right.Bounds.Y
    && left.Bounds.Width == right.Bounds.Width
    && left.Bounds.Height == right.Bounds.Height
    && left.TransformIndex == right.TransformIndex
    && left.ParentIndex == right.ParentIndex
}

internal partial class VulkanSceneCompiler {
  internal prop RetainedTextHitCount uint64{ get -> retainedText.Hit }
  internal prop RetainedTextRebuildCount uint64{ get -> retainedText.Rebuild }
  internal prop RetainedTextFallbackCount uint64{ get -> retainedText.Fallback }
  internal prop RetainedTextInvalidationCount uint64{
    get -> retainedText.Invalidation
  }
  internal prop RetainedTextTotalCount uint64{ get -> retainedText.Total }

  internal func CaptureRetainedTextSnapshot(
    owner VulkanSceneOwnerId,
    chunkIndex int32) bool -> Capture(frame, owner, chunkIndex)

  private func InvalidateRetainedText(owner VulkanSceneOwnerId) {
    if !owner.RetainedTextValid {
      return
    }
    owner.ClearRetainedText()
    IncrementSaturated(ref retainedText.Invalidation)
  }

  private func RetainedTextEligible(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds,
    opacity float32,
    context VulkanSceneTraversalContext) bool -> textScene != nil
    && !bounds.IsEmpty
    && finiteVulkanSceneValue(opacity)
    && opacity > 0.0F
    && !Double.IsNaN(node.Opacity)
    && !Double.IsInfinity(node.Opacity)
    && finiteVulkanSceneValue(node.Color.R)
    && finiteVulkanSceneValue(node.Color.G)
    && finiteVulkanSceneValue(node.Color.B)
    && finiteVulkanSceneValue(node.Color.A)
    && !styleMaskHas(node.AppliedMask, StyleField.ShaderEffect)
    && RetainedTextContentEligible(node, owner, bounds)
    && RetainedTextOwnRectClipSupported(
      node, bounds, context.ParentAxisAligned, context.ParentRectClipDepth)
    && RetainedTextContextSupported(context)

  private func RetainedTextContextSupported(
    context VulkanSceneTraversalContext) bool{
      if !ExactFloat(context.ParentOpacity, 1.0F) || !context.ParentAxisAligned
        || context.ParentPathClipChainId != 0 {
          return false
        }
      let viewport = ConservativeBounds{
        X: 0.0F,
        Y: 0.0F,
        Width: clipViewportWidth,
        Height: clipViewportHeight,
      }
      if context.ParentRectClipDepth == 0 {
        return context.ParentTransformIndex == -1 && context.ParentRectClipIndex == -1
          && ExactBounds(context.ActiveClipBounds, viewport)
      }
      if context.ParentRectClipDepth != 1 || context.ParentRectClipIndex < 0
        || context.ParentRectClipIndex >= frame.RectClipCount
        || context.ParentTransformIndex < -1
        || context.ParentTransformIndex >= frame.TransformCount{
          return false
        }
      let parentTransform = ResolveCompilerFrameTransform(context.ParentTransformIndex)
      if !RetainedTextUnitTranslation(parentTransform) {
        return false
      }
      let clip = frame.RectClips[context.ParentRectClipIndex]
      if clip.ParentIndex != -1 {
        return false
      }
      let clipTransform = ResolveCompilerFrameTransform(clip.TransformIndex)
      if !RetainedTextUnitTranslation(clipTransform) {
        return false
      }
      let expectedClipBounds = IntersectBounds(viewport,
        TransformCompilerBounds(clip.Bounds, clipTransform))
      return !expectedClipBounds.IsEmpty
        && ExactBounds(context.ActiveClipBounds, expectedClipBounds)
    }

  private func RetainedTextOwnRectClipSupported(
    node Node,
    bounds ConservativeBounds,
    parentAxisAligned bool,
    parentClipDepth int32) bool{
      if node.OverflowX == Overflow.Visible
        && node.OverflowY == Overflow.Visible{
          return true
        }
      return node.OverflowX == Overflow.Hidden
        && node.OverflowY == Overflow.Hidden
        && parentAxisAligned
        && parentClipDepth < MaxRectClipDepth
        && !HasRadius(node, bounds)
    }

  private func RetainedTextUnitTranslation(value PrimitiveTransform) bool -> ExactFloat(value.A, 1.0F)
    && ExactFloat(value.B, 0.0F)
    && ExactFloat(value.C, 0.0F)
    && ExactFloat(value.D, 1.0F)
    && finiteVulkanSceneValue(value.TX)
    && finiteVulkanSceneValue(value.TY)

  private func TryAppendRetainedText(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds,
    opacity float32,
    parentTransformIndex int32,
    parentClipIndex int32,
    parentClipDepth int32,
    activeClipBounds ConservativeBounds) bool{
      if !owner.RetainedTextValid {
        return false
      }
      guard let scene = textScene else {
        InvalidateRetainedText(owner)
        return false
      }
      let parentTransform = ResolveCompilerFrameTransform(parentTransformIndex)
      if !Object.ReferenceEquals(owner.RetainedTextContent,
        RetainedTextContent(node))
        || owner.RetainedTextPaintVersion != node.ScenePaintVersion
        || owner.RetainedTextFontRegistryGeneration != FontRegistry.Generation
        || !ExactBounds(owner.RetainedTextBounds, bounds)
        || owner.RetainedTextColor != node.Color.ToPackedRgba()
        || !ExactFloat(owner.RetainedTextOpacity, opacity)
        || owner.RetainedTextAtlasGeneration != scene.ResourceGeneration
        || !ExactFloat(owner.RetainedTextParentTranslateX, parentTransform.TX)
        || !ExactFloat(owner.RetainedTextParentTranslateY, parentTransform.TY)
        || owner.RetainedTextClipDepth != parentClipDepth
        || !ExactBounds(owner.RetainedTextClipBounds, activeClipBounds) {
          InvalidateRetainedText(owner)
          return false
        }
      guard let snapshot = Snapshot(owner) else {
        InvalidateRetainedText(owner)
        return false
      }
      let entry = node.Kind == NodeKind.Entry
      let ownRectClip = entry || node.OverflowX == Overflow.Hidden
        && node.OverflowY == Overflow.Hidden
      let rectClip = RectClipRecord{
        Bounds: entry ? ConservativeBounds{
          X: TextLayouts.ContentLeft(node),
          Y: TextLayouts.ContentTop(node),
          Width: TextLayouts.ContentWidth(node),
          Height: TextLayouts.ContentHeight(node),
        } : bounds,
        TransformIndex: parentTransformIndex,
        ParentIndex: entry ? -1 : parentClipIndex,
      }
      if !ProtectRetainedTextAtlases(scene, snapshot)
        || !frame.AppendRetainedTextSnapshot(owner.Value, frameVersion, snapshot,
          ownRectClip, rectClip) {
            InvalidateRetainedText(owner)
            return false
          }
      IncrementSaturated(ref retainedText.Hit)
      return true
    }

  private func ProtectRetainedTextAtlases(
    scene VulkanTextScene,
    snapshot VulkanRetainedTextSnapshot) bool{
      if snapshot.SegmentCount < 0
        || snapshot.SegmentCount > snapshot.Segments.Length
        || snapshot.ResourceCount < 0 {
          return false
        }
      var index int32 = 0
      var expectedResources int32 = 0
      while index < snapshot.SegmentCount {
        let value = snapshot.Segments[index]
        guard let segment = value.Segment else {
          return false
        }
        if !ValidSegmentReference(value, segment)
          || segment.GlyphCount > Int32.MaxValue - segment.RunCount{
            return false
          }
        let segmentResourceCount = segment.GlyphCount + segment.RunCount
        if expectedResources > snapshot.ResourceCount
          || segmentResourceCount > snapshot.ResourceCount - expectedResources{
            return false
          }
        var glyphIndex int32 = 0
        while glyphIndex < segment.GlyphCount {
          let resource = segment.GlyphResources[glyphIndex]
          if !resource.IsValid || resource.Kind != SceneResourceKind.GlyphRun {
            return false
          }
          expectedResources = expectedResources + 1
          glyphIndex = glyphIndex + 1
        }
        var glyphBase int32 = 0
        var runIndex int32 = 0
        while runIndex < segment.RunCount {
          let run = segment.Runs[runIndex]
          if run.InstanceCount > segment.GlyphCount - glyphBase
            || !scene.TryMarkAtlasActive(run.AtlasId) {
              return false
            }
          expectedResources = expectedResources + 1
          let runEnd = glyphBase + run.InstanceCount
          if run.ByteRangeEnd == 0uL
            || !scene.IsAtlasRangeResident(
              run.AtlasId, run.ByteRangeEnd) {
                return false
              }
          glyphBase = runEnd
          runIndex = runIndex + 1
        }
        if glyphBase != segment.GlyphCount {
          return false
        }
        index = index + 1
      }
      return expectedResources == snapshot.ResourceCount
    }

  private func StoreRetainedTextFingerprint(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds,
    opacity float32,
    parentTransformIndex int32,
    parentClipDepth int32,
    activeClipBounds ConservativeBounds) {
      guard let scene = textScene else {
        throw InvalidOperationException("Vulkan retained text scene is unavailable")
      }
      let parentTransform = ResolveCompilerFrameTransform(parentTransformIndex)
      owner.RetainedTextContent = RetainedTextContent(node)
      owner.RetainedTextPaintVersion = node.ScenePaintVersion
      owner.RetainedTextFontRegistryGeneration = RetainedTextFontGeneration(node)
      owner.RetainedTextBounds = bounds
      owner.RetainedTextColor = node.Color.ToPackedRgba()
      owner.RetainedTextOpacity = opacity
      owner.RetainedTextAtlasGeneration = scene.ResourceGeneration
      owner.RetainedTextParentTranslateX = parentTransform.TX
      owner.RetainedTextParentTranslateY = parentTransform.TY
      owner.RetainedTextClipDepth = parentClipDepth
      owner.RetainedTextClipBounds = activeClipBounds
      owner.RetainedTextValid = true
    }

  private func RetainedTextContent(node Node) string ->
  node.Kind == NodeKind.Entry ? node.Buffer : node.Content

  private func RetainedTextFontGeneration(node Node) uint64 {
    if node.Kind == NodeKind.Entry {
      return FontRegistry.Generation
    }
    guard let layout = node.TextLayout else {
      throw InvalidOperationException("Vulkan retained text layout is unavailable")
    }
    return layout.FontRegistryGeneration
  }

  private func RetainedTextContentEligible(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds) bool{
      if node.Kind == NodeKind.Text {
        return StrictPlainTextContentEligible(node, owner, bounds)
      }
      if node.Kind != NodeKind.Entry || node.Children.Count != 0
        || node.Focused || node.Buffer == "" && node.Placeholder == ""
        || node.Width.Unit != LengthUnit.Px
        || node.Height.Unit != LengthUnit.Px
        || node.FontSize.Unit != LengthUnit.Px
        || node.BackgroundColor.A > 0.0F
        || node.BackgroundGradient != nil
        || node.HasBackgroundImageState
        || node.HasOutlineState
        || boxShadowCount(node.BoxShadows) != 0
        || node.HasTextShadowState
        || node.HasTextStrokeState
        || node.TextDecoration != TextDecoration.None
        || node.HasClipPath
        || node.HasTransformState
        || node.HasVisualTransform
        || node.ScrollX != 0.0F
        || node.ScrollY != 0.0F
        || node.EditScrollX != 0.0F
        || node.BlendMode != BlendMode.Normal
        || HasBorderWidth(node, bounds)
        || node.BorderTopColor.A > 0.0F
        || node.BorderRightColor.A > 0.0F
        || node.BorderBottomColor.A > 0.0F
        || node.BorderLeftColor.A > 0.0F {
          return false
        }
      return node.OverflowX == Overflow.Visible
        && node.OverflowY == Overflow.Visible
    }
}
