package Goo

import System

internal class NodeLifecycle {
  shared {
    internal func DisposeTree(n Node) {
      let firstError = disposeTree(n)
      if let error = firstError {
        System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(error).Throw()
      }
    }

    internal func ResetForReuse(n Node) {
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
      n.ResetForReuse()
      for i in 0 ... n.Children.Count {
        ResetForReuse(n.Children[i])
      }
    }

    private func disposeTree(n Node) Exception? {
      var firstError Exception?
      if let cell = n.Fiber {
        n.Fiber = nil
        try {
          cell.DisposeMounted()
        } catch (error Exception) { firstError = error }
      }
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
      try {
        ScrollbarParts.Dispose(n)
      } catch (error Exception) {
        firstError ??= error
      }
      try {
        Virtualization.Dispose(n)
      } catch (error Exception) {
        firstError ??= error
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
