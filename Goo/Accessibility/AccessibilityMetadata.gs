package Goo

import System.Runtime.CompilerServices

internal class AccessibilityMetadata {
  shared {
    private let blobValues ConditionalWeakTable[Blob, Accessibility] =
    ConditionalWeakTable[Blob, Accessibility]()

    internal func BlobValue(b Blob) Accessibility? -> if blobValues.TryGetValue(b, out var value) { value } else { nil }

    internal func SetBlobValue(b Blob, value Accessibility?) {
      blobValues.Remove(b)
      if let next = value { blobValues.Add(b, next) }
    }

    internal func Value(n Node) Accessibility? -> if n.HasAccessibilityDeclaration { n.PointerState?.Accessibility } else { nil }

    internal func Sync(n Node, b Blob) bool {
      let next = BlobValue(b)
      let prior = Value(n)
      next?.Validate()
      if sameAccessibility(prior, next) { return false }
      if let value = next {
        n.EnsurePointerState().Accessibility = value
        n.HasAccessibilityDeclaration = true
      } else {
        if let state = n.PointerState { state.Accessibility = nil }
        n.HasAccessibilityDeclaration = false
      }
      return true
    }

    internal func Remove(n Node) {
      if !n.HasAccessibilityDeclaration {
        return
      }
      if let state = n.PointerState { state.Accessibility = nil }
      n.HasAccessibilityDeclaration = false
    }
  }
}

private func sameAccessibility(left Accessibility?, right Accessibility?) bool {
  if left == nil || right == nil { return left == right }
  let a = left
  let b = right
  return a.Role == b.Role && a.CustomRole == b.CustomRole && a.Name == b.Name
    && a.Description == b.Description && a.Value == b.Value && sameValue(a.Range, b.Range)
    && a.Checked == b.Checked && a.Selected == b.Selected && a.Expanded == b.Expanded
    && a.ReadOnly == b.ReadOnly && a.Required == b.Required && a.Invalid == b.Invalid
    && a.PositionInSet == b.PositionInSet && a.SizeOfSet == b.SizeOfSet
    && a.RowIndex == b.RowIndex && a.ColumnIndex == b.ColumnIndex
    && a.RowCount == b.RowCount && a.ColumnCount == b.ColumnCount
    && a.Busy == b.Busy && a.Level == b.Level && a.Orientation == b.Orientation
    && a.Modal == b.Modal && a.Multiline == b.Multiline && a.MultiSelectable == b.MultiSelectable
    && a.HasPopup == b.HasPopup && a.Live == b.Live && a.Atomic == b.Atomic && a.Hidden == b.Hidden
    && sameArray(a.RawActions, b.RawActions) && a.OnAction == b.OnAction
    && sameRelationships(a.Relationships, b.Relationships)
}

private func sameValue(left AccessibilityValue?, right AccessibilityValue?) bool {
  if left == nil || right == nil { return left == right }
  let a = left
  let b = right
  return a.Now == b.Now && a.Minimum == b.Minimum && a.Maximum == b.Maximum && a.Text == b.Text
}

private func sameRelationships(left AccessibilityRelationships?, right AccessibilityRelationships?) bool {
  if left == nil || right == nil { return left == right }
  let a = left
  let b = right
  return sameArray(a.RawLabelledBy, b.RawLabelledBy)
    && sameArray(a.RawDescribedBy, b.RawDescribedBy)
    && sameArray(a.RawControls, b.RawControls) && sameArray(a.RawOwns, b.RawOwns)
    && sameArray(a.RawFlowTo, b.RawFlowTo) && sameArray(a.RawErrorMessage, b.RawErrorMessage)
    && a.ActiveDescendant == b.ActiveDescendant
}

internal class AccessibilityNodeStates {
  shared {

    internal func GetOrAdd(n Node, id AccessibilityId) RetainedAccessibilityNode {
      if let value = n.PointerState?.AccessibilityNode && n.HasAccessibilityNodeState { return value }
      let fresh = RetainedAccessibilityNode(id)
      n.EnsurePointerState().AccessibilityNode = fresh
      n.HasAccessibilityNodeState = true
      return fresh
    }

    internal func Get(n Node) RetainedAccessibilityNode? -> if n.HasAccessibilityNodeState { n.PointerState?.AccessibilityNode } else { nil }

    internal func Remove(n Node) {
      if !n.HasAccessibilityNodeState {
        return
      }
      if let state = n.PointerState { state.AccessibilityNode = nil }
      n.HasAccessibilityNodeState = false
    }
  }
}

internal class AccessibilityButtonNames {
  shared {

    internal func Get(n Node, fingerprint uint64) string? -> if let value = n.PointerState?.AccessibilityButtonName && !n.Retired && value.Generation == n.MountGeneration && value.Fingerprint == fingerprint { value.Name } else { nil }

    internal func Set(n Node, fingerprint uint64, name string) {
      n.EnsurePointerState().AccessibilityButtonName = AccessibilityButtonName(n.MountGeneration, fingerprint, name)
    }
  }
}

internal class AccessibilityButtonName {
  internal let Generation uint64
  internal let Fingerprint uint64
  internal let Name string

  internal init(generation uint64, fingerprint uint64, name string) {
    Generation = generation
    Fingerprint = fingerprint
    Name = name
  }
}
