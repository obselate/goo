package Goo

import System

internal class AccessibilityAttachmentFixtures {
  func RetainedFieldContract() bool {
    let cell = AttachmentFieldCell()
    let adapter = AccessibilityTestAdapter()
    let window = Window{Root: cell, Size: LayoutSize(240, 120), AccessibilityAdapter: adapter}
    try {
      window.UpdateTree()
      let root = window.Tree!!
      let input = root.Children[1]
      let rect = input.Rect
      let semantics = adapter.Tree!!.Root!!
      if semantics.Children[1].Relationships.LabelledBy.Count != 1
        || semantics.Children[1].Relationships.LabelledBy[0] != semantics.Children[0].Id { return false }
      if AccessibilityMetadata.Value(input)?.Required != true
        || AccessibilityMetadata.Value(input)?.Relationships?.LabelledBy.Length != 1 { return false }
      let updates = adapter.Updates
      cell.Rebuild()
      window.UpdateTree()
      if window.Tree!!.Children[1] != input || adapter.Updates != updates { return false }
      cell.Required = false
      cell.Invalid = false
      cell.Rebuild()
      window.UpdateTree()
      if AccessibilityMetadata.Value(input)?.Required != false
        || AccessibilityMetadata.Value(input)?.Invalid != false { return false }
      cell.Attached = false
      cell.Rebuild()
      window.UpdateTree()
      let plain = window.Tree!!.Children[1]
      if countNodes(root) != 3 || plain.Rect != rect || AccessibilityMetadata.Value(plain)?.Required != nil
        || AccessibilityMetadata.Value(plain)?.Relationships != nil || cell.Input.Accessibility != nil { return false }
      return true
    } finally { if let root = window.Tree { NodeLifecycle.DisposeTree(root) } }
  }

  func NestedTargetContract() bool {
    let inner = AttachmentEditorCell()
    let cell = AttachmentTargetCell(inner)
    let window = Window{Root: cell, Size: LayoutSize(240, 120)}
    try {
      window.UpdateTree()
      let first = inner.Handle.AttachedNode()!!
      if AccessibilityMetadata.Value(first)?.Required != true { return false }
      inner.Replace = true
      inner.Rebuild()
      window.UpdateTree()
      let next = inner.Handle.AttachedNode()!!
      if first == next || AccessibilityMetadata.Value(next)?.Required != true { return false }
      inner.Move = true
      inner.Rebuild()
      window.UpdateTree()
      let moved = inner.Handle.AttachedNode()!!
      if moved == next || AccessibilityMetadata.Value(next)?.Required != nil
        || AccessibilityMetadata.Value(moved)?.Required != true { return false }
      cell.Missing = true
      cell.Rebuild()
      window.UpdateTree()
      return AccessibilityMetadata.Value(moved)?.Required == nil
    } finally {
      if let root = window.Tree { NodeLifecycle.DisposeTree(root) }
      if inner.Handle.AccessibilityAttachments?.Count != 0 { throw InvalidOperationException("Attachment subscription survived unmount") }
    }
  }

  func IndependentMountsAndPrecedenceContract() bool {
    let input = TextEntry{Value: "retained", Width: 100, Height: 24}
    let reconciler = Reconciler{Res: Resolver{}}
    let root = reconciler.Mount(Container(){
      AccessibilityAttachment{Content: input, Required: true},
      AccessibilityAttachment{Content: AccessibilityAttachment{Content: input, Required: false, Invalid: false}, Required: true, Invalid: true},
    })
    try {
      return root.Children.Count == 2 && countNodes(root) == 3
        && AccessibilityMetadata.Value(root.Children[0])?.Required == true
        && AccessibilityMetadata.Value(root.Children[1])?.Required == false
        && AccessibilityMetadata.Value(root.Children[1])?.Invalid == false
        && input.Accessibility == nil
    } finally {
      NodeLifecycle.DisposeTree(root)
      if AccessibilityMetadata.Value(root.Children[0]) != nil { throw InvalidOperationException("Attachment metadata survived unmount") }
    }
  }

  func DragRegionOwnershipContract() bool {
    let fresh = Container{Width: 100, Height: 24}
    if Window.DragRegion(fresh) != fresh || !fresh.DragsWindow { return false }
    let frozen = Container{Width: 100, Height: 24}
    let original = Reconciler{Res: Resolver{}}.Mount(frozen)
    try {
      try { Window.DragRegion(frozen) }
      catch (_ InvalidOperationException) { return !frozen.DragsWindow && !original.DragsWindow }
      return false
    } finally { NodeLifecycle.DisposeTree(original) }
  }
}

internal class AttachmentFieldCell : Cell {
  internal let Label ElementHandle = ElementHandle()
  internal let Input Blob = TextEntry{Value: "retained", Width: 100, Height: 24}
  internal var Attached bool = true
  internal var Required bool = true
  internal var Invalid bool = true

  override func Build() Blob -> Container{
    Width: 240, Height: 120,
    Text{Content: "Name", Handle: Label},
    if Attached {
      AccessibilityAttachment{Content: Input, Required: Required, Invalid: Invalid,
        Relationships: AccessibilityRelationships{LabelledBy: []ElementHandle{Label}}}
    } else { Input },
  }
}

internal class AttachmentEditorCell : Cell {
  internal let Handle ElementHandle = ElementHandle()
  internal var Replace bool
  internal var Move bool

  override func Build() Blob {
    if !Replace { return TextEntry{Handle: Handle, Value: "first", Width: 100, Height: 24} }
    return Container(){
      TextEntry{Key: "first", Handle: if Move { nil } else { Handle }, Value: "first"},
      TextEntry{Key: "second", Handle: if Move { Handle } else { nil }, Value: "second"},
    }
  }
}

internal class AttachmentTargetCell : Cell {
  private let editor AttachmentEditorCell
  private let missing ElementHandle = ElementHandle()
  internal var Missing bool

  internal init(value AttachmentEditorCell) { editor = value }

  override func Build() Blob -> AccessibilityAttachment{
    Content: Cell.Mount[AttachmentEditorCell](nil, () -> editor),
    Target: if Missing { missing } else { editor.Handle }, Required: true,
  }
}
