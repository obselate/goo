package Goo

import System.Collections.Generic

public partial class Window {
  private let retiredVirtualStates List[VirtualNodeState] = List[VirtualNodeState]()

  internal func CanRecycleVirtualRow(root Node) bool {
    var current = root.Parent
    while let ancestor = current {
      if ancestor.Kind == NodeKind.Entry || ancestor.Kind == NodeKind.Editor { return false }
      current = ancestor.Parent
    }
    return !input.RetainsInteraction(root) && family?.NativeDrop?.RetainsInteraction(root) != true
  }

  internal func QueueVirtualRetirements(state VirtualNodeState) {
    if !retiredVirtualStates.Contains(state) { retiredVirtualStates.Add(state) }
  }

  private func finishVirtualRetirements() {
    if retiredVirtualStates.Count == 0 { return }
    let profiling = profiler.Active
    let started = profiling ? profiler.Start() : FrameProfilePoint{}
    try {
      for state in retiredVirtualStates { state.FinishRetirements(this) }
    } finally {
      retiredVirtualStates.Clear()
      if profiling { profiler.Record(FrameProfileStage.Reconcile, started) }
    }
  }
}
