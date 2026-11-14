package Goo

import System.Collections.Generic

/// Builds one child per item. Children without a key get the item's key. Explicit keys stay unchanged.
/// @typeparam T The item type.
/// @param items The items in child order.
/// @param itemKey Selects a stable, unique sibling key from an item.
/// @param itemBuilder Builds the child for an item.
/// @returns Children to spread into a container. Duplicate sibling keys are rejected during reconciliation.
public func Each[T any](items IReadOnlyList[T], itemKey(T) -> string, itemBuilder(T) -> Blob)[]Blob ->
  eachCore[T](items, itemKey, itemBuilder)

internal func eachCore[T any](items IReadOnlyList[T], itemKey(T) -> string, itemBuilder(T) -> Blob)[]Blob {
  let result = [items.Count]Blob
  for index in 0 ... result.Length {
    let item = items[index]
    var child = itemBuilder(item)
    if child.Key == nil {
      if child.IsFrozen {
        child = Cell.Mount[Blob, EachContentCell](itemKey(item), child)
      } else {
        child.Key = itemKey(item)
      }
    }
    result[index] = child
  }
  return result
}

internal sealed class EachContentCell : Cell[Blob] {
  protected override func Build(input Blob) Blob -> input
}
