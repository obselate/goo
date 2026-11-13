package Goo

import System.Collections.Generic

/// Defines a semantic button container with pointer and keyboard activation.
public class Button : Blob {
  shared {
    private let emptyChildren IList[Blob] = FrozenChildren(typeof(Button), nil)
  }

  private var children IList[Blob]?
  internal override func coreBlob() {
  }

  internal func FreezeChildren() IList[Blob] {
    if let owned = children as OwnedChildren {
      if owned.Owner == this { return owned }
    }
    children = (children?.Count ?? 0) == 0 ? Button.emptyChildren : FrozenChildren(GetType(), children)
    return children!!
  }

  /// Gets the mutable child list. Read-only lists supplied during initialization are copied.
  /// Siblings can mix keyed and unkeyed entries. Keyed children match by key; unkeyed children match only at the same absolute sibling index.
  public prop Children IList[Blob]{
    get {
      children ??= OwnedChildren(this)
      return children!!
    }
    set {
      CheckMutable()
      children = value.IsReadOnly ? List[Blob](value) : value
    }
  }

  /// Initializes an empty button.
  public init() {
    Focusable = true
    JustifyContent = JustifyContent.Center
    AlignItems = AlignItems.Center
  }

  /// Adds a child to the end of the ordered child collection.
  /// @param child The child to add.
  public func Add(child Blob) {
    Children.Add(child)
  }
}
