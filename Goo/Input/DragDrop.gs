package Goo

import System
import System.Runtime.CompilerServices

/// Selects the effects allowed or accepted by an in-app drag operation.
@Flags
public enum DragEffect {
  None = 0;
  Copy = 1;
  Move = 2;
}

/// Identifies a drop-target lifecycle callback.
public enum DragEventKind { Enter; Move; Leave; Drop }

/// Identifies how an in-app drag operation ended.
public enum DragEndKind { Dropped; Canceled }

/// Holds the consumer-owned value and allowed effects for one in-app drag operation.
public sealed class DragData {
  private let value object
  private let allowedEffects DragEffect
  /// Gets the consumer-owned payload.
  public prop Value object{ get -> value }
  /// Gets the effects that a target may select.
  public prop AllowedEffects DragEffect{ get -> allowedEffects }

  /// Creates drag data for a non-null payload and one or more allowed effects.
  /// @param value consumer-owned payload retained for the drag lifetime
  /// @param allowedEffects effects that a target may select
  public init(value object, allowedEffects DragEffect) {
    if Object.ReferenceEquals(value, nil) { throw ArgumentNullException("value") }
    this.value = value
    this.allowedEffects = requireAllowedDragEffects(allowedEffects)
  }
}

/// Describes the pointer state when a source crosses the drag threshold.
public struct DragStartEvent {
  /// Gets the stable pointer identifier.
  public prop PointerId int64{ get; init; }
  /// Gets the pointer device type.
  public prop Device PointerDevice{ get; init; }
  /// Gets the modifier keys held at the threshold.
  public prop Modifiers KeyModifiers{ get; init; }
  /// Gets the pointer position in source-local coordinates.
  public prop Position Point{ get; init; }
  /// Gets the pointer position in logical window coordinates.
  public prop WindowPosition Point{ get; init; }
}

/// Describes one callback in the lifetime of an accepting drop target.
public struct DragEvent {
  /// Gets the lifecycle phase.
  public prop Kind DragEventKind{ get; init; }
  /// Gets the drag data.
  public prop Data DragData{ get; init; }
  /// Gets the stable pointer identifier.
  public prop PointerId int64{ get; init; }
  /// Gets the pointer device type.
  public prop Device PointerDevice{ get; init; }
  /// Gets the modifier keys held for this callback.
  public prop Modifiers KeyModifiers{ get; init; }
  /// Gets the pointer position in target-local coordinates.
  public prop Position Point{ get; init; }
  /// Gets the pointer position in logical window coordinates.
  public prop WindowPosition Point{ get; init; }
  /// Gets the effects allowed by the source.
  public prop AllowedEffects DragEffect{ get; init; }
  /// Gets the effect selected by this target, or None while querying.
  public prop Effect DragEffect{ get; init; }
}

/// Describes the terminal source callback for one in-app drag operation.
public struct DragEndEvent {
  /// Gets how the operation ended.
  public prop Kind DragEndKind{ get; init; }
  /// Gets the completed effect, or None when canceled.
  public prop Effect DragEffect{ get; init; }
}

/// Defines payload creation and terminal notification for an in-app drag source.
public sealed class DragSource {
  private let create((DragStartEvent) -> DragData?)
  private let end Action[DragEndEvent]?
  /// Gets the callback invoked once after the pointer crosses the drag threshold.
  public prop Create((DragStartEvent) -> DragData?) { get -> create }
  /// Gets the optional callback invoked after the operation terminates.
  public prop End Action[DragEndEvent]? { get -> end }

  /// Creates a source descriptor.
  /// @param create callback that creates or rejects drag data at the threshold
  /// @param end optional terminal callback
  public init(create((DragStartEvent) -> DragData?), end Action[DragEndEvent]? = nil) {
    if create == nil { throw ArgumentNullException("create") }
    this.create = create
    this.end = end
  }
}

/// Defines negotiation and lifecycle callbacks for an in-app drop target.
public sealed class DropTarget {
  private let query((DragEvent) -> DragEffect)
  private let changed Action[DragEvent]?
  /// Gets the callback that selects one allowed effect or rejects the drag.
  public prop Query((DragEvent) -> DragEffect) { get -> query }
  /// Gets the optional enter, move, leave, and drop callback.
  public prop Changed Action[DragEvent]? { get -> changed }

  /// Creates a target descriptor.
  /// @param query callback that selects one allowed effect or None
  /// @param changed optional lifecycle callback
  public init(query((DragEvent) -> DragEffect), changed Action[DragEvent]? = nil) {
    if query == nil { throw ArgumentNullException("query") }
    this.query = query
    this.changed = changed
  }
}

private func requireAllowedDragEffects(value DragEffect) DragEffect {
  let bits = int32(value)
  if bits <= 0 || (bits & ^int32(3)) != 0 {
    throw ArgumentOutOfRangeException("allowedEffects")
  }
  return value
}

internal func acceptedDragEffect(value DragEffect, allowed DragEffect) DragEffect {
  let bits = int32(value)
  if (bits != int32(DragEffect.Copy) && bits != int32(DragEffect.Move))
    || (bits & int32(allowed)) == 0 {
      return DragEffect.None
    }
  return value
}

internal class DragDropBinding {
  internal var Source DragSource?
  internal var Target DropTarget?

  internal func Empty() bool -> Source == nil && Target == nil
}

internal class DragDropMetadata {
  shared {
    private let blobValues ConditionalWeakTable[Blob, DragDropBinding] =
    ConditionalWeakTable[Blob, DragDropBinding]()
    private let nodeValues ConditionalWeakTable[Node, DragDropBinding] =
    ConditionalWeakTable[Node, DragDropBinding]()

    internal func SetBlobSource(blob Blob, value DragSource?) {
      guard let binding = blobBinding(blob, value != nil) else { return }
      binding.Source = value
      finishBlob(blob, binding)
    }

    internal func BlobSource(blob Blob) DragSource ? -> blobBinding(blob, false)?.Source

    internal func SetBlobTarget(blob Blob, value DropTarget?) {
      guard let binding = blobBinding(blob, value != nil) else { return }
      binding.Target = value
      finishBlob(blob, binding)
    }

    internal func BlobTarget(blob Blob) DropTarget ? -> blobBinding(blob, false)?.Target

    internal func Sync(node Node, blob Blob) bool {
      var source DragDropBinding?
      if blobValues.TryGetValue(blob, out var blobBindingValue) { source = blobBindingValue }
      var destination DragDropBinding?
      if nodeValues.TryGetValue(node, out var nodeBindingValue) { destination = nodeBindingValue }
      let sourceChanged = destination?.Source != source?.Source
      let targetChanged = destination?.Target != source?.Target
      if source == nil {
        nodeValues.Remove(node)
        return sourceChanged || targetChanged
      }
      if let current = destination {
        current.Source = source?.Source
        current.Target = source?.Target
      } else {
        let created = DragDropBinding()
        created.Source = source?.Source
        created.Target = source?.Target
        nodeValues.Add(node, created)
      }
      return sourceChanged || targetChanged
    }

    internal func Source(node Node) DragSource ? -> nodeBinding(node)?.Source

    internal func Target(node Node) DropTarget ? -> nodeBinding(node)?.Target

    internal func HasBlobBindings(blob Blob) bool -> blobValues.TryGetValue(blob, out var value)
      && !value.Empty()

    internal func HasNodeBindings(node Node) bool -> nodeValues.TryGetValue(node, out var value)
      && !value.Empty()

    private func blobBinding(blob Blob, create bool) DragDropBinding? {
      if blobValues.TryGetValue(blob, out var value) { return value }
      if !create { return nil }
      let created = DragDropBinding()
      blobValues.Add(blob, created)
      return created
    }

    private func finishBlob(blob Blob, value DragDropBinding) {
      if value.Empty() { blobValues.Remove(blob) }
    }

    private func nodeBinding(node Node) DragDropBinding? {
      if !node.HasSparseInputState { return nil }
      return if nodeValues.TryGetValue(node, out var value) { value } else { nil }
    }

  }
}
