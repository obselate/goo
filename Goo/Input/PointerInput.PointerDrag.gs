package Goo

import System
import System.Collections.Generic

internal class PointerDragState {
    internal var Target NodeMount
    internal var Owner Cell?
    internal var Callback((PointerDragEvent) -> void)?
    internal var WindowOrigin Point
    internal var Threshold float64
    internal var Axis LayoutAxis?
    internal var Started bool
    internal var Last PointerDragEvent
}

internal partial class PointerInput {
    private func dispatchPointerDrag(
        node Node,
        event PointerEvent,
        kind PointerEventKind,
        route List[NodeMount],
        index int32,
        transformed bool
    ) {
        if kind == PointerEventKind.Press && event.Button == PointerButton.Primary
        && current.PointerDrag == nil && node.OnPointerDrag != nil && !hasPointerDrag(node) {
            current.PointerDrag = PointerDragState{
                Target: NodeMount(node),
                Owner: CellOwnership.InRoute(route, index),
                Callback: node.OnPointerDrag,
                WindowOrigin: event.WindowPosition,
                Threshold: node.PointerDragThreshold,
                Axis: node.PointerDragAxis,
            }
        }
        guard let state = current.PointerDrag else {
            return
        }
        if state.Target.Current != node {
            return
        }
        if kind == PointerEventKind.Release && event.Button != PointerButton.Primary {
            return
        }
        state.Callback = node.OnPointerDrag ?? state.Callback
        let distanceX = event.WindowPosition.X - state.WindowOrigin.X
        let distanceY = event.WindowPosition.Y - state.WindowOrigin.Y
        var phase = GesturePhase.Changed
        if !state.Started {
            if kind == PointerEventKind.Release {
                current.PointerDrag = nil
                return
            }
            let x = state.Axis == LayoutAxis.Vertical ? 0.0: distanceX
            let y = state.Axis == LayoutAxis.Horizontal ? 0.0: distanceY
            if x * x + y * y < state.Threshold * state.Threshold || x == 0.0 && y == 0.0 {
                return
            }
            state.Started = true
            event.Capture()
            phase = GesturePhase.Started
        } else if kind == PointerEventKind.Press {
            return
        }
        if kind == PointerEventKind.Release {
            phase = GesturePhase.Completed
            current.PointerDrag = nil
        }
        var translation = Point{X: distanceX, Y: distanceY}
        var delta = event.Delta
        if kind == PointerEventKind.Release {
            delta = Point{
                X: event.WindowPosition.X - state.Last.WindowPosition.X,
                Y: event.WindowPosition.Y - state.Last.WindowPosition.Y,
            }
        }
        if transformed {
            var originX = float32(state.WindowOrigin.X)
            var originY = float32(state.WindowOrigin.Y)
            var previousX = float32(state.Last.WindowPosition.X)
            var previousY = float32(state.Last.WindowPosition.Y)
            for i in 0 ... index + 1 {
                guard let ancestor = route[i].Current else {
                    return
                }
                if ancestor.IsPortal {
                    originX = float32(state.WindowOrigin.X)
                    originY = float32(state.WindowOrigin.Y)
                    previousX = float32(state.Last.WindowPosition.X)
                    previousY = float32(state.Last.WindowPosition.Y)
                }
                let origin = TransformGeometry.Unmap(ancestor, originX, originY)
                if !origin.Valid {
                    return
                }
                originX = origin.X
                originY = origin.Y
                if kind == PointerEventKind.Release {
                    let previous = TransformGeometry.Unmap(ancestor, previousX, previousY)
                    if !previous.Valid {
                        return
                    }
                    previousX = previous.X
                    previousY = previous.Y
                }
            }
            translation = Point{
                X: event.Position.X - float64(originX - node.Rect.X),
                Y: event.Position.Y - float64(originY - node.Rect.Y),
            }
            if kind == PointerEventKind.Release {
                delta = Point{
                    X: event.Position.X - float64(previousX - node.Rect.X),
                    Y: event.Position.Y - float64(previousY - node.Rect.Y),
                }
            }
        }
        current.ClickTarget = nil
        current.LastPressNode = nil
        state.Last = PointerDragEvent{
            Pointer: event,
            Phase: phase,
            Translation: translation,
            Delta: delta,
            HitInput: this,
            HitRoot: route[0],
            HitTarget: state.Target,
        }
        let previousContext = state.Owner?.BeginCallback()
        try {
            state.Callback?.Invoke(state.Last)
        } finally {
            state.Owner?.EndCallback(previousContext)
        }
    }

    internal func PointerDragHits(root Node?, target Node?, position Point) bool {
        guard let tree = root else {
            return false
        }
        guard let element = target else {
            return false
        }
        hitChain.Clear()
        try {
            hitChainInto(tree, float32(position.X), float32(position.Y), hitChain)
            return !chainDisabled(hitChain) && containsNode(hitChain, element)
        } finally {
            hitChain.Clear()
        }
    }

    private func hasPointerDrag(node Node) bool {
        if mouse.PointerDrag?.Target.Current == node {
            return true
        }
        if let contacts = contacts {
            for contact in contacts {
                if contact.PointerDrag?.Target.Current == node {
                    return true
                }
            }
        }
        return false
    }

    private func cancelPointerDrag(reason GestureCancelReason) {
        guard let state = current.PointerDrag else {
            return
        }
        current.PointerDrag = nil
        if !state.Started {
            return
        }
        state.Callback = state.Target.Current?.OnPointerDrag ?? state.Callback
        let previous = state.Last
        let event = PointerEvent{
            Identity: previous.Pointer.Identity,
            IsPrimary: previous.Pointer.IsPrimary,
            Position: previous.Position,
            WindowPosition: previous.WindowPosition,
            Modifiers: previous.Modifiers,
        }
        let previousContext = state.Owner?.BeginCallback()
        try {
            state.Callback?.Invoke(
                PointerDragEvent{
                    Pointer: event,
                    Phase: GesturePhase.Canceled,
                    Reason: reason,
                    Translation: previous.Translation,
                }
            )
        } finally {
            state.Owner?.EndCallback(previousContext)
        }
    }
}
