using Android.Content;
using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Views.InputMethods;
using System.Text;
using AndroidKeyEvent = Android.Views.KeyEvent;

namespace Goo.Android;

public sealed class GooView : SurfaceView, ISurfaceHolderCallback
{
    private readonly AndroidVulkanHost host;
    private readonly Handler handler = new(Looper.MainLooper!);
    private readonly FrameCallback frameCallback;
    private readonly Java.Lang.Runnable scheduleFrame;
    private readonly Choreographer choreographer;
    private readonly InputMethodManager inputMethod;
    private readonly object wakeGate = new();
    private bool framePosted;
    private bool resumed = true;
    private volatile bool disposed;
    private long lastFrameTime;
    private long editorFocus;
    private int editorConfiguration;
    private GooInputConnection? batchConnection;
    private int batchDepth;
    private FocusedEditorSnapshot? pendingEditor;
    private bool editorPending;
    private int wakePosted;

    public GooView(Context context, global::Goo.Window window) : base(context)
    {
        ArgumentNullException.ThrowIfNull(window);
        if (Looper.MyLooper() != Looper.MainLooper)
            throw new InvalidOperationException("Create GooView on the Android main thread.");
        Window = window;
        host = new AndroidVulkanHost(this);
        frameCallback = new FrameCallback(this);
        scheduleFrame = new Java.Lang.Runnable(ScheduleFrame);
        choreographer = Choreographer.Instance!;
        inputMethod = (InputMethodManager)context.GetSystemService(Context.InputMethodService)!;
        Focusable = true;
        FocusableInTouchMode = true;
        Clickable = true;
        if (window.Transparent)
        {
            SetZOrderOnTop(true);
            Holder!.SetFormat(Format.Translucent);
        }
        Holder!.AddCallback(this);
        window.Attach(host);
        window.PlatformInput.EditorChanged += OnEditorChanged;
    }

    public global::Goo.Window Window { get; }
    /// <summary>Reports changes in immediate frame demand on the Android UI thread.</summary>
    public event Action<bool>? FrameDemandChanged;
    /// <summary>Gets whether a frame is pending or another immediate frame is needed.</summary>
    public bool HasFrameDemand { get; private set; }
    /// <summary>Gets or sets whether the Done editor action hides the software keyboard.</summary>
    public bool DismissKeyboardOnSubmit { get; set; } = true;
    internal float Density => Math.Max(Resources?.DisplayMetrics?.Density ?? 1f, 0.1f);
    internal PlatformInput Input => Window.PlatformInput;

    public void Resume()
    {
        if (disposed)
            return;
        resumed = true;
        lastFrameTime = 0;
        host.Resume();
        host.SetFocused(HasWindowFocus);
        RequestFrame();
    }

    public void Pause()
    {
        if (disposed)
            return;
        resumed = false;
        CancelFrames();
        host.Suspend();
    }

    public void SurfaceCreated(ISurfaceHolder holder)
    {
        if (disposed || holder.Surface is not { } surface)
            return;
        host.AcquireSurface(surface);
    }

    public void SurfaceChanged(ISurfaceHolder holder, Format format, int width, int height)
    {
        if (disposed)
            return;
        if (holder.Surface is { } surface)
            host.RefreshSurface(surface);
        host.Resize(Math.Max(1, (int)Math.Round(width / Density)),
            Math.Max(1, (int)Math.Round(height / Density)), width, height);
        if (!host.IsPresentationAttached && width > 0 && height > 0)
            host.AttachPresentation();
        RequestFrame();
    }

    public void SurfaceDestroyed(ISurfaceHolder holder)
    {
        if (disposed)
            return;
        CancelFrames();
        Input.FocusLost();
        host.DetachPresentation();
        host.ReleaseSurface();
    }

    public override void OnWindowFocusChanged(bool hasWindowFocus)
    {
        base.OnWindowFocusChanged(hasWindowFocus);
        if (!disposed)
            host.SetFocused(hasWindowFocus && resumed);
    }

    protected override void OnDetachedFromWindow()
    {
        CancelFrames();
        base.OnDetachedFromWindow();
    }

    internal void RequestFrame()
    {
        lock (wakeGate)
        {
            if (disposed || Interlocked.Exchange(ref wakePosted, 1) != 0)
                return;
            handler.Post(() =>
            {
                Interlocked.Exchange(ref wakePosted, 0);
                if (disposed)
                    return;
                if (resumed && host.IsPresentationAttached)
                    host.ServicePendingSubmission();
                handler.RemoveCallbacks(scheduleFrame);
                ScheduleFrame();
            });
        }
    }

    private void ScheduleFrame()
    {
        if (disposed || !resumed || !host.IsPresentationAttached || framePosted)
            return;
        framePosted = true;
        SetFrameDemand(true);
        choreographer.PostFrameCallback(frameCallback);
    }

    private void DrawFrame(long frameTime)
    {
        framePosted = false;
        if (disposed || !resumed || !host.IsPresentationAttached)
            return;
        var dt = lastFrameTime == 0 ? 0 : Math.Max(0, (frameTime - lastFrameTime) / 1_000_000_000d);
        lastFrameTime = frameTime;
        host.RenderFrame(dt);
        var delay = host.NextFrameDelaySeconds;
        SetFrameDemand(delay <= 0);
        if (double.IsPositiveInfinity(delay))
            return;
        if (delay <= 0)
            ScheduleFrame();
        else
            handler.PostDelayed(scheduleFrame, Math.Max(1, (long)Math.Ceiling(delay * 1000)));
    }

    private void CancelFrames()
    {
        handler.RemoveCallbacks(scheduleFrame);
        choreographer.RemoveFrameCallback(frameCallback);
        framePosted = false;
        lastFrameTime = 0;
        SetFrameDemand(false);
    }

    private void SetFrameDemand(bool value)
    {
        if (HasFrameDemand == value)
            return;
        HasFrameDemand = value;
        FrameDemandChanged?.Invoke(value);
    }

    public override bool OnTouchEvent(MotionEvent? e)
    {
        if (disposed || e is null || !resumed)
            return false;
        if (e.ActionMasked == MotionEventActions.Down)
        {
            RequestFocus();
            Parent?.RequestDisallowInterceptTouchEvent(true);
        }
        var modifiers = Modifiers(e.MetaState);
        var first = e.ActionMasked == MotionEventActions.Move || e.ActionMasked == MotionEventActions.Cancel ? 0 : e.ActionIndex;
        var count = e.ActionMasked == MotionEventActions.Move || e.ActionMasked == MotionEventActions.Cancel ? e.PointerCount : first + 1;
        for (var i = first; i < count; i++)
        {
            var id = e.GetPointerId(i);
            var device = Device(e.GetToolType(i));
            var x = e.GetX(i) / Density;
            var y = e.GetY(i) / Density;
            switch (e.ActionMasked)
            {
                case MotionEventActions.Down:
                case MotionEventActions.PointerDown:
                    Input.PointerPress(id, device, x, y, PointerButton.Primary, modifiers, e.GetPressure(i));
                    break;
                case MotionEventActions.Up:
                case MotionEventActions.PointerUp:
                    Input.PointerRelease(id, device, x, y, PointerButton.Primary, modifiers, e.GetPressure(i));
                    break;
                case MotionEventActions.Cancel:
                    Input.PointerCancel(id, device);
                    break;
                default:
                    Input.PointerMove(id, device, x, y, modifiers, e.GetPressure(i));
                    break;
            }
        }
        if (e.ActionMasked == MotionEventActions.Up)
        {
            PerformClick();
            if (Input.Editor is { IsReadOnly: false })
                inputMethod.ShowSoftInput(this, ShowFlags.Implicit);
        }
        RequestFrame();
        return true;
    }

    public override bool PerformClick()
    {
        base.PerformClick();
        return true;
    }

    public override bool OnGenericMotionEvent(MotionEvent? e)
    {
        if (e is null || disposed || !resumed)
            return false;
        if (e.ActionMasked == MotionEventActions.Scroll)
            Input.PointerWheel(e.GetX() / Density, e.GetY() / Density,
                e.GetAxisValue(Axis.Hscroll), e.GetAxisValue(Axis.Vscroll), Modifiers(e.MetaState));
        else if (e.ActionMasked is MotionEventActions.HoverMove or MotionEventActions.HoverEnter)
            Input.PointerMove(e.GetPointerId(0), Device(e.GetToolType(0)), e.GetX() / Density,
                e.GetY() / Density, Modifiers(e.MetaState), e.GetPressure(0));
        else
            return base.OnGenericMotionEvent(e);
        RequestFrame();
        return true;
    }

    public override bool OnKeyDown(Keycode keyCode, AndroidKeyEvent? e)
    {
        if (disposed || !resumed || e is null)
            return false;
        var key = AndroidKeys.Map(keyCode);
        var handled = key != Key.Unknown;
        try
        {
            if (handled)
                Input.KeyPress(key, Modifiers(e.MetaState));
            var scalar = e.UnicodeChar;
            if (!e.IsCtrlPressed && !e.IsAltPressed && Rune.TryCreate(scalar, out var character) && !Rune.IsControl(character))
            {
                Input.CommitText(character.ToString());
                handled = true;
            }
            if (!handled)
                return base.OnKeyDown(keyCode, e);
            RequestFrame();
            return true;
        }
        finally
        {
            if (key != Key.Unknown)
                Input.KeyRelease(key);
        }
    }

    public override bool OnKeyUp(Keycode keyCode, AndroidKeyEvent? e)
    {
        if (disposed || !resumed || e is null)
            return false;
        var key = AndroidKeys.Map(keyCode);
        if (key == Key.Unknown)
            return base.OnKeyUp(keyCode, e);
        return true;
    }

    public override bool OnCheckIsTextEditor() => Input.Editor is { IsReadOnly: false };

    public override IInputConnection? OnCreateInputConnection(EditorInfo? outAttrs)
    {
        if (disposed || outAttrs is null || Input.Editor is not { IsReadOnly: false } editor)
            return null;
        outAttrs.InputType = global::Android.Text.InputTypes.ClassText
            | (editor.IsPassword ? global::Android.Text.InputTypes.TextVariationPassword : 0)
            | (editor.IsMultiline ? global::Android.Text.InputTypes.TextFlagMultiLine : 0);
        outAttrs.ImeOptions = (ImeFlags)(editor.IsMultiline ? ImeAction.None : ImeAction.Done)
            | ImeFlags.NoExtractUi | (editor.IsPassword ? ImeFlags.NoPersonalizedLearning : 0);
        outAttrs.InitialSelStart = editor.SelectionStart;
        outAttrs.InitialSelEnd = editor.SelectionEnd;
        return new GooInputConnection(this, editor.FocusId);
    }

    internal bool BeginTextInput()
    {
        RequestFocus();
        inputMethod.RestartInput(this);
        inputMethod.ShowSoftInput(this, ShowFlags.Implicit);
        return true;
    }

    internal void EndTextInput() => inputMethod.HideSoftInputFromWindow(WindowToken, HideSoftInputFlags.None);

    internal bool SetImeArea(int x, int y, int width, int height)
    {
        if (batchDepth > 0)
            return true;
        var area = new Rect((int)(x * Density), (int)(y * Density),
            (int)((x + width) * Density), (int)((y + height) * Density));
        RequestRectangleOnScreen(area);
        if (Input.Editor is not { } editor)
            return false;
        var location = new int[2];
        GetLocationOnScreen(location);
        using var matrix = new Matrix();
        matrix.SetTranslate(location[0], location[1]);
        using var builder = new CursorAnchorInfo.Builder();
        builder.SetMatrix(matrix);
        builder.SetSelectionRange(editor.SelectionStart, editor.SelectionEnd);
        builder.SetInsertionMarkerLocation(area.Left, area.Top, area.Bottom, area.Bottom,
            CursorAnchorFlags.HasVisibleRegion);
        using var anchor = builder.Build();
        inputMethod.UpdateCursorAnchorInfo(this, anchor);
        return true;
    }

    private void OnEditorChanged(FocusedEditorSnapshot? editor)
    {
        var focus = editor?.FocusId ?? 0;
        var configuration = EditorConfiguration(editor);
        if (batchDepth > 0 && focus == editorFocus && configuration == editorConfiguration)
        {
            pendingEditor = editor;
            editorPending = true;
            RequestFrame();
            return;
        }
        if (focus != editorFocus || configuration != editorConfiguration)
        {
            batchConnection = null;
            batchDepth = 0;
            editorPending = false;
            pendingEditor = null;
            editorFocus = focus;
            editorConfiguration = configuration;
            inputMethod.RestartInput(this);
            if (editor is { IsReadOnly: false })
                inputMethod.ShowSoftInput(this, ShowFlags.Implicit);
            else
                EndTextInput();
        }
        if (editor is { } value)
            inputMethod.UpdateSelection(this, value.SelectionStart, value.SelectionEnd,
                value.CompositionStart, value.CompositionEnd);
        RequestFrame();
    }

    internal bool BeginInputBatch(GooInputConnection connection)
    {
        if (disposed || batchConnection is not null && batchConnection != connection || batchDepth == int.MaxValue)
            return false;
        batchConnection = connection;
        batchDepth++;
        return true;
    }

    internal bool EndInputBatch(GooInputConnection connection)
    {
        if (disposed || batchConnection != connection || batchDepth == 0)
            return false;
        batchDepth--;
        if (batchDepth != 0)
            return true;
        EndInputBatches(connection);
        return false;
    }

    internal void EndInputBatches(GooInputConnection connection)
    {
        if (disposed || batchConnection != connection)
            return;
        batchConnection = null;
        batchDepth = 0;
        if (!editorPending)
            return;
        var editor = pendingEditor;
        pendingEditor = null;
        editorPending = false;
        OnEditorChanged(editor);
        if (editor is { } value)
            SetImeArea((int)value.CaretArea.X, (int)value.CaretArea.Y,
                Math.Max(1, (int)Math.Ceiling(value.CaretArea.Width)), Math.Max(1, (int)Math.Ceiling(value.CaretArea.Height)));
    }

    private static int EditorConfiguration(FocusedEditorSnapshot? editor) => editor is { } value
        ? (value.IsPassword ? 1 : 0) | (value.IsMultiline ? 2 : 0) | (value.IsReadOnly ? 4 : 0) : 0;

    internal string GetClipboardText()
    {
        var clipboard = (ClipboardManager)Context!.GetSystemService(Context.ClipboardService)!;
        return clipboard.PrimaryClip?.GetItemAt(0)?.CoerceToText(Context)?.ToString() ?? "";
    }

    internal void SetClipboardText(string value)
    {
        var clipboard = (ClipboardManager)Context!.GetSystemService(Context.ClipboardService)!;
        clipboard.PrimaryClip = ClipData.NewPlainText("Goo", value);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && !disposed)
        {
            lock (wakeGate)
            {
                disposed = true;
                handler.RemoveCallbacksAndMessages(null);
            }
            CancelFrames();
            Window.PlatformInput.EditorChanged -= OnEditorChanged;
            EndTextInput();
            host.Dispose();
            host.ReleaseSurface();
            Holder?.RemoveCallback(this);
            frameCallback.Dispose();
            scheduleFrame.Dispose();
            handler.Dispose();
        }
        base.Dispose(disposing);
    }

    private static PointerDevice Device(MotionEventToolType tool) => tool switch
    {
        MotionEventToolType.Finger => PointerDevice.Touch,
        MotionEventToolType.Stylus or MotionEventToolType.Eraser => PointerDevice.Pen,
        _ => PointerDevice.Mouse,
    };

    private static KeyModifiers Modifiers(MetaKeyStates state) => new()
    {
        Alt = (state & MetaKeyStates.AltOn) != 0,
        Shift = (state & MetaKeyStates.ShiftOn) != 0,
        Ctrl = (state & MetaKeyStates.CtrlOn) != 0,
        Super = (state & MetaKeyStates.MetaOn) != 0,
    };

    private sealed class FrameCallback(GooView view) : Java.Lang.Object, Choreographer.IFrameCallback
    {
        public void DoFrame(long frameTimeNanos) => view.DrawFrame(frameTimeNanos);
    }
}
