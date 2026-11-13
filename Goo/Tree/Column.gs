package Goo

import System.Collections.Generic

/// Defines a vertical flex container. Setting FlexDirection throws when mounted.
public class Column : Blob {
  shared {
    private let emptyChildren IList[Blob] = FrozenChildren(typeof(Column), nil)
  }

  private var children IList[Blob]?
  private var hitTestSelf bool
  private var hasAuthoredHitTestSelf bool

  internal override func coreBlob() { }

  internal func FreezeChildren() IList[Blob] {
    if let owned = children as OwnedChildren {
      if owned.Owner == this { return owned }
    }
    children = (children?.Count ?? 0) == 0 ? Column.emptyChildren : FrozenChildren(GetType(), children)
    return children!!
  }

  /// Gets the ordered child collection. Read-only lists are copied.
  public prop Children IList[Blob] {
    get {
      children ??= OwnedChildren(this)
      return children!!
    }
    set {
      CheckMutable()
      children = value.IsReadOnly ? List[Blob](value) : value
    }
  }

  /// Overrides whether this container participates in pointer hit testing.
  /// When omitted, Goo derives the value from authored interaction behavior.
  public prop HitTestSelf bool {
    get -> hitTestSelf
    set {
      CheckMutable()
      hitTestSelf = value
      hasAuthoredHitTestSelf = true
    }
  }
  internal prop HasAuthoredHitTestSelf bool { get -> hasAuthoredHitTestSelf }

  /// Initializes an empty vertical flex container.
  public init() {
    pushEnumOrdinal(StyleField.FlexDirection, int32(FlexDirection.Column))
  }

  /// Adds a child to the ordered child collection.
  /// @param child The child to add.
  public func Add(child Blob) -> Children.Add(child)
}
