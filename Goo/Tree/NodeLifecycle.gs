package Goo

import System

internal class NodeLifecycle {
  shared {
    internal func DisposeTree(n Node) {
      let firstError = disposeTree(n)
      if let error = firstError {
        throw error
      }
    }

    internal func ResetForReuse(n Node) {
      using let profile = HistoryPreparationProfile(0)
      let metadata = HistoryPreparationProfile(8)
      InputCallbacks.Remove(n)
      TextInputCallbacks.Remove(n)
      GestureMetadata.Remove(n)
      DragDropMetadata.Remove(n)
      AccessibilityButtonNames.Remove(n)
      ClipPaths.Remove(n)
      Outlining.Remove(n)
      Transforming.Remove(n)
      TextShadowing.Set(n, nil)
      TextStroking.Remove(n)
      ScrollbarStyles.Remove(n)
      ScrollActivityStates.Remove(n)
      CustomLayouts.Remove(n)
      Stacking.Remove(n)
      Portals.Remove(n)
      metadata.Dispose()
      n.ResetForReuse()
      for i in 0 ... n.Children.Count {
        ResetForReuse(n.Children[i])
      }
    }

    private func disposeTree(n Node) Exception? {
      if !n.Retired && FrameRecorder.Current != nil {
        if Virtualization.State(n) != nil {
          FrameWorkCounters.VirtualDiscards += n.Children.Count
        } else if let parent = n.Parent {
          if Virtualization.State(parent) != nil { FrameWorkCounters.VirtualDiscards++ }
        }
      }
      n.Retired = true
      n.PaintBindingResolver?.ForgetPaintBindings(n)
      n.Context = nil
      ElementHandles.Detach(n)
      InputCallbacks.SetFocusTarget(n, nil)
      if n.HasAccessibilityDeclaration {
        AccessibilityMetadata.Remove(n)
      }
      if n.HasAccessibilityNodeState {
        AccessibilityNodeStates.Remove(n)
      }
      var firstError Exception?
      try {
        ScrollbarParts.Dispose(n)
      } catch (error Exception) {
        firstError = error
      }
      try {
        Virtualization.Dispose(n)
      } catch (error Exception) {
        firstError ??= error
      }
      if let cell = n.Fiber {
        n.Fiber = nil
        try {
          cell.DisposeMounted()
        } catch (error Exception) {
          if firstError == nil {
            firstError = error
          }
        }
      }
      TextLayouts.Dispose(n)
      if let editor = n.EditorBinding {
        n.EditorBinding = nil
        editor.Dispose()
      }
      if n.Kind == NodeKind.Image {
        ImageLayouts.Dispose(n)
      }
      BackgroundImageLayouts.Dispose(n)
      ShaderEffectStyles.Dispose(n)
      LayoutTransitions.Dispose(n)
      VulkanSceneCompiler.RetireNode(n)
      for i in 0 ... n.Children.Count {
        if let error = disposeTree(n.Children[i]) {
          if firstError == nil {
            firstError = error
          }
        }
      }
      return firstError
    }
  }
}
