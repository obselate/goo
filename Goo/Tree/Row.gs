package Goo

import System.Collections.Generic

/// Defines a horizontal flex container. Setting FlexDirection throws when mounted.
public class Row : Blob {
  private var children IList[Blob]?

  internal override func coreBlob() { }

  /// Gets the ordered child collection. Read-only lists are copied.
  public prop Children IList[Blob] {
    get {
      children ??= List[Blob]()
      return children!!
    }
    init -> children = value.IsReadOnly ? List[Blob](value) : value
  }

  /// Initializes an empty horizontal flex container.
  public init() {
    pushEnumOrdinal(StyleField.FlexDirection, int32(FlexDirection.Row))
  }

  /// Adds a child to the ordered child collection.
  /// @param child The child to add.
  public func Add(child Blob) -> Children.Add(child)
}
