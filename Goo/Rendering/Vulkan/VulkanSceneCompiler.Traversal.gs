package Goo

import Facebook.Yoga
import System
import System.Runtime.CompilerServices

internal partial class VulkanSceneCompiler {
  private func CompileRetainedParentChildren(
    node Node,
    context VulkanSceneTraversalContext) {
      let children = Stacking.Children(node)
      var index int32 = 0
      while index < children.Count {
        if !children[index].IsPortal {
          CompileNode(children[index], context)
        }
        index = index + 1
      }
      frame.SetActiveClipChain(context.ParentPathClipChainId)
    }

  private func CompileScrollbarParts(
    node Node,
    ownerId uint64,
    bounds ConservativeBounds,
    context VulkanSceneTraversalContext,
    transform VulkanSceneTransformState,
    activePathClipChainId int32,
    ownerClipIndex int32,
    ownerOpacity float32) {
      let parts = ScrollbarParts.ActiveChildren(node)
      if parts.Count == 0 { return }
      let parentClipIndex = ownerClipIndex >= 0
        ? ownerClipIndex : context.ParentRectClipIndex
      let parentClipDepth = context.ParentRectClipDepth + (ownerClipIndex >= 0 ? 1 : 0)
      let resolvedTransform = ResolveCompilerFrameTransform(transform.Index)
      let activeBounds = IntersectBounds(context.ActiveClipBounds,
        TransformCompilerBounds(bounds, resolvedTransform))
      frame.SetActiveClipChain(activePathClipChainId)
      frame.BeginChunk(ownerId, frameVersion, bounds, false)
      let sidecarClipIndex = frame.AddRectClipBegin(RectClipRecord{
        Bounds: bounds,
        TransformIndex: transform.Index,
        ParentIndex: parentClipIndex,
      })
      clipCount = clipCount + 1
      frame.EndChunk()
      let partContext = VulkanSceneTraversalContext{
        ParentTransformIndex: transform.Index,
        ParentRectClipIndex: sidecarClipIndex,
        ParentOpacity: ownerOpacity,
        ParentAxisAligned: context.ParentAxisAligned && transform.AxisAligned,
        ParentRectClipDepth: parentClipDepth + 1,
        ParentPathClipChainId: activePathClipChainId,
        ParentIsolation: context.ParentIsolation || transform.Index != context.ParentTransformIndex
          || node.HasClipPath || ownerClipIndex >= 0,
        ExactCullContextSafe: context.ExactCullContextSafe,
        ActiveClipBounds: activeBounds,
      }
      for part in parts {
        let alpha = scrollbarAlpha(node, ScrollbarParts.IsVertical(node, part))
        var childContext = partContext
        childContext.ParentOpacity = ownerOpacity * alpha
        CompileNode(part, childContext)
      }
      frame.SetActiveClipChain(context.ParentPathClipChainId)
      frame.BeginChunk(ownerId, frameVersion, bounds, false)
      frame.AddRectClipEnd(RectClipRecord{
        Bounds: bounds,
        TransformIndex: transform.Index,
        ParentIndex: parentClipIndex,
      })
      frame.EndChunk()
    }

  private func CompileNode(
    node Node,
    context VulkanSceneTraversalContext) {
      let owner = Owner(node)
      let ownerId = owner.Value
      frame.SetActiveClipChain(context.ParentPathClipChainId)
      if node.Retired || node.Display == Display.None || node.Visibility == Visibility.Hidden {
        InvalidateRetainedBox(owner)
        InvalidateRetainedText(owner)
        skippedNodeCount = skippedNodeCount + 1
        return
      }

      let opacity = EffectiveOpacity(context.ParentOpacity, node.Opacity)
      if opacity <= 0.0F {
        InvalidateRetainedBox(owner)
        InvalidateRetainedText(owner)
        skippedNodeCount = skippedNodeCount + 1
        return
      }
      let localOpacity = EffectiveOpacity(1.0F, node.Opacity)
      let shaderEffect = if styleMaskHas(node.AppliedMask, StyleField.ShaderEffect) {
        node.ShaderEffect
      } else { nil }
      let isolatesOpacity = Portals.SourceChildCount(node) != 0 && localOpacity < 1.0F
      let isolatesBlend = blendModeSupported && BlendModeSupported(node.BlendMode)
        && node.BlendMode != BlendMode.Normal
      let combinesEffectAndBlend = shaderEffect != nil && isolatesBlend
      let isolates = isolatesOpacity || isolatesBlend || shaderEffect != nil
      visibleNodeCount = visibleNodeCount + 1
      if node.ScrollX != 0.0F || node.ScrollY != 0.0F {
        scrollNodeCount = scrollNodeCount + 1
      }
      let bounds = NodeBounds(node)
      let hasActiveScrollbarParts = ScrollbarParts.HasActive(node)
      let earlyOverflowPreflight = PreflightRectOverflowClip(
        node, bounds, context.ParentAxisAligned, context.ParentRectClipDepth)
      let exactCandidate = ExactTextClipCullEligible(node, bounds,
        context.ExactCullContextSafe, context.ParentAxisAligned, earlyOverflowPreflight)
      if exactCandidate {
        exactTextClipCandidateCount = exactTextClipCandidateCount + 1
        if exactTextClipCullEnabled && !hasActiveScrollbarParts
          && IntersectBounds(bounds, context.ActiveClipBounds).IsEmpty{
            InvalidateRetainedBox(owner)
            InvalidateRetainedText(owner)
            frame.AppendPlaceholderChunk(ownerId, frameVersion, bounds)
            skippedNodeCount = skippedNodeCount + 1
            exactTextClipCullCount = exactTextClipCullCount + 1
            return
          }
      }
      let viewportCulled = StrictTextViewportCulled(
        node, owner, bounds, context.ActiveClipBounds,
        context.ParentTransformIndex, context.ParentAxisAligned, context.ParentIsolation)
      if viewportCulled && !hasActiveScrollbarParts {
        cachedTextPaintCullCount = cachedTextPaintCullCount + 1
        InvalidateRetainedBox(owner)
        if node.Kind == NodeKind.Text
          && RetainedTextEligible(node, owner, bounds, opacity, context) {
            frame.AppendPlaceholderChunk(ownerId, frameVersion, bounds)
            skippedNodeCount = skippedNodeCount + 1
            return
          }
        InvalidateRetainedText(owner)
        skippedNodeCount = skippedNodeCount + 1
        return
      }
    var retainedLeafEligible = false
      var retainedTextEligible = false
      if node.Kind == NodeKind.Text || node.Kind == NodeKind.Entry {
        InvalidateRetainedBox(owner)
        IncrementSaturated(ref retainedText.Total)
        retainedTextEligible = RetainedTextEligible(node, owner, bounds, opacity, context)
        if hasActiveScrollbarParts { retainedTextEligible = false }
        if retainedTextEligible {
          if TryAppendRetainedText(node, owner, bounds, opacity,
            context.ParentTransformIndex, context.ParentRectClipIndex, context.ParentRectClipDepth,
            context.ActiveClipBounds) {
              emittedNodeCount = emittedNodeCount + 1
              return
            }
        } else {
          InvalidateRetainedText(owner)
          IncrementSaturated(ref retainedText.Fallback)
        }
      } else if Portals.SourceChildCount(node) == 0 && !hasActiveScrollbarParts {
        InvalidateRetainedText(owner)
        let retainedBorderCandidate = RetainedBorderCandidate(node, bounds)
        if retainedBorderCandidate {
          IncrementSaturated(ref retainedBorder.Total)
          var retainedBorderRecord PerEdgeBorderRecord
          let retainedBorderEligible = RetainedBorderEligible(node, bounds, opacity,
            context, out retainedBorderRecord)
          if retainedBorderEligible {
            if TryAppendRetainedBorderLeaf(node, owner, ownerId, bounds,
              retainedBorderRecord) {
                emittedNodeCount = emittedNodeCount + 1
                return
              }
            InvalidateRetainedBox(owner)
            AppendRetainedBorderLeafRebuild(node, owner, ownerId, bounds,
              retainedBorderRecord)
            return
          }
          InvalidateRetainedBox(owner)
          IncrementSaturated(ref retainedBorder.Fallback)
        } else {
          IncrementSaturated(ref retainedLeaf.Total)
          retainedLeafEligible = RetainedLeafEligible(node, bounds, opacity, context)
          if retainedLeafEligible {
            if TryAppendRetainedLeaf(node, owner, ownerId, bounds, opacity) {
              emittedNodeCount = emittedNodeCount + 1
              return
            }
            InvalidateRetainedBox(owner)
          } else {
            InvalidateRetainedBox(owner)
            IncrementSaturated(ref retainedLeaf.Fallback)
          }
          if retainedLeafEligible {
            AppendRetainedLeafRebuild(node, owner, ownerId, bounds, opacity)
            return
          }
        }
      } else {
        InvalidateRetainedText(owner)
        let retainedParentBoxEligible = RetainedParentBoxEligible(
          node, bounds, opacity, context)
        if retainedParentBoxEligible && !hasActiveScrollbarParts {
          IncrementSaturated(ref retainedParentBox.Total)
          if TryAppendRetainedBox(node, owner, ownerId, bounds, opacity, false) {
            emittedNodeCount = emittedNodeCount + 1
            CompileRetainedParentChildren(node, context)
            return
          }
          InvalidateRetainedBox(owner)
          AppendRetainedBoxRebuild(node, owner, ownerId, bounds, opacity, false)
          CompileRetainedParentChildren(node, context)
          return
        }
        if owner.RetainedLeafValid && !owner.RetainedBoxIsLeaf {
          InvalidateRetainedBox(owner)
          IncrementSaturated(ref retainedParentBox.Fallback)
        } else if owner.RetainedLeafValid {
          InvalidateRetainedBox(owner)
        }
      }
      let shadowEligible = ShadowContextSupported(node)
      let chunkBounds = ExpandedChunkBounds(node, bounds, shadowEligible)
      MarkUnsupportedNode(node)
      RecordUnsupportedFields(node, bounds)

      let chunk = frame.BeginChunk(ownerId, frameVersion, chunkBounds, true)
      let transform = AddNodeTransform(node, context.ParentTransformIndex)
      transformCount = frame.TransformCount
      let axisAligned = context.ParentAxisAligned && transform.AxisAligned
      let subtreeBounds = isolates
      ? LayerSubtreeBounds(node, ResolveCompilerFrameTransform(context.ParentTransformIndex),
        context.ActiveClipBounds) : ConservativeBounds{}
      var layerRecord LayerRecord
      var outerLayerRecord LayerRecord
      var innerLayerRecord LayerRecord
      if isolates {
        if combinesEffectAndBlend {
          innerLayerRecord = MakeLayerRecord(ownerId, subtreeBounds, 1.0F,
            BlendMode.Normal, shaderEffect)
          outerLayerRecord = MakeLayerRecord(ownerId, subtreeBounds, localOpacity,
            node.BlendMode, nil)
          if (innerLayerRecord.Flags & uint32(LayerRecordFlags.SamplesBackdrop)) != 0u {
            innerLayerRecord.Flags = innerLayerRecord.Flags
            | uint32(LayerRecordFlags.BorrowsParentBackdrop)
            outerLayerRecord.OriginX = innerLayerRecord.OriginX
            outerLayerRecord.OriginY = innerLayerRecord.OriginY
            outerLayerRecord.ExtentWidth = innerLayerRecord.ExtentWidth
            outerLayerRecord.ExtentHeight = innerLayerRecord.ExtentHeight
          }
        } else {
          layerRecord = MakeLayerRecord(ownerId, subtreeBounds, localOpacity,
            isolatesBlend ? node.BlendMode : BlendMode.Normal, shaderEffect)
        }
        frame.SetActiveClipChain(context.ParentPathClipChainId)
        if combinesEffectAndBlend {
          frame.AddLayerBegin(outerLayerRecord)
          frame.AddLayerBegin(innerLayerRecord)
        } else {
          frame.AddLayerBegin(layerRecord)
        }
      }
      let pathClip = ResolvePathClip(node, bounds, transform.Index, context.ParentPathClipChainId)
      var activePathClipChainId = context.ParentPathClipChainId
      if node.HasClipPath && ClipPaths.Path(node).CommandCount != 0 {
        if pathClip.Emitted {
          activePathClipChainId = pathClip.ChainIndex
          pathClipCount = pathClipCount + 1
        } else {
          MarkPathClipUnsupported(node)
        }
      }
      let overflowPreflight = PreflightRectOverflowClip(
        node, bounds, axisAligned, context.ParentRectClipDepth)
      let clipsX = overflowPreflight.ClipsX
      let clipsY = overflowPreflight.ClipsY
      let bothAxes = overflowPreflight.BothAxes
      let hasRadius = overflowPreflight.HasRadius
      let paddingEdgeBounds = PaddingEdgeBounds(node, bounds)
      let scrollbarContentBounds = ScrollbarViewportBounds(node, paddingEdgeBounds)
      var overflowPathClipChainId = activePathClipChainId
      var roundedOverflowClip = false
      var mixedOverflowClip = false
      if hasRadius {
        let roundedClip = ResolveRoundedOverflowClip(node, bounds, paddingEdgeBounds,
          transform.Index, activePathClipChainId)
        if roundedClip.Emitted {
          overflowPathClipChainId = roundedClip.ChainIndex
          roundedOverflowClip = true
        }
      } else if clipsX != clipsY {
        let mixedClip = ResolveMixedOverflowClip(node, paddingEdgeBounds, transform.Index,
          activePathClipChainId, clipsX)
        if mixedClip.Emitted {
          overflowPathClipChainId = mixedClip.ChainIndex
          mixedOverflowClip = true
        }
      }
    let shapeGeometry = node.Kind == NodeKind.Shape
    ? ShapeGeometry.Resolve(
      node,
      Rect{X: bounds.X, Y: bounds.Y, W: bounds.Width, H: bounds.Height}) : ResolvedShapeGeometry{}
    var shapePaintClip = false
      let nodeContentClipChainId = node.Kind == NodeKind.Shape
      ? overflowPathClipChainId : activePathClipChainId
      var paintPathClipChainId = nodeContentClipChainId
      if ShapePaintNeedsMask(node) {
        let shapeClip = ResolveShapePaintClip(node, bounds, shapeGeometry, transform.Index,
          nodeContentClipChainId)
        if shapeClip.Emitted {
          paintPathClipChainId = shapeClip.ChainIndex
          shapePaintClip = true
        } else {
          MarkShapePaintUnsupported(node)
        }
      }
      frame.SetActiveClipChain(paintPathClipChainId)
      let contentOpacity = isolates ? 1.0F : opacity
      if node.Kind != NodeKind.Shape {
        PaintNodeBackground(node, bounds, contentOpacity, transform.Index)
        if node.Kind != NodeKind.Image && HasBorderWidth(node, bounds) {
          frame.SetActiveClipChain(activePathClipChainId)
          PaintBorder(node, bounds, contentOpacity, transform.Index)
        }
      }
      var clipIndex int32 = -1
      var childClipDepth = context.ParentRectClipDepth
      if clipsX || clipsY {
        if bothAxes {
          let depthExceeded = overflowPreflight.DepthExceeded
          let pathDepthExceeded = activePathClipChainId >= 0
            && activePathClipChainId < frame.ClipChainCount
            && (activePathClipChainId == 0
              ? 0 : frame.ClipChains[activePathClipChainId].Depth) >= MaxPathClipDepth
          if overflowPreflight.RectangularEmittable {
            let clip = RectClipRecord{
              Bounds: paddingEdgeBounds,
              TransformIndex: transform.Index,
              ParentIndex: context.ParentRectClipIndex,
            }
            clipIndex = frame.AddRectClipBegin(clip)
            clipCount = clipCount + 1
            childClipDepth = context.ParentRectClipDepth + 1
          }
          if !roundedOverflowClip && !axisAligned {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              VulkanSceneUnsupportedField.OverflowX,
              VulkanSceneUnsupportedPrimitive.RectClipNonAxisAligned)
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.OverflowY,
              VulkanSceneUnsupportedPrimitive.RectClipNonAxisAligned)
            if hasRadius {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BorderRadius,
                VulkanSceneUnsupportedPrimitive.RectClipRounded)
            }
            if depthExceeded || pathDepthExceeded {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ClipDepth,
                VulkanSceneUnsupportedPrimitive.RectClipDepth)
            }
          } else if !roundedOverflowClip && hasRadius {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              VulkanSceneUnsupportedField.BorderRadius,
              VulkanSceneUnsupportedPrimitive.RectClipRounded)
            if depthExceeded || pathDepthExceeded {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ClipDepth,
                VulkanSceneUnsupportedPrimitive.RectClipDepth)
            }
          } else if !roundedOverflowClip && depthExceeded {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              VulkanSceneUnsupportedField.ClipDepth,
              VulkanSceneUnsupportedPrimitive.RectClipDepth)
          }
        } else {
          if !mixedOverflowClip {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              clipsX ? VulkanSceneUnsupportedField.OverflowX : VulkanSceneUnsupportedField.OverflowY,
              VulkanSceneUnsupportedPrimitive.RectClipMixedAxis)
            let pathDepthExceeded = activePathClipChainId >= 0
              && activePathClipChainId < frame.ClipChainCount
              && (activePathClipChainId == 0
                ? 0 : frame.ClipChains[activePathClipChainId].Depth) >= MaxPathClipDepth
            if pathDepthExceeded {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ClipDepth,
                VulkanSceneUnsupportedPrimitive.RectClipDepth)
            }
          }
        }
      }
      var textComplete bool
      PaintNode(node, bounds, contentOpacity, transform.Index, axisAligned, childClipDepth,
        shapePaintClip, nodeContentClipChainId, overflowPathClipChainId,
      shapeGeometry, out textComplete)
      let ownerContentClipIndex = clipIndex >= 0 ? clipIndex : context.ParentRectClipIndex
      var scrollbarContentClipIndex int32 = -1
      if !scrollbarContentBounds.IsEmpty {
        scrollbarContentClipIndex = frame.AddRectClipBegin(RectClipRecord{
          Bounds: scrollbarContentBounds,
          TransformIndex: transform.Index,
          ParentIndex: ownerContentClipIndex,
        })
        clipCount = clipCount + 1
        childClipDepth = childClipDepth + 1
      }
      let inheritedChildClipIndex = scrollbarContentClipIndex >= 0
      ? scrollbarContentClipIndex : ownerContentClipIndex
      var editorContentClipIndex int32 = -1
      var editorContentBounds ConservativeBounds
      if node.Kind == NodeKind.Editor {
        editorContentBounds = TextEditorContentBounds(node)
        if !editorContentBounds.IsEmpty && TextEditorSupported(node)
          && TextClipSupported(node, axisAligned, childClipDepth) {
            frame.SetActiveClipChain(overflowPathClipChainId)
            editorContentClipIndex = frame.AddRectClipBegin(RectClipRecord{
              Bounds: editorContentBounds,
              TransformIndex: transform.Index,
              ParentIndex: inheritedChildClipIndex,
            })
            clipCount = clipCount + 1
            childClipDepth = childClipDepth + 1
            PaintEditorContent(node, contentOpacity, transform.Index)
          }
      }
      frame.SetActiveClipChain(overflowPathClipChainId)
      frame.EndChunk()
      if retainedTextEligible {
        if textComplete && CaptureRetainedTextSnapshot(owner, chunk) {
          StoreRetainedTextFingerprint(node, owner, bounds, opacity,
            context.ParentTransformIndex, context.ParentRectClipDepth, context.ActiveClipBounds)
          frame.Chunks[chunk].RetentionState = SceneChunkRetentionState.ExactLeafRebuild
          IncrementSaturated(ref retainedText.Rebuild)
        } else {
          InvalidateRetainedText(owner)
          IncrementSaturated(ref retainedText.Fallback)
        }
      }
      emittedNodeCount = emittedNodeCount + 1

      let childClipIndex = editorContentClipIndex >= 0
      ? editorContentClipIndex : inheritedChildClipIndex
      var childClipBounds = context.ActiveClipBounds
      let resolvedTransform = ResolveCompilerFrameTransform(transform.Index)
      if clipIndex >= 0 {
        childClipBounds = IntersectBounds(childClipBounds,
          TransformCompilerBounds(paddingEdgeBounds, resolvedTransform))
      }
      if scrollbarContentClipIndex >= 0 {
        childClipBounds = IntersectBounds(childClipBounds,
          TransformCompilerBounds(scrollbarContentBounds, resolvedTransform))
      }
      if pathClip.Emitted {
        childClipBounds = IntersectBounds(childClipBounds,
          EmittedPathClipBounds(pathClip))
      }
      if roundedOverflowClip {
        childClipBounds = IntersectBounds(childClipBounds,
          EmittedPathClipBounds(VulkanScenePathClipResult{
            Emitted: true,
            ChainIndex: overflowPathClipChainId,
          }))
      }
      if mixedOverflowClip {
        childClipBounds = IntersectBounds(childClipBounds,
          EmittedPathClipBounds(VulkanScenePathClipResult{
            Emitted: true,
            ChainIndex: overflowPathClipChainId,
          }))
      }
      if editorContentClipIndex >= 0 {
        childClipBounds = IntersectBounds(childClipBounds,
          TransformCompilerBounds(editorContentBounds, resolvedTransform))
      }
      let childExactCullContextSafe = ExactCullContextForChildren(
        context.ExactCullContextSafe, node, isolates, axisAligned, overflowPreflight)
      let childContext = VulkanSceneTraversalContext{
        ParentTransformIndex: transform.Index,
        ParentRectClipIndex: childClipIndex,
        ParentOpacity: isolates ? 1.0F : opacity,
        ParentAxisAligned: axisAligned,
        ParentRectClipDepth: childClipDepth,
        ParentPathClipChainId: overflowPathClipChainId,
        ParentIsolation: context.ParentIsolation || isolates || node.HasTransformState
          || node.HasClipPath || clipsX || clipsY || node.ScrollX != 0.0F
          || node.ScrollY != 0.0F || node.BlendMode != BlendMode.Normal
          || editorContentClipIndex >= 0,
        ExactCullContextSafe: childExactCullContextSafe,
        ActiveClipBounds: childClipBounds,
      }
      let children = Stacking.Children(node)
      var index int32 = 0
      while index < children.Count
        && (node.Kind != NodeKind.Editor || editorContentClipIndex >= 0) {
          if !children[index].IsPortal {
            CompileNode(children[index], childContext)
          }
          index = index + 1
        }

      if editorContentClipIndex >= 0 || scrollbarContentClipIndex >= 0 || clipIndex >= 0 {
        frame.SetActiveClipChain(context.ParentPathClipChainId)
        frame.BeginChunk(ownerId, frameVersion, bounds, false)
        if editorContentClipIndex >= 0 {
          frame.AddRectClipEnd(RectClipRecord{
            Bounds: editorContentBounds,
            TransformIndex: transform.Index,
            ParentIndex: inheritedChildClipIndex,
          })
        }
        if scrollbarContentClipIndex >= 0 {
          frame.AddRectClipEnd(RectClipRecord{
            Bounds: scrollbarContentBounds,
            TransformIndex: transform.Index,
            ParentIndex: ownerContentClipIndex,
          })
        }
        if clipIndex >= 0 {
          frame.AddRectClipEnd(RectClipRecord{
            Bounds: paddingEdgeBounds,
            TransformIndex: transform.Index,
            ParentIndex: context.ParentRectClipIndex,
          })
        }
        frame.EndChunk()
      }
      if node.Kind == NodeKind.Image && (HasBorderWidth(node, bounds)
        || boxShadowCount(node.BoxShadows) != 0) {
          frame.SetActiveClipChain(activePathClipChainId)
          frame.BeginChunk(ownerId, frameVersion, bounds, true)
          PaintBoxShadows(node, bounds, contentOpacity, transform.Index, true)
          PaintBorder(node, bounds, contentOpacity, transform.Index)
          frame.EndChunk()
        }
      CompileScrollbarParts(node, ownerId, bounds, context, transform,
        activePathClipChainId, clipIndex, contentOpacity)
      let outlineBounds = OutlineBounds(node, bounds)
      if !outlineBounds.IsEmpty {
        frame.SetActiveClipChain(activePathClipChainId)
        frame.BeginChunk(ownerId, frameVersion, outlineBounds, true)
        PaintOutline(node, bounds, contentOpacity, transform.Index)
        frame.EndChunk()
      }
      if isolates {
        frame.SetActiveClipChain(context.ParentPathClipChainId)
        frame.BeginChunk(ownerId, frameVersion, subtreeBounds, false)
        if combinesEffectAndBlend {
          frame.AddLayerEnd(innerLayerRecord)
          frame.AddLayerEnd(outerLayerRecord)
        } else {
          frame.AddLayerEnd(layerRecord)
        }
        frame.EndChunk()
      }
      frame.SetActiveClipChain(context.ParentPathClipChainId)
    }

}
