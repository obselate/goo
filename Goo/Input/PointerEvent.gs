package Goo

internal class PointerDispatchControl {
  internal var Active bool
  internal var Generation int64
  internal var PropagationStopped bool
  internal var DefaultPrevented bool
  internal var CurrentTarget Node?
  internal var CaptureOwner Node?
  internal var CaptureTarget Node?
  internal var ReleaseTarget Node?

  internal func Begin(generation int64, captureOwner Node?) {
    Generation = generation
    PropagationStopped = false
    DefaultPrevented = false
    CurrentTarget = nil
    CaptureOwner = captureOwner
    CaptureTarget = nil
    ReleaseTarget = nil
    Active = true
  }

  internal func Finish(generation int64) {
    if Active && Generation == generation {
      Active = false
      CurrentTarget = nil
      CaptureOwner = nil
      CaptureTarget = nil
      ReleaseTarget = nil
    }
  }

  internal func Stop(generation int64) {
    if Active && Generation == generation { PropagationStopped = true }
  }

  internal func Prevent(generation int64) {
    if Active && Generation == generation { DefaultPrevented = true }
  }

  internal func SetCurrentTarget(generation int64, target Node) {
    if Active && Generation == generation { CurrentTarget = target }
  }

  internal func ClearCurrentTarget(generation int64) {
    if Active && Generation == generation { CurrentTarget = nil }
  }

  internal func Capture(generation int64) {
    if Active && Generation == generation {
      if let target = CurrentTarget { CaptureTarget = target }
    }
  }

  internal func ReleaseCapture(generation int64) {
    if Active && Generation == generation {
      if let owner = CaptureOwner {
        if let target = CurrentTarget {
          if owner == target { ReleaseTarget = target }
        }
      }
    }
  }
}

/// Describes a pointer input callback.
public struct PointerEvent {
  /// Gets the stable identifier for this pointer while it is connected.
  public prop PointerId int64{
    get {
      return if let identity = Identity { identity.Id } else { 0 }
    }
  }
  /// Gets the pointer device type that produced this event.
  public prop Device PointerDevice{
    get {
      return if let identity = Identity { identity.Device } else { PointerDevice.Mouse }
    }
  }
  /// Reports whether this contact is primary for its active device-type sequence.
  public prop IsPrimary bool{ get; init; }
  /// Gets normalized pressure in the inclusive range from 0 to 1.
  public prop Pressure float64{ get; init; }
  /// Gets the pointer position in the current handler coordinates.
  public prop Position Point{ get; init; }
  /// Gets the pointer position in logical window coordinates.
  public prop WindowPosition Point{ get; init; }
  /// Gets movement since the preceding pointer position in the current handler coordinates.
  public prop Delta Point{ get; init; }
  /// Gets the pointer button that changed, or None for movement.
  public prop Button PointerButton{ get; init; }
  /// Gets the normalized press count (1 to 3) on down and matching up; zero on other events.
  /// Counts use the same target, button, 400 ms, and 4 logical pixel policy as text selection.
  public prop ClickCount int32{ get; init; }
  /// True when a clickable or focusable descendant is below this handler on the routed path.
  /// Applies to down, move, up, and cancel; hover notifications are not routed.
  public prop IsFromInteractiveChild bool{ get; init; }
  /// Gets the pointer buttons held after the event transition.
  public prop Buttons PointerButtons{ get; init; }
  /// Gets the modifier keys held for the event.
  public prop Modifiers KeyModifiers{ get; init; }
  internal prop Control PointerDispatchControl? { get; init; }
  internal prop Generation int64{ get; init; }
  internal prop Identity PointerContact? { get; init; }

  /// Stops further callback propagation for this event.
  public func StopPropagation() {
    if let control = Control { control.Stop(Generation) }
  }

  /// Prevents the default behavior for this event.
  public func PreventDefault() {
    if let control = Control { control.Prevent(Generation) }
  }

  /// Requests pointer capture for the current callback target.
  public func Capture() {
    if let control = Control { control.Capture(Generation) }
  }

  /// Releases pointer capture held by the current callback target.
  public func ReleaseCapture() {
    if let control = Control { control.ReleaseCapture(Generation) }
  }
}
