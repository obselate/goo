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
          consumed = applyWheelScroll(scratchChain, dx, dy)
        }
        return consumed
      } finally {
        scratchChain.Clear()
      }
    }

  private func trimDisabledWheelRoute(route List[Node]) bool {
    if route.Count == 0 { return false }
    if route[0].HasFocusScopes && !FocusScopes.Allows(route[0], route[route.Count - 1]) {
      return false
    }
    for i in 0 ... route.Count {
      if !route[i].Disabled { continue }
      for j in i ... route.Count {
        if route[j].FocusScopeBoundary || route[j].IsPortal { return false }
      }
      while route.Count > i { route.RemoveAt(route.Count - 1) }
      break
    }
    return route.Count > 0
  }

  private func dispatchWheel(route List[Node], x float32, y float32, dx float32, dy float32,
    modifiers KeyModifiers) bool{
      let transformed = routeHasTransform(route)
      if transformed && !mapRoutePositions(route, x, y, routePositions) { return false }
      wheelDispatchGeneration++
      let generation = wheelDispatchGeneration
      wheelControl.Begin(generation)
      try {
        for var i = route.Count; i > 0; i-- {
          let n = route[i - 1]
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
            finally { owner?.Rebuild() }
          }
          if wheelControl.PropagationStopped || n.FocusScopeBoundary { break }
        }
        return wheelControl.DefaultPrevented
      } finally {
        wheelControl.Finish(generation)
      }
    }

  private func applyWheelScroll(chain List[Node], dx float32, dy float32) bool {
    var consumed = false
    var remainingX = -dx
    var remainingY = -dy
    for var i = chain.Count; i > 0; i-- {
      let n = chain[i - 1]
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
