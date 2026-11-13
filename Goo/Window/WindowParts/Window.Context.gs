package Goo

import System.Collections.Generic

/// Owns retained typed context values and their window lifecycle.
public partial class Window {
    private var contextValues Dictionary[object, ContextFrame]?
    private var trackedState WindowDependency[WindowState]?
    private var trackedFocus WindowDependency[bool]?
    private var trackedSize WindowDependency[LayoutSize]?
    private var trackedWidth WindowDependency[int32]?
    private var trackedHeight WindowDependency[int32]?
    private var trackedScale WindowDependency[float32]?
    private var trackedPreferences WindowDependency[PlatformPreferences]?
    private var trackedModifiers WindowDependency[KeyModifiers]?
    internal var trackedEditsText WindowDependency[bool]?
    internal var trackedEditor WindowDependency[FocusedEditorSnapshot?]?
    internal var trackedSelection WindowDependency[TextSelection?]?

    internal func TrackWindowValue[T any](ref dependency WindowDependency[T]?, value T) T {
        if let reader = StateDependency.Reader() {
            dependency ??= WindowDependency[T](value)
            dependency!!.Read(reader)
        }
        return value
    }

    private func SyncWindowValues() {
        trackedState?.Sync(state)
        trackedFocus?.Sync(IsFocused)
        trackedSize?.Sync(Size)
        trackedWidth?.Sync(NativeWidth)
        trackedHeight?.Sync(NativeHeight)
        trackedScale?.Sync(UiScale)
        trackedPreferences?.Sync(preferences)
        trackedModifiers?.Sync(modifiers)
        SyncWindowFocus()
    }

    private func SyncWindowFocus() {
        trackedEditsText?.Sync(WindowFocus.TargetEditsText(input.FocusedNode()))
        trackedEditor?.Sync(input.EditorSnapshot())
        trackedSelection?.Sync(input.EditorSelection())
    }


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
