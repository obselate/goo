package Goo

import System

/// Shares an application action and its current availability across explicit bindings and controls.
/// Rebuild the owning cell when availability changes to update button disabled styling and semantics.
public sealed class Command {
  private let action Action
  private let canExecute Func[bool]?

  /// Creates an application action with an optional availability predicate.
  public init(execute Action, canExecute Func[bool]? = nil) {
    if execute == nil { throw ArgumentNullException("execute") }
    action = execute
    this.canExecute = canExecute
  }

  /// Evaluates whether the action can execute now.
  public prop CanExecute bool{ get -> canExecute?.Invoke() ?? true }

  /// Rechecks availability and invokes the action. Returns false when unavailable.
  public func Execute() bool {
    if !CanExecute { return false }
    action()
    return true
  }
}
