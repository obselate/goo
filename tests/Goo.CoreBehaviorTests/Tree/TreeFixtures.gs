package Goo

import System

internal class TreeFixtures {
  func KeyedReconciliationContract() bool {
    TreeKeyedCell.DisposedA = 0
    let parent = TreeKeyedParent{}
    let window = Window{ Root: parent, Width: 200, Height: 100 }
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
    let root = rec.Mount(Container{ Children: {
      Cell.Mount[TreeContainerCell]("slot", nil),
    } })
    let entry = root.Children[0].Children[0]
    entry.Focused = true
    entry.Buffer = "typed"
    rec.Diff(root, Container{ Children: {
      Container{ Key: "slot", Children: {
        TextEntry{ Key: "entry", Value: "new" },
      } },
    } })
    let replacement = root.Children[0].Children[0]
    return !replacement.Focused && replacement.Buffer == "new"
  }

  func PositionalReconciliationContract() bool {
    let parent = TreePositionalParent{}
    let window = Window{ Root: parent, Width: 200, Height: 100 }
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

  func OutputAndKindReplacementContract() bool {
    let rec = Reconciler{ Res: Resolver{} }
    let node = rec.Mount(Container{ Children: { Text("original") } })
    rec.Diff(node, Container{ Children: { Text("changed") } })
    if node.Children[0].Content != "changed" { return false }
    rec.Diff(node, Container{ Children: { Container{ Children: { Text("nested") } } } })
    let container = node.Children[0]
    if container.Children.Count != 1 || container.Children[0].Content != "nested" {
      return false
    }
    rec.Diff(node, Container{ Children: { Text("replaced") } })
    let replacement = node.Children[0]
    return replacement.Content == "replaced" && replacement.Children.Count == 0
  }

  func RejectsInvalidChildList(scenario string) bool {
    try {
      let rec = Reconciler{ Res: Resolver{} }
      switch scenario {
        case "mount-mixed" {
          rec.Mount(Container{ Children: { Text{ Key: "keyed", Content: "x" }, Text{ Content: "plain" } } })
        }
        case "diff-mixed" {
          let node = rec.Mount(Container{ Children: { Text{ Key: "keyed", Content: "x" } } })
          rec.Diff(node, Container{ Children: { Text{ Key: "keyed", Content: "x" }, Text{ Content: "plain" } } })
        }
        case "mount-duplicate" {
          rec.Mount(Container{ Children: { Text{ Key: "same", Content: "a" }, Text{ Key: "same", Content: "b" } } })
        }
        case "diff-duplicate" {
          let node = rec.Mount(Container{ Children: { Text{ Key: "a", Content: "a" } } })
          rec.Diff(node, Container{ Children: { Text{ Key: "same", Content: "a" }, Text{ Key: "same", Content: "b" } } })
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
    let window = Window{ Root: parent, Width: 200, Height: 100 }
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
    let window = Window{ Root: parent, Width: 200, Height: 100 }
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
    let window = Window{ Root: parent, Width: 200, Height: 100 }
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
    return hitDispatchClick(root, 25.0F, 25.0F) && visibleHits == 1 && hiddenHits == 0
  }

  func DisplayNoneFocusContract() bool {
    let cell = TreeDisplayFocusCell{}
    let window = Window{ Width: 300, Height: 100, Root: cell }
    let input = InputCoordinator()
    let resolver = Resolver{}
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    guard let before = window.Tree else { return false }
    if !before.Children[1].Children[0].Focused { return false }
    cell.Hide()
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    guard let hidden = window.Tree else { return false }
    if hidden.Children[1].Children[0].Focused || input.HandleChar(window.Tree, "x") { return false }
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    if !hidden.Children[0].Focused { return false }
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    return hidden.Children[2].Focused
  }

  func DisplayNoneLifecycleContract() bool {
    TreeDisplayRetainedCell.Disposed = false
    let parent = TreeDisplayRetainedParent{}
    let window = Window{ Width: 200, Height: 100, Root: parent }
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
    return hitDispatchClick(root, 25.0F, 25.0F) && visibleHits == 1 && hiddenHits == 0
  }

  func VisibilityFocusContract() bool {
    let cell = TreeVisibilityFocusCell{}
    let window = Window{ Width: 300, Height: 100, Root: cell }
    let input = InputCoordinator()
    let resolver = Resolver{}
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    guard let before = window.Tree else { return false }
    if !before.Children[1].Children[0].Focused { return false }
    cell.Hide()
    window.UpdateTree()
    input.AfterTreeUpdated(window.Tree, resolver, true)
    guard let hidden = window.Tree else { return false }
    if hidden.Children[1].Children[0].Focused || input.HandleChar(window.Tree, "x") { return false }
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    if !hidden.Children[0].Focused { return false }
    input.HandleKey(window.Tree, resolver, Key.Tab, false, false)
    return hidden.Children[2].Focused
  }

  func VisibilityLifecycleContract() bool {
    TreeDisplayRetainedCell.Disposed = false
    let parent = TreeVisibilityRetainedParent{}
    let window = Window{ Width: 200, Height: 100, Root: parent }
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
    let node = reconciler.Mount(Button{
      BackgroundColor: Color.Rgb(100, 100, 100),
      Color: Color.Rgb(200, 20, 10),
      Hover: Style{ BackgroundColor: Color.White },
      Children: {
        Shape{ Key: "icon", Path: PathBuilder().MoveTo(0.0, 0.0).LineTo(1.0, 1.0).Build() },
        Text{ Key: "label", Content: "Hi" },
      },
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
    reconciler.Diff(node, Button{
      Color: Color.Rgb(10, 20, 200),
      Children: {
        Shape{ Key: "icon", Path: PathBuilder().MoveTo(0.0, 0.0).LineTo(1.0, 0.0).Build() },
        Text{ Key: "label", Content: "Updated" },
      },
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
    guard let entries = node.BaseStyle else { return false }
    if entries.Count != 8
      || entries.At(0).Field != StyleField.JustifyContent
      || entries.At(1).Field != StyleField.AlignItems
      || entries.At(2).Field != StyleField.Width
      || entries.At(6).Field != StyleField.Color
      || entries.At(7).Field != StyleField.JustifyContent
      || node.JustifyContent != JustifyContent.FlexEnd || node.AlignItems != AlignItems.Center
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
      Hover: Style{ BackgroundColor: Color.Rgb(51, 51, 61) },
      Active: Style{ BackgroundColor: Color.Rgb(31, 31, 41) },
      Focus: Style{ OutlineWidth: 1 },
      DisabledStyle: Style{ Opacity: 0.5 },
      Disabled: true,
      OnClick: () -> { clicked = true },
    })
    if !Object.ReferenceEquals(entries, node.BaseStyle)
      || node.HoverStyle == nil || node.ActiveStyle == nil
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
    return !Object.ReferenceEquals(entries, node.BaseStyle)
      && node.Width.Value == 120.0F
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

  internal func markBackgroundApplied(node Node) {
    node.AppliedMask = styleMaskWith(node.AppliedMask, StyleField.BackgroundColor)
  }
}

internal class TreeKeyedParent : Cell {
  internal var Mode int32

  init() { Mode = 0 }

  override func Build() Blob -> switch Mode {
    case 0: Container { Children: { keyedCell("a"), keyedCell("b") } }
    case 1: Container { Children: { keyedCell("b"), keyedCell("a") } }
    case 2: Container { Children: { keyedCell("b"), keyedCell("c"), keyedCell("a") } }
    case 3: Container { Children: { keyedCell("b"), keyedCell("a") } }
    case _: Container { Children: { keyedCell("b"), Text{ Key: "a", Content: "replacement" } } }
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
  override func Build() Blob -> Container { Children: {
    TextEntry{ Key: "entry", Value: "old" },
  } }
}

internal class TreePositionalParent : Cell {
  internal var Label string

  init() { Label = "before" }

  override func Build() Blob -> Container { Children: {
    Text{ Content: Label },
    Cell.Mount[TreePositionalCell](nil),
    Text{ Content: "tail" },
  } }
}

internal class TreePositionalCell : Cell {
  internal var Value string

  init() { Value = "initial" }

  override func Build() Blob -> Text { Content: "slot:${Value}" }
}

internal class TreeIncrementalParent : Cell {
  internal var Title string

  init() { Title = "old" }

  override func Build() Blob -> Container { Children: {
    Text{ Key: "title", Content: Title },
    Cell.Mount[string, TreeIncrementalChild]("child", Title),
  } }
}

internal class TreeBuildCountingParent : Cell {
  internal var Builds int32

  override func Build() Blob {
    Builds = Builds + 1
    return Container{ Children: {
      Text{ Key: "stable", Content: "stable" },
      Cell.Mount[string, TreeIncrementalChild]("child", ""),
    } }
  }
}

internal class TreeRemovedChildParent : Cell {
  internal var ShowChild bool

  init() { ShowChild = true }

  override func Build() Blob {
    if ShowChild {
      return Container{ Children: { Cell.Mount[string, TreeIncrementalChild]("child", "") } }
    }
    return Container{ Children: { Text{ Content: "empty" } } }
  }
}

internal class TreeIncrementalChild : Cell[string] {
  internal var Count int32
  internal var Builds int32

  init() {
    Count = 0
  }

  override func Build() Blob {
    Builds = Builds + 1
    return Container{ Children: {
      Text{ Content: Input },
      Text{ Content: "${Count}" },
    } }
  }
}

internal class TreeDisplayFocusCell : Cell {
  internal var Hidden bool

  init() { Hidden = false }

  func Hide() {
    Hidden = true
    Rebuild()
  }

  override func Build() Blob -> Container { Width: 300.0, Height: 100.0, Children: {
    TextEntry{ Key: "a", Width: 100.0, Height: 30.0 },
    Container{ Key: "hidden", Display: Hidden ? Display.None : Display.Flex, Children: {
      TextEntry{ Key: "hidden-entry", Width: 100.0, Height: 30.0 },
    } },
    TextEntry{ Key: "c", Width: 100.0, Height: 30.0 },
  } }
}

internal class TreeDisplayRetainedParent : Cell {
  internal var Hidden bool

  init() { Hidden = false }

  func Hide() {
    Hidden = true
    Rebuild()
  }
  func Show() {
    Hidden = false
    Rebuild()
  }

  override func Build() Blob -> Container { Width: 200.0, Height: 100.0, Children: {
    Container{ Key: "wrapper", Display: Hidden ? Display.None : Display.Flex, Children: {
      Cell.Mount[TreeDisplayRetainedCell]("retained", nil),
    } },
  } }
}

internal class TreeVisibilityFocusCell : Cell {
  internal var Hidden bool

  init() { Hidden = false }

  func Hide() {
    Hidden = true
    Rebuild()
  }

  override func Build() Blob -> Container { Width: 300.0, Height: 100.0, Children: {
    TextEntry{ Key: "a", Width: 100.0, Height: 30.0 },
    Container{
      Key: "hidden", Visibility: Hidden ? Visibility.Hidden : Visibility.Visible,
      Children: {
        TextEntry{
          Key: "hidden-entry", Width: 100.0, Height: 30.0,
          Visibility: Visibility.Visible,
        },
      },
    },
    TextEntry{ Key: "c", Width: 100.0, Height: 30.0 },
  } }
}

internal class TreeVisibilityRetainedParent : Cell {
  internal var Hidden bool

  init() { Hidden = false }

  func Hide() {
    Hidden = true
    Rebuild()
  }
  func Show() {
    Hidden = false
    Rebuild()
  }

  override func Build() Blob -> Container { Width: 200.0, Height: 100.0, Children: {
    Container{
      Key: "wrapper", Visibility: Hidden ? Visibility.Hidden : Visibility.Visible,
      Children: { Cell.Mount[TreeDisplayRetainedCell]("retained", nil) },
    },
  } }
}

internal class TreeDisplayRetainedCell : Cell, IDisposable {
  shared { var Disposed bool }
  internal var Count int32

  init() { Count = 0 }

  func Increment() {
    Count = Count + 1
    Rebuild()
  }

  func Dispose() { Disposed = true }

  override func Build() Blob -> Container { Children: { Text{ Content: "${Count}" } } }
}
