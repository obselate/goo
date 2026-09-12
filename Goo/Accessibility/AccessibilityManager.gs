package Goo

import System
import System.Collections.Generic
import System.Text

internal class AccessibilityManager {
  private let owner Window
  private var adapter AccessibilityAdapter?
  private let tree RetainedAccessibilityTree
  private let nodes Dictionary[int64, Node]
  private let semanticNodes List[Node]
  private let forced HashSet[Node]
  private let childLists List[List[AccessibilityNode]]
  private let noChildren List[AccessibilityNode]
  private let syntheticRoot RetainedAccessibilityNode
  private var childListDepth int32
  private var nextId int64
  private var semanticDirty bool
  private var deliveryPending bool
  private var retryUsed bool
  private var rebuildingChanged bool

  internal init(owner Window) {
    this.owner = owner
    tree = RetainedAccessibilityTree()
    nodes = Dictionary[int64, Node]()
    semanticNodes = List[Node]()
    forced = HashSet[Node]()
    childLists = List[List[AccessibilityNode]]()
    noChildren = List[AccessibilityNode]()
    syntheticRoot = RetainedAccessibilityNode(AccessibilityId(0))
    nextId = 1
  }

  internal prop Adapter AccessibilityAdapter? { get -> adapter }
  internal prop LastError Exception? { get; private set; }
  internal prop HasDemand bool{ get -> semanticDirty || deliveryPending }

  internal func SetAdapter(value AccessibilityAdapter?) {
    if adapter == value {
      return
    }
    adapter = value
    LastError = nil
    retryUsed = false
    semanticDirty = value != nil
    deliveryPending = value != nil
    if value == nil {
      nodes.Clear()
      semanticNodes.Clear()
      forced.Clear()
    }
  }

  internal func MarkDirty() {
    if adapter != nil {
      semanticDirty = true
      retryUsed = false
    }
  }

  internal func NodeFor(id AccessibilityId) Node? {
    if nodes.TryGetValue(id.Value, out var node) && !node.Retired {
      return node
    }
    return nil
  }

  internal func Supports(id AccessibilityId, action AccessibilityAction) bool {
    guard let node = NodeFor(id) else { return false }
    guard let view = AccessibilityNodeStates.Get(node) else { return false }
    return view.Supports(action)
  }

  internal func InvokeDeclared(target Node, request AccessibilityActionRequest) bool? {
    guard let declaration = AccessibilityMetadata.Value(target) else {
      return nil
    }
    guard let handler = declaration.OnAction else { return nil }
    if !containsAction(declaration.RawActions, request.Action) { return nil }
    let handled = handler(request)
    if handled { rebuildOwner(target) }
    return handled
  }

  // Returns true only when a failed delivery needs the next rendered UI update.
  internal func Publish(root Node?) bool {
    guard let host = adapter else { return false }
    if semanticDirty {
      semanticDirty = false
      if rebuild(root) {
        tree.MarkChanged()
        deliveryPending = true
      }
    }
    if !deliveryPending { return false }
    try {
      host.Update(tree)
      if adapter == host {
        deliveryPending = false
        LastError = nil
      }
      return false
    } catch (error Exception) {
      if adapter != host { return false }
      LastError = error
      if retryUsed {
        deliveryPending = false
        return false
      }
      retryUsed = true
      return true
    }
  }

  private func rebuild(root Node?) bool {
    rebuildingChanged = false
    forced.Clear()
    if let treeRoot = root { collectForced(treeRoot, false) }
    nodes.Clear()
    semanticNodes.Clear()
    let top = rentChildren()
    try {
      if let treeRoot = root { appendNode(treeRoot, top, false, false, false) }
      var rootChanged = false
      if top.Count == 0 {
        if syntheticRoot.SetChildren(noChildren) { rebuildingChanged = true }
        rootChanged = tree.SetRoot(nil)
      } else if top.Count == 1 {
        if syntheticRoot.SetChildren(noChildren) { rebuildingChanged = true }
        rootChanged = tree.SetRoot(top[0])
      } else {
        if syntheticRoot.Apply(AccessibilityRole.Generic, "", "", "", "", "", nil,
          nil, nil, nil, nil, nil, nil, AccessibilityChecked.Unspecified, nil, nil, false,
          nil, nil, nil, nil, nil, AccessibilityOrientation.Unspecified, nil, nil, nil,
          nil, AccessibilityLive.Off, nil, false, ElementRect{}, 0) {
            rebuildingChanged = true
          }
        if syntheticRoot.SetChildren(top) { rebuildingChanged = true }
        rootChanged = tree.SetRoot(syntheticRoot)
      }
      applyRelationships()
      return rebuildingChanged || rootChanged
    } finally {
      returnChildren()
    }
  }

  private func collectForced(n Node, inheritedHidden bool) {
    let declaration = AccessibilityMetadata.Value(n)
    let nowHidden = computeHidden(n, declaration, inheritedHidden)
    if nowHidden {
      return
    }
    if !declaredRoleIsNone(declaration) {
      if let relationships = declaration?.Relationships {
        collectHandles(relationships.RawLabelledBy)
        collectHandles(relationships.RawDescribedBy)
        collectHandles(relationships.RawControls)
        collectHandles(relationships.RawOwns)
        collectHandles(relationships.RawFlowTo)
        collectHandles(relationships.RawErrorMessage)
        if let active = relationships.ActiveDescendant { force(active) }
      }
    }
    for i in 0 ... n.Children.Count { collectForced(n.Children[i], nowHidden) }
  }

  private func collectHandles(handles []ElementHandle) {
    for handle in handles { force(handle) }
  }

  private func force(handle ElementHandle) {
    guard let target = handle.AttachedNodeFor(owner) else {
      return
    }
    if target.Retired {
      return
    }
    if let declaration = AccessibilityMetadata.Value(target) {
      if declaration.Hidden || declaration.Role == AccessibilityRole.None {
        return
      }
    }
    forced.Add(target)
  }

  private func appendNode(n Node, target List[AccessibilityNode], inheritedHidden bool,
    inheritedDisabled bool, suppressAutoText bool) {
      let declaration = AccessibilityMetadata.Value(n)
      let nowHidden = computeHidden(n, declaration, inheritedHidden)
      if nowHidden {
        return
      }
      if declaredRoleIsNone(declaration) {
        let disabled = inheritedDisabled || n.Disabled
        for i in 0 ... n.Children.Count {
          appendNode(n.Children[i], target, false, disabled, suppressAutoText)
        }
        return
      }
      if suppressAutoText && n.Kind == NodeKind.Text && declaration == nil {
        return
      }
      let role = resolvedRole(n, declaration)
      if role == AccessibilityRole.Auto {
        let disabled = inheritedDisabled || n.Disabled
        for i in 0 ... n.Children.Count {
          appendNode(n.Children[i], target, false, disabled, suppressAutoText)
        }
        return
      }
      let disabled = inheritedDisabled || n.Disabled
      let hasExplicitName = declaration != nil && declaration.Name != ""
      let childValues = rentChildren()
      try {
        let suppressChildText = role == AccessibilityRole.Button && !hasExplicitName
        for i in 0 ... n.Children.Count {
          appendNode(n.Children[i], childValues, false, disabled, suppressChildText)
        }
        let view = stateFor(n)
        let valueRange = declaration?.Range
        let textState = textStateFor(n)
        if view.Apply(role, declaration?.CustomRole ?? "", resolvedName(n, declaration, role),
          declaration?.Description ?? "", resolvedValue(n, declaration), valueRange?.Text ?? "",
          valueRange?.Now, valueRange?.Minimum, valueRange?.Maximum, textState.Document, textState.Start,
          textState.Length, textState.Caret, declaration?.Checked ?? AccessibilityChecked.Unspecified,
          declaration?.Selected, declaration?.Expanded, disabled, resolvedReadOnly(n, declaration),
          declaration?.Required, declaration?.Invalid, declaration?.Busy, declaration?.Level,
          declaration?.Orientation ?? AccessibilityOrientation.Unspecified, declaration?.Modal,
          resolvedMultiline(n, declaration), declaration?.MultiSelectable, declaration?.HasPopup,
          declaration?.Live ?? AccessibilityLive.Off, declaration?.Atomic, n.Focused,
          ElementHandles.BorderBox(n), resolvedActionMask(n, role, disabled, declaration)) {
            rebuildingChanged = true
          }
        if view.SetChildren(childValues) { rebuildingChanged = true }
        nodes[view.Id.Value] = n
        semanticNodes.Add(n)
        target.Add(view)
      } finally {
        returnChildren()
      }
    }

  private func stateFor(n Node) RetainedAccessibilityNode {
    if let current = AccessibilityNodeStates.Get(n) { return current }
    let value = AccessibilityNodeStates.GetOrAdd(n, AccessibilityId(nextId))
    nextId++
    return value
  }

  private func resolvedRole(n Node, declaration Accessibility?) AccessibilityRole {
    if let metadata = declaration {
      if metadata.Role != AccessibilityRole.Auto { return metadata.Role }
    }
    return switch n.Kind {
      case NodeKind.Button: AccessibilityRole.Button
      case NodeKind.Text: AccessibilityRole.Text
      case NodeKind.Entry: AccessibilityRole.TextInput
      case NodeKind.Editor: AccessibilityRole.TextEditor
      case NodeKind.Image: AccessibilityRole.Image
      case NodeKind.Container: n.Focusable || n.OnClick != nil || declaration != nil || forced.Contains(n)
      ? AccessibilityRole.Generic : AccessibilityRole.Auto
      default: declaration != nil || forced.Contains(n) ? AccessibilityRole.Generic : AccessibilityRole.Auto
    }
  }

  private func computeHidden(n Node, declaration Accessibility?, inherited bool) bool -> inherited || n.PaintInputHidden || declaration?.Hidden == true

  private func declaredRoleIsNone(declaration Accessibility?) bool {
    if let metadata = declaration { return metadata.Role == AccessibilityRole.None }
    return false
  }

  private func resolvedName(n Node, declaration Accessibility?, role AccessibilityRole) string {
    if let metadata = declaration {
      if metadata.Name != "" { return metadata.Name }
    }
    if role == AccessibilityRole.Button { return buttonName(n) }
    return ""
  }

  private func buttonName(n Node) string {
    let fingerprint = buttonNameFingerprint(n, uint64(1469598103934665603), false)
    if let cached = AccessibilityButtonNames.Get(n, fingerprint) { return cached }
    let value = descendantText(n, false)
    AccessibilityButtonNames.Set(n, fingerprint, value)
    return value
  }

  private func buttonNameFingerprint(n Node, hash uint64, inheritedHidden bool) uint64 {
    let declaration = AccessibilityMetadata.Value(n)
    let nowHidden = computeHidden(n, declaration, inheritedHidden)
    var value = accessibilityHash(hash, uint64(int32(n.Kind)))
    value = accessibilityHash(value, nowHidden ? uint64(1) : uint64(0))
    if nowHidden { return value }
    let role = declaration?.Role ?? AccessibilityRole.Auto
    value = accessibilityHash(value, uint64(int32(role)))
    if n.Kind == NodeKind.Text && n.Content != "" {
      value = accessibilityHash(value, uint64(n.Content.Length))
      for i in 0 ... n.Content.Length {
        value = accessibilityHash(value, uint64(n.Content[i]))
      }
    }
    for i in 0 ... n.Children.Count {
      value = buttonNameFingerprint(n.Children[i], value, nowHidden)
    }
    return value
  }

  private func descendantText(n Node, hidden bool) string {
    let nowHidden = hidden || n.PaintInputHidden
    if nowHidden { return "" }
    let builder = StringBuilder()
    appendNodeText(n, builder, nowHidden)
    return builder.ToString().Trim()
  }

  private func appendNodeText(n Node, builder StringBuilder, hidden bool) {
    let declaration = AccessibilityMetadata.Value(n)
    let nowHidden = computeHidden(n, declaration, hidden)
    if nowHidden {
      return
    }
    if declaredRoleIsNone(declaration) {
      for i in 0 ... n.Children.Count { appendNodeText(n.Children[i], builder, nowHidden) }
      return
    }
    if n.Kind == NodeKind.Text && n.Content != "" {
      if builder.Length > 0 { builder.Append(" ") }
      builder.Append(n.Content)
    }
    for i in 0 ... n.Children.Count { appendNodeText(n.Children[i], builder, nowHidden) }
  }

  private func resolvedValue(n Node, declaration Accessibility?) string {
    if n.Kind == NodeKind.Entry && n.Password {
      return protectedTextMask(n.Buffer)
    }
    if let metadata = declaration {
      if metadata.Value != "" { return metadata.Value }
    }
    if n.Kind == NodeKind.Text || n.Kind == NodeKind.Entry { return n.Kind == NodeKind.Text ? n.Content : n.Buffer }
    return ""
  }

  private func resolvedReadOnly(n Node, declaration Accessibility?) bool? {
    if let metadata = declaration {
      if metadata.ReadOnly != nil { return metadata.ReadOnly }
    }
    return n.Kind == NodeKind.Editor ? n.EditorReadOnly : nil
  }

  private func resolvedMultiline(n Node, declaration Accessibility?) bool? {
    if let metadata = declaration {
      if metadata.Multiline != nil { return metadata.Multiline }
    }
    if n.Kind == NodeKind.Entry { return false }
    if n.Kind == NodeKind.Editor { return true }
    return nil
  }

  private func resolvedActionMask(n Node, role AccessibilityRole, disabled bool,
    declaration Accessibility?) int32{
      if disabled { return 0 }
      var result int32
      if n.Focusable && canReceiveInput(n) { result = result | actionBit(AccessibilityAction.Focus) }
      if role == AccessibilityRole.Button || n.OnClick != nil {
        result = result | actionBit(AccessibilityAction.Activate)
      }
      if n.Kind == NodeKind.Entry || n.Kind == NodeKind.Editor {
        result = result | actionBit(AccessibilityAction.SetSelection)
        if resolvedReadOnly(n, declaration) != true { result = result | actionBit(AccessibilityAction.SetValue) }
      }
      if n.Kind == NodeKind.Editor || n.OverflowX == Overflow.Scroll || n.OverflowY == Overflow.Scroll {
        result = result | actionBit(AccessibilityAction.Scroll)
      }
      if let metadata = declaration {
        for action in metadata.RawActions { result = result | actionBit(action) }
      }
      return result
    }

  private func textStateFor(n Node) AccessibilityTextState {
    if n.Kind == NodeKind.Entry {
      let start = n.Anchor < n.Caret ? n.Anchor : n.Caret
      let end = n.Anchor < n.Caret ? n.Caret : n.Anchor
      if n.Password {
        let displayStart = protectedTextDisplayOffset(n.Buffer, start, TextAffinity.Upstream)
        let displayEnd = protectedTextDisplayOffset(n.Buffer, end, TextAffinity.Downstream)
        let displayCaret = protectedTextDisplayOffset(n.Buffer, n.Caret, n.CaretAffinity)
        return AccessibilityTextState(nil, displayStart, displayEnd - displayStart, displayCaret)
      }
      return AccessibilityTextState(nil, start, end - start, n.Caret)
    }
    if n.Kind == NodeKind.Editor {
      if let controller = n.EditorController {
        let selection = controller.Selection
        let anchor = selection.Anchor.Offset
        let active = selection.Active.Offset
        let start = anchor < active ? anchor : active
        let length = anchor < active ? active - anchor : anchor - active
        return AccessibilityTextState(controller.Document, start, length, active)
      }
    }
    return AccessibilityTextState(nil, nil, nil, nil)
  }

  private func applyRelationships() {
    for n in semanticNodes {
      guard let view = AccessibilityNodeStates.Get(n) else { continue }
      guard let relationships = AccessibilityMetadata.Value(n)?.Relationships else {
        if view.ApplyRelationships(AccessibilityEmpty.Ids, AccessibilityEmpty.Ids,
          AccessibilityEmpty.Ids, AccessibilityEmpty.Ids, AccessibilityEmpty.Ids,
          AccessibilityEmpty.Ids, nil) {
            rebuildingChanged = true
          }
        continue
      }
      if view.RelationshipsMatch(this, relationships) {
        continue
      }
      if view.ApplyRelationships(idsFor(relationships.RawLabelledBy),
        idsFor(relationships.RawDescribedBy), idsFor(relationships.RawControls),
        idsFor(relationships.RawOwns), idsFor(relationships.RawFlowTo),
        idsFor(relationships.RawErrorMessage), IdFor(relationships.ActiveDescendant)) {
          rebuildingChanged = true
        }
    }
  }

  private func idsFor(handles []ElementHandle) []AccessibilityId {
    if handles.Length == 0 { return AccessibilityEmpty.Ids }
    let result = List[AccessibilityId]()
    for handle in handles {
      if let id = IdFor(handle) { result.Add(id) }
    }
    return result.Count == 0 ? AccessibilityEmpty.Ids : result.ToArray()
  }

  internal func HasResolved(handles []ElementHandle) bool {
    for handle in handles {
      if IdFor(handle) != nil { return true }
    }
    return false
  }

  internal func IdFor(handle ElementHandle?) AccessibilityId? {
    guard let value = handle else { return nil }
    guard let target = value.AttachedNodeFor(owner) else { return nil }
    if target.Retired { return nil }
    guard let state = AccessibilityNodeStates.Get(target) else { return nil }
    return nodes.ContainsKey(state.Id.Value) ? state.Id : nil
  }

  private func rentChildren() List[AccessibilityNode] {
    if childListDepth == childLists.Count { childLists.Add(List[AccessibilityNode]()) }
    let result = childLists[childListDepth]
    childListDepth++
    result.Clear()
    return result
  }

  private func returnChildren() {
    childListDepth--
  }

  private func rebuildOwner(n Node) {
    var current Node? = n
    while current != nil {
      if let fiber = current.Fiber {
        fiber.Rebuild()
        return
      }
      current = current.Parent
    }
  }
}

private data struct AccessibilityTextState(Document TextDocument?, Start int32?, Length int32?,
  Caret int32?) { }

private func containsAction(values []AccessibilityAction, action AccessibilityAction) bool {
  for value in values {
    if value == action { return true }
  }
  return false
}

private func accessibilityHash(hash uint64, value uint64) uint64 -> (hash ^ value) * uint64(1099511628211)
