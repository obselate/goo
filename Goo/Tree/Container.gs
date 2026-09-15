package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

/// Defines an element that contains child blobs.
public class Container : Blob {
  private var children IList[Blob] = List[Blob]()
  private var hitTestSelf bool
  private var hasAuthoredHitTestSelf bool

  internal override func coreBlob() {
  }

  /// Gets the mutable child list. Read-only lists supplied during initialization are copied.
  /// Give all siblings stable keys, or give no sibling a key.
  public prop Children IList[Blob]{ get -> children
    init -> children = value.IsReadOnly ? List[Blob](value) : value
  }
  /// Gets the optional retained measure/arrange policy. Nil uses the normal flex layout; replace the immutable policy when its configuration changes.
  public prop Layout LayoutAlgorithm? {
    get -> CustomLayouts.BlobValue(this)
    init -> CustomLayouts.SetBlobValue(this, value)
  }
  internal prop VectorViewport VectorViewport? {
    get -> ContainerVectorViewports.Get(this)
    init -> ContainerVectorViewports.Set(this, value)
  }
  /// Reports whether scroll content stays pinned to the bottom.
  public prop PinToBottom bool{ get; init; }
  // Window-domain marker; authored through WindowDragRegion, not directly.
  internal prop DragsWindow bool{ get; set }
  /// Overrides whether this container participates in pointer hit testing.
  /// When omitted, Goo derives the value from authored interaction behavior.
  public prop HitTestSelf bool{
    get -> hitTestSelf
    init{
      hitTestSelf = value
      hasAuthoredHitTestSelf = true
    }
  }
  internal prop HasAuthoredHitTestSelf bool{ get -> hasAuthoredHitTestSelf }

  /// Initializes an empty child collection.
  public init() { }

  /// Adds a child to the end of the ordered child collection.
  /// @param child The child to add.
  public func Add(child Blob) {
    Children.Add(child)
  }
}

internal class ContainerVectorViewports {
  shared {
    private var values ConditionalWeakTable[Container, ContainerVectorViewportValue]?

    internal func Get(container Container) VectorViewport? {
      guard let table = values else { return nil }
      if table.TryGetValue(container, out var value) { return value.Value }
      return nil
    }

    internal func Set(container Container, next VectorViewport?) {
      if let nextValue = next {
        if let table = values {
          if table.TryGetValue(container, out var existing) {
            existing.Value = nextValue
            return
          }
        }
        if values == nil {
          values = ConditionalWeakTable[Container, ContainerVectorViewportValue]()
        }
        values?.Add(container, ContainerVectorViewportValue{ Value: nextValue })
        return
      }
      values?.Remove(container)
    }
  }
}

internal class ContainerVectorViewportValue {
  internal var Value VectorViewport
}
