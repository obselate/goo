package Goo

import System.Runtime.CompilerServices

internal class AccessibilityMetadata {
  shared {
    private let blobValues ConditionalWeakTable[Blob, Accessibility] =
    ConditionalWeakTable[Blob, Accessibility]()
    private let nodeValues ConditionalWeakTable[Node, Accessibility] =
    ConditionalWeakTable[Node, Accessibility]()
    private let attachmentSources ConditionalWeakTable[Node, AttachmentSource] =
      ConditionalWeakTable[Node, AttachmentSource]()

    internal func MoveAttachment(attachment AccessibilityAttachmentCell, next Node?, registry AccessibilityAttachmentRegistry) {
      if let prior = attachment.TargetNode {
        if prior != next && attachmentSources.TryGetValue(prior, out var source) {
          source.Attachments.Remove(attachment)
          source.Registry.Nodes.Add(prior)
        }
      }
      if let node = next {
        if !attachmentSources.TryGetValue(node, out var source) {
          source = AttachmentSource(Value(node), registry)
          attachmentSources.Add(node, source)
        }
        if attachment.TargetNode != next { source.Attachments.Add(attachment) }
        source.Registry.Nodes.Add(node)
      }
      attachment.TargetNode = next
    }

    internal func RefreshAttachments(n Node) bool {
      if !attachmentSources.TryGetValue(n, out var source) { return false }
      if n.Retired {
        attachmentSources.Remove(n)
        return false
      }
      var next = source.Value
      source.Attachments.Sort((left, right) -> left.Depth().CompareTo(right.Depth()))
      for attachment in source.Attachments { next = mergeAttachment(next, attachment.Declaration) }
      if source.Attachments.Count == 0 { attachmentSources.Remove(n) }
      if sameAccessibility(Value(n), next) { return false }
      nodeValues.Remove(n)
      if let value = next { nodeValues.Add(n, value) }
      n.HasAccessibilityDeclaration = next != nil
      return true
    }

    private func mergeAttachment(prior Accessibility?, attachment AccessibilityAttachment) Accessibility? {
      if attachment.Relationships == nil && attachment.Required == nil && attachment.Invalid == nil { return prior }
      let next = if let prior = prior { Accessibility{...prior} } else { Accessibility{} }
      if let additions = attachment.Relationships {
        let existing = prior?.Relationships ?? AccessibilityRelationships{}
        next.Relationships = AccessibilityRelationships{...existing,
          LabelledBy: appendHandles(existing.LabelledBy, additions.LabelledBy),
          DescribedBy: appendHandles(existing.DescribedBy, additions.DescribedBy),
          ErrorMessage: appendHandles(existing.ErrorMessage, additions.ErrorMessage),
          Controls: appendHandles(existing.Controls, additions.Controls),
          Owns: appendHandles(existing.Owns, additions.Owns),
          FlowTo: appendHandles(existing.FlowTo, additions.FlowTo),
          ActiveDescendant: additions.ActiveDescendant ?? existing.ActiveDescendant}
      }
      if let required = attachment.Required { next.Required = required }
      if let invalid = attachment.Invalid { next.Invalid = invalid }
      next.Freeze(typeof(AccessibilityAttachment))
      return next
    }

    private func appendHandles(existing []ElementHandle, additions []ElementHandle) []ElementHandle {
      if additions.Length == 0 { return existing }
      let result = System.Collections.Generic.List[ElementHandle](existing)
      for handle in additions { if !result.Contains(handle) { result.Add(handle) } }
      return result.ToArray()
    }

    internal func BlobValue(b Blob) Accessibility? -> if blobValues.TryGetValue(b, out var value) { value } else { nil }

    internal func SetBlobValue(b Blob, value Accessibility?) {
      blobValues.Remove(b)
      if let next = value { blobValues.Add(b, next) }
    }

    internal func Value(n Node) Accessibility? -> if n.HasAccessibilityDeclaration && nodeValues.TryGetValue(n, out var value) { value } else { nil }

    internal func Sync(n Node, b Blob) bool {
      let next = BlobValue(b)
      if attachmentSources.TryGetValue(n, out var source) {
        next?.Validate()
        if !sameAccessibility(source.Value, next) {
          source.Value = next
          source.Registry.Nodes.Add(n)
        }
        return false
      }
      let prior = Value(n)
      next?.Validate()
      if sameAccessibility(prior, next) { return false }
      nodeValues.Remove(n)
      if let value = next {
        nodeValues.Add(n, value)
        n.HasAccessibilityDeclaration = true
      } else {
        n.HasAccessibilityDeclaration = false
      }
      return true
    }

    internal func Remove(n Node) {
      if attachmentSources.TryGetValue(n, out var source) { source.Registry.Nodes.Remove(n) }
      attachmentSources.Remove(n)
      if !n.HasAccessibilityDeclaration {
        return
      }
      nodeValues.Remove(n)
      n.HasAccessibilityDeclaration = false
    }
  }
}

internal class AttachmentSource {
  internal var Value Accessibility?
  internal let Registry AccessibilityAttachmentRegistry
  internal let Attachments System.Collections.Generic.List[AccessibilityAttachmentCell] =
    System.Collections.Generic.List[AccessibilityAttachmentCell]()

  internal init(value Accessibility?, registry AccessibilityAttachmentRegistry) {
    Value = value
    Registry = registry
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
    private let values ConditionalWeakTable[Node, RetainedAccessibilityNode] =
    ConditionalWeakTable[Node, RetainedAccessibilityNode]()

    internal func GetOrAdd(n Node, id AccessibilityId) RetainedAccessibilityNode {
      if n.HasAccessibilityNodeState && values.TryGetValue(n, out var value) { return value }
      let fresh = RetainedAccessibilityNode(id)
      values.Add(n, fresh)
      n.HasAccessibilityNodeState = true
      return fresh
    }

    internal func Get(n Node) RetainedAccessibilityNode? -> if n.HasAccessibilityNodeState && values.TryGetValue(n, out var value) { value } else { nil }

    internal func Remove(n Node) {
      if !n.HasAccessibilityNodeState {
        return
      }
      values.Remove(n)
      n.HasAccessibilityNodeState = false
    }
  }
}

internal class AccessibilityButtonNames {
  shared {
    private let values ConditionalWeakTable[Node, AccessibilityButtonName] =
    ConditionalWeakTable[Node, AccessibilityButtonName]()

    internal func Get(n Node, fingerprint uint64) string? -> if !n.Retired && values.TryGetValue(n, out var value) && value.Generation == n.MountGeneration && value.Fingerprint == fingerprint { value.Name } else { nil }

    internal func Set(n Node, fingerprint uint64, name string) {
      values.Remove(n)
      values.Add(n, AccessibilityButtonName(n.MountGeneration, fingerprint, name))
    }

    internal func Remove(n Node) { values.Remove(n) }
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
