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
            rebuildOwner(route, i - 1)
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
    if dy != 0.0F {
      if let editor = deepestEditorY(chain) {
        consumed = TextEditorLayouts.ScrollBy(editor, 0.0F, -dy * InputPolicy.WheelUnit())
        if consumed { markScrolled(editor) }
      } else if let target = deepestArmedY(chain) {
        let next = clampOffset(target.ScrollTargetY - dy * InputPolicy.WheelUnit(), maxScrollY(target))
        if next != target.ScrollTargetY {
          target.ScrollTargetY = next
          markScrolled(target)
          if target.PinToBottom {
            target.UserScrolled = target.ScrollTargetY < maxScrollY(target) - 0.5F
          }
          consumed = true
        }
      }
    }
    if dx != 0.0F {
      if let editor = deepestEditorX(chain) {
        let moved = TextEditorLayouts.ScrollBy(editor, -dx * InputPolicy.WheelUnit(), 0.0F)
        if moved { markScrolled(editor) }
        consumed = consumed || moved
      } else if let target = deepestArmedX(chain) {
        let next = clampOffset(target.ScrollTargetX - dx * InputPolicy.WheelUnit(), maxScrollX(target))
        if next != target.ScrollTargetX {
          target.ScrollTargetX = next
          markScrolled(target)
          consumed = true
        }
      }
    }
    return consumed
  }

  private func deepestEditorY(chain List[Node]) Node? {
    for var i = chain.Count; i > 0; i-- {
      let n = chain[i - 1]
      if n.Kind == NodeKind.Editor && maxScrollY(n) > 0.0F { return n }
      if n.FocusScopeBoundary { break }
    }
    return nil
  }

  private func deepestEditorX(chain List[Node]) Node? {
    for var i = chain.Count; i > 0; i-- {
      let n = chain[i - 1]
      if n.Kind == NodeKind.Editor && maxScrollX(n) > 0.0F { return n }
      if n.FocusScopeBoundary { break }
    }
    return nil
  }

  private func deepestArmedY(chain List[Node]) Node? {
    for var i = chain.Count; i > 0; i-- {
      let n = chain[i - 1]
      if n.OverflowY == Overflow.Scroll && maxScrollY(n) > 0.0F { return n }
      if n.FocusScopeBoundary { break }
    }
    return nil
  }

  private func deepestArmedX(chain List[Node]) Node? {
    for var i = chain.Count; i > 0; i-- {
      let n = chain[i - 1]
      if n.OverflowX == Overflow.Scroll && maxScrollX(n) > 0.0F { return n }
      if n.FocusScopeBoundary { break }
    }
    return nil
  }

  private func markScrolled(n Node) {
    n.ScrollIdle = 0.0F
    n.ScrollBarAlpha = 1.0F
  }
}
