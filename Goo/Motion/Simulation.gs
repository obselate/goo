package Goo

/// Evaluates a closed-form motion at an elapsed time. No numeric integration:
/// every override is a pure function of elapsed seconds, so evaluation is
/// idempotent and safe to repeat within a frame.
public open class Simulation {
  /// Gets the scalar coordinate at the specified elapsed time.
  /// @param elapsed seconds since the simulation began
  /// @returns the coordinate value at elapsed
  public open func Position(elapsed float64) float64;

  /// Gets the rate of change of progress at the specified elapsed time.
  /// @param elapsed seconds since the simulation began
  /// @returns the velocity at elapsed
  public open func Velocity(elapsed float64) float64;

  /// Gets whether the simulation has settled at the specified elapsed time.
  /// @param elapsed seconds since the simulation began
  /// @returns true once the simulation has reached its target
  public open func Done(elapsed float64) bool;
}

// Core's one stock sim: a linear ramp from `from` to `to` over `duration`
// seconds. Precedent: Resolver's TransitionMs is already exactly this.
internal class LinearTimed : Simulation {
  internal var duration float64
  internal var from float64
  internal var to float64
  internal var easing Easing

  internal init(duration float64, from float64, to float64, easing Easing = Easing.Linear) {
    this.duration = duration
    this.from = from
    this.to = to
    this.easing = easing
  }

  public override func Position(elapsed float64) float64 {
    if elapsed < 0.0 {
      return from
    }
    if duration <= 0.0 {
      return to
    }
    if elapsed == 0.0 {
      return from
    }
    if Done(elapsed) {
      return to
    }
    let t = elapsed / duration
    return from + (to - from) * ease(easing, t)
  }

  public override func Velocity(elapsed float64) float64 {
    if duration <= 0.0 || elapsed < 0.0 || elapsed >= duration {
      return 0.0
    }
    return (to - from) * tweenSlope(easing, elapsed / duration) / duration
  }

  public override func Done(elapsed float64) bool -> elapsed >= duration
}

private func tweenSlope(easing Easing, t float64) float64 {
  if easing == Easing.EaseIn {
    return 2.0 * t
  }
  if easing == Easing.EaseOut {
    return 2.0 * (1.0 - t)
  }
  return if easing == Easing.EaseInOut { t < 0.5 ? 4.0 * t : 4.0 * (1.0 - t) } else { 1.0 }
}
