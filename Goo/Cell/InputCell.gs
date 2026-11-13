package Goo

import System
import System.Collections.Generic

/// Defines a stateful Goo component with an immutable input snapshot.
/// @typeparam TInput component input type
public open class Cell[TInput any] : Cell {
  private var input TInput = default (TInput)
  private var hasInput bool
  internal var inputOwner Cell?

  /// Gets the current immutable input snapshot.
  protected prop Input TInput{ get -> input }

  /// Invokes an input-time callback and rebuilds the Cell that supplied this input.
  /// A supplying Cell already in Build needs no extra rebuild.
  /// Call Build-time queries directly. They must not change the supplying Cell's state.
  /// @param callback callback from the current input
  protected func InvokeInputCallback(callback Action?) {
    guard let callback = callback else { return }
    let owner = inputOwner
    try { callback() }
    finally { owner?.RebuildAfterCallback() }
  }

  /// Invokes an input-time callback and rebuilds the Cell that supplied this input.
  /// A supplying Cell already in Build needs no extra rebuild.
  /// Call Build-time queries directly. They must not change the supplying Cell's state.
  /// @typeparam T callback argument type
  /// @param callback callback from the current input
  /// @param value callback argument
  protected func InvokeInputCallback[T any](callback Action[T]?, value T) {
    guard let callback = callback else { return }
    let owner = inputOwner
    try { callback(value) }
    finally { owner?.RebuildAfterCallback() }
  }

  /// Invokes an input-time callback and rebuilds the Cell that supplied this input.
  /// A supplying Cell already in Build needs no extra rebuild.
  /// Call Build-time queries directly. They must not change the supplying Cell's state.
  /// @typeparam T1 first callback argument type
  /// @typeparam T2 second callback argument type
  /// @param callback callback from the current input
  /// @param first first callback argument
  /// @param second second callback argument
  protected func InvokeInputCallback[T1 any, T2 any](callback Action[T1, T2]?, first T1, second T2) {
    guard let callback = callback else { return }
    let owner = inputOwner
    try { callback(first, second) }
    finally { owner?.RebuildAfterCallback() }
  }

  /// Invokes an input-time callback and rebuilds the Cell that supplied this input.
  /// A supplying Cell already in Build needs no extra rebuild.
  /// Call Build-time queries directly. They must not change the supplying Cell's state.
  /// @typeparam T callback argument type
  /// @typeparam TResult callback result type
  /// @param callback callback from the current input
  /// @param value callback argument
  /// @param fallback result when callback is nil
  /// @returns the callback result or fallback
  protected func InvokeInputCallback[T any, TResult any](callback Func[T, TResult]?, value T, fallback TResult) TResult {
    guard let callback = callback else { return fallback }
    let owner = inputOwner
    try { return callback(value) }
    finally { owner?.RebuildAfterCallback() }
  }

  /// Decides whether a later post-mount snapshot needs a rebuild after Input stores next; default uses EqualityComparer[TInput].Default.
  protected open func ShouldRebuild(previous TInput, next TInput) bool ->
  !EqualityComparer[TInput].Default.Equals(previous, next)

  /// Builds the component tree from the current immutable input snapshot.
  /// @param input current input snapshot
  /// @returns the root blob for this component
  protected open func Build(input TInput) Blob -> Build()

  /// Derives local state from the newly stored immutable input before Build.
  /// Runs for the first input and later inputs that differ by EqualityComparer[TInput].Default.
  /// Reads here are not tracked. State writes are allowed and coalesce with this rebuild.
  /// The window is already bound, so Host, Post, After, Every and Lifetime are valid.
  /// @param input the current input snapshot, already stored in Input
  protected open func InputChanged(input TInput) { }

  internal override func BuildOutput() Blob -> Build(input)

  internal func SetInput(value TInput) bool {
    let previous = input
    let hadInput = hasInput
    input = value
    let reader = Cell.StateReader
    Cell.StateReader = nil
    hasInput = true
    try {
      if hadInput && !ShouldRebuild(previous, value) {
        return false
      }
      InputChanged(value)
    } catch (error Exception) {
      MarkDirtyFromInput()
      rethrow
    } finally {
      Cell.StateReader = reader
    }
    MarkDirtyFromInput()
    return true
  }

}
