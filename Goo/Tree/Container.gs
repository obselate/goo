package Goo

import System
import System.Collections
import System.Collections.Generic
import System.Collections.ObjectModel
import System.Runtime.CompilerServices

/// Defines an element that contains child blobs.
public class Container : Blob {
  shared {
    private let emptyChildren IList[Blob] = FrozenChildren(typeof(Container), nil)
  }

  private var children IList[Blob]?
  private var hitTestSelf bool
  private var hasAuthoredHitTestSelf bool

  internal override func coreBlob() {
  }

  internal func FreezeChildren() IList[Blob] {
    if let owned = children as OwnedChildren {
      if owned.Owner == this { return owned }
    }
    children = (children?.Count ?? 0) == 0 ? Container.emptyChildren : FrozenChildren(GetType(), children)
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
      children = value.IsReadOnly ? OwnedChildren(this, value) : value
    }
  }
  /// Gets the optional retained measure/arrange policy. Nil uses the normal flex layout; replace the immutable policy when its configuration changes.
  public prop Layout LayoutAlgorithm? {
    get -> CustomLayouts.BlobValue(this)
    set {
      CheckMutable()
      CustomLayouts.SetBlobValue(this, value)
    }
  }
  internal prop VectorViewport VectorViewport? {
    get -> ContainerVectorViewports.Get(this)
    set {
      CheckMutable()
      ContainerVectorViewports.Set(this, value)
    }
  }
  // Window-domain marker; authored through WindowDragRegion, not directly.
  internal prop DragsWindow bool{ get; set }
  /// Overrides whether this container participates in pointer hit testing.
  /// When omitted, Goo derives the value from authored interaction behavior.
  public prop HitTestSelf bool{
    get -> hitTestSelf
    set {
      CheckMutable()
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

internal sealed class FrozenChildren : Collection[Blob] {
  private let owner Type

  internal init(owner Type, values IList[Blob]?) : base(
    if let values = values { List[Blob](values) } else { List[Blob]() }) {
    this.owner = owner
  }

  protected override func ClearItems() { modified() }
  protected override func InsertItem(index int32, item Blob) { modified() }
  protected override func RemoveItem(index int32) { modified() }
  protected override func SetItem(index int32, item Blob) { modified() }

  private func modified() {
    throw InvalidOperationException(owner.Name + " modified after it was returned to Goo")
  }
}

internal sealed class OwnedChildren : IList[Blob] {
  private let owner Blob
  private let values List[Blob]
  internal prop Owner Blob { get -> owner }

  internal init(owner Blob) {
    this.owner = owner
    values = List[Blob]()
  }

  internal init(owner Blob, source IList[Blob]) {
    this.owner = owner
    values = List[Blob](source)
  }

  public prop Count int32 { get -> values.Count }
  public prop IsReadOnly bool { get -> owner.IsFrozen }
  public prop this[index int32] Blob {
    get -> values[index]
    set {
      owner.CheckMutable()
      values[index] = value
    }
  }

  public func Add(item Blob) {
    owner.CheckMutable()
    values.Add(item)
  }

  public func Clear() {
    owner.CheckMutable()
    values.Clear()
  }

  public func Insert(index int32, item Blob) {
    owner.CheckMutable()
    values.Insert(index, item)
  }

  public func Remove(item Blob) bool {
    owner.CheckMutable()
    return values.Remove(item)
  }

  public func RemoveAt(index int32) {
    owner.CheckMutable()
    values.RemoveAt(index)
  }

  public func Contains(item Blob) bool -> values.Contains(item)
  public func IndexOf(item Blob) int32 -> values.IndexOf(item)
  public func CopyTo(array []Blob, index int32) { values.CopyTo(array, index) }
  public func GetEnumerator() IEnumerator[Blob] -> values.GetEnumerator()
  func (IEnumerable) GetEnumerator() IEnumerator -> GetEnumerator()
}

internal class ContainerVectorViewports {
  shared {
    private var values ConditionalWeakTable[Container, ContainerVectorViewportValue]?

    internal func Get(container Container) VectorViewport? {
      guard let table = values else { return nil }
      return if table.TryGetValue(container, out var value) { value.Value } else { nil }
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
