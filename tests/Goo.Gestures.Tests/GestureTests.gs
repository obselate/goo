import Goo
import Goo.Gestures
import System
import System.Collections.Generic
import System.Diagnostics
import System.Linq
import System.Reflection
import Xunit

class GestureTests {
    @Fact
    func TransformCombinesPinchRotationAndPanAndSuppressesClicks() {
        let events = List[TransformGestureEvent]()
        var clicks = 0
        let surface = Container{
            Width: 200,
            Height: 200,
            Gestures: []GestureRecognizer{TransformGesture(events.Add)},
            OnClick: () -> clicks++
        }
        let window = Mount(surface)
        Down(window, 1, 30.0F, 50.0F)
        Down(window, 2, 70.0F, 50.0F)
        Move(window, 2, 30.0F, 130.0F)
        Up(window, 1, 30.0F, 50.0F)
        Move(window, 2, 50.0F, 150.0F)
        Up(window, 2, 50.0F, 150.0F)
        Assert.Equal(0, clicks)
        Assert.Equal(GesturePhase.Started, events[0].Phase)
        Assert.Equal(GesturePhase.Completed, events[^1].Phase)
        Assert.Equal(3, events.Count)
        Assert.Equal(2.0, events[1].Scale, 6)
        Assert.Equal(Math.PI / float64(2.0), events[1].Rotation.Radians, 6)
        Assert.Equal(GestureRotationStatus.Available, events[1].Rotation.Status)
        Assert.Equal(30.0, events[1].WindowCenter.X, 6)
        Assert.Equal(90.0, events[1].WindowCenter.Y, 6)
        events.Clear()
        Down(window, 3, 30.0F, 50.0F)
        Down(window, 4, 70.0F, 50.0F)
        Move(window, 4, 30.0F, 50.0F)
        Up(window, 4, 30.0F, 50.0F)
        Assert.Equal(GesturePhase.Completed, events[^1].Phase)
        Up(window, 3, 30.0F, 50.0F)
        Assert.Equal(3, events.Count)
        Close(window)
    }

    @Fact
    func PanWinsBeforeAncestorScrollAndNativeCancelEndsOnce() {
        let events = List[PanGestureEvent]()
        let surface = Container{Width: 200, Height: 400, Gestures: []GestureRecognizer{PanGesture(events.Add)}}
        let viewport = Container{Width: 200, Height: 200, OverflowY: Overflow.Scroll}
        viewport.Children.Add(surface)
        let window = Mount(viewport)
        Down(window, 1, 30.0F, 100.0F)
        Move(window, 1, 30.0F, 70.0F)
        window.PlatformInput.PointerCancel(1, PointerDevice.Touch)
        Up(window, 1, 30.0F, 70.0F)
        Assert.Equal(
            []GesturePhase{GesturePhase.Started, GesturePhase.Canceled},
            events.Select((value PanGestureEvent) -> value.Phase)
        )
        Assert.Equal(GestureCancelReason.PointerCanceled, events[^1].Reason)
        Assert.Equal(-30, events[0].Translation.Y, 6)
        Close(window)
    }

    @Fact
    func LongPressUsesCoreDeadlineAndKeepsDraggingUntilRelease() {
        let events = List[PressGestureEvent]()
        let surface = Container{Width: 200, Height: 200, Gestures: []GestureRecognizer{LongPressGesture(events.Add)}}
        let window = Mount(surface)
        Down(window, 1, 30.0F, 50.0F)
        AdvanceDeadline(window)
        Move(window, 1, 70.0F, 90.0F)
        Up(window, 1, 70.0F, 90.0F)
        Assert.Equal(
            []GesturePhase{GesturePhase.Started, GesturePhase.Changed, GesturePhase.Completed},
            events.Select((value PressGestureEvent) -> value.Phase)
        )
        Assert.Equal(70.0, events[1].WindowPosition.X, 6)
        Close(window)
    }

    @Fact
    func TrackpadScaleReportsRotationUnavailableWithoutContactSamples() {
        let events = List[TransformGestureEvent]()
        let surface = Container{Width: 200, Height: 200, Gestures: []GestureRecognizer{TransformGesture(events.Add)}}
        let window = Mount(surface)
        Pinch(window, "PinchBegin", 1.0F)
        Pinch(window, "PinchUpdate", 2.0F)
        Pinch(window, "PinchEnd", 1.0F)
        Assert.Equal(
            []GesturePhase{GesturePhase.Started, GesturePhase.Changed, GesturePhase.Completed},
            events.Select((value TransformGestureEvent) -> value.Phase)
        )
        Assert.Equal(GestureSource.Trackpad, events[1].Source)
        Assert.Equal(2.0, events[1].Scale, 6)
        Assert.Equal(GestureRotationStatus.Unsupported, events[1].Rotation.Status)
        Close(window)
    }

    @Fact
    func DoubleTapUsesFreshContactIdsAndReplaysOnlyAnUnclaimedSingleClick() {
        var taps = 0
        var clicks = 0
        let surface = Container{
            Width: 200,
            Height: 200,
            Gestures: []GestureRecognizer{DoubleTapGesture((_ TapGestureEvent) -> taps++)},
            OnClick: () -> clicks++
        }
        let window = Mount(surface)
        Down(window, 10, 30.0F, 50.0F)
        Up(window, 10, 30.0F, 50.0F)
        Assert.Equal(0, clicks)
        Down(window, 11, 30.0F, 50.0F)
        Up(window, 11, 30.0F, 50.0F)
        Assert.Equal(1, taps)
        Assert.Equal(0, clicks)
        Down(window, 12, 30.0F, 50.0F)
        Up(window, 12, 30.0F, 50.0F)
        AdvanceDeadline(window)
        Assert.Equal(1, taps)
        Assert.Equal(1, clicks)
        Close(window)
    }

    private class SurfaceCell(content Blob) : Cell {
        override func Build() Blob -> content
    }

    shared {
        private func AdvanceDeadline(window Window) {
            let flags = BindingFlags.Instance | BindingFlags.NonPublic
            let input = typeof(Window).GetField("input", flags)!!.GetValue(window)!!
            let root = typeof(Window).GetField("node", flags)!!.GetValue(window)
            let resolver = typeof(Window).GetField("resolver", flags)!!.GetValue(window)
            let step = input
                .GetType()
                .GetMethods(flags)
                .Single((method MethodInfo) -> method.Name == "Step" && method.GetParameters().Length == 4)
            step.Invoke(input, []object? {root, resolver, 1d, Stopwatch.GetTimestamp() + Stopwatch.Frequency})
        }

        private func Pinch(window Window, kind string, scale float32) {
            let flags = BindingFlags.Instance | BindingFlags.NonPublic
            let input = typeof(Window).GetField("input", flags)!!.GetValue(window)!!
            let pointer = input.GetType().GetField("pointer", flags)!!.GetValue(input)!!
            let eventType = typeof(Window).Assembly.GetType("Goo.QueuedPointerEvent")!!
            let sample = Activator.CreateInstance(eventType)!!
            eventType.GetField("Kind", flags)!!.SetValue(
                sample,
                Enum.Parse(typeof(Window).Assembly.GetType("Goo.PointerEventKind")!!, kind)
            )
            eventType.GetField("X", flags)!!.SetValue(sample, 50f)
            eventType.GetField("Y", flags)!!.SetValue(sample, 50f)
            eventType.GetField("PinchScale", flags)!!.SetValue(sample, scale)
            let root = typeof(Window).GetField("node", flags)!!.GetValue(window)
            let resolver = typeof(Window).GetField("resolver", flags)!!.GetValue(window)
            let text = input.GetType().GetField("text", flags)!!.GetValue(input)
            pointer.GetType().GetMethod("Dispatch", flags)!!.Invoke(
                pointer,
                []object? {sample, root, resolver, 10d, text}
            )
        }

        private func Mount(content Blob) Window {
            let window = Window{Root: SurfaceCell(content), Width: 200, Height: 200}
            typeof(Window).GetMethod(
                "UpdateTree",
                BindingFlags.Instance | BindingFlags.NonPublic,
                Type.EmptyTypes
            )!!.Invoke(window, nil)
            return window
        }

        private func Close(window Window) -> typeof(Window).GetMethod(
            "Close",
            BindingFlags.Instance | BindingFlags.NonPublic
        )!!.Invoke(window, nil)

        private func Down(window Window, id int64, x float32, y float32) -> window.PlatformInput.PointerPress(
            id,
            PointerDevice.Touch,
            x,
            y,
            PointerButton.Primary,
            default(KeyModifiers),
            1.0F
        )

        private func Move(window Window, id int64, x float32, y float32) -> window.PlatformInput.PointerMove(
            id,
            PointerDevice.Touch,
            x,
            y,
            default(KeyModifiers),
            1.0F
        )

        private func Up(window Window, id int64, x float32, y float32) -> window.PlatformInput.PointerRelease(
            id,
            PointerDevice.Touch,
            x,
            y,
            PointerButton.Primary,
            default(KeyModifiers),
            0.0F
        )
    }
}
