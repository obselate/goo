package Goo

import System
import System.Collections.Generic

internal class TreeFixtures {
  func TextRangeStylesFreezeAtHandOffContract() bool {
    for spans in []bool{false, true} {
      let style = Style{Color: Color.Black}
      let text = spans ? Text(TextSpan("text", style))
        : Text{Content: "text", StyleRanges: []TextStyleRange{TextStyleRange(TextRange(0, 4), style)}}
      let node = Reconciler{Res: Resolver{}}.Mount(text)
      try {
        try { style.Color = Color.White }
        catch (error InvalidOperationException) {
          if !error.Message.Contains("Text") { return false }
          continue
        }
        return false
      } finally { NodeLifecycle.DisposeTree(node) }
    }
    let source = Style{Color: Color.Black}
    let fragment = Goo.RichText.RichTextFragment("text",
      []TextStyleSpan{TextStyleSpan("style", TextRange(0, 4), source)})
    source.Width = 10
    let copy = fragment.Styles[0].Style
    let node = Reconciler{Res: Resolver{}}.Mount(Text(TextSpan(fragment.Text, copy)))
    try {
      source.Color = Color.White
      try { copy.Color = Color.White }
      catch (_ InvalidOperationException) { return true }
      return false
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func FrozenChildrenCanInitializeMutableContainersContract() bool {
    for empty in []bool{false, true} {
      let children = List[Blob]()
      if !empty { children.Add(Text("before")) }
      let declaration = Container{Children: children}
      let node = Reconciler{Res: Resolver{}}.Mount(declaration)
      try {
        if !declaration.Children.IsReadOnly { return false }
        let copy = Container{Children: declaration.Children}
        copy.Add(Text("after"))
        if copy.Children.Count != children.Count + 1 || declaration.Children.Count != children.Count { return false }
      } finally { NodeLifecycle.DisposeTree(node) }
    }
    return true
  }

  func SizedReadEntryFailureRestoresContextContract() bool {
    let owner = Cell()
    let previous = ContextEnvironment.Enter(ContextEnvironment{CallbackCell: owner})
    using let state = SizedNodeState(SizedBlob(_ -> Text("unused")), nil, nil, nil, nil)
    state.Reads.Dispose()
    try {
      try { state.Build(LayoutSize(10, 10)) }
      catch (_ InvalidOperationException) { return Text("after").CallbackOwner == owner }
      return false
    } finally { ContextEnvironment.Current = previous }
  }

  func BuildReturnFreezesBeforeNestedCellContract() bool {
    let cell = FreezeBuildReturnCell()
    let node = Reconciler{Res: Resolver{}}.MountRoot(cell)
    try { return cell.Rejected && cell.Declaration?.Key == nil }
    finally { NodeLifecycle.DisposeTree(node) }
  }

  func InputOptionsFreezeAtHandOffContract() bool {
    let hints = []string{"before"}
    let options = TextInputOptions{AutofillHints: hints}
    let view = options.AutofillHints
    let node = Reconciler{Res: Resolver{}}.Mount(TextEntry{InputOptions: options})
    try {
      hints[0] = "after"
      view[0] = "readback"
      if options.AutofillHints[0] != "before" { return false }
      try { options.Purpose = InputPurpose.Email } catch (error InvalidOperationException) {
        return error.Message.Contains("TextEntry") && error.Message.Contains("modified after it was returned to Goo")
      }
      return false
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func ScrollbarDeclarationsFreezeAtHandOffContract() bool {
    let content = Text("track")
    let scrollbar = Scrollbar{Track: Container(){content}, Thumb: Container{}}
    let node = Reconciler{Res: Resolver{}}.Mount(Container{ScrollbarY: scrollbar})
    try {
      let changes = []Action{() -> { scrollbar.Thickness = 8 }, () -> { content.Content = "changed" },
        () -> scrollbar.Thumb!!.Add(Text("extra"))}
      for change in changes {
        var rejected = false
        try { change() } catch (error InvalidOperationException) {
          rejected = error.Message.Contains("modified after it was returned to Goo")
        }
        if !rejected { return false }
      }
      return true
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func VectorStrokeFreezeAtHandOffContract() bool {
    for kind in 0 ... 3 {
      let stroke = VectorStroke(1, Color.Black)
      var node Node?
      if kind == 0 { node = Reconciler{Res: Resolver{}}.Mount(Shape{Stroke: stroke}) }
      else if kind == 1 { let vector = VectorNode(VectorPath.Empty, VectorNodeStyle{Stroke: stroke}) }
      else { let vector = VectorNode(VectorPath.Empty, VectorNodeStyle{Stroke: stroke}, []VectorNode{}) }
      try {
        for change in []Action{() -> { stroke.Cap = StrokeCap.Round }, () -> { stroke.Join = StrokeJoin.Bevel },
          () -> { stroke.MiterLimit = 2 }, () -> { stroke.Dashes = nil },
          () -> { stroke.VectorEffect = VectorEffect.NonScalingStroke }} {
          var rejected = false
          try { change() } catch (error InvalidOperationException) {
            rejected = error.Message == "VectorStroke modified after it was returned to Goo"
          }
          if !rejected { return false }
        }
      } finally { if let node = node { NodeLifecycle.DisposeTree(node) } }
    }
    return true
  }
  func RetainedImageBranchesFreezeAtHandOffContract() bool {
    let placeholder = Text("pending")
    let fallback = Text("failed")
    let image = Image{Placeholder: Container(){placeholder}, Fallback: Container(){fallback}}
    let node = Reconciler{Res: Resolver{}}.Mount(image)
    try {
      for content in []Text{placeholder, fallback} {
        var rejected = false
        try { content.Content = "changed" } catch (error InvalidOperationException) {
          rejected = error.Message.Contains("Text") && error.Message.Contains("modified after it was returned to Goo")
        }
        if !rejected { return false }
      }
      return true
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func OverlayDeclarationsFreezeAtHandOffContract() bool {
    let scopeOptions = FocusScopeOptions{}
    let portal = Portal{FocusScope: scopeOptions, Text("content")}
    let node = Reconciler{Res: Resolver{}}.Mount(portal)
    try {
      let changes = []Action{() -> { scopeOptions.Modal = true }, () -> { portal.Scrim = Color.Black },
        () -> { portal.FocusScope = nil }, () -> portal.Add(Text("extra"))}
      for change in changes {
        var rejected = false
        try { change() } catch (error InvalidOperationException) {
          rejected = error.Message.Contains("Portal") && error.Message.Contains("modified after it was returned to Goo")
        }
        if !rejected { return false }
      }
      return true
    } finally { NodeLifecycle.DisposeTree(node) }
  }
  func BlobAssignmentAfterHandOffContract() bool {
    let blob = Text("before")
    let node = Reconciler{Res: Resolver{}}.Mount(blob)
    try {
      try { blob.Content = "after" } catch (error InvalidOperationException) {
        return error.Message.Contains("Text") && error.Message.Contains("modified after it was returned to Goo")
          && node.Content == "before"
      }
      return false
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func AccessibilityAssignmentAfterHandOffContract() bool {
    let declaration = Accessibility{Name: "before", Range: AccessibilityValue{Now: 1},
      Relationships: AccessibilityRelationships{}}
    let blob = Container{Accessibility: declaration}
    let node = Reconciler{Res: Resolver{}}.Mount(blob)
    try {
      let changes = []Action{() -> { declaration.Name = "after" },
        () -> { declaration.Range!!.Now = 2 },
        () -> { declaration.Relationships!!.ActiveDescendant = ElementHandle() }}
      for change in changes {
        var rejected = false
        try { change() } catch (error InvalidOperationException) {
          rejected = error.Message.Contains("Container") && error.Message.Contains("modified after it was returned to Goo")
        }
        if !rejected { return false }
      }
      return declaration.Name == "before" && declaration.Range!!.Now == 1
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func ChildrenMutationAfterHandOffContract() bool {
    let blob = Container(){Text("before")}
    let node = Reconciler{Res: Resolver{}}.Mount(blob)
    try {
      let changes = []Action{() -> blob.Add(Text("after")), () -> blob.Children.Add(Text("after")),
        () -> blob.Children.Clear(), () -> blob.Children.RemoveAt(0),
        () -> blob.Children.Insert(0, Text("after")), () -> { blob.Children[0] = Text("after") }}
      for change in changes {
        var rejected = false
        try { change() } catch (error InvalidOperationException) {
          rejected = error.Message.Contains("Container") && error.Message.Contains("modified after it was returned to Goo")
        }
        if !rejected { return false }
      }
      return node.Children.Count == 1 && node.Children[0].Content == "before"
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func ChildrenConstructionBeforeHandOffContract() bool {
    let blob = Row(){Text("brace")}
    blob.Add(Text("add"))
    blob.Children.Add(Text("list"))
    let node = Reconciler{Res: Resolver{}}.Mount(blob)
    try {
      return node.Children.Count == 3 && node.Children[0].Content == "brace"
        && node.Children[1].Content == "add" && node.Children[2].Content == "list"
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func SharedChildrenCopiedAtHandOffContract() bool {
    for kind in 0 ... 4 {
      let children = List[Blob](){Text("before")}
      let blob Blob = switch kind {
        case 0: Container{Children: children}
        case 1: Row{Children: children}
        case 2: Column{Children: children}
        case _: Button{Children: children}
      }
      let reconciler = Reconciler{Res: Resolver{}}
      let node = reconciler.Mount(blob)
      try {
        children[0] = Text("after")
        children.Add(Text("extra"))
        reconciler.Diff(node, blob)
        if node.Children.Count != 1 || node.Children[0].Content != "before" { return false }
      } finally { NodeLifecycle.DisposeTree(node) }
    }
    let owner = Container(){Text("before")}
    let blob = Container{Children: owner.Children}
    let reconciler = Reconciler{Res: Resolver{}}
    let node = reconciler.Mount(blob)
    try {
      owner.Add(Text("after"))
      reconciler.Diff(node, blob)
      return node.Children.Count == 1 && node.Children[0].Content == "before"
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func EachFrozenKeylessBlobContract() bool {
    let blob = Text("frozen")
    let reconciler = Reconciler{Res: Resolver{}}
    let node = reconciler.Mount(blob)
    var list Node?
    try {
      let children = Each([]string{"key"}, item -> item, item -> blob)
      list = reconciler.Mount(Container{...children})
      return blob.Key == nil && list.Children.Count == 1
        && list.Children[0].Key == "key" && list.Children[0].Content == "frozen"
    } finally {
      if let root = list { NodeLifecycle.DisposeTree(root) }
      NodeLifecycle.DisposeTree(node)
    }
  }

  func SizedStateAndContextContract() bool {
    let previous = StateVerification.Override
    StateVerification.Enabled = false
    SizedFixtureProbe.OwnerBuilds = 0
    SizedFixtureProbe.ContentBuilds = 0
    let cell = SizedStateFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    SizedFixtureProbe.Context.Set(window, 10)
    try {
      window.UpdateTree()
      let root = window.Tree!!
      let sibling = root.Children[0]
      let sized = root.Children[1]
      let content = sized.Children[0]
      cell.Value.Value = 1
      window.UpdateTree()
      if SizedFixtureProbe.OwnerBuilds != 1 || SizedFixtureProbe.ContentBuilds != 2
        || sized.Children[0] != content || root.Children[0] != sibling
        || content.Children[0].Content != "1:10" { return false }
      SizedFixtureProbe.Context.Set(window, 11)
      window.UpdateTree()
      if SizedFixtureProbe.OwnerBuilds != 1 || SizedFixtureProbe.ContentBuilds != 3
        || content.Children[0].Content != "1:11" { return false }
      cell.UseOther.Value = true
      window.UpdateTree()
      let builds = SizedFixtureProbe.ContentBuilds
      cell.Value.Value = 2
      window.UpdateTree()
      if SizedFixtureProbe.ContentBuilds != builds { return false }
      cell.Other.Value = 7
      window.UpdateTree()
      return SizedFixtureProbe.ContentBuilds == builds + 1 && content.Children[0].Content == "7:11"
        && !sized.RetainedSizedState!!.Reads.StateChanged
    } finally {
      window.Close()
      StateVerification.Override = previous
    }
  }

  func SizedCallbackOwnershipAndVerificationContract() bool {
    let previous = StateVerification.Override
    try {
      StateVerification.Enabled = true
      for mode in []int32{0, 1, 2} {
        SizedFixtureProbe.Mode = 0
        SizedFixtureProbe.Inside = 0
        SizedFixtureProbe.Outside = 0
        let cell = SizedVerificationFixtureCell()
        let window = Window{Root: cell, Size: LayoutSize(200, 100)}
        try {
          window.UpdateTree()
          window.PlatformInput.PointerMove(0, PointerDevice.Mouse, 10, 30, KeyModifiers.None, 0)
          window.UpdateTree()
          let sized = window.Tree!!.Children[1]
          if sized.Children[0].Children[0].Content != "1:0" || cell.stateChanged
            || sized.RetainedSizedState!!.Reads.StateChanged { return false }
          if mode == 0 { continue }
          SizedFixtureProbe.Mode = mode
          var rejected = false
          try {
            window.PlatformInput.PointerMove(0, PointerDevice.Mouse, 11, 30, KeyModifiers.None, 0)
            window.UpdateTree()
          } catch (error InvalidOperationException) {
            rejected = error.Message.Contains("SizedVerificationFixtureCell")
              && error.Message.Contains("without a tracked State write")
          }
          if !rejected { return false }
        } finally { window.Close() }
      }
      return true
    } finally { StateVerification.Override = previous }
  }

  func SizedBuildRejectsStateWritesContract() bool {
    let value = State[int32](0)
    let window = Window{Size: LayoutSize(100, 100), Root: SizedRootFixture(() -> Sized(size -> {
      value.Value++
      return Text("invalid")
    }))}
    try {
      try { window.UpdateTree() }
      catch (error InvalidOperationException) {
        return error.Message.Contains("State writes are not allowed during Build")
          && StateReadScope.Current == nil && Cell.StateReader == nil
      }
      return false
    } finally { window.Close() }
  }

  func SizedFailedBuildRetainsSubscriptionsContract() bool {
    let previous = StateVerification.Override
    let previousFailure = SizedFixtureProbe.Fail
    StateVerification.Enabled = false
    SizedFixtureProbe.Fail = false
    let cell = SizedStateFixtureCell()
    let window = Window{Root: cell, Size: LayoutSize(200, 100)}
    SizedFixtureProbe.Context.Set(window, 0)
    var reads StateReadScope?
    try {
      window.UpdateTree()
      let state = window.Tree!!.Children[1].RetainedSizedState!!
      reads = state.Reads
      SizedFixtureProbe.Fail = true
      cell.Rebuild()
      var failed = false
      try { window.UpdateTree() }
      catch (error InvalidOperationException) { failed = error.Message == "Sized fixture failure." }
      if !failed || StateReadScope.Current != nil { return false }
      cell.Other.Value = 4
      if state.Reads.StateChanged { return false }
      cell.Value.Value = 2
      if !state.Reads.StateChanged { return false }
      SizedFixtureProbe.Fail = false
      window.UpdateTree()
      return window.Tree!!.Children[1].Children[0].Children[0].Content == "2:0"
        && !state.Reads.StateChanged
    } finally {
      SizedFixtureProbe.Fail = previousFailure
      StateVerification.Override = previous
      window.Close()
      cell.Value.Value = 3
      if reads?.StateChanged == true { throw InvalidOperationException("Disposed Sized retained a State subscription.") }
    }
  }

  func EachAssignsDataKeysContract() bool {
    let items = []string{"a", "b"}
    let children = Each(items, item -> item, item -> Text(item))
    let interop = Blob.Each[string](items, (item string) -> item, (item string) -> Text(item))
    let rec = Reconciler{Res: Resolver{}}
    let root = rec.Mount(Container(){...children})
    try {
      return root.Children.Count == 2 && root.Children[0].Key == "a" && root.Children[1].Key == "b"
        && root.Children[0].Content == "a" && root.Children[1].Content == "b"
        && interop.Length == 2 && interop[0].Key == "a" && interop[1].Key == "b"
        && Each([]string{}, item -> item, item -> Text(item)).Length == 0
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  func EachPreservesExplicitKeysContract() bool {
    let children = Each([]string{"a", "b"},
      item -> throw InvalidOperationException("An explicit key must skip the selector."),
      item -> Text{Key: "explicit-" + item, Content: item})
    return children.Length == 2 && children[0].Key == "explicit-a" && children[1].Key == "explicit-b"
  }

  func EachReorderRetainsIdentityContract() bool {
    let rec = Reconciler{Res: Resolver{}}
    let root = rec.Mount(Container(){
      ...Each([]string{"a", "b"}, item -> item, item -> Cell.Mount[string, TreeKeyedCell](nil, item)),
    })
    try {
      let a = root.Children[0]
      let b = root.Children[1]
      guard let cell = a.Fiber as TreeKeyedCell else { return false }
      cell.Value = "kept"
      cell.Rebuild()
      rec.Diff(root, Container(){
        ...Each([]string{"b", "a"}, item -> item, item -> Cell.Mount[string, TreeKeyedCell](nil, item)),
      })
      return root.Children[0] == b && root.Children[1] == a && a.Fiber == cell && a.Content == "a:kept"
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  func EachDuplicateKeysThrowContract() bool {
    let rec = Reconciler{Res: Resolver{}}
    let root = rec.Mount(Container(){...Each([]string{"a"}, item -> item, item -> Text(item))})
    try {
      try {
        rec.Diff(root, Container(){...Each([]string{"a", "a"}, item -> item, item -> Text(item))})
        return false
      } catch (error NotSupportedException) {
        return error.Message.Contains("Duplicate key 'a'", StringComparison.Ordinal)
      }
    } finally { NodeLifecycle.DisposeTree(root) }
  }

  func EmptyChildrenPreserveStyleRetryRootContract() bool {
    let rec = Reconciler{Res: Resolver{}}
    let node = rec.Mount(Container{})
    try {
      rec.FlushStyles()
      if node.StylePendingSelf { return false }
      rec.diffChildren(node, []Blob{})
      rec.DiscardStyles()
      return node.StylePendingSelf
    } finally { NodeLifecycle.DisposeTree(node) }
  }

  func NodeMountLifetimeContract() bool {
    let rec = Reconciler{Res: Resolver{}}
    let node = rec.Mount(Text{Content: "old"})
    let original = NodeMount(node)
    let same = NodeMount(node)
    let empty = NodeMount(nil)
    let identities = HashSet[NodeMount]()
    if node.MountGeneration != 1uL || original.Current != node || original.Captured != node
      || !original.Equals(same) || original.GetHashCode() != same.GetHashCode()
      || !empty.Equals(NodeMount{}) || empty.Current != nil || empty.Captured != nil
      || !identities.Add(original) || identities.Add(same) { return false }
    try {
      node.TryBeginRebind()
      return false
    } catch (_ InvalidOperationException) { }
    NodeLifecycle.DisposeTree(node)
    if original.Current != nil || original.Captured != node || node.MountGeneration != 1uL { return false }
    if !node.TryBeginRebind() { return false }
    let rebound = rec.Diff(node, Text{Content: "new"})
    let current = NodeMount(rebound)
    return Object.ReferenceEquals(node, rebound) && node.MountGeneration == 2uL
      && original.Current == nil && original.Captured == nil && current.Current == node
      && !original.Equals(current) && identities.Add(current) && rebound.Content == "new"
  }

  func TreeDepthLimitContract() bool {
    let message = "Node tree depth exceeds the limit of " + Reconciler.MaximumTreeDepth.ToString() + "."
    var blob Blob = Text{}
    for i in 0 ... Reconciler.MaximumTreeDepth {
      blob = Container(){blob}
    }
    let rec = Reconciler{Res: Resolver{}}
    try {
      rec.Mount(blob)
      return false
    } catch (error InvalidOperationException) {
      if error.Message != message { return false }
    }
    guard let container = blob as Container else { return false }
    let root = rec.Mount(container.Children[0])
    rec.Diff(root, container.Children[0])
    try {
      rec.Diff(root, blob)
      return false
    } catch (error InvalidOperationException) {
      if error.Message != message { return false }
    }
    var leaf = root
    while leaf.Children.Count > 0 { leaf = leaf.Children[0] }
    try {
      rec.Diff(leaf, Container(){Text{}})
      return false
    } catch (error InvalidOperationException) {
      if error.Message != message { return false }
    }
    try {
      rec.Mount(Text{}, leaf)
      return false
    } catch (error InvalidOperationException) {
      if error.Message != message { return false }
    }
    try {
      rec.MountRoot(TreeDepthCell{Depth: Reconciler.MaximumTreeDepth})
      return false
    } catch (error InvalidOperationException) {
      if error.Message != message { return false }
    }
    NodeLifecycle.DisposeTree(root)
    return rec.Mount(Text{Content: "recovered"}).Content == "recovered"
  }

  func KeyedReconciliationContract() bool {
    TreeKeyedCell.DisposedA = 0
    let parent = TreeKeyedParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let a = first.Children[0].Fiber else { return false }
    guard let b = first.Children[1].Fiber else { return false }
    if !(a is TreeKeyedCell) || !(b is TreeKeyedCell) { return false }
    a.Value = "A"
    b.Value = "B"
    a.Rebuild()
    b.Rebuild()
    window.UpdateTree()

    parent.Mode = 1
    parent.Rebuild()
    window.UpdateTree()
    guard let reordered = window.Tree else { return false }
    if reordered.Children.Count != 2 || reordered.Children[0].Content != "b:B" || reordered.Children[1].Content != "a:A" {
      return false
    }

    parent.Mode = 2
    parent.Rebuild()
    window.UpdateTree()
    guard let inserted = window.Tree else { return false }
    if inserted.Children.Count != 3 || inserted.Children[0].Content != "b:B"
      || inserted.Children[1].Content != "c:initial" || inserted.Children[2].Content != "a:A" {
        return false
      }

    parent.Mode = 3
    parent.Rebuild()
    window.UpdateTree()
    guard let removed = window.Tree else { return false }
    if removed.Children.Count != 2 || removed.Children[0].Content != "b:B" || removed.Children[1].Content != "a:A" {
      return false
    }

    parent.Mode = 4
    parent.Rebuild()
    window.UpdateTree()
    guard let replaced = window.Tree else { return false }
    if replaced.Children.Count != 2 || replaced.Children[0].Content != "b:B"
      || replaced.Children[1].Content != "replacement" || TreeKeyedCell.DisposedA != 1 {
        return false
      }
    a.Value = "stale"
    a.Rebuild()
    window.UpdateTree()
    guard let afterStaleUpdate = window.Tree else { return false }
    if afterStaleUpdate.Children.Count != 2 || afterStaleUpdate.Children[0].Content != "b:B"
      || afterStaleUpdate.Children[1].Content != "replacement" || TreeKeyedCell.DisposedA != 1 {
        return false
      }
    return freshSubtreeOnCellReplacement()
  }

  internal func freshSubtreeOnCellReplacement() bool {
    let rec = Reconciler{ Res: Resolver{} }
    let root = rec.Mount(Container() {
      Cell.Mount[TreeContainerCell]("slot"),})
    let entry = root.Children[0].Children[0]
    entry.Focused = true
    entry.Buffer = "typed"
    rec.Diff(root, Container() {
      Container() {.Key: "slot", TextEntry{ Key: "entry", Value: "new" },
      },})
    let replacement = root.Children[0].Children[0]
    return !replacement.Focused && replacement.Buffer == "new"
  }

  func PositionalReconciliationContract() bool {
    let parent = TreePositionalParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let child = first.Children[1].Fiber else { return false }
    if !(child is TreePositionalCell) { return false }
    child.Value = "kept"
    child.Rebuild()
    window.UpdateTree()
    parent.Label = "after"
    parent.Rebuild()
    window.UpdateTree()
    guard let after = window.Tree else { return false }
    return after.Children.Count == 3 && after.Children[0].Content == "after"
      && after.Children[1].Content == "slot:kept" && after.Children[2].Content == "tail"
  }

  func MixedReconciliationContract() bool {
    let rec = Reconciler{ Res: Resolver{} }
    let root = rec.Mount(Container() {
      Cell.Mount[string, TreeKeyedCell]("a", "a"),
      Cell.Mount[TreePositionalCell](),
      Cell.Mount[string, TreeKeyedCell]("b", "b"),
    })
    let a = root.Children[0]
    let positional = root.Children[1]
    let b = root.Children[2]
    guard let bCell = b.Fiber else { return false }
    guard let cell = positional.Fiber as TreePositionalCell else { return false }
    cell.Value = "kept"
    cell.Rebuild()

    rec.Diff(root, Container() {
      Cell.Mount[string, TreeKeyedCell]("b", "b"),
      Cell.Mount[TreePositionalCell](),
      Cell.Mount[string, TreeKeyedCell]("a", "a"),
    })
    if root.Children[0] != b || root.Children[1] != positional || root.Children[2] != a
      || positional.Content != "slot:kept" { return false }

    rec.Diff(root, Container() {
      Cell.Mount[string, TreeKeyedCell]("b", "b"),
      Cell.Mount[TreePositionalCell](),
      Text{ Key: "inserted", Content: "inserted" },
      Cell.Mount[string, TreeKeyedCell]("a", "a"),
    })
    let inserted = root.Children[2]
    if root.Children[3] != a || root.Children[1] != positional { return false }

    rec.Diff(root, Container() {
      Cell.Mount[string, TreeKeyedCell]("b", "b"),
      Cell.Mount[TreePositionalCell](),
      Cell.Mount[string, TreeKeyedCell]("changed", "a"),
    })
    if !inserted.Retired || !a.Retired || root.Children[0] != b
      || root.Children[1] != positional || root.Children[2].Fiber == a.Fiber { return false }

    rec.Diff(root, Container() {
      Cell.Mount[TreePositionalCell](),
      Cell.Mount[TreePositionalCell](),
      Cell.Mount[TreePositionalCell](),
    })
    if !bCell.disposed || root.Children[0].Fiber == bCell || root.Children[1] != positional
      || root.Children[0].Content != "slot:initial" || positional.Content != "slot:kept" { return false }

    rec.Diff(root, Container() {
      Text{ Key: "inserted", Content: "inserted" },
      Cell.Mount[string, TreeKeyedCell]("a", "a"),
      Cell.Mount[TreePositionalCell](),
    })
    let shifted = root.Children[2]
    if !positional.Retired || shifted == positional || shifted.Content != "slot:initial" { return false }
    rec.Diff(root, Container() { Cell.Mount[string, TreeKeyedCell]("a", "a"), })
    let retained = root.Children[0]
    rec.Diff(root, Container() { Text("plain"), Cell.Mount[string, TreeKeyedCell]("a", "a"), })
    let passed = root.Children[1] == retained && shifted.Retired
    NodeLifecycle.DisposeTree(root)
    return passed
  }

  func MixedHandleRollbackContract() bool {
    let handle = ElementHandle{}
    let provisional = ElementHandle{}
    ElementHandleRollbackCell.Target = handle
    let rec = Reconciler{ Res: Resolver{}, Owner: Window{} }
    let root = rec.Mount(Container() {
      Cell.Mount[ElementHandleRollbackCell]("a"),
      Text("plain"),
    })
    let original = root.Children[0]
    let positional = root.Children[1]
    var rejected = false
    try {
      rec.Diff(root, Container() {
        Text{ Key: "a", Handle: handle, Content: "replacement" },
        Text("plain"),
        Text{ Key: "provisional", Handle: provisional },
        Container() {.Key: "fail", Text{ Handle: provisional }, },
      })
    } catch (error InvalidOperationException) {
      rejected = true
    }
    if !rejected || root.Children.Count != 2 || root.Children[0] != original
      || root.Children[1] != positional || original.Retired
      || !ElementHandles.Owns(original, handle) || provisional.IsMounted { return false }

    rejected = false
    try {
      rec.Diff(root, Container() {
        Text{ Key: "a", Handle: handle }, Text{ Handle: handle },
      })
    } catch (error InvalidOperationException) {
      rejected = true
    }
    if !rejected || !ElementHandles.Owns(original, handle) { return false }

    rec.Diff(root, Container() { Text{ Key: "a" }, Text{ Handle: handle }, })
    if !original.Retired || !ElementHandles.Owns(root.Children[1], handle) { return false }
    rec.Diff(root, Container() { Text{ Handle: handle }, Text{ Key: "a" }, })
    let passed = ElementHandles.Owns(root.Children[0], handle)
      && !ElementHandles.Owns(root.Children[1], handle)
    NodeLifecycle.DisposeTree(root)
    ElementHandleRollbackCell.Target = nil
    return passed && !handle.IsMounted
  }

  func OutputAndKindReplacementContract() bool {
    let rec = Reconciler{ Res: Resolver{} }
    let node = rec.Mount(Container() { Text("original"),})
    rec.Diff(node, Container() { Text("changed"),})
    if node.Children[0].Content != "changed" { return false }
    rec.Diff(node, Container() { Container() { Text("nested"),},})
    let container = node.Children[0]
    if container.Children.Count != 1 || container.Children[0].Content != "nested" {
      return false
    }
    rec.Diff(node, Container() { Text("replaced"),})
    let replacement = node.Children[0]
    return replacement.Content == "replaced" && replacement.Children.Count == 0
  }

  func RejectsInvalidChildList(scenario string) bool {
    try {
      let rec = Reconciler{ Res: Resolver{} }
      switch scenario {
        case "mount-duplicate" {
          rec.Mount(Container() {
            Text{ Key: "same", Content: "a" }, Text("plain"), Text{ Key: "same", Content: "b" },
          })
        }
        case "diff-duplicate" {
          let node = rec.Mount(Container() { Text{ Key: "a", Content: "a" },})
          rec.Diff(node, Container() {
            Text{ Key: "same", Content: "a" }, Text("plain"), Text{ Key: "same", Content: "b" },
          })
        }
        case _ {
          return false
        }
      }
    } catch (error NotSupportedException) {
      return true
    }
    return false
  }

  func LeafDirtyUpdateContract() bool {
    let parent = TreeBuildCountingParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    let parentBuilds = parent.Builds
    guard let first = window.Tree else { return false }
    guard let child = first.Children[1].Fiber else { return false }
    if !(child is TreeIncrementalChild) { return false }
    child.Count = 42
    child.Rebuild()
    window.UpdateTree()
    guard let after = window.Tree else { return false }
    return parent.Builds == parentBuilds && after.Children[0].Content == "stable"
      && after.Children[1].Children[1].Content == "42"
  }

  func DirtyAncestorContract() bool {
    let parent = TreeIncrementalParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let child = first.Children[1].Fiber else { return false }
    if !(child is TreeIncrementalChild) { return false }
    let childBuilds = child.Builds
    parent.Title = "new"
    parent.Rebuild()
    child.Count = 7
    child.Rebuild()
    window.UpdateTree()
    guard let after = window.Tree else { return false }
    return child.Builds == childBuilds + 1 && after.Children[0].Content == "new"
      && after.Children[1].Children[0].Content == "new" && after.Children[1].Children[1].Content == "7"
  }

  func RemovedDirtyContract() bool {
    let parent = TreeRemovedChildParent{}
    let window = Window{ Root: parent, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    guard let first = window.Tree else { return false }
    guard let child = first.Children[0].Fiber else { return false }
    if !(child is TreeIncrementalChild) { return false }
    child.Count = 5
    child.Rebuild()
    parent.ShowChild = false
    parent.Rebuild()
    window.UpdateTree()
    guard let after = window.Tree else { return false }
    return after.Children.Count == 1 && after.Children[0].Content == "empty"
  }

  func DisplayNonePointerContract() bool {
    var visibleHits = 0
    var hiddenHits = 0
    let root = Node{ Kind: NodeKind.Container, Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F } }
    let visible = Node{ Kind: NodeKind.Container, Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F }, OnClick: func() { visibleHits = visibleHits + 1 } }
    let hidden = Node{ Kind: NodeKind.Container, Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F }, Display: Display.None, OnClick: func() { hiddenHits = hiddenHits + 1 } }
    hidden.Children.Add(Node{ Kind: NodeKind.Container, Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F }, OnClick: func() { hiddenHits = hiddenHits + 1 } })
    root.Children.Add(visible)
    root.Children.Add(hidden)
    let input = InputCoordinator()
    input.QueuePointerPress(25.0F, 25.0F)
    input.QueuePointerRelease(25.0F, 25.0F)
    input.Drain(root, Resolver{}, 0.0, nil)
    return visibleHits == 1 && hiddenHits == 0
  }

  func DisplayNoneFocusContract() bool {
    let cell = TreeDisplayFocusCell{}
    let window = Window{ Size: LayoutSize(300, 100),  Root: cell }
    let input = InputCoordinator()
    let resolver = Resolver{}
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    input.MoveEditorFocus(window.Tree, resolver, true)
    input.MoveEditorFocus(window.Tree, resolver, true)
    guard let before = window.Tree else { return false }
    if !before.Children[1].Children[0].Focused { return false }
    cell.Hide()
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    guard let hidden = window.Tree else { return false }
    input.QueueText("x")
    if hidden.Children[1].Children[0].Focused || input.Drain(window.Tree, resolver, 0.0, nil) { return false }
    input.MoveEditorFocus(window.Tree, resolver, true)
    if !hidden.Children[0].Focused { return false }
    input.MoveEditorFocus(window.Tree, resolver, true)
    return hidden.Children[2].Focused
  }

  func DisplayNoneLifecycleContract() bool {
    TreeDisplayRetainedCell.Disposed = false
    let parent = TreeDisplayRetainedParent{}
    let window = Window{ Size: LayoutSize(200, 100),  Root: parent }
    window.UpdateTree()
    guard let mounted = window.Tree else { return false }
    guard let child = mounted.Children[0].Children[0].Fiber else { return false }
    if !(child is TreeDisplayRetainedCell) { return false }
    parent.Hide()
    window.UpdateTree()
    child.Increment()
    window.UpdateTree()
    guard let hidden = window.Tree else { return false }
    if hidden.Children[0].Children[0].Children[0].Content != "1" || TreeDisplayRetainedCell.Disposed { return false }
    parent.Show()
    window.UpdateTree()
    guard let shown = window.Tree else { return false }
    return shown.Children[0].Children[0].Children[0].Content == "1" && !TreeDisplayRetainedCell.Disposed
  }

  func VisibilityPointerContract() bool {
    var visibleHits = 0
    var hiddenHits = 0
    let root = Node{ Kind: NodeKind.Container,
      Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F } }
    let visible = Node{ Kind: NodeKind.Container,
      Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F },
      OnClick: () -> { visibleHits++ } }
    let hidden = Node{ Kind: NodeKind.Container, Visibility: Visibility.Hidden,
      Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F },
      OnClick: () -> { hiddenHits++ } }
    hidden.Children.Add(Node{ Kind: NodeKind.Container, Visibility: Visibility.Visible,
      Rect: Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 100.0F },
      OnClick: () -> { hiddenHits++ } })
    root.Children.Add(visible)
    root.Children.Add(hidden)
    let input = InputCoordinator()
    input.QueuePointerPress(25.0F, 25.0F)
    input.QueuePointerRelease(25.0F, 25.0F)
    input.Drain(root, Resolver{}, 0.0, nil)
    return visibleHits == 1 && hiddenHits == 0
  }

  func VisibilityFocusContract() bool {
    let cell = TreeVisibilityFocusCell{}
    let window = Window{ Size: LayoutSize(300, 100),  Root: cell }
    let input = InputCoordinator()
    let resolver = Resolver{}
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    input.MoveEditorFocus(window.Tree, resolver, true)
    input.MoveEditorFocus(window.Tree, resolver, true)
    guard let before = window.Tree else { return false }
    if !before.Children[1].Children[0].Focused { return false }
    cell.Hide()
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    guard let hidden = window.Tree else { return false }
    input.QueueText("x")
    if hidden.Children[1].Children[0].Focused || input.Drain(window.Tree, resolver, 0.0, nil) { return false }
    input.MoveEditorFocus(window.Tree, resolver, true)
    if !hidden.Children[0].Focused { return false }
    input.MoveEditorFocus(window.Tree, resolver, true)
    return hidden.Children[2].Focused
  }

  func VisibilityLifecycleContract() bool {
    TreeDisplayRetainedCell.Disposed = false
    let parent = TreeVisibilityRetainedParent{}
    let window = Window{ Size: LayoutSize(200, 100),  Root: parent }
    window.UpdateTree()
    guard let mounted = window.Tree else { return false }
    guard let child = mounted.Children[0].Children[0].Fiber else { return false }
    if !(child is TreeDisplayRetainedCell) { return false }
    parent.Hide()
    window.UpdateTree()
    child.Increment()
    window.UpdateTree()
    guard let hidden = window.Tree else { return false }
    if hidden.Children[0].Children[0].Children[0].Content != "1" || TreeDisplayRetainedCell.Disposed {
      return false
    }
    parent.Show()
    window.UpdateTree()
    guard let shown = window.Tree else { return false }
    return shown.Children[0].Children[0].Children[0].Content == "1" && !TreeDisplayRetainedCell.Disposed
  }

  func ButtonSemanticPrimitiveContract() bool {
    let resolver = Resolver{}
    let reconciler = Reconciler{ Res: resolver }
    let node = reconciler.Mount(Button() {.BackgroundColor: Color.Rgb(100, 100, 100),.Color: Color.Rgb(200, 20, 10),.HoverStyle: Style{ BackgroundColor: Color.White },
        Shape{ Key: "icon", Path: PathBuilder().MoveTo(0.0, 0.0).LineTo(1.0, 1.0).Build() },
        Text{ Key: "label", Content: "Hi"},
    })
    if node.Kind != NodeKind.Button || !node.Focusable || node.TransitionMs != 0.0
      || node.JustifyContent != JustifyContent.Center || node.AlignItems != AlignItems.Center
      || node.ActiveStyle != nil || node.FocusStyle != nil || node.Children.Count != 2
      || node.Children[0].Kind != NodeKind.Shape || node.Children[1].Content != "Hi"
      || node.Children[1].Color != Color.Rgb(200, 20, 10)
      || node.HoverStyle == nil {
        return false
      }
    node.Hovered = true
    resolver.Invalidate(node, false)
    resolver.Flush()
    if node.BackgroundColor != Color.White {
      return false
    }
    reconciler.Diff(node, Button() {.Color: Color.Rgb(10, 20, 200),
        Shape{ Key: "icon", Path: PathBuilder().MoveTo(0.0, 0.0).LineTo(1.0, 0.0).Build() },
        Text{ Key: "label", Content: "Updated"},
    })
    return node.Kind == NodeKind.Button && node.Children.Count == 2
      && node.Children[1].Content == "Updated" && node.Children[1].Color == Color.Rgb(10, 20, 200)
  }

  func ButtonStyleSpillContract() bool {
    let reconciler = Reconciler{ Res: Resolver{} }
    let node = reconciler.Mount(Button{
      Width: 100,
      Height: 40,
      Gap: 8,
      BackgroundColor: Color.Rgb(41, 41, 51),
      Color: Color.White,
      JustifyContent: JustifyContent.FlexEnd,
    })
    if node.JustifyContent != JustifyContent.FlexEnd || node.AlignItems != AlignItems.Center
      || node.Width.Value != 100.0F || node.Height.Value != 40.0F
      || node.Gap.Value != 8.0F || node.BackgroundColor != Color.Rgb(41, 41, 51)
      || node.Color != Color.White{
        return false
      }
    var clicked = false
    reconciler.Diff(node, Button{
      Width: 100,
      Height: 40,
      Gap: 8,
      BackgroundColor: Color.Rgb(41, 41, 51),
      Color: Color.White,
      JustifyContent: JustifyContent.FlexEnd,
      HoverStyle: Style{ BackgroundColor: Color.Rgb(51, 51, 61) },
      ActiveStyle: Style{ BackgroundColor: Color.Rgb(31, 31, 41) },
      FocusStyle: Style{ OutlineWidth: 1 },
      DisabledStyle: Style{ Opacity: 0.5 },
      Disabled: true,
      OnClick: () -> { clicked = true },
    })
    if node.HoverStyle == nil || node.ActiveStyle == nil
      || node.FocusStyle == nil || node.DisabledStyle == nil
      || !node.Disabled || node.Focusable{
        return false
      }
    guard let click = node.OnClick else { return false }
    click()
    if !clicked { return false }
    reconciler.Diff(node, Button{
      Width: 120,
      Height: 40,
      Gap: 8,
      BackgroundColor: Color.Rgb(41, 41, 51),
      Color: Color.White,
      JustifyContent: JustifyContent.FlexEnd,
    })
    return node.Width.Value == 120.0F
      && node.JustifyContent == JustifyContent.FlexEnd
      && node.HoverStyle == nil && node.ActiveStyle == nil
      && node.FocusStyle == nil && node.DisabledStyle == nil
      && !node.Disabled && node.Focusable
  }

  func TextEntryControlledValueContract() bool {
    let rec = Reconciler{ Res: Resolver{} }
    var calls = 0
    let node = rec.Mount(TextEntry{ Key: "entry", Value: "original", Placeholder: "first", Color: Color.Rgb(255, 0, 0) })
    node.Caret = 10
    node.Anchor = 10
    rec.Diff(node, TextEntry{
      Key: "entry", Value: "x", Placeholder: "second", Color: Color.Rgb(0, 255, 0),
      OnChange: (value string) -> { calls = calls + 1 },
    })
    if node.Buffer != "x" || node.Caret != 1 || node.Anchor != 1 || node.Placeholder != "second" || node.Color.G != 1.0F {
      return false
    }
    node.Focused = true
    node.Buffer = "typed"
    node.Caret = 5
    node.Anchor = 5
    rec.Diff(node, TextEntry{
      Key: "entry", Value: "external", Placeholder: "updated", Color: Color.Rgb(0, 0, 255),
      OnChange: (value string) -> { calls = calls + 1 },
    })
    if let onChange = node.OnChange { onChange("event") }
    return node.Buffer == "typed" && node.Caret == 5 && node.Anchor == 5
      && node.Placeholder == "updated" && node.Color.B == 1.0F && calls == 1
  }

  func ExplicitControlledEntryValue() bool {
    let resolver = Resolver{}
    let rec = Reconciler{Res: resolver}
    let focus = FocusManager()
    let input = TextInput(focus)
    var calls = 0
    let node = rec.Mount(TextEntry{Value: "original"})
    focus.SetFocus(resolver, node)
    node.Anchor = 5
    node.Caret = 2
    rec.Diff(
      node,
      TextEntry{
        Value: "a😀b",
        Controlled: true,
        OnChange: (value string) -> {
          calls++
        }
      })
    if node.Buffer != "a😀b" || node.Anchor != 4 || node.Caret != 1 || !node.Focused || calls != 0 {
      return false
    }
    node.Anchor = 2
    node.Caret = 2
    rec.Diff(node, TextEntry{Value: "xa\u0301z", Controlled: true})
    if node.Caret != 1 || node.Anchor != 1 {
      return false
    }
    rec.Diff(node, TextEntry{Value: "", Controlled: true})
    if node.Caret != 0 || node.Anchor != 0 || node.Buffer != "" || !node.Focused {
      return false
    }
    node.Buffer = "local"
    rec.Diff(node, TextEntry{Value: "external"})
    return node.Buffer == "local" && !TextEntry{}.Controlled
  }

  func ControlledEntryComposition() bool {
    let resolver = Resolver{}
    let rec = Reconciler{Res: resolver}
    let focus = FocusManager()
    let input = TextInput(focus)
    var calls = 0
    let node = rec.Mount(
      TextEntry{
        Value: "hello",
        OnChange: (value string) -> {
          calls++
        }
      })
    focus.SetFocus(resolver, node)
    input.HandleComposition(node, "😀", 0, 2)
    if node.Buffer != "hello😀" || input.SyncControlledEntry(node, "hello") {
      return false
    }
    if input.EditorSnapshot()!!.CompositionStart != 5 {
      return false
    }
    if !input.SyncControlledEntry(node, "external") || node.Buffer != "external"
      || input.EditorSnapshot()!!.CompositionStart != -1 || !node.Focused || calls != 0 {
        return false
      }
    input.HandleCompositionCancel(node)
    if node.Buffer != "external" {
      return false
    }
    input.HandleChar(node, "!")
    if calls != 1 {
      return false
    }
    input.HandleComposition(node, "x", 0, 1)
    let effective = node.Buffer
    if !input.SyncControlledEntry(node, effective) {
      return false
    }
    input.HandleCompositionCancel(node)
    return node.Buffer == effective && input.EditorSnapshot()!!.CompositionStart == -1 && calls == 1
  }

  internal func markBackgroundApplied(node Node) {
    node.AppliedMask = styleMaskWith(node.AppliedMask, StyleField.BackgroundColor)
  }
}

internal class TreeDepthCell : Cell {
  internal var Depth int32
  override func Build() Blob -> if Depth == 0 { Text{} }
    else { Cell.Mount[TreeDepthCell](nil, () -> TreeDepthCell{Depth: Depth - 1}) }
}

internal class TreeKeyedParent : Cell {
  internal var Mode int32

  init() { }

  override func Build() Blob -> switch Mode {
    case 0: Container() { keyedCell("a"), keyedCell("b"),}
    case 1: Container() { keyedCell("b"), keyedCell("a"),}
    case 2: Container() { keyedCell("b"), keyedCell("c"), keyedCell("a"),}
    case 3: Container() { keyedCell("b"), keyedCell("a"),}
    case _: Container() { keyedCell("b"), Text{ Key: "a", Content: "replacement" },}
  }

  internal func keyedCell(label string) Blob -> Cell.Mount[string, TreeKeyedCell](label, label)
}

internal class TreeKeyedCell : Cell[string], IDisposable {
  shared { var DisposedA int32 }
  internal var Value string

  init() {
    Value = "initial"
  }

  override func Build() Blob -> Text { Content: "$Input:${Value}" }

  func Dispose() {
    if Input == "a" { DisposedA = DisposedA + 1 }
  }
}

internal class TreeContainerCell : Cell {
  override func Build() Blob -> Container() {
    TextEntry{ Key: "entry", Value: "old" },}
}

internal class TreePositionalParent : Cell {
  internal var Label string

  init() { Label = "before" }

  override func Build() Blob -> Container() {
    Text{ Content: Label },
    Cell.Mount[TreePositionalCell](nil),
    Text{ Content: "tail" },
  }
}

internal class TreePositionalCell : Cell {
  internal var Value string

  init() { Value = "initial" }

  override func Build() Blob -> Text { Content: "slot:${Value}" }
}

internal class TreeIncrementalParent : Cell {
  internal var Title string

  init() { Title = "old" }

  override func Build() Blob -> Container() {
    Text{ Key: "title", Content: Title },
    Cell.Mount[string, TreeIncrementalChild]("child", Title),
  } }

internal class TreeBuildCountingParent : Cell {
  internal var Builds int32

  override func Build() Blob {
    Builds = Builds + 1
    return Container() {
      Text{ Key: "stable", Content: "stable" },
      Cell.Mount[string, TreeIncrementalChild]("child", ""),
    }
  }
}

internal class TreeRemovedChildParent : Cell {
  internal var ShowChild bool

  init() { ShowChild = true }

  override func Build() Blob {
    if ShowChild {
      return Container() { Cell.Mount[string, TreeIncrementalChild]("child", ""),}
    }
    return Container() { Text{ Content: "empty" },}
  }
}

internal class TreeIncrementalChild : Cell[string] {
  internal var Count int32
  internal var Builds int32

  init() { }

  override func Build() Blob {
    Builds = Builds + 1
    return Container() {
      Text{ Content: Input },
      Text{ Content: "${Count}" },}
  }
}

internal class TreeDisplayFocusCell : Cell {
  internal var Hidden bool

  init() { }

  func Hide() {
    Hidden = true
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: 300.0,.Height: 100.0,
    TextEntry{ Key: "a", Width: 100.0, Height: 30.0 },
    Container() {.Key: "hidden",.Display: Hidden ? Display.None : Display.Flex,
      TextEntry{ Key: "hidden-entry", Width: 100.0, Height: 30.0 },
    },
    TextEntry{ Key: "c", Width: 100.0, Height: 30.0 },
  }
}

internal class TreeDisplayRetainedParent : Cell {
  internal var Hidden bool

  init() { }

  func Hide() {
    Hidden = true
    Rebuild()
  }
  func Show() {
    Hidden = false
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,
    Container() {.Key: "wrapper",.Display: Hidden ? Display.None : Display.Flex,
      Cell.Mount[TreeDisplayRetainedCell]("retained"),
    },
  }
}

internal class TreeVisibilityFocusCell : Cell {
  internal var Hidden bool

  init() { }

  func Hide() {
    Hidden = true
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: 300.0,.Height: 100.0,
    TextEntry{ Key: "a", Width: 100.0, Height: 30.0 },
    Container() {.Key: "hidden",.Visibility: Hidden ? Visibility.Hidden : Visibility.Visible,
      TextEntry{
          Key: "hidden-entry", Width: 100.0, Height: 30.0,
          Visibility: Visibility.Visible,
        },
      },
    TextEntry{ Key: "c", Width: 100.0, Height: 30.0 },
  }
}

internal class TreeVisibilityRetainedParent : Cell {
  internal var Hidden bool

  init() { }

  func Hide() {
    Hidden = true
    Rebuild()
  }
  func Show() {
    Hidden = false
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,
    Container() {.Key: "wrapper",.Visibility: Hidden ? Visibility.Hidden : Visibility.Visible,
      Cell.Mount[TreeDisplayRetainedCell]("retained"),
    },
  }
}

internal class TreeDisplayRetainedCell : Cell, IDisposable {
  shared { var Disposed bool }
  internal var Count int32

  init() { }

  func Increment() {
    Count = Count + 1
    Rebuild()
  }

  func Dispose() { Disposed = true }

  override func Build() Blob -> Container() { Text{ Content: "${Count}" },} }

internal class SizedRootFixture(builder Func[Blob]) : Cell {
  override func Build() Blob -> builder()
}

internal class SizedMountedFixture : Cell {
  private let handle ElementHandle = ElementHandle()
  shared { internal var Ready bool }
  override func Build() Blob -> Container{Handle: handle, Width: Percent(100), Height: Percent(100)}
  protected override func Mounted() {
    Ready = handle.BorderBox.Width == 160 && handle.BorderBox.Height == 70
  }
}

internal class SizedFixtureProbe {
  shared {
    internal let Context Goo.Context[int32] = Goo.Context[int32]()
    internal var OwnerBuilds int32
    internal var Fail bool
    internal var ContentBuilds int32
    internal var Mode int32
    internal var Inside int32
    internal var Outside int32
  }
}

internal class SizedStateFixtureCell : Cell {
  internal let Value State[int32] = State[int32](0)
  internal let Other State[int32] = State[int32](0)
  internal let UseOther State[bool] = State[bool](false)

  override func Build() Blob {
    SizedFixtureProbe.OwnerBuilds++
    return Container{Width: Percent(100), Height: Percent(100),
      Text{Content: "sibling", Height: 20}, Sized(BuildContent){.FlexGrow: 1, .MinHeight: 0}}
  }

  private func BuildContent(size LayoutSize) Blob {
    if SizedFixtureProbe.Fail {
      let ignored = Other.Value
      throw InvalidOperationException("Sized fixture failure.")
    }
    SizedFixtureProbe.ContentBuilds++
    let value = UseOther.Value ? Other.Value : Value.Value
    let context = SizedFixtureProbe.Context.Read()
    return Container{Key: "content", Width: Percent(100), Height: Percent(100), Text("$value:$context")}
  }
}

internal class SizedVerificationFixtureCell : Cell {
  private let value State[int32] = State[int32](0)

  override func Build() Blob -> Container{Width: Percent(100), Height: Percent(100),
    Text{Content: SizedFixtureProbe.Outside.ToString(), Height: 20},
    Sized(BuildContent){.FlexGrow: 1, .MinHeight: 0}}

  private func BuildContent(size LayoutSize) Blob ->
    Container{Width: Percent(100), Height: Percent(100), OnPointerMove: Move,
      Text("${value.Value}:${SizedFixtureProbe.Inside}")}

  private func Move(event PointerEvent) {
    if SizedFixtureProbe.Mode == 0 { value.Value++ }
    else if SizedFixtureProbe.Mode == 1 { SizedFixtureProbe.Inside++ }
    else { SizedFixtureProbe.Outside++ }
  }
}

internal class FreezeBuildReturnCell : Cell {
  internal var Declaration Blob?
  internal var Rejected bool

  override func Build() Blob {
    let result = Cell.Mount[TreeDepthCell](nil, () -> {
      try { Declaration!!.Key = "changed" } catch (_ InvalidOperationException) { Rejected = true }
      return TreeDepthCell()
    })
    Declaration = result
    return result
  }
}
