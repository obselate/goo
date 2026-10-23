using Android.Graphics;
using Android.Views;
using Android.Views.Accessibility;
using AndroidRect = Android.Graphics.Rect;
using NativeManager = Android.Views.Accessibility.AccessibilityManager;

namespace Goo.Android;

internal sealed partial class GooAccessibilityProvider : NativeManager.IAccessibilityStateChangeListener,
    NativeManager.ITouchExplorationStateChangeListener, ViewTreeObserver.IOnGlobalLayoutListener,
    ViewTreeObserver.IOnPreDrawListener
{
    private readonly Matrix screenMatrix = new();
    private readonly RectF mappedBounds = new();
    private readonly AndroidRect screenBounds = new();
    private readonly AndroidRect clipBounds = new();
    private readonly float[] matrixValues = new float[9];
    private readonly float[] previousMatrix = new float[9];
    private bool observing;
    private bool presentationReady;
    private bool geometryKnown;
    private int hovered = HostViewId;
    private int pendingFocus = HostViewId;
    private int previousWidth;
    private int previousHeight;
    private int previousLeft;
    private int previousTop;
    private int previousRight;
    private int previousBottom;
    private (float X, float Y) previousScale;
    private bool previousVisibility;

    private (float X, float Y) PixelScale
    {
        get
        {
            var metrics = view.Window.CurrentWindowMetrics();
            return ((float)(metrics.DisplayScaleX > 0 ? metrics.DisplayScaleX : view.Density) * view.Window.UiScale,
                (float)(metrics.DisplayScaleY > 0 ? metrics.DisplayScaleY : view.Density) * view.Window.UiScale);
        }
    }

    internal void Attach()
    {
        if (disposed || observing) return;
        observing = true;
        manager.AddAccessibilityStateChangeListener(this);
        manager.AddTouchExplorationStateChangeListener(this);
        view.ViewTreeObserver!.AddOnGlobalLayoutListener(this);
        view.ViewTreeObserver.AddOnPreDrawListener(this);
        if (manager.IsEnabled) BindAdapter();
        geometryKnown = false;
    }

    internal void Detach()
    {
        SetPresentationReady(false);
        SuspendTree();
        if (!observing) return;
        observing = false;
        manager.RemoveAccessibilityStateChangeListener(this);
        manager.RemoveTouchExplorationStateChangeListener(this);
        if (view.ViewTreeObserver is { IsAlive: true } observer)
        {
            observer.RemoveOnGlobalLayoutListener(this);
            observer.RemoveOnPreDrawListener(this);
        }
    }

    internal void SetPresentationReady(bool value)
    {
        if (disposed || presentationReady == value) return;
        if (!value)
        {
            CancelEvents();
            SetHover(HostViewId);
            SetAccessibilityFocus(HostViewId);
            pendingFocus = HostViewId;
        }
        presentationReady = value;
        geometryKnown = false;
        if (value)
        {
            RefreshNativeGeometry();
            CompletePendingFocus();
        }
        else
            RequestFullRefresh();
    }

    public void OnGlobalLayout() => RefreshNativeGeometry();

    public bool OnPreDraw()
    {
        RefreshNativeGeometry();
        return true;
    }

    public void OnAccessibilityStateChanged(bool enabled)
    {
        if (disposed) return;
        if (enabled)
            BindAdapter();
        else
        {
            SetHover(HostViewId);
            SetAccessibilityFocus(HostViewId);
            pendingFocus = HostViewId;
            SuspendTree();
        }
        geometryKnown = false;
        RefreshNativeGeometry();
    }

    public void OnTouchExplorationStateChanged(bool enabled)
    {
        if (!enabled) SetHover(HostViewId);
    }

    internal void ConfigurationChanged()
    {
        foreach (var record in nodes.Values)
        {
            record.Words?.Dispose();
            record.Words = null;
            record.WordText = null;
        }
        geometryKnown = false;
        RequestFullRefresh();
    }

    internal void RefreshNativeGeometry()
    {
        if (disposed || !observing || !manager.IsEnabled) return;
        screenMatrix.Reset();
        view.TransformMatrixToGlobal(screenMatrix);
        screenMatrix.GetValues(matrixValues);
        var visible = Available && view.GetLocalVisibleRect(clipBounds);
        var scale = PixelScale;
        var changed = !geometryKnown || previousWidth != view.Width || previousHeight != view.Height
            || previousVisibility != visible || previousScale != scale
            || previousLeft != clipBounds.Left || previousTop != clipBounds.Top
            || previousRight != clipBounds.Right || previousBottom != clipBounds.Bottom;
        for (var i = 0; i < matrixValues.Length; i++)
        {
            changed |= previousMatrix[i] != matrixValues[i];
            previousMatrix[i] = matrixValues[i];
        }
        previousWidth = view.Width;
        previousHeight = view.Height;
        previousVisibility = visible;
        previousScale = scale;
        previousLeft = clipBounds.Left;
        previousTop = clipBounds.Top;
        previousRight = clipBounds.Right;
        previousBottom = clipBounds.Bottom;
        geometryKnown = true;
        if (!visible)
        {
            SetHover(HostViewId);
            SetAccessibilityFocus(HostViewId);
        }
        if (changed) RequestFullRefresh();
    }

    internal bool DispatchHover(MotionEvent e)
    {
        if (!Available || !manager.IsEnabled || !manager.IsTouchExplorationEnabled
            || e.GetToolType(0) != MotionEventToolType.Finger) return false;
        if (e.ActionMasked == MotionEventActions.HoverExit)
            SetHover(HostViewId);
        else if (e.ActionMasked is MotionEventActions.HoverEnter or MotionEventActions.HoverMove)
        {
            var scale = PixelScale;
            var hit = view.Window.AccessibilityHitTest(e.GetX() / scale.X, e.GetY() / scale.Y);
            SetHover(hit is { } semantic && ids.TryGetValue(semantic.Value, out var id) ? id : HostViewId);
        }
        else return false;
        return true;
    }

    private void SetHover(int id)
    {
        if (hovered == id) return;
        var previous = hovered;
        hovered = id;
        if (previous != HostViewId) Send(previous, EventTypes.ViewHoverExit);
        if (id != HostViewId) Send(id, EventTypes.ViewHoverEnter);
    }

    private void CompletePendingFocus()
    {
        if (!Available || pendingFocus == HostViewId) return;
        if (!nodes.TryGetValue(pendingFocus, out var record))
            pendingFocus = HostViewId;
        else if (record.Node.VisibleBounds is not null)
        {
            var id = pendingFocus;
            pendingFocus = HostViewId;
            SetAccessibilityFocus(id);
        }
    }

    private void BindAdapter()
    {
        var adapter = view.Window.AccessibilityAdapter;
        if (adapter is not null && !ReferenceEquals(adapter, this))
            throw new InvalidOperationException("GooView owns the window accessibility adapter.");
        view.Window.AccessibilityAdapter = this;
    }

    private void SuspendTree()
    {
        CancelEvents();
        if (ReferenceEquals(view.Window.AccessibilityAdapter, this))
            view.Window.AccessibilityAdapter = null;
        foreach (var record in nodes.Values) record.Words?.Dispose();
        nodes.Clear();
        rootId = HostViewId;
        version = -1;
    }

    private bool CanReveal(NodeRecord record)
    {
        while (record.Parent != HostViewId && nodes.TryGetValue(record.Parent, out record!))
            if (record.Node.ScrollInfo is { } scroll && (scroll.MaximumX > 0 || scroll.MaximumY > 0))
                return true;
        return false;
    }
}
