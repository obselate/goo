package Goo

import System
import System.Collections.Generic

internal partial class Reconciler {
  private func syncElementHandle(n Node, handle ElementHandle?) {
    pendingHandleMoves?.Remove(n)
    if let next = handle {
      var current = next.AttachedNode()
      if current != n && styleRetryRoot != nil {
        while let source = current {
          if source == styleRetryRoot {
            ElementHandles.Detach(n)
            let pending = pendingHandleMoves ?? Dictionary[Node, ElementHandle]()
            pending[n] = next
            pendingHandleMoves = pending
            return
          }
          current = source.Parent
        }
      }
    }
    ElementHandles.Bind(n, handle, Owner)
  }

  private func flushHandleMoves() {
    guard let pending = pendingHandleMoves else { return }
    for (node, handle) in pending {
      if !node.Retired {
        ElementHandles.Bind(node, handle, Owner)
      }
    }
    pending.Clear()
  }

  private func disposeTrees(nodes List[Node]) Exception? {
    var firstError Exception?
    for node in nodes {
      try {
        NodeLifecycle.DisposeTree(node)
      } catch (error Exception) {
        firstError ??= error
      }
    }
    return firstError
  }

  private func rollbackReplacements(scratchScope ChildDiffScratchScope) {
    for replacement in scratchScope.Replacements {
      try {
        replacement.Replacement.Fiber = nil
        replacement.Old.Fiber = replacement.Cell
        replacement.Old.Key = replacement.OldKey
        replacement.Old.Retired = replacement.OldRetired
        replacement.Cell.outputKey = replacement.OldOutputKey
        if let mounted = replacement.OldMountedNode {
          replacement.Cell.AttachMount(mounted, replacement.OldMountedOwner)
        } else {
          replacement.Cell.mountedNode = nil
          replacement.Cell.mountedOwner = replacement.OldMountedOwner
        }
        replacement.Cell.RefreshDirectMounts(replacement.Old)
        var child = replacement.Cell.directChild
        while let descendant = child {
          descendant.MarkDirtyFromInput()
          child = descendant.directChild
        }
        replacement.Cell.RestoreDirtyAndSubmit()
      } catch (error Exception) { }
      try {
        NodeLifecycle.DisposeTree(replacement.Replacement)
      } catch (error Exception) { }
      try {
        if let handle = replacement.OldHandle {
          ElementHandles.Bind(replacement.Old, handle, Owner)
        }
      } catch (error Exception) { }
    }
  }

  private func rollbackHandleReplacements(scratchScope ChildDiffScratchScope) {
    for replacement in scratchScope.HandleReplacements {
      try {
        if let current = replacement.OldHandle.AttachedNode() {
          if current != replacement.Old {
            ElementHandles.Detach(current)
          }
        }
        ElementHandles.Bind(replacement.Old, replacement.OldHandle, Owner)
      } catch (error Exception) { }
    }
  }
}
