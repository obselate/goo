package Goo

import Facebook.Yoga
import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal class ScrollbarPartState {
    internal var HorizontalTrack Node?
    internal var HorizontalThumb Node?
    internal var VerticalTrack Node?
    internal var VerticalThumb Node?
    internal let Parts List[Node]
    internal let Active List[Node]
    internal var Queued bool

    internal init() {
        Parts = List[Node]()
        Active = List[Node]()
    }
}

internal class ScrollbarParts {
    shared {
        private let states ConditionalWeakTable[Node, ScrollbarPartState] =
        ConditionalWeakTable[Node, ScrollbarPartState]()
        private let pending List[Node] = List[Node]()
        private let empty List[Node] = List[Node]()
        private let partLayout Layout = Layout()
        private var layoutDepth int32

        internal func Queue(owner Node) {
            if owner.Retired {
                return
            }
            guard let state = stateFor(owner) else {
                return
            }
            if state.Queued {
                return
            }
            state.Queued = true
            pending.Add(owner)
        }

        internal func Flush(reconciler Reconciler) bool {
            var processed = false
            var index int32
            while index < pending.Count {
                processed = true
                let owner = pending[index]
                index++
                guard let state = stateFor(owner, false) else {
                    continue
                }
                state.Queued = false
                if owner.Retired {
                    disposeParts(state)
                    states.Remove(owner)
                    continue
                }
                reconcile(owner, state, reconciler)
            }
            pending.Clear()
            return processed
        }

        internal func Discard() {
            for owner in pending {
                if let state = stateFor(owner, false) {
                    state.Queued = false
                }
            }
            pending.Clear()
        }

        internal func Dispose(owner Node) {
            guard let state = stateFor(owner, false) else {
                return
            }
            state.Queued = false
            disposeParts(state)
            states.Remove(owner)
        }

        internal func InvalidateInherited(resolver Resolver, owner Node, fields StyleMask) {
            guard let state = stateFor(owner, false) else {
                return
            }
            if styleMaskEmpty(fields) {
                return
            }
            if let root = state.HorizontalTrack {
                resolver.InvalidateInherited(root, fields)
            }
            if let root = state.HorizontalThumb {
                resolver.InvalidateInherited(root, fields)
            }
            if let root = state.VerticalTrack {
                resolver.InvalidateInherited(root, fields)
            }
            if let root = state.VerticalThumb {
                resolver.InvalidateInherited(root, fields)
            }
        }

        internal func PropagateInherited(resolver Resolver, owner Node, field StyleField) {
            var fields = StyleMask{}
            fields = styleMaskWith(fields, field)
            InvalidateInherited(resolver, owner, fields)
        }

        internal func Children(owner Node) IList[Node] {
            guard let state = stateFor(owner, false) else {
                return empty
            }
            return state.Parts
        }

        internal func ActiveChildren(owner Node) IList[Node] {
            guard let state = stateFor(owner, false) else {
                return empty
            }
            state.Active.Clear()
            for part in state.Parts {
                if IsActive(owner, part) {
                    state.Active.Add(part)
                }
            }
            return state.Active
        }

        internal func HasActive(owner Node) bool -> ActiveChildren(owner).Count != 0

        internal func IsDirectChild(owner Node, target Node) bool -> owner.Children.Contains(target)
        || Children(owner).Contains(target)

        internal func Contains(owner Node, target Node) bool {
            if owner == target {
                return true
            }
            for child in owner.Children {
                if Contains(child, target) {
                    return true
                }
            }
            for part in Children(owner) {
                if Contains(part, target) {
                    return true
                }
            }
            return false
        }

        internal func IsVertical(owner Node, part Node) bool {
            guard let state = stateFor(owner, false) else {
                return false
            }
            return state.VerticalTrack == part || state.VerticalThumb == part
        }

        internal func IsActive(owner Node, part Node) bool {
            guard let state = stateFor(owner, false) else {
                return false
            }
            if part.Retired || part.PaintInputHidden {
                return false
            }
            let vertical = IsVertical(owner, part)
            if scrollbarAlpha(owner, vertical) <= 0.0F {
                return false
            }
            var geometry ScrollThumbGeometry
            if vertical {
                if !verticalScrollThumb(owner, out geometry) {
                    return false
                }
                if state.VerticalTrack == part {
                    return geometry.TrackBounds.W > 0.0F && geometry.TrackBounds.H > 0.0F
                }
                if state.VerticalThumb == part {
                    return geometry.Bounds.W > 0.0F && geometry.Bounds.H > 0.0F
                }
            } else {
                if !horizontalScrollThumb(owner, out geometry) {
                    return false
                }
                if state.HorizontalTrack == part {
                    return geometry.TrackBounds.W > 0.0F && geometry.TrackBounds.H > 0.0F
                }
                if state.HorizontalThumb == part {
                    return geometry.Bounds.W > 0.0F && geometry.Bounds.H > 0.0F
                }
            }
            return false
        }

        internal func SetTrackHovered(owner Node, vertical bool, value bool, resolver Resolver) {
            guard let state = stateFor(owner, false) else {
                return
            }
            let part = if vertical {
                state.VerticalTrack
            } else {
                state.HorizontalTrack
            }
            guard let root = part else {
                return
            }
            if root.Retired || root.Hovered == value {
                return
            }
            root.Hovered = value
            resolver.Invalidate(root, false)
        }

        internal func SetPartPressed(owner Node, vertical bool, thumb bool, value bool, resolver Resolver) {
            guard let state = stateFor(owner, false) else {
                return
            }
            let part = if vertical {
                thumb ? state.VerticalThumb: state.VerticalTrack
            } else {
                thumb ? state.HorizontalThumb: state.HorizontalTrack
            }
            guard let root = part else {
                return
            }
            if root.Retired {
                return
            }
            if value {
                root.PointerPressCount++
                if !root.Pressed {
                    root.Pressed = true
                    resolver.Invalidate(root, false)
                }
                return
            }
            if root.PointerPressCount > 0 {
                root.PointerPressCount--
            }
            let pressed = root.PointerPressCount > 0 || root.KeyboardPressed
            if root.Pressed != pressed {
                root.Pressed = pressed
                resolver.Invalidate(root, false)
            }
        }

        internal func Arrange(root Node) {
            if layoutDepth != 0 {
                return
            }
            layoutDepth++
            try {
                layoutTree(root)
            } finally {
                layoutDepth--
            }
        }

        private func layoutTree(node Node) {
            if let state = stateFor(node, false) {
                var geometry ScrollThumbGeometry
                if (state.HorizontalTrack != nil || state.HorizontalThumb != nil)
                    && horizontalScrollThumb(node, out geometry) {
                    if let track = state.HorizontalTrack {
                        layoutPart(track, geometry.TrackBounds)
                    }
                    if let thumb = state.HorizontalThumb {
                        layoutPart(thumb, geometry.Bounds)
                    }
                }
                if (state.VerticalTrack != nil || state.VerticalThumb != nil)
                    && verticalScrollThumb(node, out geometry) {
                    if let track = state.VerticalTrack {
                        layoutPart(track, geometry.TrackBounds)
                    }
                    if let thumb = state.VerticalThumb {
                        layoutPart(thumb, geometry.Bounds)
                    }
                }
                for part in state.Parts {
                    layoutTree(part)
                }
            }
            for child in node.Children {
                if !child.IsPortal {
                    layoutTree(child)
                }
            }
        }

        private func stateFor(owner Node, create bool = true) ScrollbarPartState? {
            if states.TryGetValue(owner, out var state) {
                return state
            }
            if !create {
                return nil
            }
            let next = ScrollbarPartState()
            states.Add(owner, next)
            return next
        }

        private func reconcile(owner Node, state ScrollbarPartState, reconciler Reconciler) {
            state.HorizontalTrack = reconcilePart(owner, state.HorizontalTrack, owner.ScrollbarX?.Track, reconciler)
            state.HorizontalThumb = reconcilePart(owner, state.HorizontalThumb, owner.ScrollbarX?.Thumb, reconciler)
            state.VerticalTrack = reconcilePart(owner, state.VerticalTrack, owner.ScrollbarY?.Track, reconciler)
            state.VerticalThumb = reconcilePart(owner, state.VerticalThumb, owner.ScrollbarY?.Thumb, reconciler)
            state.Parts.Clear()
            if let root = state.HorizontalTrack {
                state.Parts.Add(root)
            }
            if let root = state.HorizontalThumb {
                state.Parts.Add(root)
            }
            if let root = state.VerticalTrack {
                state.Parts.Add(root)
            }
            if let root = state.VerticalThumb {
                state.Parts.Add(root)
            }
            partLayout.MarkStructureDirty()
            reconciler.MarkEffects(
                ReconcileEffects.Structure | ReconcileEffects.Layout
                | ReconcileEffects.Paint | ReconcileEffects.Input | ReconcileEffects.Accessibility
            )
        }

        private func reconcilePart(owner Node, current Node?, next Container?, reconciler Reconciler) Node? {
            guard let blob = next else {
                if let old = current {
                    NodeLifecycle.DisposeTree(old)
                }
                return nil
            }
            if let old = current {
                let result = reconciler.Diff(old, blob)
                result.Parent = owner
                return result
            }
            let result = reconciler.Mount(blob)
            result.Parent = owner
            return result
        }

        private func disposeParts(state ScrollbarPartState) {
            if let root = state.HorizontalTrack {
                NodeLifecycle.DisposeTree(root)
            }
            if let root = state.HorizontalThumb {
                NodeLifecycle.DisposeTree(root)
            }
            if let root = state.VerticalTrack {
                NodeLifecycle.DisposeTree(root)
            }
            if let root = state.VerticalThumb {
                NodeLifecycle.DisposeTree(root)
            }
            state.HorizontalTrack = nil
            state.HorizontalThumb = nil
            state.VerticalTrack = nil
            state.VerticalThumb = nil
            state.Parts.Clear()
            state.Active.Clear()
        }

        private func layoutPart(root Node, bounds Rect) {
            if bounds.W <= 0.0F || bounds.H <= 0.0F {
                root.Rect = bounds
                return
            }
            partLayout.Calculate(root, bounds.W, bounds.H)
            guard let yoga = root.Yoga else {
                root.Rect = bounds
                return
            }
            YGNodeStyleAPI.YGNodeStyleSetMinWidth(yoga, bounds.W)
            YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yoga, bounds.W)
            YGNodeStyleAPI.YGNodeStyleSetMinHeight(yoga, bounds.H)
            YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yoga, bounds.H)
            YGNodeStyleAPI.YGNodeStyleSetWidth(yoga, bounds.W)
            YGNodeStyleAPI.YGNodeStyleSetHeight(yoga, bounds.H)
            YGNodeAPI.YGNodeCalculateLayout(yoga, bounds.W, bounds.H, yogaDirection(root.Direction))
            partLayout.readRect(root, 0.0F, 0.0F)
            syncYogaField(root, StyleField.Width)
            syncYogaField(root, StyleField.Height)
            syncYogaField(root, StyleField.MinWidth)
            syncYogaField(root, StyleField.MinHeight)
            syncYogaField(root, StyleField.MaxWidth)
            syncYogaField(root, StyleField.MaxHeight)
            let origin = root.Rect
            offset(root, bounds.X - origin.X, bounds.Y - origin.Y)
            root.Rect = bounds
        }

        private func offset(node Node, x float32, y float32) {
            let rect = node.Rect
            node.Rect = Rect{X: rect.X + x, Y: rect.Y + y, W: rect.W, H: rect.H}
            for child in node.Children {
                offset(child, x, y)
            }
        }
    }
}
