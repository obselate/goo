package Goo.Gestures

import Goo
import System

/// Restricts pan recognition to both axes or one axis.
public enum PanAxis {
    /// Recognizes movement in either direction.
    Both;
    /// Rejects predominantly vertical movement before activation.
    Horizontal;
    /// Rejects predominantly horizontal movement before activation.
    Vertical
}

/// Reports Phase, owner-local Position, WindowPosition, cumulative Translation,
/// per-update Delta and cancellation Reason for a pan.
public data struct PanGestureEvent(Phase GesturePhase, Position Point, WindowPosition Point,
    Translation Point, Delta Point, Reason GestureCancelReason) { }

/// Reports whether rotation data is available from this gesture source.
public enum GestureRotationStatus {
    /// Real contact positions provide rotation.
    Available;
    /// The platform supplies scale without rotation.
    Unsupported
}

/// Reports rotation Status and clockwise Radians. Read Radians only when Status is Available.
public data struct GestureRotationResult(Status GestureRotationStatus, Radians float64) { }

/// Reports Phase, Source, owner-local Center, WindowCenter, cumulative Translation,
/// cumulative Scale, typed Rotation and cancellation Reason.
public data struct TransformGestureEvent(Phase GesturePhase, Source GestureSource, Center Point, WindowCenter Point,
    Translation Point, Scale float64, Rotation GestureRotationResult, Reason GestureCancelReason) { }

/// Reports Phase, owner-local Position, WindowPosition and cancellation Reason for a held press.
public data struct PressGestureEvent(Phase GesturePhase, Position Point,
    WindowPosition Point, Reason GestureCancelReason) { }

/// Reports a recognized double tap's owner-local Position and WindowPosition.
public data struct TapGestureEvent(Position Point, WindowPosition Point) { }

/// Recognizes direct touch movement without adding scrolling or inertia policy.
public sealed class PanGesture : GestureRecognizer {
    internal let Changed Action[PanGestureEvent]
    internal let Axis PanAxis

    /// Creates a pan recognizer with an eight-logical-window-unit activation distance.
    public init(changed Action[PanGestureEvent], axis PanAxis = PanAxis.Both) {
        if changed == nil { throw ArgumentNullException("changed") }
        if !Enum.IsDefined(axis) { throw ArgumentOutOfRangeException("axis") }
        Changed = changed
        Axis = axis
    }

    /// Creates isolated state for one routed interaction.
    public override func CreateSession() GestureSession -> PanSession(this)
}

/// Recognizes centroid pan, two-contact pinch and rotation as one exclusive interaction.
public sealed class TransformGesture : GestureRecognizer {
    internal let Changed Action[TransformGestureEvent]

    /// Creates a recognizer which accepts one-contact pan or two separated contacts.
    public init(changed Action[TransformGestureEvent]) {
        if changed == nil { throw ArgumentNullException("changed") }
        Changed = changed
    }

    /// Creates isolated state for one routed interaction.
    public override func CreateSession() GestureSession -> TransformSession(this)
}

/// Recognizes a stationary direct-touch hold, then retains ownership until release or cancellation.
public sealed class LongPressGesture : GestureRecognizer {
    internal let Changed Action[PressGestureEvent]
    internal let Duration float64

    /// Creates a hold recognizer with eight logical units of movement slop.
    /// Duration must be finite and positive, in milliseconds.
    public init(changed Action[PressGestureEvent], durationMilliseconds float64 = 500.0) {
        if changed == nil { throw ArgumentNullException("changed") }
        if !Double.IsFinite(durationMilliseconds) || durationMilliseconds <= 0.0 {
            throw ArgumentOutOfRangeException("durationMilliseconds")
        }
        Changed = changed
        Duration = durationMilliseconds / 1000.0
    }

    /// Creates isolated state for one routed interaction.
    public override func CreateSession() GestureSession -> LongPressSession(this)
}

/// Recognizes two completed direct-touch taps within 400 milliseconds and four logical units.
/// Core defers the first ordinary click only where this recognizer is installed.
public sealed class DoubleTapGesture : GestureRecognizer {
    internal let Recognized Action[TapGestureEvent]

    /// Creates a double-tap recognizer with the shared click-count bounds.
    public init(recognized Action[TapGestureEvent]) {
        if recognized == nil { throw ArgumentNullException("recognized") }
        Recognized = recognized
    }

    /// Creates isolated state for one routed interaction.
    public override func CreateSession() GestureSession -> DoubleTapSession(this)
}

internal class PanSession : GestureSession {
    private let owner PanGesture
    private var pointer GesturePointer
    private var origin Point
    private var windowOrigin Point
    private var previous Point
    private var translation Point
    private var delta Point
    private var active bool

    internal init(owner PanGesture) { this.owner = owner }

    public override func Evaluate(input GestureInput) GestureDecision {
        if input.PointerCount != 1 { return GestureDecision.Reject }
        pointer = input.PointerAt(0)
        if input.Kind == GestureInputKind.Down {
            origin = pointer.Position
            windowOrigin = pointer.WindowPosition
            previous = pointer.Position
        }
        if input.Kind != GestureInputKind.Move && input.Kind != GestureInputKind.Up { return GestureDecision.Pending }
        translation = Point{X: pointer.Position.X - origin.X, Y: pointer.Position.Y - origin.Y}
        delta = Point{X: pointer.Position.X - previous.X, Y: pointer.Position.Y - previous.Y}
        previous = pointer.Position
        if input.Kind == GestureInputKind.Up { return active ? GestureDecision.Complete : GestureDecision.Reject }
        if active { return GestureDecision.Accept }
        let dx = Math.Abs(pointer.WindowPosition.X - windowOrigin.X)
        let dy = Math.Abs(pointer.WindowPosition.Y - windowOrigin.Y)
        if owner.Axis == PanAxis.Horizontal {
            if dy >= 8.0 && dy > dx { return GestureDecision.Reject }
            return dx >= 8.0 ? GestureDecision.Accept : GestureDecision.Pending
        }
        if owner.Axis == PanAxis.Vertical {
            if dx >= 8.0 && dx > dy { return GestureDecision.Reject }
            return dy >= 8.0 ? GestureDecision.Accept : GestureDecision.Pending
        }
        return dx * dx + dy * dy >= 64.0 ? GestureDecision.Accept : GestureDecision.Pending
    }

    public override func NextDeadlineSeconds() float64 -> Double.PositiveInfinity

    public override func Notify(phase GesturePhase, reason GestureCancelReason) {
        if phase == GesturePhase.Started { active = true }
        if !active { return }
        owner.Changed(PanGestureEvent{Phase: phase, Position: pointer.Position,
            WindowPosition: pointer.WindowPosition, Translation: translation, Delta: delta, Reason: reason})
    }
}

internal class TransformSession : GestureSession {
    private let owner TransformGesture
    private var center Point
    private var windowCenter Point
    private var origin Point
    private var windowOrigin Point
    private var translation Point
    private var distance float64
    private var angle float64
    private var rotation float64
    private var scale float64 = 1.0
    private var paired bool
    private var active bool
    private var source GestureSource

    internal init(owner TransformGesture) { this.owner = owner }

    public override func Evaluate(input GestureInput) GestureDecision {
        source = input.Source
        if source == GestureSource.Trackpad {
            center = input.Anchor
            windowCenter = input.WindowAnchor
            scale = input.Scale
            return input.Kind == GestureInputKind.Up
                ? active ? GestureDecision.Complete : GestureDecision.Reject : GestureDecision.Accept
        }
        if input.PointerCount == 0 { return GestureDecision.Reject }
        let first = input.PointerAt(0)
        if paired && input.PointerCount < 2 { return GestureDecision.Complete }
        let two = input.PointerCount >= 2
        let second = two ? input.PointerAt(1) : first
        center = Point{X: (first.Position.X + second.Position.X) * 0.5,
            Y: (first.Position.Y + second.Position.Y) * 0.5}
        windowCenter = Point{X: (first.WindowPosition.X + second.WindowPosition.X) * 0.5,
            Y: (first.WindowPosition.Y + second.WindowPosition.Y) * 0.5}
        if input.Kind == GestureInputKind.Down && !active && input.PointerCount == 1 {
            origin = center
            windowOrigin = windowCenter
        }
        if two {
            let dx = second.WindowPosition.X - first.WindowPosition.X
            let dy = second.WindowPosition.Y - first.WindowPosition.Y
            let currentDistance = Math.Sqrt(dx * dx + dy * dy)
            let currentAngle = Math.Atan2(dy, dx)
            if currentDistance <= 0.000001 {
                translation = Point{X: center.X - origin.X, Y: center.Y - origin.Y}
                if input.Kind == GestureInputKind.Up && (!first.IsDown || !second.IsDown) {
                    return active ? GestureDecision.Complete : GestureDecision.Reject
                }
                return active ? GestureDecision.Accept : GestureDecision.Pending
            }
            if !paired {
                paired = true
                distance = currentDistance
                angle = currentAngle
                origin = Point{X: center.X - translation.X, Y: center.Y - translation.Y}
            }
            scale = currentDistance / distance
            var change = currentAngle - angle
            if change > Math.PI { change -= 2.0 * Math.PI }
            if change < -Math.PI { change += 2.0 * Math.PI }
            rotation += change
            angle = currentAngle
        }
        translation = Point{X: center.X - origin.X, Y: center.Y - origin.Y}
        if input.Kind == GestureInputKind.Up {
            if !first.IsDown || (paired && !input.PointerAt(1).IsDown) {
                return active ? GestureDecision.Complete : GestureDecision.Reject
            }
            return GestureDecision.Pending
        }
        if active || paired { return GestureDecision.Accept }
        let dx = windowCenter.X - windowOrigin.X
        let dy = windowCenter.Y - windowOrigin.Y
        return dx * dx + dy * dy >= 64.0 ? GestureDecision.Accept : GestureDecision.Pending
    }

    public override func NextDeadlineSeconds() float64 -> Double.PositiveInfinity

    public override func Notify(phase GesturePhase, reason GestureCancelReason) {
        if phase == GesturePhase.Started { active = true }
        if !active { return }
        owner.Changed(TransformGestureEvent{Phase: phase, Source: source, Center: center, WindowCenter: windowCenter,
            Translation: translation, Scale: scale, Rotation: GestureRotationResult{
                Status: source == GestureSource.Trackpad ? GestureRotationStatus.Unsupported : GestureRotationStatus.Available,
                Radians: source == GestureSource.Trackpad ? 0.0 : rotation,
            }, Reason: reason})
    }
}

internal class LongPressSession : GestureSession {
    private let owner LongPressGesture
    private var pointer GesturePointer
    private var origin Point
    private var deadline float64 = Double.PositiveInfinity
    private var active bool

    internal init(owner LongPressGesture) { this.owner = owner }

    public override func Evaluate(input GestureInput) GestureDecision {
        if input.PointerCount != 1 { return GestureDecision.Reject }
        pointer = input.PointerAt(0)
        if input.Kind == GestureInputKind.Up { return active ? GestureDecision.Complete : GestureDecision.Reject }
        if active { return GestureDecision.Accept }
        if input.Kind == GestureInputKind.Down {
            origin = pointer.WindowPosition
            deadline = input.TimeSeconds + owner.Duration
        }
        let dx = pointer.WindowPosition.X - origin.X
        let dy = pointer.WindowPosition.Y - origin.Y
        if dx * dx + dy * dy >= 64.0 { return GestureDecision.Reject }
        if input.Kind == GestureInputKind.Deadline && input.TimeSeconds >= deadline {
            deadline = Double.PositiveInfinity
            return GestureDecision.Accept
        }
        return GestureDecision.Pending
    }

    public override func NextDeadlineSeconds() float64 -> deadline

    public override func Notify(phase GesturePhase, reason GestureCancelReason) {
        if phase == GesturePhase.Started { active = true }
        if phase == GesturePhase.Canceled || phase == GesturePhase.Completed { deadline = Double.PositiveInfinity }
        if !active { return }
        owner.Changed(PressGestureEvent{Phase: phase, Position: pointer.Position,
            WindowPosition: pointer.WindowPosition, Reason: reason})
    }
}

internal class DoubleTapSession : GestureSession {
    private const IntervalSeconds float64 = 0.4
    private const Distance float64 = 4.0
    private let owner DoubleTapGesture
    private var pointer GesturePointer
    private var origin Point
    private var deadline float64 = Double.PositiveInfinity
    private var taps int32
    private var second bool

    internal init(owner DoubleTapGesture) { this.owner = owner }

    public override func Evaluate(input GestureInput) GestureDecision {
        if input.Kind == GestureInputKind.Deadline || input.PointerCount != 1 { return GestureDecision.Reject }
        pointer = input.PointerAt(0)
        if input.Kind == GestureInputKind.Down {
            if taps == 0 {
                origin = pointer.WindowPosition
                deadline = input.TimeSeconds + IntervalSeconds
            } else {
                second = true
            }
        }
        if input.TimeSeconds >= deadline || Math.Abs(pointer.WindowPosition.X - origin.X) >= Distance
            || Math.Abs(pointer.WindowPosition.Y - origin.Y) >= Distance { return GestureDecision.Reject }
        if input.Kind == GestureInputKind.Up {
            if second { return GestureDecision.Recognize }
            taps = 1
        }
        return GestureDecision.Pending
    }

    public override func NextDeadlineSeconds() float64 -> deadline

    public override func Notify(phase GesturePhase, reason GestureCancelReason) {
        if phase == GesturePhase.Completed { owner.Recognized(TapGestureEvent{
            Position: pointer.Position, WindowPosition: pointer.WindowPosition,
        }) }
        if phase == GesturePhase.Canceled || phase == GesturePhase.Completed { deadline = Double.PositiveInfinity }
    }
}
