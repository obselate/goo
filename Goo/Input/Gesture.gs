package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

/// Identifies the input transition evaluated by a gesture session.
public enum GestureInputKind {
    /// A contact was pressed.
    Down;
    /// A contact moved.
    Move;
    /// A contact was released.
    Up;
    /// The session's monotonic deadline was reached.
    Deadline
}

/// Selects the next arbitration operation without invoking application callbacks.
public enum GestureDecision {
    /// Keeps the session eligible without changing ownership.
    Pending;
    /// Claims the interaction or updates its current winner.
    Accept;
    /// Claims and completes a discrete gesture.
    Recognize;
    /// Completes an accepted gesture.
    Complete;
    /// Withdraws this session.
    Reject
}

/// Identifies a gesture callback's lifecycle transition.
public enum GesturePhase {
    /// The session acquired the interaction.
    Started;
    /// The accepted session changed.
    Changed;
    /// The gesture completed normally.
    Completed;
    /// The session was canceled or rejected.
    Canceled
}

/// Explains why a gesture session did not complete normally.
public enum GestureCancelReason {
    /// The transition is not a cancellation.
    None;
    /// Another interaction acquired the contacts.
    LostArbitration;
    /// The platform canceled a contact.
    PointerCanceled;
    /// The window lost input focus.
    FocusLost;
    /// The owner was removed, hidden, disabled or blocked.
    OwnerUnavailable;
    /// The owner's recognizer declarations changed.
    Replaced;
    /// The consumer explicitly canceled the gesture.
    Explicit;
    /// A gesture callback failed.
    CallbackFailed
}

/// Describes one contact with stable PointerId, Device, owner-local Position,
/// logical WindowPosition and IsDown state. Up retains its contact through evaluation.
public data struct GesturePointer(PointerId int64, Device PointerDevice,
    Position Point, WindowPosition Point, IsDown bool) { }

/// Provides callback-lifetime access to an owner's settled contact samples.
/// Do not retain this object beyond GestureSession.Evaluate.
public sealed class GestureInput {
    internal var KindValue GestureInputKind
    internal var TimeValue float64
    internal var ChangedId int64
    internal let Pointers List[GesturePointer] = List[GesturePointer]()

    internal init() { }

    /// Gets the transition being evaluated.
    public prop Kind GestureInputKind { get -> KindValue }

    /// Gets monotonic window time in seconds, shared with session deadlines.
    public prop TimeSeconds float64 { get -> TimeValue }

    /// Gets the changed contact identifier, or -1 for a deadline.
    public prop ChangedPointerId int64 { get -> ChangedId }

    /// Gets the number of samples, including the released contact on Up.
    public prop PointerCount int32 { get -> Pointers.Count }

    /// Gets a contact sample by arrival order. An invalid index is an argument error.
    public func PointerAt(index int32) GesturePointer -> Pointers[index]
}

/// Declares a reusable recognizer whose mutable state belongs to created sessions.
public open class GestureRecognizer {
    /// Creates a distinct session for one mounted owner and interaction.
    public open func CreateSession() GestureSession;
}

/// Evaluates input before core resolves ownership, then receives settled lifecycle notifications.
public open class GestureSession {
    /// Updates private recognition state without invoking application callbacks or changing the tree.
    public open func Evaluate(input GestureInput) GestureDecision;

    /// Gets the next absolute TimeSeconds deadline, or positive infinity when none is required.
    public open func NextDeadlineSeconds() float64;

    /// Delivers a resolved transition. Every session receives exactly one terminal notification.
    /// Pending rejection also uses Canceled, but need not produce a public recognizer callback.
    public open func Notify(phase GesturePhase, reason GestureCancelReason);
}

internal class GestureBinding {
    internal let Values IReadOnlyList[GestureRecognizer]

    internal init(values IReadOnlyList[GestureRecognizer]) {
        let copied = [values.Count]GestureRecognizer
        for i in 0 ... values.Count {
            let value = values[i]
            if value == nil { throw ArgumentException("Gesture recognizers cannot contain nil", "values") }
            copied[i] = value
        }
        Values = Array.AsReadOnly[GestureRecognizer](copied)
    }

    internal func Matches(other GestureBinding?) bool {
        if other == nil || Values.Count != other.Values.Count { return false }
        for i in 0 ... Values.Count {
            if !Object.ReferenceEquals(Values[i], other.Values[i]) { return false }
        }
        return true
    }
}

internal class GestureMetadata {
    shared {
        private let blobs ConditionalWeakTable[Blob, GestureBinding] = ConditionalWeakTable[Blob, GestureBinding]()
        private let nodes ConditionalWeakTable[Node, GestureBinding] = ConditionalWeakTable[Node, GestureBinding]()

        internal func Get(blob Blob) IReadOnlyList[GestureRecognizer]? ->
            if blobs.TryGetValue(blob, out var value) { value.Values } else { nil }

        internal func Get(node Node) GestureBinding? ->
            if nodes.TryGetValue(node, out var value) { value } else { nil }

        internal func Set(blob Blob, values IReadOnlyList[GestureRecognizer]?) {
            blobs.Remove(blob)
            if let values = values {
                if values.Count > 0 { blobs.Add(blob, GestureBinding(values)) }
            }
        }

        internal func Sync(node Node, blob Blob) bool {
            let before = Get(node)
            var after GestureBinding?
            if blobs.TryGetValue(blob, out var value) { after = value }
            if before == nil && after == nil { return false }
            if before?.Matches(after) == true { return false }
            nodes.Remove(node)
            if let after = after { nodes.Add(node, after) }
            return true
        }
    }
}
