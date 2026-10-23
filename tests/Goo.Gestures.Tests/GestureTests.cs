using System.Diagnostics;
using System.Reflection;
using Goo;
using Goo.Gestures;
using Xunit;

public sealed class GestureTests
{
    [Fact]
    public void TransformCombinesPinchRotationAndPanAndSuppressesClicks()
    {
        var events = new List<TransformGestureEvent>();
        var clicks = 0;
        var surface = new Container
        {
            Width = 200,
            Height = 200,
            Gestures = new GestureRecognizer[] { new TransformGesture(events.Add) },
            OnClick = () => clicks++
        };
        var window = Mount(surface);
        Down(window, 1, 30, 50);
        Down(window, 2, 70, 50);
        Move(window, 2, 30, 130);
        Up(window, 1, 30, 50);
        Move(window, 2, 50, 150);
        Up(window, 2, 50, 150);
        Assert.Equal(0, clicks);
        Assert.Equal(GesturePhase.Started, events[0].Phase);
        Assert.Equal(GesturePhase.Completed, events[^1].Phase);
        Assert.Equal(3, events.Count);
        Assert.Equal(2, events[1].Scale, 6);
        Assert.Equal(Math.PI / 2, events[1].Rotation.Radians, 6);
        Assert.Equal(GestureRotationStatus.Available, events[1].Rotation.Status);
        Assert.Equal(30, events[1].WindowCenter.X, 6);
        Assert.Equal(90, events[1].WindowCenter.Y, 6);
        events.Clear();
        Down(window, 3, 30, 50);
        Down(window, 4, 70, 50);
        Move(window, 4, 30, 50);
        Up(window, 4, 30, 50);
        Assert.Equal(GesturePhase.Completed, events[^1].Phase);
        Up(window, 3, 30, 50);
        Assert.Equal(3, events.Count);
        Close(window);
    }

    [Fact]
    public void PanWinsBeforeAncestorScrollAndNativeCancelEndsOnce()
    {
        var events = new List<PanGestureEvent>();
        var surface = new Container
        {
            Width = 200,
            Height = 400,
            Gestures = new GestureRecognizer[] { new PanGesture(events.Add) }
        };
        var viewport = new Container { Width = 200, Height = 200, OverflowY = Overflow.Scroll };
        viewport.Children.Add(surface);
        var window = Mount(viewport);
        Down(window, 1, 30, 100);
        Move(window, 1, 30, 70);
        window.PlatformInput.PointerCancel(1, PointerDevice.Touch);
        Up(window, 1, 30, 70);
        Assert.Equal(new[] { GesturePhase.Started, GesturePhase.Canceled }, events.Select(value => value.Phase));
        Assert.Equal(GestureCancelReason.PointerCanceled, events[^1].Reason);
        Assert.Equal(-30, events[0].Translation.Y, 6);
        Close(window);
    }

    [Fact]
    public void LongPressUsesCoreDeadlineAndKeepsDraggingUntilRelease()
    {
        var events = new List<PressGestureEvent>();
        var surface = new Container
        {
            Width = 200,
            Height = 200,
            Gestures = new GestureRecognizer[] { new LongPressGesture(events.Add) }
        };
        var window = Mount(surface);
        Down(window, 1, 30, 50);
        AdvanceDeadline(window);
        Move(window, 1, 70, 90);
        Up(window, 1, 70, 90);
        Assert.Equal(new[] { GesturePhase.Started, GesturePhase.Changed, GesturePhase.Completed }, events.Select(value => value.Phase));
        Assert.Equal(70, events[1].WindowPosition.X, 6);
        Close(window);
    }

    [Fact]
    public void TrackpadScaleReportsRotationUnavailableWithoutContactSamples()
    {
        var events = new List<TransformGestureEvent>();
        var surface = new Container
        {
            Width = 200,
            Height = 200,
            Gestures = new GestureRecognizer[] { new TransformGesture(events.Add) }
        };
        var window = Mount(surface);
        Pinch(window, "PinchBegin", 1);
        Pinch(window, "PinchUpdate", 2);
        Pinch(window, "PinchEnd", 1);
        Assert.Equal(new[] { GesturePhase.Started, GesturePhase.Changed, GesturePhase.Completed }, events.Select(value => value.Phase));
        Assert.Equal(GestureSource.Trackpad, events[1].Source);
        Assert.Equal(2, events[1].Scale, 6);
        Assert.Equal(GestureRotationStatus.Unsupported, events[1].Rotation.Status);
        Close(window);
    }

    [Fact]
    public void DoubleTapUsesFreshContactIdsAndReplaysOnlyAnUnclaimedSingleClick()
    {
        var taps = 0;
        var clicks = 0;
        var surface = new Container
        {
            Width = 200,
            Height = 200,
            Gestures = new GestureRecognizer[] { new DoubleTapGesture(_ => taps++) },
            OnClick = () => clicks++
        };
        var window = Mount(surface);
        Down(window, 10, 30, 50);
        Up(window, 10, 30, 50);
        Assert.Equal(0, clicks);
        Down(window, 11, 30, 50);
        Up(window, 11, 30, 50);
        Assert.Equal(1, taps);
        Assert.Equal(0, clicks);
        Down(window, 12, 30, 50);
        Up(window, 12, 30, 50);
        AdvanceDeadline(window);
        Assert.Equal(1, taps);
        Assert.Equal(1, clicks);
        Close(window);
    }

    private static void AdvanceDeadline(Window window)
    {
        var flags = BindingFlags.Instance | BindingFlags.NonPublic;
        var input = typeof(Window).GetField("input", flags)!.GetValue(window)!;
        var root = typeof(Window).GetField("node", flags)!.GetValue(window);
        var resolver = typeof(Window).GetField("resolver", flags)!.GetValue(window);
        var step = input.GetType().GetMethods(flags).Single(method => method.Name == "Step" && method.GetParameters().Length == 4);
        step.Invoke(input, new[] { root, resolver, 1d, Stopwatch.GetTimestamp() + Stopwatch.Frequency });
    }

    private static void Pinch(Window window, string kind, float scale)
    {
        var flags = BindingFlags.Instance | BindingFlags.NonPublic;
        var input = typeof(Window).GetField("input", flags)!.GetValue(window)!;
        var pointer = input.GetType().GetField("pointer", flags)!.GetValue(input)!;
        var eventType = typeof(Window).Assembly.GetType("Goo.QueuedPointerEvent")!;
        var sample = Activator.CreateInstance(eventType)!;
        eventType.GetField("Kind", flags)!.SetValue(sample,
            Enum.Parse(typeof(Window).Assembly.GetType("Goo.PointerEventKind")!, kind));
        eventType.GetField("X", flags)!.SetValue(sample, 50f);
        eventType.GetField("Y", flags)!.SetValue(sample, 50f);
        eventType.GetField("PinchScale", flags)!.SetValue(sample, scale);
        var root = typeof(Window).GetField("node", flags)!.GetValue(window);
        var resolver = typeof(Window).GetField("resolver", flags)!.GetValue(window);
        var text = input.GetType().GetField("text", flags)!.GetValue(input);
        pointer.GetType().GetMethod("Dispatch", flags)!.Invoke(pointer, new[] { sample, root, resolver, 10d, text });
    }

    private static Window Mount(Blob content)
    {
        var window = new Window { Root = new SurfaceCell(content), Width = 200, Height = 200 };
        typeof(Window).GetMethod("UpdateTree", BindingFlags.Instance | BindingFlags.NonPublic,
            Type.EmptyTypes)!.Invoke(window, null);
        return window;
    }

    private static void Close(Window window) =>
        typeof(Window).GetMethod("Close", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(window, null);

    private static void Down(Window window, long id, float x, float y) =>
        window.PlatformInput.PointerPress(id, PointerDevice.Touch, x, y, PointerButton.Primary, default, 1);

    private static void Move(Window window, long id, float x, float y) =>
        window.PlatformInput.PointerMove(id, PointerDevice.Touch, x, y, default, 1);

    private static void Up(Window window, long id, float x, float y) =>
        window.PlatformInput.PointerRelease(id, PointerDevice.Touch, x, y, PointerButton.Primary, default, 0);

    private sealed class SurfaceCell(Blob content) : Cell
    {
        public override Blob Build() => content;
    }
}
