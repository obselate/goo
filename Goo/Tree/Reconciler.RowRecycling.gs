package Goo

import System
import System.Collections.Generic

internal partial class Reconciler {
  private var recyclingRow bool

  private func recycleVirtualRow(state VirtualNodeState, blob Blob) Node? {
    guard let wrapper = blob as Container else { return nil }
    if wrapper.Children.Count != 1 { return nil }
    let content = wrapper.Children[0]
    if content is VirtualRetainedBlob { return nil }
    let type = if content is CellElement { content.CellType } else { content.GetType() }
    guard let root = state.TakeRecycledRow(type) else { return nil }
    let previous = recyclingRow
    recyclingRow = true
    try {
      activateRecycledTree(root)
      return Diff(root, blob)
    } catch (_ Exception) {
      NodeLifecycle.DisposeTree(root)
      rethrow
    } finally {
      recyclingRow = previous
    }
  }

  private func activateRecycledTree(n Node) {
    if !n.TryBeginRebind() { throw InvalidOperationException("Node mount generation is exhausted") }
    Res.Invalidate(n, true)
    for i in 0 ... n.Children.Count {
      activateRecycledTree(n.Children[i])
    }
  }

  private func retireVirtualRows(state VirtualNodeState, nodes List[Node]) Exception? {
    var firstError Exception?
    for node in nodes {
      let storage = state.CaptureRetirement(node)
      try {
        NodeLifecycle.DisposeTree(node)
        if let row = storage { state.Quarantine(row) }
      } catch (error Exception) {
        firstError ??= error
      }
    }
    return firstError
  }
}
