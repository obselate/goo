package Goo

import System
import System.Collections.Generic
import System.Runtime.ExceptionServices

internal class GestureContact {
    internal let Id int64
    internal var X float32
    internal var Y float32
    internal var Down bool = true

    internal init(id int64, x float32, y float32) {
        Id = id
        X = x
        Y = y
    }
}

internal class GestureCandidate {
    internal let Owner Node
    internal let Binding GestureBinding
    internal let Session GestureSession
    internal let Input GestureInput = GestureInput()
    internal let Contacts List[int64] = List[int64]()
    internal var Decision GestureDecision
    internal var Accepted bool
    internal var Terminal bool

    internal init(owner Node, binding GestureBinding, session GestureSession) {
        if session == nil { throw InvalidOperationException("A gesture recognizer returned no session") }
        Owner = owner
        Binding = binding
        Session = session
    }
}

internal class GestureGroup {
    internal let Contacts List[GestureContact] = List[GestureContact]()
    internal let Candidates List[GestureCandidate] = List[GestureCandidate]()
    internal var Winner GestureCandidate?
    internal var Claimed bool
    internal var DeferredClick Node?
    internal var Source GestureSource
    internal var WindowAnchor Point
    internal var Scale float64 = 1.0
}

internal partial class PointerInput {
    private var gestureGroups List[GestureGroup]?
    private var completingTouchTap bool
    private var recognizerTime float64
    private var nativePinch GestureGroup?

    private func gestureGroupFor(id int64) GestureGroup? {
        guard let groups = gestureGroups else { return nil }
        for group in groups {
            for contact in group.Contacts {
                if contact.Id == id { return group }
            }
        }
        return nil
    }

    private func beginGestures(root Node?, resolver Resolver, x float32, y float32) {
        if current.Device != PointerDevice.Touch || current.CaptureTarget != nil { return }
        guard let tree = root else { return }
        hitChainInto(tree, x, y, hitChain)
        if chainDisabled(hitChain) { return }
        var group GestureGroup?
        if let groups = gestureGroups {
            for existing in groups {
                if existing.Source != GestureSource.Touch { continue }
                if existing.Claimed && existing.Contacts.Count > 0 {
                    if let winner = existing.Winner {
                        if containsNode(hitChain, winner.Owner) {
                            group = existing
                            break
                        }
                    }
                }
                for candidate in existing.Candidates {
                    if !candidate.Terminal && containsNode(hitChain, candidate.Owner) {
                        group = existing
                        break
                    }
                }
                if group != nil { break }
            }
        }
        if group == nil {
            if dragSession != nil { return }
            if let contacts = contacts {
                for contact in contacts {
                    if contact != current && (contact.CaptureTarget != nil || contact.TouchPan?.Active == true) {
                        return
                    }
                }
            }
        }
        if group == nil {
            group = createGestureGroup(root, resolver)
            if let created = group {
                gestureGroups ??= List[GestureGroup]()
                gestureGroups!!.Add(created)
            }
        }
        if group == nil { return }
        group.Contacts.Add(GestureContact(current.Id, x, y))
        for candidate in group.Candidates {
            if !candidate.Terminal && containsNode(hitChain, candidate.Owner) {
                candidate.Contacts.Add(current.Id)
            }
        }
    }

    private func createGestureGroup(root Node?, resolver Resolver) GestureGroup? {
        var group GestureGroup?
        try {
            for var i = hitChain.Count; i > 0; i-- {
                let owner = hitChain[i - 1]
                if let binding = GestureMetadata.Get(owner) {
                    if group == nil { group = GestureGroup() }
                    for recognizer in binding.Values {
                        group.Candidates.Add(GestureCandidate(owner, binding, recognizer.CreateSession()))
                    }
                }
                if owner.IsPortal || owner.FocusScopeBoundary { break }
            }
        } catch (error Exception) {
            try {
                if let group = group { cancelGestureGroup(root, group, GestureCancelReason.CallbackFailed) }
            } finally {
                try { cancelInteraction(root, resolver) }
                finally { ExceptionDispatchInfo.Capture(error).Throw() }
            }
        }
        return group
    }

    private func hasPendingTouchGesture() bool -> current.Device == PointerDevice.Touch
        && !completingTouchTap && gestureGroupFor(current.Id) != nil

    private func prepareGestureInput(group GestureGroup, candidate GestureCandidate,
        kind GestureInputKind, id int64, time float64) bool {
        let input = candidate.Input
        input.KindValue = kind
        input.TimeValue = time
        input.ChangedId = id
        input.Pointers.Clear()
        input.SourceValue = group.Source
        input.ScaleValue = group.Scale
        if group.Source == GestureSource.Trackpad {
            let point = TransformGeometry.WindowToNode(candidate.Owner,
                float32(group.WindowAnchor.X), float32(group.WindowAnchor.Y))
            if !point.Valid { return false }
            input.AnchorValue = Point{X: float64(point.X - candidate.Owner.Rect.X),
                Y: float64(point.Y - candidate.Owner.Rect.Y)}
            input.WindowAnchorValue = group.WindowAnchor
            return true
        }
        for contact in group.Contacts {
            if !candidate.Contacts.Contains(contact.Id) { continue }
            let point = TransformGeometry.WindowToNode(candidate.Owner, contact.X, contact.Y)
            if !point.Valid { return false }
            input.Pointers.Add(GesturePointer{
                PointerId: contact.Id, Device: PointerDevice.Touch,
                Position: Point{ X: float64(point.X - candidate.Owner.Rect.X),
                    Y: float64(point.Y - candidate.Owner.Rect.Y) },
                WindowPosition: Point{ X: float64(contact.X), Y: float64(contact.Y) }, IsDown: contact.Down,
            })
        }
        return true
    }

    private func gestureOwnerAvailable(root Node?, candidate GestureCandidate) bool -> root != nil
        && nodeVisibleInTree(root, candidate.Owner, false) && canReceiveInput(candidate.Owner)

    private func notifyGesture(root Node?, candidate GestureCandidate, phase GesturePhase,
        reason GestureCancelReason) {
        if phase == GesturePhase.Completed || phase == GesturePhase.Canceled { candidate.Terminal = true }
        let owner = if let tree = root { CellOwnership.Within(tree, candidate.Owner) } else { nil }
        try { candidate.Session.Notify(phase, reason) }
        finally { owner?.Rebuild() }
    }

    private func cancelGestureGroup(root Node?, group GestureGroup, reason GestureCancelReason) {
        var failure Exception?
        group.DeferredClick = nil
        for candidate in group.Candidates {
            if candidate.Terminal { continue }
            try { notifyGesture(root, candidate, GesturePhase.Canceled, reason) }
            catch (error Exception) { if failure == nil { failure = error } }
        }
        if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    }

    private func abortGestureGroup(root Node?, resolver Resolver, group GestureGroup) {
        group.Claimed = true
        let saved = current
        var failure Exception?
        try { cancelGestureGroup(root, group, GestureCancelReason.CallbackFailed) }
        catch (error Exception) { failure = error }
        try {
            if let contacts = contacts {
                for var i = 0; i < contacts.Count; i++ {
                    let contact = contacts[i]
                    if gestureGroupFor(contact.Id) != group { continue }
                    current = contact
                    try { cancelInteraction(root, resolver) }
                    catch (error Exception) { if failure == nil { failure = error } }
                }
            }
        } finally { current = saved }
        if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    }

    private func cancelCurrentGestures(root Node?, reason GestureCancelReason) {
        if current.Device != PointerDevice.Touch { return }
        if let group = gestureGroupFor(current.Id) { cancelGestureGroup(root, group, reason) }
    }

    internal func CancelGestures(root Node?, target Node) bool {
        guard let groups = gestureGroups else { return false }
        var canceled = false
        for var i = 0; i < groups.Count; i++ {
            let group = groups[i]
            for candidate in group.Candidates {
                if candidate.Owner != target || candidate.Terminal { continue }
                canceled = true
                if candidate.Accepted {
                    cancelGestureGroup(root, group, GestureCancelReason.Explicit)
                } else {
                    notifyGesture(root, candidate, GesturePhase.Canceled, GestureCancelReason.Explicit)
                }
            }
        }
        return canceled
    }

    private func clearGestures(root Node?, reason GestureCancelReason) {
        nativePinch = nil
        guard let groups = gestureGroups else { return }
        var failure Exception?
        for var i = 0; i < groups.Count; i++ {
            let group = groups[i]
            try { cancelGestureGroup(root, group, reason) }
            catch (error Exception) { if failure == nil { failure = error } }
        }
        groups.Clear()
        if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    }

    private func refreshGestures(root Node?) {
        guard let groups = gestureGroups else { return }
        for var i = 0; i < groups.Count; i++ {
            let group = groups[i]
            for candidate in group.Candidates {
                if candidate.Terminal { continue }
                let reason = if !gestureOwnerAvailable(root, candidate) { GestureCancelReason.OwnerUnavailable }
                    else if GestureMetadata.Get(candidate.Owner) != candidate.Binding { GestureCancelReason.Replaced }
                    else { GestureCancelReason.None }
                if reason == GestureCancelReason.None { continue }
                if candidate.Accepted {
                    cancelGestureGroup(root, group, reason)
                    break
                }
                notifyGesture(root, candidate, GesturePhase.Canceled, reason)
            }
        }
    }

    private func deeperDefaultReady(candidate GestureCandidate, x float32, y float32) bool {
        if let source = dragCandidate {
            let threshold = current.Device == PointerDevice.Touch ? 4.0F : DragStartDistance
            if source != candidate.Owner && containsPath(candidate.Owner, source)
                && dragThresholdCrossed(x, y, threshold) { return true }
        }
        if let pan = current.TouchPan {
            let dx = x - pan.StartX
            let dy = y - pan.StartY
            if pan.Target != candidate.Owner && containsPath(candidate.Owner, pan.Target)
                && dx * dx + dy * dy >= 64.0F { return true }
        }
        return false
    }

    private func claimGesture(root Node?, resolver Resolver, group GestureGroup,
        winner GestureCandidate) {
        group.Winner = winner
        group.Claimed = true
        group.DeferredClick = nil
        winner.Accepted = true
        let saved = current
        try {
            if let values = contacts {
                for var i = 0; i < values.Count; i++ {
                    let contact = values[i]
                    if !winner.Contacts.Contains(contact.Id) { continue }
                    current = contact
                    dispatchCancel()
                    current = contact
                    clearPressChain(resolver)
                    current.DragEntry = nil
                    current.DragEditor = nil
                    current.DragSelectionStarted = false
                    current.ClickTarget = nil
                    clearTouchPan()
                    clearDragCandidate()
                    clearActiveRoute()
                }
            }
        } finally { current = saved }
        for candidate in group.Candidates {
            if candidate != winner && !candidate.Terminal {
                notifyGesture(root, candidate, GesturePhase.Canceled, GestureCancelReason.LostArbitration)
            }
        }
    }

    private func evaluateGestureGroup(root Node?, resolver Resolver, group GestureGroup,
        kind GestureInputKind, id int64, time float64, x float32, y float32) bool {
        var chosen GestureCandidate?
        for candidate in group.Candidates {
            if candidate.Terminal { continue }
            if !gestureOwnerAvailable(root, candidate) {
                notifyGesture(root, candidate, GesturePhase.Canceled, GestureCancelReason.OwnerUnavailable)
                continue
            }
            if group.Source == GestureSource.Touch && kind != GestureInputKind.Deadline
                && !candidate.Contacts.Contains(id) { continue }
            if kind == GestureInputKind.Deadline && candidate.Session.NextDeadlineSeconds() > time { continue }
            if !prepareGestureInput(group, candidate, kind, id, time) {
                notifyGesture(root, candidate, GesturePhase.Canceled, GestureCancelReason.OwnerUnavailable)
                continue
            }
            candidate.Decision = candidate.Session.Evaluate(candidate.Input)
            if candidate.Decision == GestureDecision.Reject {
                notifyGesture(root, candidate, GesturePhase.Canceled, GestureCancelReason.LostArbitration)
            } else if candidate.Decision == GestureDecision.Accept || candidate.Decision == GestureDecision.Recognize {
                if chosen == nil && !deeperDefaultReady(candidate, x, y) { chosen = candidate }
            } else if candidate.Decision == GestureDecision.Complete {
                notifyGesture(root, candidate, candidate.Accepted ? GesturePhase.Completed : GesturePhase.Canceled,
                    candidate.Accepted ? GestureCancelReason.None : GestureCancelReason.LostArbitration)
            }
        }
        if let chosen = chosen {
            let accepted = chosen.Accepted
            if !accepted { claimGesture(root, resolver, group, chosen) }
            if !chosen.Terminal && gestureOwnerAvailable(root, chosen) {
                let phase = chosen.Decision == GestureDecision.Recognize ? GesturePhase.Completed
                    : accepted ? GesturePhase.Changed : GesturePhase.Started
                notifyGesture(root, chosen, phase, GestureCancelReason.None)
            }
        }
        if !group.Claimed && group.DeferredClick != nil {
            var pending = false
            for candidate in group.Candidates { if !candidate.Terminal { pending = true } }
            if !pending {
                let click = group.DeferredClick
                group.DeferredClick = nil
                if let click = click, let tree = root {
                    if nodeVisibleInTree(tree, click, false) && canReceiveInput(click) { hitActivate(root, click) }
                }
            }
        }
        return group.Claimed
    }

    private func updateGestures(root Node?, resolver Resolver, kind GestureInputKind,
        x float32, y float32) bool {
        if current.Device != PointerDevice.Touch { return false }
        guard let group = gestureGroupFor(current.Id) else { return false }
        if kind == GestureInputKind.Down && group.Claimed {
            if let winner = group.Winner { claimGesture(root, resolver, group, winner) }
        }
        for contact in group.Contacts {
            if contact.Id == current.Id {
                contact.X = x
                contact.Y = y
                contact.Down = kind != GestureInputKind.Up
            }
        }
        try {
            return evaluateGestureGroup(root, resolver, group, kind, current.Id, recognizerTime, x, y)
        } catch (error Exception) {
            try { abortGestureGroup(root, resolver, group) }
            finally { ExceptionDispatchInfo.Capture(error).Throw() }
            return true
        }
    }

    private func finishGestureContact(root Node?, id int64) {
        guard let group = gestureGroupFor(id) else { return }
        for var i = group.Contacts.Count; i > 0; i-- {
            if group.Contacts[i - 1].Id == id { group.Contacts.RemoveAt(i - 1) }
        }
        for candidate in group.Candidates { candidate.Contacts.Remove(id) }
        if group.Contacts.Count > 0 { return }
        var pending = false
        for candidate in group.Candidates {
            if candidate.Terminal { continue }
            if !candidate.Accepted && Double.IsFinite(candidate.Session.NextDeadlineSeconds()) {
                pending = true
            } else {
                notifyGesture(root, candidate, candidate.Accepted ? GesturePhase.Completed : GesturePhase.Canceled,
                    candidate.Accepted ? GestureCancelReason.None : GestureCancelReason.LostArbitration)
            }
        }
        if !pending { gestureGroups?.Remove(group) }
    }

    internal func GestureDeadlineSeconds() float64 {
        var deadline = Double.PositiveInfinity
        if let groups = gestureGroups {
            for group in groups {
                for candidate in group.Candidates {
                    if !candidate.Terminal { deadline = Math.Min(deadline, candidate.Session.NextDeadlineSeconds()) }
                }
            }
        }
        return deadline
    }

    internal func StepGestures(root Node?, resolver Resolver, time float64) bool {
        guard let groups = gestureGroups else { return false }
        if GestureDeadlineSeconds() > time { return false }
        var changed = false
        for var i = groups.Count; i > 0; i-- {
            if i > groups.Count { continue }
            let group = groups[i - 1]
            try {
                evaluateGestureGroup(root, resolver, group, GestureInputKind.Deadline, -1, time, 0.0F, 0.0F)
                changed = true
            } catch (error Exception) {
                try { abortGestureGroup(root, resolver, group) }
                finally { ExceptionDispatchInfo.Capture(error).Throw() }
            }
            if !groups.Contains(group) { continue }
            if group.Contacts.Count == 0 {
                var pending = false
                for candidate in group.Candidates { if !candidate.Terminal { pending = true } }
                if !pending {
                    if let click = group.DeferredClick, let tree = root {
                        if nodeVisibleInTree(tree, click, false) && canReceiveInput(click) {
                            changed = hitActivate(root, click) || changed
                        }
                    }
                    groups.Remove(group)
                }
            }
        }
        return changed
    }
}
