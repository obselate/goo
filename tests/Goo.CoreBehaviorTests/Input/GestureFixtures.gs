package Goo

import Hexa.NET.SDL3
import System
import System.Collections.Generic
import System.Runtime.InteropServices

internal class GestureFixtures {
    func RoutedWinnerSuppressesClickScrollAndLosingRecognizer() bool {
        let resolver = Resolver{}
        let focus = FocusManager()
        let pointer = PointerInput(focus, InputEventQueue())
        let text = TextInput(focus)
        let first = GestureProbe()
        let second = GestureProbe()
        var clicks = 0
        var canceled = 0
        let root = Reconciler{Res: resolver}.Mount(Container{
            Width: 200, Height: 100, OverflowY: Overflow.Scroll,
            Container{
                Width: 200, Height: 400, Gestures: []GestureRecognizer{first, second},
                OnClick: () -> { clicks++ }, OnPointerCancel: (e PointerEvent) -> { canceled++ },
            },
        })
        Layout().Calculate(root, 200.0F, 100.0F)
        Send(pointer, text, resolver, root, PointerEventKind.Press, 1, 20.0F, 20.0F, 10.0)
        Send(pointer, text, resolver, root, PointerEventKind.Move, 1, 20.0F, 40.0F, 10.1)
        Send(pointer, text, resolver, root, PointerEventKind.Move, 1, 20.0F, 50.0F, 10.2)
        Send(pointer, text, resolver, root, PointerEventKind.Release, 1, 20.0F, 50.0F, 10.3)
        return clicks == 0 && canceled == 1 && root.ScrollY == 0.0F
            && first.Phases.Count == 3 && first.Phases[0] == GesturePhase.Started
            && first.Phases[1] == GesturePhase.Changed && first.Phases[2] == GesturePhase.Completed
            && second.Phases.Count == 1 && second.Phases[0] == GesturePhase.Canceled
    }

    func DeadlineAndExplicitCancelHaveOneTerminalNotification() bool {
        let resolver = Resolver{}
        let focus = FocusManager()
        let pointer = PointerInput(focus, InputEventQueue())
        let text = TextInput(focus)
        let probe = GestureProbe{Timed: true}
        var clicks = 0
        let root = Reconciler{Res: resolver}.Mount(Container{
            Width: 200, Height: 100, Gestures: []GestureRecognizer{probe}, OnClick: () -> { clicks++ },
        })
        Layout().Calculate(root, 200.0F, 100.0F)
        Send(pointer, text, resolver, root, PointerEventKind.Press, 1, 20.0F, 20.0F, 10.0)
        if pointer.GestureDeadlineSeconds() != 10.5 { return false }
        if pointer.StepGestures(root, resolver, 10.4) || probe.Phases.Count != 0 { return false }
        if !pointer.StepGestures(root, resolver, 10.5) { return false }
        if !pointer.CancelGestures(root, root) || pointer.CancelGestures(root, root) { return false }
        Send(pointer, text, resolver, root, PointerEventKind.Release, 1, 20.0F, 20.0F, 10.6)
        return clicks == 0 && probe.Phases.Count == 2 && probe.Phases[0] == GesturePhase.Started
            && probe.Phases[1] == GesturePhase.Canceled
            && Double.IsPositiveInfinity(pointer.GestureDeadlineSeconds())
    }

    func CaptureAndNativeCancelDoNotLeakRecognition() bool {
        let resolver = Resolver{}
        let focus = FocusManager()
        let pointer = PointerInput(focus, InputEventQueue())
        let text = TextInput(focus)
        let captured = GestureProbe()
        let root = Reconciler{Res: resolver}.Mount(Container{
            Width: 200, Height: 100, Gestures: []GestureRecognizer{captured},
            OnPointerDown: (e PointerEvent) -> { e.Capture() },
        })
        Layout().Calculate(root, 200.0F, 100.0F)
        Send(pointer, text, resolver, root, PointerEventKind.Press, 1, 20.0F, 20.0F, 10.0)
        Send(pointer, text, resolver, root, PointerEventKind.Move, 1, 20.0F, 40.0F, 10.1)
        Send(pointer, text, resolver, root, PointerEventKind.Cancel, 1, 20.0F, 40.0F, 10.2)
        return captured.Phases.Count == 0 && Double.IsPositiveInfinity(pointer.GestureDeadlineSeconds())
    }

    func SelectionMutationPreservesBothEndpointAffinities() bool {
        let resolver = Resolver{}
        let input = InputCoordinator()
        let root = Reconciler{Res: resolver}.Mount(TextEntry{Width: 200, Height: 40, Value: "hello"})
        Layout().Calculate(root, 200.0F, 40.0F)
        if !input.FocusElement(resolver, root) { return false }
        let selection = TextSelection{
            Anchor: TextPosition{Offset: 4, Affinity: TextAffinity.Downstream},
            Active: TextPosition{Offset: 1, Affinity: TextAffinity.Upstream},
        }
        if !input.SetEditorSelection(root, selection) { return false }
        guard let actual = input.EditorSelection() else { return false }
        return actual.Anchor.Offset == 4 && actual.Active.Offset == 1
            && actual.Anchor.Affinity == TextAffinity.Downstream && actual.Active.Affinity == TextAffinity.Upstream
    }

    func CallbackFailureSuppressesReleaseAndKeepsOriginalError() bool {
        let resolver = Resolver{}
        let focus = FocusManager()
        let pointer = PointerInput(focus, InputEventQueue())
        let text = TextInput(focus)
        let failure = InvalidOperationException("gesture callback")
        let probe = GestureProbe{Started: () -> { throw failure }}
        var clicks = 0
        let root = Reconciler{Res: resolver}.Mount(Container{
            Width: 200, Height: 100, Gestures: []GestureRecognizer{probe}, OnClick: () -> { clicks++ },
        })
        Layout().Calculate(root, 200.0F, 100.0F)
        Send(pointer, text, resolver, root, PointerEventKind.Press, 1, 20.0F, 20.0F, 10.0)
        var caught = false
        try { Send(pointer, text, resolver, root, PointerEventKind.Move, 1, 20.0F, 40.0F, 10.1) }
        catch (error InvalidOperationException) { caught = Object.ReferenceEquals(error, failure) }
        Send(pointer, text, resolver, root, PointerEventKind.Release, 1, 20.0F, 40.0F, 10.2)
        return caught && clicks == 0 && probe.Phases.Count == 2
            && probe.Phases[0] == GesturePhase.Started && probe.Phases[1] == GesturePhase.Canceled
    }

    func TrackpadScaleKeepsContactSamplesEmpty() bool {
        let begin = NativePinch(SdlPinchEventNative.BeginType, 7u, 1.0F)
        let update = NativePinch(SdlPinchEventNative.UpdateType, 0u, 2.0F)
        let end = NativePinch(SdlPinchEventNative.EndType, 0u, 1.0F)
        if Marshal.SizeOf[SdlPinchEventNative]() != 24 || SdlPinchEventNative.Read(update).Scale != 2.0F
            || SdlPinchEventNative.WindowIdFor(begin) != 7u || SdlPinchEventNative.WindowIdFor(update) != 7u
            || SdlPinchEventNative.WindowIdFor(end) != 7u || SdlPinchEventNative.WindowIdFor(update) != 0u {
            return false
        }
        let resolver = Resolver{}
        let focus = FocusManager()
        let pointer = PointerInput(focus, InputEventQueue())
        let text = TextInput(focus)
        let probe = GestureProbe()
        let root = Reconciler{Res: resolver}.Mount(Container{
            Width: 200, Height: 100, Gestures: []GestureRecognizer{probe},
        })
        Layout().Calculate(root, 200.0F, 100.0F)
        Send(pointer, text, resolver, root, PointerEventKind.PinchBegin, 0, 20.0F, 20.0F, 10.0)
        Send(pointer, text, resolver, root, PointerEventKind.PinchUpdate, 0, 20.0F, 20.0F, 10.1, 2.0F)
        Send(pointer, text, resolver, root, PointerEventKind.PinchEnd, 0, 20.0F, 20.0F, 10.2)
        return probe.Phases.Count == 3 && probe.Phases[0] == GesturePhase.Started
            && probe.Phases[1] == GesturePhase.Changed && probe.Phases[2] == GesturePhase.Completed
            && probe.Source == GestureSource.Trackpad && probe.Samples == 0 && probe.Scale == 2.0
    }

    func ContactFrameUsesOneCoherentSampleSetAndStopsAfterReset() bool {
        let resolver = Resolver{}
        let input = InputCoordinator()
        let observed = List[Point]()
        let probe = GestureProbe{Evaluate: (sample GestureInput) -> {
            if sample.Kind == GestureInputKind.Move {
                observed.Add(Point{X: sample.PointerAt(0).WindowPosition.X,
                    Y: sample.PointerAt(1).WindowPosition.X})
            }
        }}
        var clicks = 0
        var reset = false
        let root = Reconciler{Res: resolver}.Mount(Container{
            Width: 200, Height: 100, Gestures: []GestureRecognizer{probe},
            OnClick: () -> { clicks++ },
        })
        Layout().Calculate(root, 200.0F, 100.0F)
        input.QueuePointerPress(1, PointerDevice.Touch, 20.0F, 20.0F, PointerButton.Primary, KeyModifiers{})
        input.QueuePointerPress(2, PointerDevice.Touch, 40.0F, 20.0F, PointerButton.Primary, KeyModifiers{})
        input.Drain(root, resolver, 10.0, nil)
        let frame = []QueuedPointerEvent{
            QueuedPointerEvent{PointerId: 1, Device: PointerDevice.Touch, X: 80.0F, Y: 40.0F},
            QueuedPointerEvent{PointerId: 2, Device: PointerDevice.Touch, X: 120.0F, Y: 40.0F},
        }
        input.QueuePointerFrame(frame, 2.0F)
        input.Drain(root, resolver, 10.1, nil)
        if observed.Count != 1 || observed[0].X != 40.0 || observed[0].Y != 60.0 { return false }
        probe.Changed = () -> {
            reset = true
            input.Reset(root, resolver)
        }
        input.QueuePointerFrame(frame, 2.0F)
        input.Drain(root, resolver, 10.2, nil)
        input.QueuePointerRelease(1, PointerDevice.Touch, 40.0F, 20.0F, PointerButton.Primary, KeyModifiers{})
        input.QueuePointerRelease(2, PointerDevice.Touch, 60.0F, 20.0F, PointerButton.Primary, KeyModifiers{})
        input.Drain(root, resolver, 10.3, nil)
        return reset && clicks == 0 && observed.Count == 2 && probe.Phases.Count == 3
            && probe.Phases[2] == GesturePhase.Canceled
    }

    private func NativePinch(kind uint32, windowId uint32, scale float32) SDLEvent {
        var value = SDLEvent{}
        let pinch = SdlPinchEventNative{Type: kind, WindowId: windowId, Scale: scale}
        MemoryMarshal.Write[SdlPinchEventNative](MemoryMarshal.AsBytes[SDLEvent](
            MemoryMarshal.CreateSpan[SDLEvent](ref value, 1)), in pinch)
        return value
    }

    private func Send(pointer PointerInput, text TextInput, resolver Resolver, root Node,
        kind PointerEventKind, id int64, x float32, y float32, time float64, scale float32 = 1.0F) {
        pointer.Dispatch(QueuedPointerEvent{
            Kind: kind, PointerId: id, Device: PointerDevice.Touch, X: x, Y: y,
            Button: PointerButton.Primary, ReceivedTime: time, PinchScale: scale,
        }, root, resolver, time, text)
        resolver.Flush()
    }
}

internal class GestureProbe : GestureRecognizer {
    internal var Timed bool
    internal var Started Action?
    internal var Changed Action?
    internal var Evaluate Action[GestureInput]?
    internal var Source GestureSource
    internal var Samples int32
    internal var Scale float64
    internal let Phases List[GesturePhase] = List[GesturePhase]()

    public override func CreateSession() GestureSession -> GestureProbeSession(this)
}

internal class GestureProbeSession : GestureSession {
    private let probe GestureProbe
    private var deadline float64 = Double.PositiveInfinity
    private var start Point

    internal init(probe GestureProbe) { this.probe = probe }

    public override func Evaluate(input GestureInput) GestureDecision {
        probe.Source = input.Source
        probe.Evaluate?.Invoke(input)
        probe.Samples = input.PointerCount
        probe.Scale = input.Scale
        if input.Source == GestureSource.Trackpad {
            return input.Kind == GestureInputKind.Up ? GestureDecision.Complete : GestureDecision.Accept
        }
        if input.Kind == GestureInputKind.Down {
            start = input.PointerAt(0).WindowPosition
            if probe.Timed { deadline = input.TimeSeconds + 0.5 }
        }
        if input.Kind == GestureInputKind.Up { return GestureDecision.Complete }
        if input.Kind == GestureInputKind.Deadline {
            deadline = Double.PositiveInfinity
            return GestureDecision.Accept
        }
        if probe.Timed { return GestureDecision.Pending }
        let position = input.PointerAt(0).WindowPosition
        return if Math.Abs(position.X - start.X) >= 8.0 || Math.Abs(position.Y - start.Y) >= 8.0 {
            GestureDecision.Accept
        } else { GestureDecision.Pending }
    }

    public override func NextDeadlineSeconds() float64 -> deadline

    public override func Notify(phase GesturePhase, reason GestureCancelReason) {
        probe.Phases.Add(phase)
        if phase == GesturePhase.Canceled || phase == GesturePhase.Completed { deadline = Double.PositiveInfinity }
        if phase == GesturePhase.Started { probe.Started?.Invoke() }
        if phase == GesturePhase.Changed { probe.Changed?.Invoke() }
    }
}
