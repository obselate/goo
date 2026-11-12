package Goo

import System
import System.Collections.Generic

internal class PointerDragState {
  internal var Target NodeMount
  internal var Owner Cell?
  internal var Callback((PointerDragEvent) -> void)?
  internal var Origin Point
  internal var WindowOrigin Point
  internal var Threshold float64
  internal var Started bool
  internal var Last PointerDragEvent
}

internal partial class PointerInput {
  private func dispatchPointerDrag(node Node, event PointerEvent, kind PointerEventKind,
    route List[NodeMount], index int32) {
    if kind == PointerEventKind.Press && event.Button == PointerButton.Primary
      && current.PointerDrag == nil && node.OnPointerDrag != nil {
      current.PointerDrag = PointerDragState{
        Target: NodeMount(node), Owner: CellOwnership.InRoute(route, index),
        Callback: node.OnPointerDrag, Origin: event.Position, WindowOrigin: event.WindowPosition,
        Threshold: Math.Max(0.0, node.PointerDragThreshold),
      }
      event.Capture()
    }
    guard let state = current.PointerDrag else { return }
    if state.Target.Current != node { return }
    if kind == PointerEventKind.Release && event.Button != PointerButton.Primary { return }
    state.Callback = node.OnPointerDrag ?? state.Callback
    let translation = Point{
      X: event.Position.X - state.Origin.X, Y: event.Position.Y - state.Origin.Y,
    }
    let distanceX = event.WindowPosition.X - state.WindowOrigin.X
    let distanceY = event.WindowPosition.Y - state.WindowOrigin.Y
    var phase = PointerDragPhase.Moved
    if !state.Started {
      if kind == PointerEventKind.Release {
        current.PointerDrag = nil
        return
      }
      if distanceX * distanceX + distanceY * distanceY < state.Threshold * state.Threshold { return }
      state.Started = true
      phase = PointerDragPhase.Started
    } else if kind == PointerEventKind.Press { return }
    if kind == PointerEventKind.Release {
      phase = PointerDragPhase.Ended
      current.PointerDrag = nil
    }
    current.ClickTarget = nil
    current.LastPressNode = nil
    state.Last = PointerDragEvent{Pointer: event, Phase: phase, Translation: translation}
    try { state.Callback?.Invoke(state.Last) }
    finally { state.Owner?.Rebuild() }
  }

  private func cancelPointerDrag() {
    guard let state = current.PointerDrag else { return }
    current.PointerDrag = nil
    if !state.Started { return }
    let previous = state.Last
    let event = PointerEvent{
      Identity: previous.Pointer.Identity, IsPrimary: previous.Pointer.IsPrimary,
      Position: previous.Position, WindowPosition: previous.WindowPosition,
      Modifiers: previous.Modifiers,
    }
    try {
      state.Callback?.Invoke(PointerDragEvent{
        Pointer: event, Phase: PointerDragPhase.Canceled, Translation: previous.Translation,
      })
    } finally { state.Owner?.Rebuild() }
  }
}
