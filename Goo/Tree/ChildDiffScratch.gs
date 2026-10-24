package Goo

import System.Collections.Generic

internal data struct ChildDiffReplacement {
  internal let Old Node
  internal let Replacement Node
  internal let Cell Cell
  internal let OldKey string?
  internal let OldOutputKey string?
  internal let OldMountedNode Node?
  internal let OldMountedOwner Cell?
  internal let OldRetired bool
  internal let OldHandle ElementHandle?
}

internal data struct ChildDiffHandleReplacement {
  internal let Old Node
  internal let OldHandle ElementHandle
}

internal class ChildDiffScratchScope {
  internal let Next List[Node]
  internal let Provisional List[Node]
  internal let Retire List[Node]
  internal let Replacements List[ChildDiffReplacement]
  internal let HandleReplacements List[ChildDiffHandleReplacement]
  internal let Keyed Dictionary[string, Node]
  internal let IncomingKeys HashSet[string]
  internal let IncomingHandles HashSet[ElementHandle]
  internal init() {
    Next = List[Node]()
    Provisional = List[Node]()
    Retire = List[Node]()
    Replacements = List[ChildDiffReplacement]()
    HandleReplacements = List[ChildDiffHandleReplacement]()
    Keyed = Dictionary[string, Node]()
    IncomingKeys = HashSet[string]()
    IncomingHandles = HashSet[ElementHandle]()
  }

  internal func Clear() {
    Next.Clear()
    Provisional.Clear()
    Retire.Clear()
    Replacements.Clear()
    HandleReplacements.Clear()
    Keyed.Clear()
    IncomingKeys.Clear()
    IncomingHandles.Clear()
  }
}

internal class ChildDiffScratch {
  private let scopes List[ChildDiffScratchScope]
  private var active int32

  internal init() {
    scopes = List[ChildDiffScratchScope]()
  }

  internal func Rent() ChildDiffScratchScope {
    if active == scopes.Count {
      scopes.Add(ChildDiffScratchScope())
    }
    let result = scopes[active]
    active++
    return result
  }

  internal func Return(s ChildDiffScratchScope) {
    active--
    s.Clear()
  }
}
