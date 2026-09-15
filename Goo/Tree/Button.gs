package Goo

import System.Collections.Generic

/// Defines a semantic button container with pointer and keyboard activation.
public class Button : Blob {
  private var children IList[Blob] = List[Blob]()
  internal override func coreBlob() {
  }

  /// Gets the mutable child list. Read-only lists supplied during initialization are copied.
  /// Give all siblings stable keys, or give no sibling a key.
  public prop Children IList[Blob]{
    get -> children
    init -> children = value.IsReadOnly ? List[Blob](value) : value
  }

  /// Initializes an empty button.
  public init() { }
}
