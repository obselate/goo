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

    private func disposeTree(n Node) Exception? {
      n.Retired = true
      ElementHandles.Detach(n)
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
      Virtualization.Dispose(n)
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
