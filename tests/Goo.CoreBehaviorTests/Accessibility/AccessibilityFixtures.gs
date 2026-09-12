package Goo

import System
import System.Threading

internal func countNodes(n Node) int32 {
  var count int32 = 1
  for child in n.Children {
    count = count + countNodes(child)
  }
  return count
}

internal class AccessibilityFixtures {
  func PrimitiveAndExclusionContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityFixtureCell{}
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let tree = adapter.Tree, let root = tree.Root else { return false }
    if root.Role != AccessibilityRole.Generic || root.Children.Count != 6 { return false }
    let text = root.Children[0]
    let button = root.Children[1]
    let entry = root.Children[2]
    let image = root.Children[3]
    let flattened = root.Children[4]
    let generic = root.Children[5]
    if text.Role != AccessibilityRole.Text || text.Value != "plain" || text.Name != ""
      || button.Role != AccessibilityRole.Button || button.Name != "Save" || button.Children.Count != 0
      || entry.Role != AccessibilityRole.TextInput || entry.Value != "edit" || entry.Multiline != false
      || image.Role != AccessibilityRole.Image || image.Name != "" || flattened.Value != "kept"
      || !hasAction(generic, AccessibilityAction.Increment) || !hasAction(generic, AccessibilityAction.Scroll) {
        return false
      }
    let increment = window.PerformAccessibilityAction(generic.Id,
      AccessibilityActionRequest(AccessibilityAction.Increment))
    let scroll = window.PerformAccessibilityAction(generic.Id,
      AccessibilityActionRequest.Scroll(0.0, 0.0))
    return increment && scroll && cell.Actions == 2
  }

  func SnapshotAndSelectionContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let document = TextDocument("hello")
    let controller = TextEditorController(document)
    controller.Selection = TextSelection{
      Anchor: TextPosition{ Offset: 1, Affinity: TextAffinity.Upstream },
      Active: TextPosition{ Offset: 4, Affinity: TextAffinity.Downstream },
    }
    let window = Window{ Root: AccessibilityEditorCell(document, controller), Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let root = adapter.Tree?.Root else { return false }
    let editor = root.Role == AccessibilityRole.TextEditor ? root : root.Children[0]
    guard let snapshot = editor.TextSnapshot else { return false }
    return snapshot.Version == document.Version && snapshot.Length == 5 && editor.Value == ""
      && editor.SelectionStart == 1 && editor.SelectionLength == 3 && editor.Caret == 4
      && hasAction(editor, AccessibilityAction.Scroll)
  }

  func ValidationAndRetryContract() bool {
    var rangeRejected = false
    var actionRejected = false
    try {
      Reconciler{ Res: Resolver{} }.Mount(Text{ Accessibility: Accessibility{
        Range: AccessibilityValue{ Minimum: 3.0, Maximum: 2.0 },
      } })
    } catch (error ArgumentException) {
      rangeRejected = true
    }
    try {
      Reconciler{ Res: Resolver{} }.Mount(Text{ Accessibility: Accessibility{
        Actions: []AccessibilityAction{ AccessibilityAction.Scroll },
      } })
    } catch (error ArgumentException) {
      actionRejected = true
    }
    let adapter = AccessibilityTestAdapter{ Failures: 2 }
    let window = Window{ Root: AccessibilityFixtureCell{}, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    let firstVersion = adapter.Tree?.Version ?? -1
    window.UpdateTree()
    return rangeRejected && actionRejected && adapter.Updates == 2
      && adapter.Tree?.Version == firstVersion && window.LastAccessibilityError != nil
  }

  func RetainedIdentityAndRelationshipsContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityEquivalentCell{}
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let first = adapter.Tree, let node = first.Root else { return false }
    let firstVersion = first.Version
    let firstId = node.Id
    cell.Bump()
    window.UpdateTree()
    guard let retained = first.Root else { return false }
    if adapter.Updates != 1 || first.Version != firstVersion || retained.Id != firstId {
      return false
    }

    let localLabel = ElementHandle{}
    let relationAdapter = AccessibilityTestAdapter{}
    let relationWindow = Window{ Root: AccessibilityRelationshipCell(localLabel), Width: 200, Height: 100 }
    relationWindow.AccessibilityAdapter = relationAdapter
    relationWindow.UpdateTree()
    guard let relationRoot = relationAdapter.Tree?.Root else { return false }
    let source = relationRoot.Children[1]
    if source.Relationships.LabelledBy.Count != 1 || source.Relationships.LabelledBy[0]
    != relationRoot.Children[0].Id{
      return false
    }

    let foreignLabel = ElementHandle{}
    let otherAdapter = AccessibilityTestAdapter{}
    let otherWindow = Window{ Root: AccessibilityTargetCell(foreignLabel), Width: 200, Height: 100 }
    otherWindow.AccessibilityAdapter = otherAdapter
    otherWindow.UpdateTree()
    let crossAdapter = AccessibilityTestAdapter{}
    let crossWindow = Window{ Root: AccessibilityExternalRelationshipCell(foreignLabel), Width: 200, Height: 100 }
    crossWindow.AccessibilityAdapter = crossAdapter
    crossWindow.UpdateTree()
    guard let crossRoot = crossAdapter.Tree?.Root else { return false }
    return crossRoot.Relationships.LabelledBy.Count == 0
  }

  func FailedDiffPreservesPublishedTreeContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityTransactionalCell{}
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let prior = adapter.Tree, let priorRoot = prior.Root else { return false }
    let version = prior.Version
    let id = priorRoot.Id
    cell.Fail()
    var rejected = false
    try {
      window.UpdateTree()
    } catch (error ArgumentException) {
      rejected = true
    }
    guard let retained = prior.Root else { return false }
    return rejected && adapter.Updates == 1 && prior.Version == version && retained.Id == id
      && window.LastAccessibilityError == nil
  }

  func StateAndActionCapabilityContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityActionCell{}
    let window = Window{ Root: cell, Width: 100, Height: 40 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let tree = adapter.Tree, let root = tree.Root else { return false }
    if root.Children.Count != 3 { return false }
    let disabled = root.Children[0]
    let entry = root.Children[1]
    let scroll = root.Children[2]
    let priorVersion = tree.Version
    if !disabled.Disabled || disabled.Actions.Count != 0
      || window.PerformAccessibilityAction(disabled.Id,
        AccessibilityActionRequest(AccessibilityAction.Increment))
      || !hasAction(entry, AccessibilityAction.SetValue)
      || !hasAction(entry, AccessibilityAction.SetSelection)
      || !hasAction(scroll, AccessibilityAction.Scroll) {
        return false
      }
    if !window.PerformAccessibilityAction(entry.Id,
      AccessibilityActionRequest.SetValue("next"))
      || !window.PerformAccessibilityAction(entry.Id,
        AccessibilityActionRequest.SetSelection(1, 2))
      || !window.PerformAccessibilityAction(scroll.Id,
        AccessibilityActionRequest.Scroll(0.0, 4.0)) {
          return false
        }
    window.UpdateTree(0.1)
    if tree.Version <= priorVersion || entry.Value != "next" || entry.SelectionStart != 1
      || entry.SelectionLength != 2 || entry.Caret != 3 {
        return false
      }
    cell.HideAction = true
    cell.Rebuild()
    window.UpdateTree()
    if window.PerformAccessibilityAction(disabled.Id,
      AccessibilityActionRequest(AccessibilityAction.Increment)) {
        return false
      }
    let replacement = AccessibilityTestAdapter{}
    window.AccessibilityAdapter = replacement
    window.UpdateTree()
    return replacement.Updates == 1 && replacement.Tree == tree
  }

  func PayloadActionContract(setValue AccessibilityActionRequest,
    selection AccessibilityActionRequest, scroll AccessibilityActionRequest) bool{
      let adapter = AccessibilityTestAdapter{}
      let window = Window{ Root: AccessibilityActionCell{}, Width: 100, Height: 40 }
      window.AccessibilityAdapter = adapter
      window.UpdateTree()
      guard let root = adapter.Tree?.Root else { return false }
      let entry = root.Children[1]
      let scroller = root.Children[2]
      if !window.PerformAccessibilityAction(entry.Id, setValue)
        || !window.PerformAccessibilityAction(entry.Id, selection)
        || !window.PerformAccessibilityAction(scroller.Id, scroll) {
          return false
        }
      window.UpdateTree(0.1)
      return entry.Value == "next" && entry.SelectionStart == 1 && entry.SelectionLength == 2
        && entry.Caret == 3
    }

  func DeliveryDemandAndReplacementContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityActionCell{}
    let window = Window{ Root: cell, Width: 100, Height: 40 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    window.markFrameRendered()
    window.MarkAccessibilityDirtyForTest()
    if !window.AccessibilityHasDemandForTest() { return false }
    cell.HideAction = true
    cell.Rebuild()
    adapter.Failures = 1
    window.UpdateTree()
    if !window.AccessibilityHasDemandForTest() { return false }
    window.UpdateTree()
    window.markFrameRendered()
    if window.AccessibilityHasDemandForTest() || adapter.Updates != 3 { return false }

    let first = AccessibilityTestAdapter{}
    let replacement = AccessibilityTestAdapter{}
    let reentrant = Window{ Root: AccessibilityFixtureCell{}, Width: 100, Height: 40 }
    first.ReplacementWindow = reentrant
    first.Replacement = replacement
    reentrant.AccessibilityAdapter = first
    reentrant.UpdateTree()
    if first.Updates != 1 || replacement.Updates != 0
      || reentrant.AccessibilityAdapter != replacement{ return false }
    reentrant.UpdateTree()
    return replacement.Updates == 1
  }

  func DisplayAndVisibilityExclusionContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityExclusionCell{}
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let root = adapter.Tree?.Root else { return false }
    if root.Children.Count != 1 || root.Children[0].Value != "visible" { return false }
    cell.Show()
    window.UpdateTree()
    return root.Children.Count == 3 && root.Children[0].Value == "display"
      && root.Children[1].Value == "visibility" && root.Children[2].Value == "visible"
  }

  func FocusLayoutAndScrollContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityGeometryCell{}
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let root = adapter.Tree?.Root else { return false }
    let entry = root.Children[0]
    let scroller = root.Children[1]
    if scroller.Children.Count != 1 { return false }
    let child = scroller.Children[0]
    let version = adapter.Tree!!.Version
    let width = root.Bounds.Width
    let childY = child.Bounds.Y
    if !window.PerformAccessibilityAction(entry.Id,
      AccessibilityActionRequest(AccessibilityAction.Focus)) { return false }
    window.UpdateTree()
    if !entry.Focused { return false }
    cell.Widen()
    window.UpdateTree()
    if root.Bounds.Width <= width || adapter.Tree!!.Version <= version { return false }
    if !window.PerformAccessibilityAction(scroller.Id, AccessibilityActionRequest.Scroll(0.0, 48.0)) {
      return false
    }
    window.UpdateTree(1.0)
    return child.Bounds.Y < childY
  }

  func RetiredAndInvalidRelationshipContract() bool {
    let visible = ElementHandle{}
    let hidden = ElementHandle{}
    let flattened = ElementHandle{}
    let detached = ElementHandle{}
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilityRelationshipTargetsCell(visible, hidden, flattened, detached)
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let root = adapter.Tree?.Root else { return false }
    if root.Children.Count != 3 { return false }
    let detachedNode = root.Children[1]
    let source = root.Children[2]
    if source.Relationships.LabelledBy.Count != 2 { return false }
    cell.Detach()
    window.UpdateTree()
    if root.Children.Count != 2 { return false }
    let updatedSource = root.Children[1]
    if updatedSource.Relationships.LabelledBy.Count != 1 || updatedSource.Relationships.LabelledBy[0]
    != root.Children[0].Id || window.PerformAccessibilityAction(detachedNode.Id,
      AccessibilityActionRequest(AccessibilityAction.Focus)) {
        return false
      }
    let foreign = ElementHandle{}
    let foreignWindow = Window{ Root: AccessibilityTargetCell(foreign), Width: 100, Height: 40 }
    foreignWindow.AccessibilityAdapter = AccessibilityTestAdapter{}
    foreignWindow.UpdateTree()
    let foreignAdapter = AccessibilityTestAdapter{}
    let foreignSource = Window{ Root: AccessibilityExternalRelationshipCell(foreign), Width: 100, Height: 40 }
    foreignSource.AccessibilityAdapter = foreignAdapter
    foreignSource.UpdateTree()
    return foreignAdapter.Tree?.Root?.Relationships.LabelledBy.Count == 0
  }

  func SyntheticRootAndPrimitiveActionContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let cell = AccessibilitySyntheticRootCell{}
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let tree = adapter.Tree, let synthetic = tree.Root else { return false }
    if synthetic.Id.Value != 0 || synthetic.Children.Count != 2 { return false }
    cell.One()
    window.UpdateTree()
    guard let single = tree.Root else { return false }
    if single.Id.Value == 0 || single.Value != "first" { return false }
    cell.None()
    window.UpdateTree()
    if tree.Root != nil { return false }
    let primitives = AccessibilityTestAdapter{}
    let primitiveWindow = Window{ Root: AccessibilityPrimitiveActionCell{}, Width: 100, Height: 40 }
    primitiveWindow.AccessibilityAdapter = primitives
    primitiveWindow.UpdateTree()
    guard let primitiveRoot = primitives.Tree?.Root else { return false }
    return primitiveRoot.Id.Value == 0 && hasAction(primitiveRoot.Children[0], AccessibilityAction.Activate)
      && primitiveRoot.Children[1].Name == ""
  }

  func DeclaredActionFailureContract() bool {
    let adapter = AccessibilityTestAdapter{}
    let window = Window{ Root: AccessibilityActionFailureCell{}, Width: 100, Height: 40 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let root = adapter.Tree?.Root else { return false }
    if root.Children.Count != 2 || window.PerformAccessibilityAction(root.Children[0].Id,
      AccessibilityActionRequest(AccessibilityAction.Select)) { return false }
    var threw bool
    try {
      window.PerformAccessibilityAction(root.Children[1].Id,
        AccessibilityActionRequest(AccessibilityAction.Select))
    } catch (error InvalidOperationException) {
      threw = true
    }
    window.UpdateTree()
    return threw && adapter.Updates == 1 && window.LastAccessibilityError == nil
  }

  func AdapterDeliveryThreadContract() bool {
    let adapter = AccessibilityThreadAdapter{}
    let expected = Thread.CurrentThread.ManagedThreadId
    let window = Window{ Root: AccessibilityFixtureCell{}, Width: 100, Height: 40 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    return adapter.ThreadId == expected
  }
}

internal class AccessibilityTestAdapter : AccessibilityAdapter {
  internal var Tree AccessibilityTree?
  internal var Updates int32
  internal var Failures int32
  internal var ReplacementWindow Window?
  internal var Replacement AccessibilityAdapter?

  public func Update(tree AccessibilityTree) {
    Tree = tree
    Updates++
    if let window = ReplacementWindow {
      ReplacementWindow = nil
      window.AccessibilityAdapter = Replacement
    }
    if Failures > 0 {
      Failures--
      throw InvalidOperationException("Synthetic accessibility delivery failure")
    }
  }
}

internal class AccessibilityThreadAdapter : AccessibilityAdapter {
  internal var ThreadId int32 = -1

  public func Update(tree AccessibilityTree) {
    ThreadId = Thread.CurrentThread.ManagedThreadId
  }
}

public partial class Window {
  internal func AccessibilityHasDemandForTest() bool -> hasDemand()

  internal func AccessibilityManagerHasDemandForTest() bool -> accessibility?.HasDemand == true

  internal func MarkAccessibilityDirtyForTest() {
    accessibility?.MarkDirty()
  }

  internal func DrainQueuedInputForTest() bool {
    let changed = input.Drain(node, resolver, timeS, nil)
    if changed {
      accessibility?.MarkDirty()
      resolver.VisualDirty = true
    }
    return changed
  }

  internal func QueueAccessibilityWheelForTest(x float32, y float32, dx float32, dy float32) {
    input.QueuePointerWheel(x, y, dx, dy)
  }

  internal func QueueAccessibilityMoveForTest(x float32, y float32) {
    input.QueuePointerMove(x, y)
  }

  internal func QueueAccessibilityTextForTest(value string) {
    input.QueueText(value)
  }

  internal func QueueAccessibilityKeyForTest(key Key) {
    input.QueueKeyPress(key, KeyModifiers{})
  }

  internal func AccessibilityClickForTest(x float32, y float32) bool {
    let changed = input.HandleClick(node, x, y)
    if changed {
      accessibility?.MarkDirty()
      resolver.VisualDirty = true
    }
    return changed
  }
}

internal class AccessibilityFixtureCell : Cell {
  internal var Actions int32

  override func Build() Blob -> Container { Children: {
    Text{ Content: "plain" },
    Button{ Children: { Text{ Content: "Save" } } },
    TextEntry{ Value: "edit" },
    Image{},
    Image{ Accessibility: Accessibility{ Role: AccessibilityRole.None } },
    Container{ Accessibility: Accessibility{ Role: AccessibilityRole.None }, Children: {
      Text{ Content: "kept" },
    } },
    Container{ Accessibility: Accessibility{ Hidden: true }, Children: {
      Text{ Content: "hidden" },
    } },
    Container{ Accessibility: Accessibility{
      Role: AccessibilityRole.Generic,
      Actions: []AccessibilityAction{ AccessibilityAction.Increment, AccessibilityAction.Scroll },
      OnAction: func(request AccessibilityActionRequest) bool {
        Actions++
        return request.Action == AccessibilityAction.Increment || request.Action == AccessibilityAction.Scroll
      },
    } },
  } }
}

internal class AccessibilityEditorCell(document TextDocument, controller TextEditorController) : Cell {
  override func Build() Blob -> TextEditor(controller) {}
}

internal class AccessibilityEquivalentCell : Cell {
  internal var Revision int32

  init() { Revision = 0 }

  func Bump() {
    Revision++
    Rebuild()
  }

  override func Build() Blob {
    let revision = Revision
    return Text{ Content: revision >= 0 ? "same" : "unreachable", Accessibility: Accessibility{
      Role: AccessibilityRole.Text, Name: "same",
    } }
  }
}

internal class AccessibilityRelationshipCell(label ElementHandle) : Cell {
  override func Build() Blob -> Container { Children: {
    Text{ Handle: label, Content: "label" },
    Container{ Accessibility: Accessibility{
      Role: AccessibilityRole.Generic,
      Relationships: AccessibilityRelationships{ LabelledBy: []ElementHandle{ label } },
    } },
  } }
}

internal class AccessibilityTargetCell(label ElementHandle) : Cell {
  override func Build() Blob -> Text { Handle: label, Content: "other" }
}

internal class AccessibilityExternalRelationshipCell(label ElementHandle) : Cell {
  override func Build() Blob -> Container { Accessibility: Accessibility{
    Role: AccessibilityRole.Generic,
    Relationships: AccessibilityRelationships{ LabelledBy: []ElementHandle{ label } },
  } }
}

internal class AccessibilityTransactionalCell : Cell {
  internal var Invalid bool

  init() { Invalid = false }

  func Fail() {
    Invalid = true
    Rebuild()
  }

  override func Build() Blob -> Text { Content: "stable", Accessibility: Invalid ? Accessibility{
    Range: AccessibilityValue{ Minimum: 3.0, Maximum: 2.0 },
  } : Accessibility{ Name: "stable" } }
}

internal class AccessibilityActionCell : Cell {
  internal var HideAction bool

  init() { HideAction = false }

  override func Build() Blob -> Container { Children: {
    Container{ Disabled: true, Accessibility: Accessibility{ Role: AccessibilityRole.None }, Children: {
      Container{ Accessibility: Accessibility{ Role: AccessibilityRole.Generic,
        Hidden: HideAction,
        Actions: []AccessibilityAction{ AccessibilityAction.Increment },
        OnAction: func(request AccessibilityActionRequest) bool { return true },
      } },
    } },
    TextEntry{ Value: "start" },
    Container{ Accessibility: Accessibility{ Role: AccessibilityRole.Generic }, Height: 8,
      OverflowY: Overflow.Scroll, Children: {
        Text{ Content: "scroll content" },
      } },
  } }
}

internal class AccessibilityExclusionCell : Cell {
  private var visible bool

  init() { visible = false }

  func Show() {
    visible = true
    Rebuild()
  }

  override func Build() Blob -> Container { Accessibility: Accessibility{ Role: AccessibilityRole.Generic }, Children: {
    Text{ Content: "display", Display: visible ? Display.Flex : Display.None },
    Text{ Content: "visibility", Visibility: visible ? Visibility.Visible : Visibility.Hidden },
    Text{ Content: "visible" },
  } }
}

internal class AccessibilityGeometryCell : Cell {
  private var wide bool

  init() { wide = false }

  func Widen() {
    wide = true
    Rebuild()
  }

  override func Build() Blob -> Container { Width: wide ? 160.0 : 80.0, Accessibility: Accessibility{
    Role: AccessibilityRole.Generic,
  }, Children: {
    TextEntry{ Value: "entry" },
    Container{ Height: 12.0, OverflowY: Overflow.Scroll, Accessibility: Accessibility{
      Role: AccessibilityRole.Generic,
    }, Children: {
      Container{ Height: 100.0, Accessibility: Accessibility{ Role: AccessibilityRole.Generic } },
    } },
  } }
}

internal class AccessibilityRelationshipTargetsCell : Cell {
  private let visible ElementHandle
  private let hidden ElementHandle
  private let flattened ElementHandle
  private let detached ElementHandle
  private var attached bool

  init(visible ElementHandle, hidden ElementHandle, flattened ElementHandle, detached ElementHandle) {
    this.visible = visible
    this.hidden = hidden
    this.flattened = flattened
    this.detached = detached
    attached = true
  }

  func Detach() {
    attached = false
    Rebuild()
  }

  override func Build() Blob {
    let root = Container{ Accessibility: Accessibility{ Role: AccessibilityRole.Generic } }
    root.Children.Add(Text{ Handle: visible, Content: "visible" })
    root.Children.Add(Text{ Handle: hidden, Content: "hidden", Accessibility: Accessibility{ Hidden: true } })
    root.Children.Add(Image{ Accessibility: Accessibility{ Role: AccessibilityRole.None },
      Handle: flattened })
    if attached {
      root.Children.Add(Text{ Handle: detached, Content: "detached", Focusable: true })
    }
    root.Children.Add(Container{ Accessibility: Accessibility{
      Role: AccessibilityRole.Generic,
      Relationships: AccessibilityRelationships{ LabelledBy: []ElementHandle{
        visible, hidden, flattened, detached,
      } },
    } })
    return root
  }
}

internal class AccessibilitySyntheticRootCell : Cell {
  private var stage int32

  init() { stage = 0 }

  func One() {
    stage = 1
    Rebuild()
  }
  func None() {
    stage = 2
    Rebuild()
  }

  override func Build() Blob {
    let root = Container{ Accessibility: Accessibility{ Role: AccessibilityRole.None } }
    if stage != 2 { root.Children.Add(Text{ Content: "first" }) }
    if stage == 0 { root.Children.Add(Text{ Content: "second" }) }
    return root
  }
}

internal class AccessibilityPrimitiveActionCell : Cell, IDisposable {
  private let image ImageSource = ImageSource(1, 1, [4]uint8)
  public func Dispose() { image.Dispose() }
  override func Build() Blob -> Container { Accessibility: Accessibility{ Role: AccessibilityRole.None }, Children: {
    Button{ Children: { Text{ Content: "Run" } } },
    Image{ Path: "images/nonempty-name-must-not-leak.png", Source: image },
  } }
}

internal class AccessibilityActionFailureCell : Cell {
  override func Build() Blob -> Container { Accessibility: Accessibility{ Role: AccessibilityRole.None }, Children: {
    Container{ Accessibility: Accessibility{
      Role: AccessibilityRole.Generic,
      Actions: []AccessibilityAction{ AccessibilityAction.Select },
      OnAction: func(request AccessibilityActionRequest) bool { return false },
    } },
    Container{ Accessibility: Accessibility{
      Role: AccessibilityRole.Generic,
      Actions: []AccessibilityAction{ AccessibilityAction.Select },
      OnAction: func(request AccessibilityActionRequest) bool {
        throw InvalidOperationException("Synthetic declared accessibility action failure")
      },
    } },
  } }
}

internal class AccessibilityPerformanceFixtures {
  private var optOut Window?
  private var optIn Window?
  private var adapter AccessibilityTestAdapter?

  func PrepareOptOut() {
    let window = Window{ Root: AccessibilityOptOutCell{}, Width: 200, Height: 100 }
    window.UpdateTree()
    window.UpdateTree()
    window.markFrameRendered()
    optOut = window
  }

  func StepOptOut() int32 {
    guard let window = optOut else { return -1 }
    window.UpdateTree()
    return window.Tree?.Children.Count ?? -1
  }

  func OptOutHasNoDemand() bool {
    guard let window = optOut else { return false }
    return !window.AccessibilityHasDemandForTest()
  }

  func MountAndDisposeOptOut() int32 {
    let window = Window{ Root: AccessibilityOptOutCell{}, Width: 200, Height: 100 }
    window.UpdateTree()
    guard let root = window.Tree else { return -1 }
    let count = root.Children.Count
    TextLayouts.DisposeTree(root)
    return count
  }

  func PrepareOptIn() {
    let target = AccessibilityTestAdapter{}
    let window = Window{ Root: AccessibilityOptInCell{}, Width: 200, Height: 100 }
    window.AccessibilityAdapter = target
    window.UpdateTree()
    window.UpdateTree()
    optIn = window
    adapter = target
  }

  func StepOptIn() int32 {
    guard let window = optIn else { return -1 }
    window.UpdateTree()
    return adapter?.Updates ?? -1
  }

  func ForceEquivalentSemanticRebuild() int32 {
    guard let window = optIn else { return -1 }
    window.MarkAccessibilityDirtyForTest()
    window.UpdateTree()
    return adapter?.Updates ?? -1
  }
}

internal class AccessibilityScaleFixtures {
  private var window Window?
  private var root AccessibilityScaleRootCell?
  private var adapter AccessibilityScaleAdapter?
  private var hoverOnTarget bool
  private var focusActive bool
  private var insertText bool
  private var scrollDown bool
  private var semanticDemandBeforePublish bool

  func Prepare() int32 -> prepare(true)

  func PrepareWithoutAdapter() int32 -> prepare(false)

  private func prepare(withAdapter bool) int32 {
    let scaleRoot = AccessibilityScaleRootCell{}
    let scaleAdapter = AccessibilityScaleAdapter{}
    let scaleWindow = Window{ Root: scaleRoot, Width: 640, Height: 640 }
    if withAdapter { scaleWindow.AccessibilityAdapter = scaleAdapter }
    scaleWindow.UpdateTree()
    if !scaleRoot.Entry.Focus() { return -1 }
    scaleWindow.UpdateTree()
    scaleWindow.markFrameRendered()
    window = scaleWindow
    root = scaleRoot
    adapter = withAdapter ? scaleAdapter : nil
    hoverOnTarget = false
    focusActive = true
    insertText = true
    scrollDown = false
    semanticDemandBeforePublish = false
    return if let tree = scaleWindow.Tree { countNodes(tree) } else { -1 }
  }

  func AdapterUpdates() int32 -> adapter?.Updates ?? -1

  func TreeVersion() int64 -> adapter?.Tree?.Version ?? -1

  func HasSemanticDemand() bool -> window?.AccessibilityManagerHasDemandForTest() ?? false

  func SemanticDemandBeforePublish() bool -> semanticDemandBeforePublish

  func RenderPending() bool -> window?.RenderPending() ?? true

  func StepUnchanged() bool {
    guard let scaleWindow = window else { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    scaleWindow.UpdateTree()
    return !scaleWindow.AccessibilityManagerHasDemandForTest() && !scaleWindow.RenderPending()
  }

  func StepNoOpWheel() bool {
    guard let scaleWindow = window else { return false }
    scaleWindow.QueueAccessibilityWheelForTest(4.0F, 4.0F, 0.0F, 1.0F)
    if scaleWindow.DrainQueuedInputForTest() { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if semanticDemandBeforePublish || scaleWindow.RenderPending() { return false }
    scaleWindow.UpdateTree()
    return !scaleWindow.AccessibilityManagerHasDemandForTest() && !scaleWindow.RenderPending()
  }

  func StepHoverBoundary() bool {
    guard let scaleWindow = window else { return false }
    hoverOnTarget = !hoverOnTarget
    let y = hoverOnTarget ? 4.0F : 28.0F
    scaleWindow.QueueAccessibilityMoveForTest(4.0F, y)
    if !scaleWindow.DrainQueuedInputForTest() { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if !semanticDemandBeforePublish { return false }
    scaleWindow.UpdateTree()
    scaleWindow.markFrameRendered()
    return !scaleWindow.AccessibilityManagerHasDemandForTest()
  }

  func StepFocusChange() bool {
    guard let scaleWindow = window, let scaleRoot = root else { return false }
    focusActive = !focusActive
    let changed = focusActive ? scaleRoot.Entry.Focus() : scaleRoot.Entry.Blur()
    if !changed { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if !semanticDemandBeforePublish { return false }
    scaleWindow.UpdateTree()
    scaleWindow.markFrameRendered()
    return !scaleWindow.AccessibilityManagerHasDemandForTest()
  }

  func StepTextEdit() bool {
    guard let scaleWindow = window, let scaleRoot = root else { return false }
    if !editText(scaleWindow, scaleRoot) { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if !semanticDemandBeforePublish { return false }
    scaleWindow.UpdateTree()
    scaleWindow.markFrameRendered()
    return !scaleWindow.AccessibilityManagerHasDemandForTest()
  }

  func StepTextEditWithoutAdapter() bool {
    guard let scaleWindow = window, let scaleRoot = root else { return false }
    if !editText(scaleWindow, scaleRoot) { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if semanticDemandBeforePublish { return false }
    scaleWindow.UpdateTree()
    scaleWindow.markFrameRendered()
    return !scaleWindow.AccessibilityManagerHasDemandForTest()
  }

  func StepScroll() bool {
    guard let scaleWindow = window, let scaleRoot = root else { return false }
    scrollDown = !scrollDown
    if !scaleRoot.Scroll.ScrollTo(0.0, scrollDown ? 48.0 : 0.0) { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if !semanticDemandBeforePublish { return false }
    scaleWindow.UpdateTree(1.0)
    scaleWindow.markFrameRendered()
    return !scaleWindow.AccessibilityManagerHasDemandForTest()
  }

  func StepSemanticDeclarationChange() bool {
    guard let scaleWindow = window else { return false }
    if !scaleWindow.AccessibilityClickForTest(4.0F, 84.0F) { return false }
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if !semanticDemandBeforePublish { return false }
    scaleWindow.UpdateTree()
    scaleWindow.markFrameRendered()
    return !scaleWindow.AccessibilityManagerHasDemandForTest()
  }

  func StepEquivalentSemanticRebuild() bool {
    guard let scaleWindow = window else { return false }
    let updates = AdapterUpdates()
    let version = TreeVersion()
    scaleWindow.MarkAccessibilityDirtyForTest()
    semanticDemandBeforePublish = scaleWindow.AccessibilityManagerHasDemandForTest()
    if !semanticDemandBeforePublish { return false }
    scaleWindow.UpdateTree()
    return !scaleWindow.AccessibilityManagerHasDemandForTest() && AdapterUpdates() == updates
      && TreeVersion() == version && !scaleWindow.RenderPending()
  }

  func StepAdapterDeliveryOnly() bool {
    guard let scaleAdapter = adapter, let tree = scaleAdapter.Tree else { return false }
    semanticDemandBeforePublish = false
    let version = tree.Version
    let updates = scaleAdapter.Updates
    scaleAdapter.Update(tree)
    return scaleAdapter.Updates == updates + 1 && tree.Version == version
  }

  private func editText(scaleWindow Window, scaleRoot AccessibilityScaleRootCell) bool {
    if !scaleRoot.Entry.Focus() && !focusActive { return false }
    focusActive = true
    if insertText {
      scaleWindow.QueueAccessibilityTextForTest("x")
    } else {
      scaleWindow.QueueAccessibilityKeyForTest(Key.Backspace)
    }
    insertText = !insertText
    return scaleWindow.DrainQueuedInputForTest()
  }
}

internal class AccessibilityScaleAdapter : AccessibilityAdapter {
  internal var Tree AccessibilityTree?
  internal var Updates int32

  public func Update(tree AccessibilityTree) {
    Tree = tree
    Updates++
  }
}

internal class AccessibilityScaleRootCell : Cell {
  internal let Entry ElementHandle
  internal let Scroll ElementHandle

  init() {
    Entry = ElementHandle{}
    Scroll = ElementHandle{}
  }

  override func Build() Blob {
    let result = Container{
      Width: 640.0,
      Height: 640.0,
      FlexDirection: FlexDirection.Column,
      Accessibility: Accessibility{ Role: AccessibilityRole.Generic, Name: "scale root" },
    }
    result.Children.Add(Cell.Mount[AccessibilityScaleHoverCell]("hover", nil))
    result.Children.Add(Cell.Mount[AccessibilityScaleEntryCell]("entry",
      (c AccessibilityScaleEntryCell) -> { c.Handle = Entry }))
    result.Children.Add(Cell.Mount[AccessibilityScaleScrollCell]("scroll",
      (c AccessibilityScaleScrollCell) -> { c.Handle = Scroll }))
    result.Children.Add(Cell.Mount[AccessibilityScaleSemanticCell]("semantic", nil))
    for i in 0 ... 995 {
      result.Children.Add(Cell.Mount[AccessibilityScaleStaticCell]("static-$i", nil))
    }
    return result
  }
}

internal class AccessibilityScaleHoverCell : Cell {
  override func Build() Blob -> Container {
    Width: 96.0,
    Height: 24.0,
    HitTestSelf: true,
    Accessibility: Accessibility{ Role: AccessibilityRole.Generic, Name: "hover target" },
  }
}

internal class AccessibilityScaleEntryCell : Cell {
  internal var Handle ElementHandle?

  override func Build() Blob -> TextEntry {
    Width: 96.0,
    Height: 24.0,
    Handle: Handle,
    Value: "seed",
  }
}

internal class AccessibilityScaleScrollCell : Cell {
  internal var Handle ElementHandle?

  override func Build() Blob -> Container {
    Width: 96.0,
    Height: 32.0,
    OverflowY: Overflow.Scroll,
    Handle: Handle,
    Accessibility: Accessibility{ Role: AccessibilityRole.Generic, Name: "scroll target" },
    Children: {
      Container{
        Height: 96.0,
        Accessibility: Accessibility{ Role: AccessibilityRole.Generic, Name: "scroll content" },
      },
    },
  }
}

internal class AccessibilityScaleSemanticCell : Cell {
  private var alternate bool

  override func Build() Blob {
    let name = alternate ? "semantic alternate" : "semantic primary"
    return Container{
      Width: 96.0,
      Height: 24.0,
      Accessibility: Accessibility{ Role: AccessibilityRole.Generic, Name: name },
      OnClick: () -> { alternate = !alternate },
    }
  }
}

internal class AccessibilityScaleStaticCell : Cell {
  override func Build() Blob -> Text { Content: "static semantic leaf" }
}

internal class AccessibilityOptOutCell : Cell {
  override func Build() Blob -> Container { Children: {
    Button{ Children: { Text{ Content: "static" } } },
    Text{ Content: "content" },
  } }
}

internal class AccessibilityOptInCell : Cell {
  private let label ElementHandle

  init() { label = ElementHandle{} }

  override func Build() Blob -> Container { Accessibility: Accessibility{ Role: AccessibilityRole.Generic }, Children: {
    Button{ Children: { Text{ Content: "static button name" } } },
    Text{ Handle: label, Content: "label" },
    Container{ Accessibility: Accessibility{
      Role: AccessibilityRole.Generic,
      Relationships: AccessibilityRelationships{ LabelledBy: []ElementHandle{ label } },
    } },
  } }
}

private func hasAction(node AccessibilityNode, action AccessibilityAction) bool {
  for value in node.Actions {
    if value == action { return true }
  }
  return false
}
