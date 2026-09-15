package Goo

import System
import System.Collections.Generic

internal sealed class TextEditorBinding : IDisposable {
  private let node Node
  private let document TextDocument
  private let controller TextEditorController
  private let retainedInvalidated Action[ReconcileEffects]?
  private var composition TextComposition?
  private var scrollTargetX float64
  private var scrollTargetY float64
  private var disposed bool
  internal let RenderState TextEditorRenderState
  internal prop Controller TextEditorController{
    get -> controller
  }

  internal init(
    node Node,
    controller TextEditorController,
    layers []TextPresentationLayer,
    readOnly bool,
    retainedInvalidated Action[ReconcileEffects]?) {
      controller.Attach(node)
      this.node = node
      this.controller = controller
      document = controller.Document
      this.retainedInvalidated = retainedInvalidated
      RenderState = TextEditorRenderState(node, document, controller, layers, readOnly)
      composition = controller.Composition
      scrollTargetX = controller.ScrollTargetX
      scrollTargetY = controller.ScrollTargetY
      document.Committed += onDocumentCommitted
      document.Changed += onDocumentChanged
      controller.Changed = onControllerChanged
      controller.Submitted = onSubmitted
      TextEditorLayerBindings.Register(this)
    }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    document.Committed -= onDocumentCommitted
    document.Changed -= onDocumentChanged
    controller.Changed = nil
    controller.Submitted = nil
    TextEditorLayerBindings.Unregister(this)
    RenderState.Dispose()
    controller.Detach(node)
  }

  private func onDocumentCommitted(change TextDocumentChange) {
    RenderState.DocumentChanged(change)
    requestIntrinsicInvalidation()
  }

  private func onDocumentChanged(change TextDocumentChange) {
    node.EditorOnChange?.Invoke(change)
  }

  private func onSubmitted() {
    node.EditorOnSubmit?.Invoke()
  }

  internal func LayerChanged(change TextPresentationLayerChange) {
    if change.All {
      RenderState.ClearParagraphs()
    } else {
      RenderState.InvalidateParagraphs(change.Range)
    }
    refreshSlotMetadata()
    RenderState.Invalidate(true)
    if change.SlotChildrenChanged {
      CellOwnership.Nearest(node)?.Rebuild()
    }
    requestIntrinsicInvalidation()
  }

  private func refreshSlotMetadata() {
    for child in node.Children {
      if child.EditorSlotKey == "" {
        continue
      }
      if !refreshSlotMetadata(child) {
        child.Visibility = Visibility.Hidden
      }
    }
  }

  private func refreshSlotMetadata(child Node) bool {
    for layerIndex in 0 ... RenderState.LayerCount {
      let layer = RenderState.Layer(layerIndex)
      for projection in layer.ReadProjections() {
        if projection.Kind != TextProjectionKind.InlineSlot
          && projection.Kind != TextProjectionKind.BlockSlot{
            continue
          }
        if child.EditorSlotKey != textEditorSlotKey(layer, projection) {
          continue
        }
        child.EditorSlotRange = projection.Range
        child.EditorSlotBlock = projection.Kind == TextProjectionKind.BlockSlot
        return true
      }
    }
    return false
  }

  private func onControllerChanged() {
    let current = controller.Composition
    let intrinsic = !sameEditorComposition(composition, current)
    let scrollChanged = scrollTargetX != controller.ScrollTargetX
      || scrollTargetY != controller.ScrollTargetY
    if intrinsic {
      if let previous = composition {
        RenderState.InvalidateParagraphs(previous.Range)
      }
      if let next = current {
        RenderState.InvalidateParagraphs(next.Range)
      }
    }
    composition = current
    scrollTargetX = controller.ScrollTargetX
    scrollTargetY = controller.ScrollTargetY
    node.BlinkT = 0.0
    if intrinsic {
      RenderState.Invalidate(true)
      requestIntrinsicInvalidation()
    } else if scrollChanged {
      RenderState.Invalidate(false)
      requestInvalidation(ReconcileEffects.Paint | ReconcileEffects.Input | ReconcileEffects.Rect)
    } else {
      requestInvalidation(ReconcileEffects.Paint | ReconcileEffects.Input)
    }
  }

  private func requestIntrinsicInvalidation() {
    var effects = ReconcileEffects.Content | ReconcileEffects.Paint
    | ReconcileEffects.Input | ReconcileEffects.Rect
    if !(node.Width.HasMagnitude && node.Height.HasMagnitude) {
      effects = ReconcileEffects(int32(effects) | int32(ReconcileEffects.Layout))
    }
    requestInvalidation(effects)
  }

  private func requestInvalidation(e ReconcileEffects) {
    if let callback = retainedInvalidated {
      callback(e)
      return
    }
    CellOwnership.Nearest(node)?.Rebuild()
  }
}

internal func sameEditorComposition(left TextComposition?, right TextComposition?) bool {
  guard let leftValue = left, let rightValue = right else {
    return left == nil && right == nil
  }
  return leftValue.Range == rightValue.Range && leftValue.Text == rightValue.Text
    && leftValue.SelectionStart == rightValue.SelectionStart
    && leftValue.SelectionLength == rightValue.SelectionLength
}

internal class TextEditorLayerBindings {
  shared {
    private let states List[TextEditorBinding] = List[TextEditorBinding]()

    internal func Register(state TextEditorBinding) {
      if !states.Contains(state) {
        states.Add(state)
      }
    }

    internal func Unregister(state TextEditorBinding) {
      states.Remove(state)
    }

    internal func Changed(layer TextPresentationLayer, change TextPresentationLayerChange) {
      for state in states {
        for index in 0 ... state.RenderState.LayerCount {
          if state.RenderState.Layer(index) == layer {
            state.LayerChanged(change)
            break
          }
        }
      }
    }

    private func hasLayerOverlap(layer TextPresentationLayer, textRange TextRange) bool {
      for state in states {
        var contains = false
        for layerIndex in 0 ... state.RenderState.LayerCount {
          if state.RenderState.Layer(layerIndex) == layer {
            contains = true
            break
          }
        }
        if !contains {
          continue
        }
        for layerIndex in 0 ... state.RenderState.LayerCount {
          let candidate = state.RenderState.Layer(layerIndex)
          if candidate == layer {
            continue
          }
          for projection in candidate.ReadProjections() {
            if rangesEditorOverlap(textRange, projection.Range) {
              return true
            }
          }
        }
      }
      return false
    }

    internal func EnsureNonOverlapping(layer TextPresentationLayer, textRange TextRange) {
      if hasLayerOverlap(layer, textRange) {
        throw ArgumentException("Layout-affecting projections cannot overlap", "range")
      }
    }

    internal func CanRestoreNonOverlapping(
      layer TextPresentationLayer,
      textRange TextRange) bool -> !hasLayerOverlap(layer, textRange)
  }
}
