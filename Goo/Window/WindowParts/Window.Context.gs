package Goo

import System.Collections.Generic

/// Owns retained typed context values and their window lifecycle.
public partial class Window {
    private var contextValues Dictionary[object, ContextFrame]?

    internal func RequireContextThread() {
        requireUiThread("Context")
    }

    internal func ContextValue(key object) ContextFrame? {
        if let values = contextValues {
            if values.TryGetValue(key, out var value) {
                return value
            }
        }
        return nil
    }

    internal func AddContextValue(key object, value ContextFrame) {
        contextValues ??= Dictionary[object, ContextFrame]()
        value.Owner = this
        contextValues!!.Add(key, value)
        InvalidateVirtualContexts(value, false)
    }

    internal func InvalidateVirtualContexts(frame ContextFrame, lineageChanged bool) {
        guard let root = node else {
            return
        }
        for candidate in layout.ScrollNodes(root) {
            if let state = Virtualization.State(candidate) {
                if state.ContextAffected(frame, lineageChanged) {
                    state.InvalidateContext()
                }
            }
        }
    }

    internal func ContextVirtualInvalidated() {
        enqueueRetainedInvalidation(ReconcileEffects.Layout)
    }

    private func ClearContextValues() {
        if let values = contextValues {
            for entry in values {
                entry.Value.Clear()
            }
            values.Clear()
        }
        contextValues = nil
    }
}
