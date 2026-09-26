package Goo

import System.Collections.Generic

internal partial class PointerInput {
  internal func HandleWheel(root Node?, x float32, y float32, dx float32, dy float32) bool -> HandleWheel(root, x, y, dx, dy, KeyModifiers {})

  internal func HandleWheel(root Node?, x float32, y float32, dx float32, dy float32,
    modifiers KeyModifiers) bool{
      guard let tree = root else { return false }
      scratchChain.Clear()
      try {
        hitChainInto(tree, x, y, scratchChain)
        if chainDisabled(scratchChain) {
          return false
        }
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
            callback(event)
            CellOwnership.InRoute(route, i - 1)?.Rebuild()
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
