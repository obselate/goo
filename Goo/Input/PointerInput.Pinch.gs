package Goo

import System
import System.Collections.Generic
import System.Runtime.ExceptionServices

internal partial class PointerInput {
    private func QueuePinch(kind GestureInputKind, x float32, y float32, scale float32) {
        queue.Add(QueuedPointerEvent{
            Kind: kind == GestureInputKind.Down ? PointerEventKind.PinchBegin
                : kind == GestureInputKind.Up ? PointerEventKind.PinchEnd : PointerEventKind.PinchUpdate,
            X: x / UiScale, Y: y / UiScale, PinchScale: scale,
        })
    }

    private func DispatchPinch(e QueuedPointerEvent, root Node?, resolver Resolver) bool {
        if e.Kind == PointerEventKind.PinchBegin {
            if let previous = nativePinch {
                cancelGestureGroup(root, previous, GestureCancelReason.Replaced)
                gestureGroups?.Remove(previous)
                nativePinch = nil
            }
            if mouse.HeldButtons != PointerButtons.None || mouse.CaptureTarget != nil || dragSession != nil
                || hasHeldContact(PointerDevice.Touch) || hasHeldContact(PointerDevice.Pen) { return false }
            guard let tree = root else { return false }
            hitChainInto(tree, e.X, e.Y, hitChain)
            if chainDisabled(hitChain) { return false }
            guard let created = createGestureGroup(root, resolver) else { return false }
            created.Source = GestureSource.Trackpad
            nativePinch = created
            gestureGroups ??= List[GestureGroup]()
            gestureGroups!!.Add(created)
        }
        guard let group = nativePinch else { return false }
        group.WindowAnchor = Point{X: float64(e.X), Y: float64(e.Y)}
        if e.Kind == PointerEventKind.PinchUpdate {
            if !Single.IsFinite(e.PinchScale) || e.PinchScale <= 0.0F { return group.Claimed }
            group.Scale *= float64(e.PinchScale)
        }
        let kind = e.Kind == PointerEventKind.PinchBegin ? GestureInputKind.Down
            : e.Kind == PointerEventKind.PinchEnd ? GestureInputKind.Up : GestureInputKind.Move
        try {
            return evaluateGestureGroup(root, resolver, group, kind, -1, recognizerTime, e.X, e.Y)
        } catch (error Exception) {
            try { abortGestureGroup(root, resolver, group) }
            finally { ExceptionDispatchInfo.Capture(error).Throw() }
            return true
        } finally {
            if kind == GestureInputKind.Up {
                try { cancelGestureGroup(root, group, GestureCancelReason.LostArbitration) }
                finally {
                    gestureGroups?.Remove(group)
                    nativePinch = nil
                }
            }
        }
    }
}
