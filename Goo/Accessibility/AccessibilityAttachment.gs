package Goo

import System
import System.Collections.Generic

/// Adds relationships and state without changing the supplied declaration, layout, or semantic tree shape.
/// Nested attachments merge from outer to inner. The inner attachment wins state overrides.
public data struct AccessibilityAttachment {
  /// Gets the supplied declaration.
  var Content Blob
  /// Gets the descendant handle. Nil selects the rendered root. A missing target has no effect.
  var Target ElementHandle?
  /// Gets relationships to append without duplicates, from outer to inner.
  var Relationships AccessibilityRelationships?
  /// Gets the required override. Nil preserves the value. False clears it.
  var Required bool?
  /// Gets the invalid override. Nil preserves the value. False clears it.
  var Invalid bool?

  /// Builds a transparent retained attachment.
  /// @returns The attachment declaration.
  public func Build() Blob -> AccessibilityAttachmentElement(this)
}

/// Creates a transparent retained accessibility attachment.
/// @param value The attachment declaration.
/// @returns A transparent declaration that applies the attachment at each mount.
public func operator implicit(value AccessibilityAttachment) Blob -> value.Build()

internal class AccessibilityAttachmentElement : CellElement {
  private let declaration AccessibilityAttachment

  internal init(value AccessibilityAttachment) {
    declaration = value
    Key = value.Content.Key
    CellType = typeof(AccessibilityAttachmentCell)
  }

  internal override func CreateCell() Cell -> AccessibilityAttachmentCell()

  internal override func ApplyInput(cell Cell) {
    let target = (cell as AccessibilityAttachmentCell)!!
    if !target.Declaration.Equals(declaration) {
      target.Declaration = declaration
      target.Rebuild()
    }
  }
}

internal sealed class AccessibilityAttachmentCell : Cell, IDisposable {
  internal var Declaration AccessibilityAttachment
  internal var TargetNode Node?
  internal var Queued bool
  private var registry AccessibilityAttachmentRegistry?
  private var handle ElementHandle?

  internal func RenderAttachment() Blob {
    Declaration.Relationships?.Freeze(typeof(AccessibilityAttachment))
    return Declaration.Content
  }

  internal func Register(value AccessibilityAttachmentRegistry) {
    registry = value
    if handle != Declaration.Target {
      handle?.AccessibilityAttachments?.Remove(this)
      handle = Declaration.Target
      if let target = handle {
        target.AccessibilityAttachments ??= List[AccessibilityAttachmentCell]()
        target.AccessibilityAttachments!!.Add(this)
      }
    }
    Invalidate()
  }

  internal func Invalidate() {
    if Queued || registry == nil { return }
    Queued = true
    registry!!.Pending.Add(this)
  }

  internal func Resolve() {
    let root = mountedNode
    let target = if let handle = Declaration.Target { handle.AttachedNode() } else { root }
    var ancestor = target
    while ancestor != nil && ancestor != root { ancestor = ancestor.Parent }
    let next = if root != nil && ancestor != nil && target?.Retired != true { target } else { nil }
    AccessibilityMetadata.MoveAttachment(this, next, registry!!)
  }

  public func Dispose() {
    registry?.Pending.Remove(this)
    Queued = false
    handle?.AccessibilityAttachments?.Remove(this)
    handle = nil
    if let value = registry { AccessibilityMetadata.MoveAttachment(this, nil, value) }
    registry = nil
  }

  internal func Depth() int32 {
    var result int32
    var owner = mountedOwner
    while let parent = owner {
      result++
      owner = parent.mountedOwner
    }
    var node = mountedNode?.Parent
    while let parent = node {
      result++
      node = parent.Parent
    }
    return result
  }
}

internal class AccessibilityAttachmentRegistry {
  internal let Pending List[AccessibilityAttachmentCell] = List[AccessibilityAttachmentCell]()
  internal let Nodes HashSet[Node] = HashSet[Node]()

  internal func Flush() bool {
    for attachment in Pending {
      attachment.Queued = false
      if !attachment.disposed { attachment.Resolve() }
    }
    Pending.Clear()
    var changed = false
    for node in Nodes {
      if AccessibilityMetadata.RefreshAttachments(node) { changed = true }
    }
    Nodes.Clear()
    return changed
  }
}

/// Hosts a Goo tree in a native window.
public partial class Window {
  internal var SemanticAttachments AccessibilityAttachmentRegistry?
}

internal partial class Reconciler {
  private var semanticAttachments AccessibilityAttachmentRegistry?

  private func attachmentRegistry() AccessibilityAttachmentRegistry {
    if let owner = Owner {
      owner.SemanticAttachments ??= AccessibilityAttachmentRegistry()
      return owner.SemanticAttachments!!
    }
    semanticAttachments ??= AccessibilityAttachmentRegistry()
    return semanticAttachments!!
  }

  private func applySemanticAttachments() {
    let registry = if let owner = Owner { owner.SemanticAttachments } else { semanticAttachments }
    if registry?.Flush() == true { MarkEffects(ReconcileEffects.Accessibility) }
  }
}
