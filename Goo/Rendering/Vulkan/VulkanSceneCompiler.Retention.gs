package Goo

import System

internal partial class VulkanSceneCompiler {
  private var retentionProofs VulkanSceneRetentionProofStore? = nil
  private var partialRedrawSafe bool
  private var damageJournal VulkanSceneDamageJournal? = nil
  private var retainedLeaf VulkanRetentionCounters
  private var retainedBorder VulkanRetentionCounters
  private var retainedParentBox VulkanRetentionCounters
  private var retainedText VulkanRetentionCounters

  internal prop RetainedLeafHitCount uint64{ get -> retainedLeaf.Hit }
  internal prop RetainedLeafRebuildCount uint64{ get -> retainedLeaf.Rebuild }
  internal prop RetainedLeafFallbackCount uint64{ get -> retainedLeaf.Fallback }
  internal prop RetainedLeafInvalidationCount uint64{ get -> retainedLeaf.Invalidation }
  internal prop RetainedLeafTotalCount uint64{ get -> retainedLeaf.Total }
  internal prop RetainedBorderHitCount uint64{ get -> retainedBorder.Hit }
  internal prop RetainedBorderRebuildCount uint64{ get -> retainedBorder.Rebuild }
  internal prop RetainedBorderFallbackCount uint64{ get -> retainedBorder.Fallback }
  internal prop RetainedBorderInvalidationCount uint64{
    get -> retainedBorder.Invalidation
  }
  internal prop RetainedBorderTotalCount uint64{ get -> retainedBorder.Total }
  internal prop RetainedParentBoxHitCount uint64{ get -> retainedParentBox.Hit }
  internal prop RetainedParentBoxRebuildCount uint64{
    get -> retainedParentBox.Rebuild
  }
  internal prop RetainedParentBoxFallbackCount uint64{
    get -> retainedParentBox.Fallback
  }
  internal prop RetainedParentBoxInvalidationCount uint64{
    get -> retainedParentBox.Invalidation
  }
  internal prop RetainedParentBoxTotalCount uint64{ get -> retainedParentBox.Total }

  private func IncrementSaturated(ref value uint64) {
    if value != uint64.MaxValue {
      value = value + 1uL
    }
  }

  private func InvalidateRetainedBox(owner VulkanSceneOwnerId) {
    if !owner.RetainedLeafValid {
      return
    }
    let isLeaf = owner.RetainedBoxIsLeaf
    let kind = owner.RetainedLeafKind
    owner.ClearRetainedLeaf()
    if isLeaf {
      if kind == SceneDrawKind.PerEdgeBorder {
        IncrementSaturated(ref retainedBorder.Invalidation)
      } else {
        IncrementSaturated(ref retainedLeaf.Invalidation)
      }
    } else {
      IncrementSaturated(ref retainedParentBox.Invalidation)
    }
  }

  private func RetainedLeafContextDefault(
    context VulkanSceneTraversalContext) bool -> context.ParentTransformIndex == -1
    && context.ParentRectClipIndex == -1
    && context.ParentOpacity == 1.0F
    && context.ParentAxisAligned
    && context.ParentRectClipDepth == 0
    && context.ParentPathClipChainId == 0
    && !context.ParentIsolation
    && ExactBounds(context.ActiveClipBounds, ConservativeBounds{
      X: 0.0F,
      Y: 0.0F,
      Width: clipViewportWidth,
      Height: clipViewportHeight,
    })

  private func RetainedCommonEligible(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    context VulkanSceneTraversalContext,
    requireNoChildren bool) bool{
      if (node.Kind != NodeKind.Container && node.Kind != NodeKind.Button)
        || (requireNoChildren && node.Children.Count != 0)
        || bounds.IsEmpty
        || !finiteVulkanSceneValue(opacity)
        || opacity <= 0.0F
        || Double.IsNaN(node.Opacity) || Double.IsInfinity(node.Opacity)
        || !finiteVulkanSceneValue(node.BackgroundColor.R) || !finiteVulkanSceneValue(node.BackgroundColor.G)
        || !finiteVulkanSceneValue(node.BackgroundColor.B) || !finiteVulkanSceneValue(node.BackgroundColor.A)
        || node.BackgroundGradient != nil
        || node.HasBackgroundImageState
        || node.HasOutlineState
        || boxShadowCount(node.BoxShadows) != 0
        || node.HasTextShadowState
        || node.HasTextStrokeState
        || node.TextDecoration != TextDecoration.None
        || node.HasClipPath
        || ClipPaths.Fit(node) != ShapeFit.Fill
        || ClipPaths.FillRule(node) != FillRule.NonZero
        || node.OverflowX != Overflow.Visible
        || node.OverflowY != Overflow.Visible
        || node.HasTransformState
        || node.HasVisualTransform
        || node.ScrollX != 0.0F || node.ScrollY != 0.0F
        || node.BlendMode != BlendMode.Normal
        || styleMaskHas(node.AppliedMask, StyleField.ShaderEffect)
        || node.Hovered || node.Pressed || node.KeyboardPressed
        || node.Focused || node.Disabled
        || node.PointerPressCount != 0
        || !RetainedLeafContextDefault(context) {
          return false
        }
      return true
    }

  private func RetainedBoxEligible(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    context VulkanSceneTraversalContext,
    requireNoChildren bool) bool{
      if !RetainedCommonEligible(node, bounds, opacity, context, requireNoChildren)
        || node.BackgroundColor.A <= 0.0F {
          return false
        }
      if node.BorderStyle != BorderStyle.Solid
        || HasBorderWidth(node, bounds)
        || node.BorderTopColor.A > 0.0F
        || node.BorderRightColor.A > 0.0F
        || node.BorderBottomColor.A > 0.0F
        || node.BorderLeftColor.A > 0.0F {
          return false
        }
      return true
    }

  private func RetainedBorderVisible(
    node Node,
    record PerEdgeBorderRecord) bool{
      let topVisible = record.TopWidth > 0.0F && node.BorderTopColor.A > 0.0F
      let rightVisible = record.RightWidth > 0.0F && node.BorderRightColor.A > 0.0F
      let bottomVisible = record.BottomWidth > 0.0F
        && node.BorderBottomColor.A > 0.0F
      let leftVisible = record.LeftWidth > 0.0F && node.BorderLeftColor.A > 0.0F
      return topVisible || rightVisible || bottomVisible || leftVisible
    }

  private func RetainedBorderColorsFinite(node Node) bool -> finiteVulkanSceneValue(node.BorderTopColor.R)
    && finiteVulkanSceneValue(node.BorderTopColor.G)
    && finiteVulkanSceneValue(node.BorderTopColor.B)
    && finiteVulkanSceneValue(node.BorderTopColor.A)
    && finiteVulkanSceneValue(node.BorderRightColor.R)
    && finiteVulkanSceneValue(node.BorderRightColor.G)
    && finiteVulkanSceneValue(node.BorderRightColor.B)
    && finiteVulkanSceneValue(node.BorderRightColor.A)
    && finiteVulkanSceneValue(node.BorderBottomColor.R)
    && finiteVulkanSceneValue(node.BorderBottomColor.G)
    && finiteVulkanSceneValue(node.BorderBottomColor.B)
    && finiteVulkanSceneValue(node.BorderBottomColor.A)
    && finiteVulkanSceneValue(node.BorderLeftColor.R)
    && finiteVulkanSceneValue(node.BorderLeftColor.G)
    && finiteVulkanSceneValue(node.BorderLeftColor.B)
    && finiteVulkanSceneValue(node.BorderLeftColor.A)

  private func RetainedBorderCandidate(node Node, bounds ConservativeBounds) bool -> node.Kind == NodeKind.Container || node.Kind == NodeKind.Button
  ? node.Children.Count == 0
    && !bounds.IsEmpty
    && node.BackgroundColor.A <= 0.0F
    && HasBorderWidth(node, bounds): false

  private func RetainedBorderEligible(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    context VulkanSceneTraversalContext,
    out record PerEdgeBorderRecord) bool{
      record = PerEdgeBorderRecord{}
      if !RetainedCommonEligible(node, bounds, opacity, context, true)
        || node.Opacity != 1.0
        || node.BackgroundColor.A > 0.0F
        || node.BorderStyle != BorderStyle.Solid
        || HasRadius(node, bounds)
        || !RetainedBorderColorsFinite(node) {
          return false
        }
      record = RetainedBorderRecord(node, bounds, opacity)
      return RetainedBorderVisible(node, record)
    }

  private func RetainedLeafEligible(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    context VulkanSceneTraversalContext) bool -> RetainedBoxEligible(
      node, bounds, opacity, context, true)

  private func RetainedParentBoxEligible(
    node Node,
    bounds ConservativeBounds,
    opacity float32,
    context VulkanSceneTraversalContext) bool -> ExactFloat(opacity, 1.0F)
    && RetainedBoxEligible(node, bounds, opacity, context, false)

  private func ExactFloat(left float32, right float32) bool -> BitConverter.SingleToInt32Bits(left) == BitConverter.SingleToInt32Bits(right)

  private func ExactBounds(left ConservativeBounds, right ConservativeBounds) bool -> ExactFloat(left.X, right.X) && ExactFloat(left.Y, right.Y)
    && ExactFloat(left.Width, right.Width) && ExactFloat(left.Height, right.Height)

  private func TryAppendRetainedBox(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    opacity float32,
    isLeaf bool) bool{
      if !owner.RetainedLeafValid
        || owner.RetainedLeafNodeKind != node.Kind
        || owner.RetainedLeafPaintVersion != node.ScenePaintVersion
        || !ExactBounds(owner.RetainedLeafBounds, bounds) {
          return false
        }
      let color = node.BackgroundColor.ToPackedRgba()
      if owner.RetainedLeafKind == SceneDrawKind.SolidBox {
        if HasRadius(node, bounds) {
          return false
        }
        let record = owner.RetainedLeafSolid
        if !ExactBounds(record.Bounds, bounds)
          || record.Color != color
          || !ExactFloat(record.Opacity, opacity)
          || record.TransformIndex != -1 {
            return false
          }
        frame.AppendRetainedSolidLeaf(ownerId, frameVersion, bounds, record, true)
        owner.RetainedBoxIsLeaf = isLeaf
        if isLeaf {
          IncrementSaturated(ref retainedLeaf.Hit)
        } else {
          IncrementSaturated(ref retainedParentBox.Hit)
        }
        return true
      }
      if owner.RetainedLeafKind == SceneDrawKind.RoundedBox {
        if !HasRadius(node, bounds) {
          return false
        }
        let record = owner.RetainedLeafRounded
        if !ExactBounds(record.Bounds, bounds)
          || !ExactFloat(record.RadiusTopLeft, Radius(node.BorderTopLeftRadius,
            node.BorderRadius, bounds))
          || !ExactFloat(record.RadiusTopRight, Radius(node.BorderTopRightRadius,
            node.BorderRadius, bounds))
          || !ExactFloat(record.RadiusBottomRight, Radius(node.BorderBottomRightRadius,
            node.BorderRadius, bounds))
          || !ExactFloat(record.RadiusBottomLeft, Radius(node.BorderBottomLeftRadius,
            node.BorderRadius, bounds))
          || record.Color != color
          || !ExactFloat(record.Opacity, opacity)
          || record.TransformIndex != -1 {
            return false
          }
        frame.AppendRetainedRoundedLeaf(ownerId, frameVersion, bounds, record, true)
        owner.RetainedBoxIsLeaf = isLeaf
        if isLeaf {
          IncrementSaturated(ref retainedLeaf.Hit)
        } else {
          IncrementSaturated(ref retainedParentBox.Hit)
        }
        return true
      }
      return false
    }

  private func RetainedBorderRecord(
    node Node,
    bounds ConservativeBounds,
    opacity float32) PerEdgeBorderRecord{
      let basis = MinDimension(bounds)
      return PerEdgeBorderRecord{
        Bounds: bounds,
        TopWidth: ResolveLength(node.BorderTopWidth, basis),
        RightWidth: ResolveLength(node.BorderRightWidth, basis),
        BottomWidth: ResolveLength(node.BorderBottomWidth, basis),
        LeftWidth: ResolveLength(node.BorderLeftWidth, basis),
        RadiusTopLeft: 0.0F,
        RadiusTopRight: 0.0F,
        RadiusBottomRight: 0.0F,
        RadiusBottomLeft: 0.0F,
        TopColor: EffectiveColor(node.BorderTopColor, opacity),
        RightColor: EffectiveColor(node.BorderRightColor, opacity),
        BottomColor: EffectiveColor(node.BorderBottomColor, opacity),
        LeftColor: EffectiveColor(node.BorderLeftColor, opacity),
        Style: uint32(int32(BorderStyle.Solid)),
        TransformIndex: -1,
      }
    }

  private func TryAppendRetainedBorder(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    record PerEdgeBorderRecord) bool{
      if !owner.RetainedLeafValid
        || owner.RetainedLeafKind != SceneDrawKind.PerEdgeBorder
        || owner.RetainedLeafNodeKind != node.Kind
        || owner.RetainedLeafPaintVersion != node.ScenePaintVersion
        || !ExactBounds(owner.RetainedLeafBounds, bounds) {
          return false
        }
      if !ExactBorder(owner.RetainedLeafBorder, record) {
        return false
      }
      frame.AppendRetainedBorderLeaf(ownerId, frameVersion, bounds, record, true)
      owner.RetainedBoxIsLeaf = true
      IncrementSaturated(ref retainedBorder.Hit)
      return true
    }

  private func AppendRetainedBoxRebuild(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    opacity float32,
    isLeaf bool) {
      let color = node.BackgroundColor.ToPackedRgba()
      let radiusTopLeft = Radius(node.BorderTopLeftRadius, node.BorderRadius, bounds)
      let radiusTopRight = Radius(node.BorderTopRightRadius, node.BorderRadius, bounds)
      let radiusBottomRight = Radius(node.BorderBottomRightRadius, node.BorderRadius, bounds)
      let radiusBottomLeft = Radius(node.BorderBottomLeftRadius, node.BorderRadius, bounds)
      if radiusTopLeft > 0.0F || radiusTopRight > 0.0F
        || radiusBottomRight > 0.0F || radiusBottomLeft > 0.0F {
          let record = RoundedBoxRecord{
            Bounds: bounds,
            RadiusTopLeft: radiusTopLeft,
            RadiusTopRight: radiusTopRight,
            RadiusBottomRight: radiusBottomRight,
            RadiusBottomLeft: radiusBottomLeft,
            Color: color,
            Opacity: opacity,
            TransformIndex: -1,
          }
          frame.AppendRetainedRoundedLeaf(ownerId, frameVersion, bounds, record, false)
          owner.RetainedLeafKind = SceneDrawKind.RoundedBox
          owner.RetainedLeafNodeKind = node.Kind
          owner.RetainedLeafPaintVersion = node.ScenePaintVersion
          owner.RetainedLeafBounds = bounds
          owner.RetainedLeafRounded = record
        } else {
          let record = SolidBoxRecord{
            Bounds: bounds,
            Color: color,
            Opacity: opacity,
            TransformIndex: -1,
          }
          frame.AppendRetainedSolidLeaf(ownerId, frameVersion, bounds, record, false)
          owner.RetainedLeafKind = SceneDrawKind.SolidBox
          owner.RetainedLeafNodeKind = node.Kind
          owner.RetainedLeafPaintVersion = node.ScenePaintVersion
          owner.RetainedLeafBounds = bounds
          owner.RetainedLeafSolid = record
        }
      owner.RetainedLeafValid = true
      owner.RetainedBoxIsLeaf = isLeaf
      if isLeaf {
        IncrementSaturated(ref retainedLeaf.Rebuild)
      } else {
        IncrementSaturated(ref retainedParentBox.Rebuild)
      }
      emittedNodeCount = emittedNodeCount + 1
    }

  private func AppendRetainedBorderRebuild(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    record PerEdgeBorderRecord) {
      frame.AppendRetainedBorderLeaf(ownerId, frameVersion, bounds, record, false)
      owner.RetainedLeafKind = SceneDrawKind.PerEdgeBorder
      owner.RetainedLeafNodeKind = node.Kind
      owner.RetainedLeafPaintVersion = node.ScenePaintVersion
      owner.RetainedLeafBounds = bounds
      owner.RetainedLeafBorder = record
      owner.RetainedLeafValid = true
      owner.RetainedBoxIsLeaf = true
      IncrementSaturated(ref retainedBorder.Rebuild)
      emittedNodeCount = emittedNodeCount + 1
    }

  private func TryAppendRetainedLeaf(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    opacity float32) bool -> TryAppendRetainedBox(node, owner, ownerId, bounds, opacity, true)

  private func AppendRetainedLeafRebuild(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    opacity float32) {
      AppendRetainedBoxRebuild(node, owner, ownerId, bounds, opacity, true)
    }

  private func TryAppendRetainedBorderLeaf(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    record PerEdgeBorderRecord) bool -> TryAppendRetainedBorder(node, owner, ownerId, bounds, record)

  private func AppendRetainedBorderLeafRebuild(
    node Node,
    owner VulkanSceneOwnerId,
    ownerId uint64,
    bounds ConservativeBounds,
    record PerEdgeBorderRecord) {
      AppendRetainedBorderRebuild(node, owner, ownerId, bounds, record)
    }

  internal prop PartialRedrawSafe bool{
    get -> partialRedrawSafe
  }

  internal prop DamageJournal VulkanSceneDamageJournal? {
    get -> damageJournal
  }

  internal func InitializeRetention(capacity int32) {
    let journalCapacity = capacity < 32 ? 32 : capacity * 2
    damageJournal = VulkanSceneDamageJournal(journalCapacity)
    retentionProofs = VulkanSceneRetentionProofStore(capacity)
  }

  internal func BuildDamage(appliedVersion uint64, currentVersion uint64,
    scaleX float32, scaleY float32, extentWidth uint32, extentHeight uint32,
    out region VulkanDamageRegion, out fullRedraw bool) bool{
      guard let journal = damageJournal else {
        region = VulkanDamageRegion{}
        fullRedraw = true
        return true
      }
      let tracked = journal.BuildSince(appliedVersion, currentVersion, scaleX, scaleY,
        extentWidth, extentHeight, out region, out fullRedraw)
      if !partialRedrawSafe {
        region = VulkanDamageRegion{
          X: 0,
          Y: 0,
          Width: int32(extentWidth),
          Height: int32(extentHeight),
        }
        fullRedraw = true
        return true
      }
      return tracked
    }

  private func ClassifyRetainedChunks() {
    guard let journal = damageJournal else {
      throw InvalidOperationException("Vulkan scene damage journal is unavailable")
    }
    guard let proofs = retentionProofs else {
      throw InvalidOperationException("Vulkan retained scene proof storage is unavailable")
    }
    journal.BeginVersion(frameVersion)
    let currentCount = frame.ChunkCount
    let retainedChunks = proofs.Chunks
    var topologySame = proofs.Ready && proofs.ChunkCount == currentCount
    var index int32 = 0
    while index < currentCount {
      let current = frame.Chunks[index]
      if topologySame {
        let prior = retainedChunks[index]
        if prior.OwnerId != current.OwnerId {
          topologySame = false
        } else if !IsPlaceholderChunkTransition(current, prior) {
          var topologyMatches bool = false
          if current.RetentionState != SceneChunkRetentionState.Generic
            && prior.RetentionState != SceneChunkRetentionState.Generic{
              topologyMatches = ExactChunkTopology(index, prior)
            } else if prior.TopologyKey == current.TopologyKey {
              topologyMatches = ExactChunkTopology(index, prior)
            }
          if !topologyMatches {
            if current.DrawCount == 0 || prior.ProofDrawCount == 0 {
              topologySame = false
            }
          }
        }
      }
      index = index + 1
    }
    if !proofs.Ready {
      journal.MarkFullRedraw()
      index = 0
      while index < currentCount {
        let current = frame.Chunks[index]
        journal.AddChange(ConservativeBounds{}, false, current.Bounds, true)
        index = index + 1
      }
    } else if !topologySame {
      journal.MarkFullRedraw()
      let maximum = proofs.ChunkCount > currentCount ? proofs.ChunkCount : currentCount
      index = 0
      while index < maximum {
        let hasOld = index < proofs.ChunkCount
        let hasNew = index < currentCount
        let oldBounds = hasOld ? retainedChunks[index].Bounds : ConservativeBounds{}
        let newBounds = hasNew ? frame.Chunks[index].Bounds : ConservativeBounds{}
        journal.AddChange(oldBounds, hasOld, newBounds, hasNew)
        index = index + 1
      }
    } else {
      index = 0
      while index < currentCount {
        let current = frame.Chunks[index]
        let prior = retainedChunks[index]
        if IsPlaceholderChunkTransition(current, prior) {
          journal.AddChange(prior.Bounds, true, current.Bounds, true)
          frame.Chunks[index].Dirty = true
        } else if current.RetentionState == SceneChunkRetentionState.ExactLeafRebuild {
          journal.AddChange(prior.Bounds, true, current.Bounds, true)
        } else if (current.RetentionState == SceneChunkRetentionState.ExactLeafHit
            && prior.RetentionState != SceneChunkRetentionState.Generic)
          || (current.ContentKey == prior.ContentKey
              && ((current.RetentionState != SceneChunkRetentionState.Generic
                  && prior.RetentionState != SceneChunkRetentionState.Generic)
                  || ExactGenericChunkContent(index, prior))) {
                    frame.Chunks[index].Version = prior.Version
                    frame.Chunks[index].Dirty = false
                  } else {
                    journal.AddChange(prior.Bounds, true, current.Bounds, true)
                  }
        index = index + 1
      }
    }
    partialRedrawSafe = proofs.Ready && topologySame && !IsPartialUnsafe()
    if !partialRedrawSafe {
      journal.MarkFullRedraw()
    }
    journal.EndVersion()
    proofs.Capture(frame)
  }

  private func IsPlaceholderChunkTransition(
    current SceneChunk,
    prior VulkanSceneChunkIdentity) bool{
      if current.OwnerId != prior.OwnerId {
        return false
      }
      let currentPlaceholder = current.RetentionState == SceneChunkRetentionState.Generic
        && current.DrawCount == 0
      let priorPlaceholder = prior.RetentionState == SceneChunkRetentionState.Generic
        && prior.ProofDrawCount == 0
      if currentPlaceholder {
        return prior.RetentionState != SceneChunkRetentionState.Generic
          || prior.ProofDrawCount > 0
      }
      return priorPlaceholder && current.DrawCount > 0
    }

  private func IsPartialUnsafe() bool {
    if unsupportedNodeCount != 0 || unsupportedPrimitiveCount != 0
      || clipCount != 0 || pathClipCount != 0 || clipMaskCount != 0
      || clipChainCount != 0 {
        return true
      }
    var index int32 = 0
    while index < frame.DrawRefCount {
      let reference = frame.DrawRefs[index]
      let kind = reference.Kind
      if kind == SceneDrawKind.PerEdgeBorder {
        let value = frame.PerEdgeBorders[reference.Index]
        if value.Style != uint32(int32(BorderStyle.Solid))
          || value.RadiusTopLeft != 0.0F || value.RadiusTopRight != 0.0F
          || value.RadiusBottomRight != 0.0F
          || value.RadiusBottomLeft != 0.0F
          || value.TransformIndex != -1 {
            return true
          }
      } else if kind == SceneDrawKind.CachedImage {
        if frame.CachedImages[reference.Index].TransformIndex != -1 {
          return true
        }
      } else if kind != SceneDrawKind.SolidBox && kind != SceneDrawKind.RoundedBox
        && kind != SceneDrawKind.CachedTextSegment{
          return true
        }
      index = index + 1
    }
    return false
  }

  private func ExactChunkTopology(index int32, prior VulkanSceneChunkIdentity) bool {
    let current = frame.Chunks[index]
    let currentExactLeaf = current.RetentionState != SceneChunkRetentionState.Generic
    let priorExactLeaf = prior.RetentionState != SceneChunkRetentionState.Generic
    if currentExactLeaf && priorExactLeaf {
      if current.DrawCount == 1 && current.ResourceCount == 0 {
        return prior.ExactLeafKind == frame.DrawRefs[current.FirstDraw].Kind
      }
    } else if currentExactLeaf != priorExactLeaf {
      return false
    }
    return current.DrawCount == prior.ProofDrawCount
      && current.ResourceCount == prior.ProofResourceCount
  }

  private func ExactGenericChunkContent(index int32,
    prior VulkanSceneChunkIdentity) bool{
      let current = frame.Chunks[index]
      if current.RetentionState != SceneChunkRetentionState.Generic
        || prior.RetentionState != SceneChunkRetentionState.Generic
        || !prior.ProofValid
        || !ExactBounds(current.Bounds, prior.Bounds) {
          return false
        }
      guard let proofs = retentionProofs else {
        return false
      }
      let draws = proofs.Draws
      let resources = proofs.Resources
      let cachedTextSegments = proofs.CachedTextSegments
      let cachedImages = proofs.CachedImages
      let textProof = proofs.TextProofs[index]
      let imageProof = proofs.ImageProofs[index]
      if textProof.HasText {
        if textProof.CachedTextSegmentStart < 0
          || textProof.CachedTextSegmentCount < 0
          || textProof.CachedTextSegmentStart > proofs.CachedTextSegmentCount
          || textProof.CachedTextSegmentCount > proofs.CachedTextSegmentCount
        -textProof.CachedTextSegmentStart{
          return false
        }
      }
      if imageProof.HasImage {
        if imageProof.CachedImageStart < 0
          || imageProof.CachedImageCount < 0
          || imageProof.CachedImageStart > proofs.CachedImageCount
          || imageProof.CachedImageCount > proofs.CachedImageCount
        -imageProof.CachedImageStart{
          return false
        }
      }
      var segmentProofIndex int32 = 0
      var imageProofIndex int32 = 0
      var drawIndex int32 = 0
      while drawIndex < current.DrawCount {
        let reference = frame.DrawRefs[current.FirstDraw + drawIndex]
        let retained = draws[prior.ProofDrawStart + drawIndex]
        if reference.Kind != retained.Kind || reference.Flags != retained.Flags
          || reference.ClipChainId != retained.ClipChainId{
            return false
          }
        if reference.Kind == SceneDrawKind.SolidBox {
          if !ExactSolid(frame.SolidBoxes[reference.Index], retained.Solid) {
            return false
          }
        } else if reference.Kind == SceneDrawKind.RoundedBox {
          if !ExactRounded(frame.RoundedBoxes[reference.Index], retained.Rounded) {
            return false
          }
        } else if reference.Kind == SceneDrawKind.PerEdgeBorder {
          if !ExactBorder(frame.PerEdgeBorders[reference.Index], retained.Border) {
            return false
          }
        } else if reference.Kind == SceneDrawKind.CachedImage {
          if !imageProof.HasImage
            || imageProofIndex >= imageProof.CachedImageCount
            || !ExactCachedImage(frame.CachedImages[reference.Index],
              cachedImages[imageProof.CachedImageStart + imageProofIndex]) {
                return false
              }
          imageProofIndex = imageProofIndex + 1
        } else if reference.Kind == SceneDrawKind.CachedTextSegment {
          if !textProof.HasText
            || segmentProofIndex >= textProof.CachedTextSegmentCount
            || !ExactCachedTextSegment(frame.CachedTextSegments[reference.Index],
              cachedTextSegments[
                textProof.CachedTextSegmentStart + segmentProofIndex]) {
                  return false
                }
          segmentProofIndex = segmentProofIndex + 1
        } else {
          return false
        }
        drawIndex = drawIndex + 1
      }
      if textProof.HasText
        && segmentProofIndex != textProof.CachedTextSegmentCount{
          return false
        }
      if imageProof.HasImage
        && imageProofIndex != imageProof.CachedImageCount{
          return false
        }
      var resourceIndex int32 = 0
      while resourceIndex < current.ResourceCount {
        let currentResource = frame.ResourceRefs[current.FirstResource + resourceIndex]
        let retainedResource = resources[prior.ProofResourceStart + resourceIndex]
        if !ExactResource(currentResource, retainedResource) {
          return false
        }
        resourceIndex = resourceIndex + 1
      }
      return true
    }

  private func ExactSolid(left SolidBoxRecord, right SolidBoxRecord) bool -> ExactBounds(left.Bounds, right.Bounds)
    && left.Color == right.Color
    && ExactFloat(left.Opacity, right.Opacity)
    && left.TransformIndex == right.TransformIndex

  private func ExactRounded(left RoundedBoxRecord, right RoundedBoxRecord) bool -> ExactBounds(left.Bounds, right.Bounds)
    && ExactFloat(left.RadiusTopLeft, right.RadiusTopLeft)
    && ExactFloat(left.RadiusTopRight, right.RadiusTopRight)
    && ExactFloat(left.RadiusBottomRight, right.RadiusBottomRight)
    && ExactFloat(left.RadiusBottomLeft, right.RadiusBottomLeft)
    && ExactFloat(left.OpaqueBorderWidth, right.OpaqueBorderWidth)
    && ExactFloat(left.OpaqueBorderHeight, right.OpaqueBorderHeight)
    && left.Color == right.Color
    && ExactFloat(left.Opacity, right.Opacity)
    && left.TransformIndex == right.TransformIndex

  private func ExactBorder(left PerEdgeBorderRecord, right PerEdgeBorderRecord) bool -> ExactBounds(left.Bounds, right.Bounds)
    && ExactFloat(left.TopWidth, right.TopWidth)
    && ExactFloat(left.RightWidth, right.RightWidth)
    && ExactFloat(left.BottomWidth, right.BottomWidth)
    && ExactFloat(left.LeftWidth, right.LeftWidth)
    && ExactFloat(left.RadiusTopLeft, right.RadiusTopLeft)
    && ExactFloat(left.RadiusTopRight, right.RadiusTopRight)
    && ExactFloat(left.RadiusBottomRight, right.RadiusBottomRight)
    && ExactFloat(left.RadiusBottomLeft, right.RadiusBottomLeft)
    && left.TopColor == right.TopColor
    && left.RightColor == right.RightColor
    && left.BottomColor == right.BottomColor
    && left.LeftColor == right.LeftColor
    && left.Style == right.Style
    && left.TransformIndex == right.TransformIndex

  private func ExactCachedTextSegment(
    left CachedTextSegmentRefRecord,
    right CachedTextSegmentRefRecord) bool -> ExactBounds(left.Bounds, right.Bounds)
    && left.SegmentId == right.SegmentId
    && left.SegmentVersion == right.SegmentVersion
    && left.GlyphCount == right.GlyphCount
    && left.ClipChainId == right.ClipChainId
    && Object.ReferenceEquals(left.Segment, right.Segment)

  private func ExactCachedImage(
    left CachedImageRefRecord,
    right VulkanSceneCachedImageProof) bool -> ExactBounds(left.Bounds, right.Bounds)
    && ExactFloat(left.SourceX, right.SourceX)
    && ExactFloat(left.SourceY, right.SourceY)
    && ExactFloat(left.SourceWidth, right.SourceWidth)
    && ExactFloat(left.SourceHeight, right.SourceHeight)
    && ExactFloat(left.Opacity, right.Opacity)
    && left.Sampling == right.Sampling
    && left.TransformIndex == right.TransformIndex

  private func ExactResource(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind && left.LogicalId == right.LogicalId
    && left.Version == right.Version

}
