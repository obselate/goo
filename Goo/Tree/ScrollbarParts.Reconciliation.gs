package Goo

import System.Collections.Generic

internal partial class ScrollbarParts {
    private let pending List[Node] = List[Node]()
    internal prop HasPending bool { get -> pending.Count != 0 }

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
                Dispose(owner)
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

    shared {
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

    }
}
