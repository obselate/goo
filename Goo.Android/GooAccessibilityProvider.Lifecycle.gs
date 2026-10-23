package Goo.Android

import Android.Graphics
import Android.Views
import Android.Views.Accessibility
import AndroidRect = Android.Graphics.Rect
import Goo
import NativeManager = Android.Views.Accessibility.AccessibilityManager
import System

internal partial class GooAccessibilityProvider : AccessibilityNodeProvider,
AccessibilityAdapter,
Android
    .Views
    .Accessibility
    .AccessibilityManager
    .IAccessibilityStateChangeListener,
Android
    .Views
    .Accessibility
    .AccessibilityManager
    .ITouchExplorationStateChangeListener,
ViewTreeObserver.IOnGlobalLayoutListener,
ViewTreeObserver
    .IOnPreDrawListener {
    private let screenMatrix Matrix = Matrix()
    private let mappedBounds RectF = RectF()
    private let screenBounds AndroidRect = AndroidRect()
    private let clipBounds AndroidRect = AndroidRect()
    private let matrixValues[]float32 = [9]float32
    private let previousMatrix[]float32 = [9]float32
    private var observing bool
    private var presentationReady bool
    private var geometryKnown bool
    private var hovered int32 = AccessibilityNodeProvider.HostViewId
    private var pendingFocus int32 = AccessibilityNodeProvider.HostViewId
    private var previousWidth int32
    private var previousHeight int32
    private var previousLeft int32
    private var previousTop int32
    private var previousRight int32
    private var previousBottom int32
    private var previousScale(X float32, Y float32)
    private var previousVisibility bool

    private prop PixelScale(X float32, Y float32) {
        get {
            var metrics = view.Window.CurrentWindowMetrics()
            return (
                float32(
                    (
                        if metrics.DisplayScaleX > float64(0.0) {
                            metrics.DisplayScaleX
                        } else {
                            float64(view.Density)
                        }
                    )
                ) * view
                    .Window
                    .UiScale,
                float32(
                    (
                        if metrics.DisplayScaleY > float64(0.0) {
                            metrics.DisplayScaleY
                        } else {
                            float64(view.Density)
                        }
                    )
                ) * view
                    .Window
                    .UiScale
            )
        }
    }

    internal func Attach() {
        if disposed || observing {
            return
        }
        observing = true
        manager.AddAccessibilityStateChangeListener(this)
        manager.AddTouchExplorationStateChangeListener(this)
        view.ViewTreeObserver!!.AddOnGlobalLayoutListener(this)
        view.ViewTreeObserver!!.AddOnPreDrawListener(this)
        if manager.IsEnabled {
            BindAdapter()
        }
        geometryKnown = false
    }

    internal func Detach() {
        SetPresentationReady(false)
        SuspendTree()
        if !observing {
            return
        }
        observing = false
        manager.RemoveAccessibilityStateChangeListener(this)
        manager.RemoveTouchExplorationStateChangeListener(this)
        if view.ViewTreeObserver is {IsAlive: true} observer {
            observer.RemoveOnGlobalLayoutListener(this)
            observer.RemoveOnPreDrawListener(this)
        }
    }

    internal func SetPresentationReady(value bool) {
        if disposed || presentationReady == value {
            return
        }
        if !value {
            CancelEvents()
            SetHover(AccessibilityNodeProvider.HostViewId)
            SetAccessibilityFocus(AccessibilityNodeProvider.HostViewId)
            pendingFocus = AccessibilityNodeProvider.HostViewId
        }
        presentationReady = value
        geometryKnown = false
        if value {
            RefreshNativeGeometry()
            CompletePendingFocus()
        } else {
            RequestFullRefresh()
        }
    }

    func OnGlobalLayout() -> RefreshNativeGeometry()

    func OnPreDraw() bool {
        RefreshNativeGeometry()
        return true
    }

    func OnAccessibilityStateChanged(enabled bool) {
        if disposed {
            return
        }
        if enabled {
            BindAdapter()
        } else {
            SetHover(AccessibilityNodeProvider.HostViewId)
            SetAccessibilityFocus(AccessibilityNodeProvider.HostViewId)
            pendingFocus = AccessibilityNodeProvider.HostViewId
            SuspendTree()
        }
        geometryKnown = false
        RefreshNativeGeometry()
    }

    func OnTouchExplorationStateChanged(enabled bool) {
        if !enabled {
            SetHover(AccessibilityNodeProvider.HostViewId)
        }
    }

    internal func ConfigurationChanged() {
        for record in nodes.Values {
            record.Words?.Dispose()
            record.Words = nil
            record.WordText = nil
        }
        geometryKnown = false
        RequestFullRefresh()
    }

    internal func RefreshNativeGeometry() {
        if disposed || !observing || !manager.IsEnabled {
            return
        }
        screenMatrix.Reset()
        view.TransformMatrixToGlobal(screenMatrix)
        screenMatrix.GetValues(matrixValues)
        let visible = Available && view.GetLocalVisibleRect(clipBounds)
        let scale = PixelScale
        var changed = !geometryKnown ||
            previousWidth != view.Width ||
            previousHeight != view.Height ||
            previousVisibility != visible ||
            previousScale != scale ||
            previousLeft != clipBounds.Left ||
            previousTop != clipBounds.Top ||
            previousRight != clipBounds.Right ||
            previousBottom != clipBounds.Bottom
        for var i = 0; i < matrixValues.Length; i++ {
            changed |= previousMatrix[i] != matrixValues[i]
            previousMatrix[i] = matrixValues[i]
        }
        previousWidth = view.Width
        previousHeight = view.Height
        previousVisibility = visible
        previousScale = scale
        previousLeft = clipBounds.Left
        previousTop = clipBounds.Top
        previousRight = clipBounds.Right
        previousBottom = clipBounds.Bottom
        geometryKnown = true
        if !visible {
            SetHover(AccessibilityNodeProvider.HostViewId)
            SetAccessibilityFocus(AccessibilityNodeProvider.HostViewId)
        }
        if changed {
            RequestFullRefresh()
        }
    }

    internal func DispatchHover(e MotionEvent) bool {
        if !Available || !manager.IsEnabled || !manager.IsTouchExplorationEnabled || e.GetToolType(
            0
        ) != MotionEventToolType.Finger {
            return false
        }
        if e.ActionMasked == MotionEventActions.HoverExit {
            SetHover(AccessibilityNodeProvider.HostViewId)
        } else if (e.ActionMasked is MotionEventActions.HoverEnter or MotionEventActions.HoverMove) {
            let scale = PixelScale
            let hit = view.Window.AccessibilityHitTest(e.GetX() / scale.X, e.GetY() / scale.Y)
            var semantic AccessibilityId
            SetHover(
                if hit != nil && {
                    semantic = hit!!
                    true
                } && ids.TryGetValue(semantic.Value, out var id) {
                    id
                } else {
                    AccessibilityNodeProvider.HostViewId
                }
            )
        } else {
            return false
        }
        return true
    }

    private func SetHover(id int32) {
        if hovered == id {
            return
        }
        let previous = hovered
        hovered = id
        if previous != AccessibilityNodeProvider.HostViewId {
            Send(previous, EventTypes.ViewHoverExit)
        }
        if id != AccessibilityNodeProvider.HostViewId {
            Send(id, EventTypes.ViewHoverEnter)
        }
    }

    private func CompletePendingFocus() {
        if !Available || pendingFocus == AccessibilityNodeProvider.HostViewId {
            return
        }
        if !nodes.TryGetValue(pendingFocus, out var record) {
            pendingFocus = AccessibilityNodeProvider.HostViewId
        } else if record.Node.VisibleBounds != nil {
            let id = pendingFocus
            pendingFocus = AccessibilityNodeProvider.HostViewId
            SetAccessibilityFocus(id)
        }
    }

    private func BindAdapter() {
        let adapter AccessibilityAdapter? = view.Window.AccessibilityAdapter
        if adapter != nil && !object.ReferenceEquals(adapter, this) {
            throw InvalidOperationException("GooView owns the window accessibility adapter.")
        }
        view.Window.AccessibilityAdapter = this
    }

    private func SuspendTree() {
        CancelEvents()
        if object.ReferenceEquals(view.Window.AccessibilityAdapter, this) {
            view.Window.AccessibilityAdapter = nil
        }
        for record in nodes.Values {
            record.Words?.Dispose()
        }
        nodes.Clear()
        rootId = AccessibilityNodeProvider.HostViewId
        version = -1
    }

    private func CanReveal(record NodeRecord) bool {
        var record = record
        while record.Parent != AccessibilityNodeProvider.HostViewId && nodes.TryGetValue(record.Parent, out record) {
            let __spill4 = record.Node.ScrollInfo
            var scroll AccessibilityScrollInfo
            if __spill4 != nil && {
                scroll = __spill4!!
                true
            } && (scroll.MaximumX > float64(0.0) || scroll.MaximumY > float64(0.0)) {
                return true
            }
        }
        return false
    }
}
