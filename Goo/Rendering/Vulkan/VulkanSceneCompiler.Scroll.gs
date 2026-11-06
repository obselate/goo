package Goo

import System

internal partial class VulkanSceneCompiler {
  private func ScrollsContent(node Node) bool -> node.Kind == NodeKind.Editor
    || node.OverflowX == Overflow.Scroll || node.OverflowY == Overflow.Scroll
    || node.ScrollX != 0.0F || node.ScrollY != 0.0F || Virtualization.State(node) != nil

  private func ScrollTransform(node Node, parentIndex int32, ownerId uint64,
    verticalOnly bool = false) TransformRecord {
    let offset = TransformGeometry.ScrollOffset(node, TransformGeometry.WindowMatrix(node),
      verticalOnly ? 0.0F : node.PlacedScrollX, node.PlacedScrollY)
    return TransformRecord{
      A: 1.0F, D: 1.0F, TX: offset.X, TY: offset.Y,
      ParentIndex: parentIndex, Kind: verticalOnly ? SceneTransformKind.VerticalScrollPlacement
        : SceneTransformKind.ScrollPlacement,
      ScrollOwnerId: ownerId, ScrollPixelX: offset.PixelX, ScrollPixelY: offset.PixelY,
    }
  }

  private func ReplaceScrollTransform(index int32, value TransformRecord) bool {
    let previous = frame.Transforms[index]
    if previous.ScrollPixelX == value.ScrollPixelX && previous.ScrollPixelY == value.ScrollPixelY {
      return false
    }
    frame.Transforms[index] = value
    return true
  }

  private func UpdateScrollPlacement(node Node, owner VulkanSceneOwnerId,
    context VulkanSceneTraversalContext, start VulkanSceneRangePosition) {
    var changed = ReplaceScrollTransform(start.Transforms,
      ScrollTransform(node, context.ParentTransformIndex, owner.Value))
    if node.Kind == NodeKind.Editor {
      let verticalChanged = ReplaceScrollTransform(start.Transforms + 1,
        ScrollTransform(node, context.ParentTransformIndex, owner.Value, true))
      changed = changed || verticalChanged
    }
    if changed {
      frame.Chunks[start.Chunks].ContentKey = frame.ChunkContentDigest(start.Chunks)
      frame.Chunks[start.Chunks].RangeContentRetained = false
    }
  }

  private func CompileContentChildren(node Node, context VulkanSceneTraversalContext,
    owner VulkanSceneOwnerId, contentDirty bool, scrolls bool, opacity float32,
    canPaintEditor bool) {
    let editor = node.Kind == NodeKind.Editor
    if editor && !canPaintEditor { return }
    if !editor && node.Children.Count == 0 { return }
    let slot = scrolls ? RangeSlot(owner, VulkanSceneRangeBoundary.Content) : -1
    if slot >= 0 && !contentDirty && !node.Retired {
      let start = frame.RangePosition()
      if TryAppendRange(slot, context) {
        UpdateScrollPlacement(node, owner, context, start)
        return
      }
    }
    let state = BeginRangeCompilation(slot, context)
    var completed = false
    try {
      var childrenContext = context
      var verticalTransform = context.ParentTransformIndex
      let bounds = NodeBounds(node)
      if scrolls {
        frame.SetTransformNodeLimit(Math.Max(lastResult.VisibleNodeCount, visibleNodeCount))
        frame.SetActiveTransform(context.ParentTransformIndex)
        frame.SetActiveClipChain(context.ParentPathClipChainId)
        frame.BeginChunk(owner.Value, frameVersion, bounds, true)
        childrenContext.ParentTransformIndex = frame.AddTransform(
          ScrollTransform(node, context.ParentTransformIndex, owner.Value))
        if editor {
          verticalTransform = frame.AddTransform(
            ScrollTransform(node, context.ParentTransformIndex, owner.Value, true))
        }
        frame.EndChunk()
      }
      var editorBounds ConservativeBounds
      if editor {
        if node.EditorShowLineNumbers {
          frame.SetActiveTransform(verticalTransform)
          frame.BeginChunk(owner.Value, frameVersion, bounds, true)
          PaintEditorContent(node, opacity, verticalTransform, true, context.ParentTransformIndex)
          frame.EndChunk()
        }
        editorBounds = TextEditorContentBounds(node)
        if !editorBounds.IsEmpty {
          frame.SetActiveTransform(childrenContext.ParentTransformIndex)
          frame.BeginChunk(owner.Value, frameVersion, bounds, true)
          childrenContext.ParentRectClipIndex = frame.AddRectClipBegin(RectClipRecord{
            Bounds: editorBounds, TransformIndex: context.ParentTransformIndex,
            ParentIndex: context.ParentRectClipIndex,
          })
          childrenContext.ParentRectClipDepth++
          childrenContext.ActiveClipBounds = IntersectBounds(context.ActiveClipBounds,
            TransformCompilerBounds(editorBounds,
              ResolveCompilerFrameTransform(context.ParentTransformIndex)))
          clipCount++
          PaintEditorContent(node, opacity, childrenContext.ParentTransformIndex,
            false, -1, verticalTransform)
          frame.EndChunk()
        }
      }
      if !editor || !editorBounds.IsEmpty {
        let children = Stacking.Children(node)
        for index in 0 ... children.Count {
          let child = children[index]
          if child.IsPortal { continue }
          var childContext = childrenContext
          if editor && child.EditorSlotBlock { childContext.ParentTransformIndex = verticalTransform }
          CompileNode(child, childContext)
        }
      }
      if editor && !editorBounds.IsEmpty {
        frame.SetActiveTransform(context.ParentTransformIndex)
        frame.BeginChunk(owner.Value, frameVersion, bounds, false)
        frame.AddRectClipEnd(RectClipRecord{
          Bounds: editorBounds, TransformIndex: context.ParentTransformIndex,
          ParentIndex: context.ParentRectClipIndex,
        })
        frame.EndChunk()
      }
      completed = !node.SceneContentDirty
    } finally {
      EndRangeCompilation(slot, state, completed)
    }
  }
}
