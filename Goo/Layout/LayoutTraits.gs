package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Threading

/// Identifies a typed child layout trait attached to a Blob and queried from LayoutContext during custom layout.
/// @typeparam T The trait value type.
public sealed class LayoutKey[T any] {
  internal let Id int32 = LayoutTraitIds.Next()
  internal let DefaultValue T

  /// Creates a layout trait key whose default value is the default of T.
  public init() {
    DefaultValue = default(T)
  }

  /// Creates a layout trait key with an explicit fallback value used when a child omits the trait.
  /// @param defaultValue The value returned when a child does not declare this trait.
  public init(defaultValue T) {
    DefaultValue = defaultValue
  }

  /// Gets the fallback value returned when a child does not declare this trait.
  public prop Default T { get -> DefaultValue }
}

internal class LayoutTraitIds {
  shared {
    private var next int32

    internal func Next() int32 -> Interlocked.Increment(ref next)
  }
}

internal abstract class LayoutTraitValue {
  internal var KeyId int32

  internal open func Matches(other LayoutTraitValue) bool;
  internal open func Clone() LayoutTraitValue;
}

internal sealed class LayoutTraitValue[T any] : LayoutTraitValue {
  internal var Value T

  internal init(keyId int32, value T) {
    KeyId = keyId
    Value = value
  }

  internal override func Matches(other LayoutTraitValue) bool {
    guard let typed = other as LayoutTraitValue[T] else { return false }
    return EqualityComparer[T].Default.Equals(Value, typed.Value)
  }

  internal override func Clone() LayoutTraitValue -> LayoutTraitValue[T](KeyId, Value)
}

internal sealed class LayoutTraitBag {
  internal let Entries List[LayoutTraitValue] = List[LayoutTraitValue](2)

  internal func FindIndex(keyId int32) int32 {
    for i in 0 ... Entries.Count {
      if Entries[i].KeyId == keyId { return i }
    }
    return -1
  }

  internal func Matches(other LayoutTraitBag) bool {
    if Entries.Count != other.Entries.Count { return false }
    for i in 0 ... Entries.Count {
      let entry = Entries[i]
      let index = other.FindIndex(entry.KeyId)
      if index < 0 || !entry.Matches(other.Entries[index]) { return false }
    }
    return true
  }

  internal func CopyFrom(source LayoutTraitBag) {
    Entries.Clear()
    for i in 0 ... source.Entries.Count {
      Entries.Add(source.Entries[i].Clone())
    }
  }
}

internal class LayoutTraits {
  shared {
    private var blobs ConditionalWeakTable[Blob, LayoutTraitBag]?
    private var nodes ConditionalWeakTable[Node, LayoutTraitBag]?

    internal func SetBlob[T any](blob Blob, key LayoutKey[T], value T) {
      blobs ??= ConditionalWeakTable[Blob, LayoutTraitBag]()
      var bag LayoutTraitBag
      if !blobs!!.TryGetValue(blob, out bag) {
        bag = LayoutTraitBag()
        blobs!!.Add(blob, bag)
      }
      let index = bag.FindIndex(key.Id)
      if index >= 0 {
        (bag.Entries[index] as LayoutTraitValue[T])!!.Value = value
      } else {
        bag.Entries.Add(LayoutTraitValue[T](key.Id, value))
      }
      blob.HasLayoutTraits = true
    }

    internal func TryGetBlob[T any](blob Blob, key LayoutKey[T], out value T) bool {
      if blob.HasLayoutTraits && blobs != nil {
        if blobs!!.TryGetValue(blob, out var bag) {
          let index = bag.FindIndex(key.Id)
          if index >= 0 {
            value = (bag.Entries[index] as LayoutTraitValue[T])!!.Value
            return true
          }
        }
      }
      value = key.DefaultValue
      return false
    }

    internal func ClearBlob[T any](blob Blob, key LayoutKey[T]) bool {
      if !blob.HasLayoutTraits || blobs == nil { return false }
      if !blobs!!.TryGetValue(blob, out var bag) { return false }
      let index = bag.FindIndex(key.Id)
      if index < 0 { return false }
      bag.Entries.RemoveAt(index)
      if bag.Entries.Count == 0 {
        blobs!!.Remove(blob)
        blob.HasLayoutTraits = false
      }
      return true
    }

    internal func TryGetNode[T any](node Node, key LayoutKey[T], out value T) bool {
      if node.HasLayoutTraits && nodes != nil {
        if nodes!!.TryGetValue(node, out var bag) {
          let index = bag.FindIndex(key.Id)
          if index >= 0 {
            value = (bag.Entries[index] as LayoutTraitValue[T])!!.Value
            return true
          }
        }
      }
      value = key.DefaultValue
      return false
    }

    internal func Sync(node Node, blob Blob) bool {
      var sourceBag LayoutTraitBag?
      if blob.HasLayoutTraits && blobs != nil {
        blobs!!.TryGetValue(blob, out sourceBag)
      }
      guard let source = sourceBag else {
        if !node.HasLayoutTraits { return false }
        nodes?.Remove(node)
        node.HasLayoutTraits = false
        return true
      }
      nodes ??= ConditionalWeakTable[Node, LayoutTraitBag]()
      if nodes!!.TryGetValue(node, out var target) {
        if target.Matches(source) { return false }
        target.CopyFrom(source)
        node.HasLayoutTraits = true
        return true
      }
      let created = LayoutTraitBag()
      created.CopyFrom(source)
      nodes!!.Add(node, created)
      node.HasLayoutTraits = true
      return true
    }

    internal func Remove(node Node) {
      if !node.HasLayoutTraits { return }
      nodes?.Remove(node)
      node.HasLayoutTraits = false
    }
  }
}
