package Goo

import System.Collections.Generic

/// Defines a horizontal flex container. Setting FlexDirection throws when mounted.
public class Row : Blob {
  private var children IList[Blob]?
  private var hitTestSelf bool
  private var hasAuthoredHitTestSelf bool

  internal override func coreBlob() { }

  /// Gets the ordered child collection. Read-only lists are copied.
  public prop Children IList[Blob] {
    get {
      children ??= List[Blob]()
      return children!!
    }
    init -> children = value.IsReadOnly ? List[Blob](value) : value
  }

  /// Overrides whether this container participates in pointer hit testing.
  /// When omitted, Goo derives the value from authored interaction behavior.
  public prop HitTestSelf bool {
    get -> hitTestSelf
    init {
      hitTestSelf = value
      hasAuthoredHitTestSelf = true
    }
  }
  internal prop HasAuthoredHitTestSelf bool { get -> hasAuthoredHitTestSelf }

  /// Initializes an empty horizontal flex container.
  public init() {
    pushEnumOrdinal(StyleField.FlexDirection, int32(FlexDirection.Row))
  }

  /// Adds a child to the ordered child collection.
  /// @param child The child to add.
  public func Add(child Blob) -> Children.Add(child)
}
