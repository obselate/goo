package Goo

import System.Collections.Generic

internal partial class PointerInput {
  internal func HandleWheel(root Node?, x float32, y float32, dx float32, dy float32,
    modifiers KeyModifiers) bool{
      guard let tree = root else { return false }
      scratchChain.Clear()
      try {
        hitChainInto(tree, x, y, scratchChain)
        if !trimDisabledWheelRoute(scratchChain) { return false }
        let prevented = dispatchWheel(scratchChain, x, y, dx, dy, modifiers)
        var consumed = false
        if !prevented {
          consumed = applyWheelScroll(scratchChain, dx, dy, modifiers)
        }
        return consumed
      } finally {
        scratchChain.Clear()
      }
    }

  private func trimDisabledWheelRoute(route List[NodeMount]) bool {
    if route.Count == 0 { return false }
    guard let root = route[0].Current, let target = route[route.Count - 1].Current else { return false }
    if root.HasFocusScopes && !FocusScopes.Allows(root, target) { return false }
    for i in 0 ... route.Count {
      guard let node = route[i].Current else { return false }
      if !node.Disabled { continue }
      for j in i ... route.Count {
        guard let descendant = route[j].Current else { return false }
        if descendant.FocusScopeBoundary || descendant.IsPortal { return false }
      }
      while route.Count > i { route.RemoveAt(route.Count - 1) }
      break
    }
    return route.Count > 0
  }

  private func dispatchWheel(route List[NodeMount], x float32, y float32, dx float32, dy float32,
    modifiers KeyModifiers) bool{
      let transformed = routeHasTransform(route)
      if transformed && !mapRoutePositions(route, x, y, routePositions) { return false }
      wheelDispatchGeneration++
      let generation = wheelDispatchGeneration
      wheelControl.Begin(generation)
      try {
        for var i = route.Count; i > 0; i-- {
          let mount = route[i - 1]
          guard let n = mount.Current else { return true }
          let event = WheelEvent{
            Position: transformed ? routePositions[i - 1] : Point{
              X: float64(x - n.Rect.X), Y: float64(y - n.Rect.Y),
            },
            WindowPosition: Point{ X: float64(x), Y: float64(y) },
            Delta: Point{ X: float64(dx), Y: float64(dy) },
            Modifiers: modifiers,
            Control: wheelControl,
            Generation: generation,
          }
          if let callback = n.OnWheel {
            let owner = CellOwnership.InRoute(route, i - 1)
            try { callback(event) }
            finally { owner?.RebuildAfterCallback() }
          }
          if mount.Current == nil { return true }
          if wheelControl.PropagationStopped || n.FocusScopeBoundary { break }
        }
        return wheelControl.DefaultPrevented
      } finally {
        wheelControl.Finish(generation)
      }
    }

  private func applyWheelScroll(chain List[NodeMount], dx float32, dy float32, modifiers KeyModifiers) bool {
    var consumed = false
    let horizontal = modifiers.Shift && dx == 0.0F && dy != 0.0F
    var remainingX = horizontal ? -dy : dx
    var remainingY = horizontal ? 0.0F : -dy
    for var i = chain.Count; i > 0; i-- {
      guard let n = chain[i - 1].Current else { break }
      let unitX = InputPolicy.WheelUnit(false, scrollViewportWidth(n)) * WheelScrollScale
      let unitY = InputPolicy.WheelUnit(true, scrollViewportHeight(n)) * WheelScrollScale
      let x = maxScrollX(n) > 0.0F ? remainingX * unitX : 0.0F
      let y = maxScrollY(n) > 0.0F ? remainingY * unitY : 0.0F
      if x != 0.0F || y != 0.0F {
        let moved = ScrollState.By(n, x, y)
        consumed = consumed || moved.X != 0.0 || moved.Y != 0.0
        if unitX > 0.0F { remainingX = remainingX - float32(moved.X) / unitX }
        if unitY > 0.0F { remainingY = remainingY - float32(moved.Y) / unitY }
      }
      if n.FocusScopeBoundary || n.IsPortal { break }
    }
    return consumed
  }
}
