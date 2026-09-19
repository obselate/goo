package Goo

import System

internal class PortalFixtures {
  func OverlayOrderingInputAndGeometryContract() bool {
    let cell = PortalInputCell{}
    let window = Window{ Root: cell, Width: 200, Height: 100 }
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    let source = root.Children[0]
    guard let layout = CustomLayouts.State(source) else { return false }
    if layout.Children.Length != 1 || layout.ContentWidth != 20.0F
      || cell.ResizeHandle.BorderBox.Width != 100.0 {
        return false
      }
    let target = cell.EqualHandle.AttachedNode()
    if target == nil || hitTopmost(root, 125.0F, 25.0F) != target
      || cell.EqualHandle.BorderBox.X != 120.0 || cell.EqualHandle.BorderBox.Y != 20.0 {
        return false
      }

    window.InputForTest.QueuePointerPress(125.0F, 25.0F)
    window.InputForTest.QueuePointerRelease(125.0F, 25.0F)
    window.DrainQueuedInputForTest()
    if cell.EqualClicks != 1 || cell.LowClicks != 0 || cell.NormalClicks != 0
      || cell.SourceDowns != 1 || cell.TargetX != 5.0 || cell.TargetWindowX != 125.0 {
        return false
      }

    window.InputForTest.QueuePointerPress(80.0F, 80.0F)
    window.InputForTest.QueuePointerRelease(80.0F, 80.0F)
    window.DrainQueuedInputForTest()
    if cell.NormalClicks != 1 { return false }

    cell.EqualZ = -1
    cell.Rebuild()
    window.UpdateTree()
    guard let updated = window.Tree else { return false }
    if hitTopmost(updated, 125.0F, 25.0F)?.Key != "low-target" { return false }
    window.InputForTest.QueuePointerPress(125.0F, 25.0F)
    window.InputForTest.QueuePointerRelease(125.0F, 25.0F)
    window.DrainQueuedInputForTest()
    if cell.LowClicks != 1 || cell.EqualClicks != 1 { return false }

    window.HandleResize(300, 100)
    window.UpdateTree()
    return cell.ResizeHandle.BorderBox.Width == 150.0
  }

  func KeyedLifecycleFocusAccessibilityAndCaptureContract() bool {
    PortalRetainedCell.Disposals = 0
    let cell = PortalLifecycleCell{}
    let adapter = AccessibilityTestAdapter{}
    let window = Window{ Root: cell, Width: 200, Height: 80 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    let portal = root.Children[0]
    let target = portal.Children[0]
    if root.Children[1].Rect.Y != 0.0F { return false }
    guard let retained = target.Fiber as PortalRetainedCell ? else { return false }
    guard let semantic = findPortalAccessibility(adapter.Tree?.Root, "portal target") else { return false }
    let semanticId = semantic.Id
    using let focusScope = cell.ScopeHandle.BeginFocusScope()
    if !cell.TargetHandle.Focus() || !target.Focused { return false }
    window.QueueAccessibilityKeyForTest(Key.A)
    window.DrainQueuedInputForTest()
    window.UpdateTree()
    if retained.Keys != 1 { return false }

    window.InputForTest.QueuePointerPress(45.0F, 5.0F)
    window.DrainQueuedInputForTest()
    window.UpdateTree()

    let builds = retained.Builds
    cell.Reversed = true
    cell.Rebuild()
    window.UpdateTree()
    guard let reordered = window.Tree else { return false }
    let retainedPortal = reordered.Children[1]
    guard let retainedSemantic = findPortalAccessibility(adapter.Tree?.Root,
      "portal target") else { return false }
    if retainedPortal != portal || retainedPortal.Children[0] != target
      || target.Fiber != retained || !cell.TargetHandle.IsMounted || !target.Focused
      || retainedSemantic.Id != semanticId {
        return false
      }

    window.InputForTest.QueuePointerMove(180.0F, 70.0F, KeyModifiers{})
    window.DrainQueuedInputForTest()
    window.UpdateTree()
    if retained.Moves != 1 || retained.Builds != builds + 1 { return false }

    cell.ShowPortal = false
    cell.Rebuild()
    window.UpdateTree()
    guard let removed = window.Tree else { return false }
    window.InputForTest.QueuePointerMove(150.0F, 60.0F, KeyModifiers{})
    window.DrainQueuedInputForTest()
    let result = target.Retired && !target.Focused && !cell.TargetHandle.IsMounted
      && PortalRetainedCell.Disposals == 1 && retained.Moves == 1
      && findPortalAccessibility(adapter.Tree?.Root, "portal target") == nil
    return result
  }

  func AnchoredPlacementTracksViewportAndGeometryContract() bool {
    let cell = PortalPlacementCell{}
    let window = Window{ Root: cell, Width: 240, Height: 160 }
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 150.0, 50.0, 90.0, 50.0) {
      return false
    }
    window.InputForTest.QueuePointerPress(160.0F, 60.0F)
    window.InputForTest.QueuePointerRelease(160.0F, 60.0F)
    window.DrainQueuedInputForTest()
    if cell.Clicks != 1 || !cell.Scroll.JumpTo(50.0, 40.0) { return false }
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 120.0, 80.0, 90.0, 50.0) {
      return false
    }
    guard let anchor = cell.Anchor.AttachedNode() else { return false }
    let builds = cell.Builds
    Transforming.SetTranslateX(anchor,
      Length{ Unit: LengthUnit.Px, Value: -20.0F })
    window.UpdateTree()
    if cell.Builds != builds
      || !samePortalBox(cell.Popup.BorderBox, 100.0, 80.0, 90.0, 50.0) {
        return false
      }
    window.HandleResize(180, 100)
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 90.0, 10.0, 90.0, 50.0) {
      return false
    }
    cell.PopupWidth = 300.0
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 0.0, 10.0, 180.0, 50.0) {
      return false
    }
    window.HandleResize(240, 160)
    cell.PopupWidth = 90.0
    cell.RightToLeft = true
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 30.0, 80.0, 90.0, 50.0) {
      return false
    }
    cell.RightToLeft = false
    cell.Placement = PortalPlacement.Bottom
    cell.Rebuild()
    window.UpdateTree()
    return samePortalBox(cell.Popup.BorderBox, 65.0, 80.0, 90.0, 50.0)
  }

  func AnchoredPlacementLifecycleAndDependencyContract() bool {
    let otherAnchor = ElementHandle{}
    let other = Window{ Root: PortalForeignAnchorCell(otherAnchor),
      Width: 40, Height: 40 }
    other.UpdateTree()
    let cell = PortalAnchorLifecycleCell{}
    let adapter = AccessibilityTestAdapter{}
    let window = Window{ Root: cell, Width: 200, Height: 120 }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let initial = window.Tree else { return false }
    if !samePortalBox(cell.Popup.BorderBox, 11.0, 13.0, 30.0, 20.0)
      || !samePortalBox(cell.ForwardPopup.BorderBox, 80.0, 45.0, 30.0, 20.0)
      || initial.Children[2].PaintInputHidden || initial.Children[3].PaintInputHidden
      || !initial.Children[4].PaintInputHidden || !initial.Children[5].PaintInputHidden
      || window.PortalLayoutNeedsForTest() {
        return false
      }

    cell.SelectedAnchor = cell.Anchor
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 60.0, 50.0, 30.0, 20.0) {
      return false
    }
    cell.SelectedAnchor = nil
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 11.0, 13.0, 30.0, 20.0) {
      return false
    }

    cell.SelectedAnchor = otherAnchor
    cell.Rebuild()
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    if cell.PopupTarget.Focus() || hitTopmost(root, 16.0F, 18.0F)?.Key == "toggle-target"
      || findPortalAccessibility(adapter.Tree?.Root, "anchored target") != nil {
        return false
      }
    cell.SelectedAnchor = cell.Anchor
    cell.Rebuild()
    window.UpdateTree()
    if findPortalAccessibility(adapter.Tree?.Root, "anchored target") == nil
      || !cell.PopupTarget.Focus() {
        return false
      }
    guard let target = cell.PopupTarget.AttachedNode() else { return false }
    cell.ShowAnchor = false
    cell.Rebuild()
    window.UpdateTree()
    guard let updated = window.Tree else { return false }
    if target.Focused || hitTopmost(updated, 65.0F, 55.0F)?.Key == "toggle-target"
      || findPortalAccessibility(adapter.Tree?.Root, "anchored target") != nil
      || window.PortalLayoutNeedsForTest() {
        return false
      }
    cell.ShowAnchor = true
    cell.Rebuild()
    window.UpdateTree()
    guard let restored = window.Tree else { return false }
    return findPortalAccessibility(adapter.Tree?.Root, "anchored target") != nil
      && !restored.Children[2].PaintInputHidden
      && !restored.Children[3].PaintInputHidden
      && !window.PortalLayoutNeedsForTest()
  }
}

public partial class Window {
  internal prop InputForTest InputCoordinator { get -> input }

  internal func PortalLayoutNeedsForTest() bool {
    guard let root = node else { return false }
    return layout.NeedsLayout(root, portalRoot, float32(Width), float32(Height))
  }
}

internal func samePortalBox(value ElementRect, x float64, y float64,
  width float64, height float64) bool -> value.X == x && value.Y == y
  && value.Width == width && value.Height == height

internal func findPortalAccessibility(node AccessibilityNode?, name string) AccessibilityNode? {
  guard let current = node else { return nil }
  if current.Name == name { return current }
  for child in current.Children {
    if let found = findPortalAccessibility(child, name) { return found }
  }
  return nil
}

internal class PortalFixtureLayout : LayoutAlgorithm {
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    let child = context.MeasureChild(0, available)
    return LayoutSize{ Width: child.Width, Height: child.Height }
  }

  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    context.ArrangeChild(0, ElementRect{ X: 0.0, Y: 0.0, Width: 20.0, Height: 20.0 })
  }
}

internal class PortalInputCell : Cell {
  internal let EqualHandle ElementHandle = ElementHandle{}
  internal let ResizeHandle ElementHandle = ElementHandle{}
  internal var EqualZ int32 = 10
  internal var EqualClicks int32
  internal var LowClicks int32
  internal var NormalClicks int32
  internal var SourceDowns int32
  internal var TargetX float64
  internal var TargetWindowX float64

  override func Build() Blob -> Container() {.Width: 200,.Height: 100,
    Container() {.Key: "source",.Width: 40,.Height: 40,.Layout: PortalFixtureLayout{},.Overflow: Overflow.Hidden,.Opacity: 0.0,.Transform: PanelTransform{ Scale: 0 },.OnPointerDown: (e PointerEvent) -> SourceDowns++,
      Container{ Key: "flow", Width: 20, Height: 20 },
      Portal{Key: "low", ZIndex: 10, Width: 40, Height: 40, Transform: PanelTransform{ TranslateX: 120, TranslateY: 20 }, TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
        Container{ Key: "low-target", Width: 40, Height: 40,
          OnClick: () -> LowClicks++ },
      },
      Portal{Key: "equal", ZIndex: EqualZ, Width: 40, Height: 40, Transform: PanelTransform{ TranslateX: 120, TranslateY: 20 }, TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
        Container{ Key: "equal-target", Handle: EqualHandle, Width: 40, Height: 40,
          OnClick: () -> EqualClicks++,
          OnPointerDown: (e PointerEvent) -> {
            TargetX = e.Position.X
            TargetWindowX = e.WindowPosition.X
          },
        },
      },
      Portal{Key: "miss", ZIndex: 20, Width: 20, Height: 20, Transform: PanelTransform{ TranslateX: 170, TranslateY: 70 }, TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
        Container{ Width: 20, Height: 20, OnClick: () -> EqualClicks++ },
      },
      Portal{Key: "resize", Width: Length.Percent(50), Height: 10,
        Container{ Handle: ResizeHandle, Width: Length.Percent(100), Height: 10 },
      },
    },
    Container{ Key: "normal", Position: PositionType.Absolute,
      Width: Length.Percent(100), Height: Length.Percent(100),
      OnClick: () -> NormalClicks++ },
  }
}

internal data struct PortalRetainedInput(Target ElementHandle) { }

internal class PortalRetainedCell : Cell[PortalRetainedInput], IDisposable {
  shared { internal var Disposals int32 }
  internal var Builds int32
  internal var Moves int32
  internal var Keys int32

  func Dispose() { Disposals++ }

  override func Build() Blob {
    Builds++
    return Container{
      Handle: Input.Target,
      Width: 40,
      Height: 40,
      Focusable: true,
      Accessibility: Accessibility{ Role: AccessibilityRole.Generic, Name: "portal target" },
      OnPointerDown: (e PointerEvent) -> e.Capture(),
      OnPointerMove: (e PointerEvent) -> Moves++,
      OnKeyDown: (e KeyEvent) -> Keys++,
    }
  }
}

internal class PortalLifecycleCell : Cell {
  internal let ScopeHandle ElementHandle = ElementHandle{}
  internal let TargetHandle ElementHandle = ElementHandle{}
  internal var Reversed bool
  internal var ShowPortal bool = true

  override func Build() Blob {
    let root = Container{
      Handle: ScopeHandle,
      Width: 200,
      Height: 80,
      Focusable: true,
      Accessibility: Accessibility{ Role: AccessibilityRole.Generic, Name: "scope" },
    }
    let tail = Container{ Key: "tail", Width: 20, Height: 20 }
    if !ShowPortal {
      root.Add(tail)
      return root
    }
    let portal = Portal{Key: "portal", ZIndex: 5, Width: 40, Height: 40, Transform: PanelTransform{ TranslateX: 40 }, TransformOriginX: Length.Percent(0), TransformOriginY: Length.Percent(0),
      Cell.Mount[PortalRetainedInput, PortalRetainedCell]("retained",
        PortalRetainedInput(TargetHandle)),
    }
    if Reversed {
      root.Add(tail)
      root.Add(portal)
    } else {
      root.Add(portal)
      root.Add(tail)
    }
    return root
  }
}

internal class PortalPlacementCell : Cell {
  internal let Scroll ElementHandle = ElementHandle{}
  internal let Anchor ElementHandle = ElementHandle{}
  internal let Popup ElementHandle = ElementHandle{}
  internal var PopupWidth float64 = 90.0
  internal var RightToLeft bool
  internal var Placement PortalPlacement
  internal var Clicks int32
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return Container{Width: Length.Percent(100), Height: Length.Percent(100),
      Container{Handle: Scroll, Width: 200, Height: 120, Overflow: Overflow.Scroll,
        Container{Width: 300, Height: 300, Position: PositionType.Relative,
          Container{Handle: Anchor, Position: PositionType.Absolute,
            Left: 170, Top: 100, Width: 20, Height: 20},
          Portal{Handle: Popup, Anchor: Anchor,
            Placement: Placement,
            Direction: RightToLeft ? Direction.RightToLeft : Direction.LeftToRight,
            Overflow: Overflow.Scroll,
            Container{Width: PopupWidth, Height: 50,
              OnClick: () -> Clicks++},
          },
        },
      },
    }
  }
}

internal class PortalAnchorLifecycleCell : Cell {
  internal let Anchor ElementHandle = ElementHandle{}
  internal let Popup ElementHandle = ElementHandle{}
  internal let PopupTarget ElementHandle = ElementHandle{}
  internal let ForwardAnchor ElementHandle = ElementHandle{}
  internal let ForwardPopup ElementHandle = ElementHandle{}
  internal let CycleA ElementHandle = ElementHandle{}
  internal let CycleB ElementHandle = ElementHandle{}
  internal var SelectedAnchor ElementHandle?
  internal var ShowAnchor bool = true

  override func Build() Blob -> Container{Width: 200, Height: 120,
    if ShowAnchor {
      Container{Key: "anchor", Handle: Anchor, Position: PositionType.Absolute,
        Left: 60, Top: 40, Width: 20, Height: 10}
    } else {
      Container{Key: "anchor-missing", Width: 1, Height: 1}
    },
    Portal{Key: "toggle", Handle: Popup, Anchor: SelectedAnchor,
      Position: PositionType.Absolute, Left: 11, Top: 13, Width: 30, Height: 20,
      Container{Key: "toggle-target", Handle: PopupTarget,
        Width: 30, Height: 20, Focusable: true,
        Accessibility: Accessibility{Role: AccessibilityRole.Generic,
          Name: "anchored target"}},
    },
    Portal{Key: "forward", Handle: ForwardPopup, Anchor: ForwardAnchor,
      Placement: PortalPlacement.RightEnd, Width: 30, Height: 20,
      Container{Width: 30, Height: 20},
    },
    Portal{Key: "forward-host", Anchor: Anchor, Width: 50, Height: 50,
      Container{Handle: ForwardAnchor, Position: PositionType.Absolute,
        Left: 10, Top: 5, Width: 10, Height: 10},
    },
    Portal{Key: "cycle-a", Anchor: CycleB, Width: 10, Height: 10,
      Container{Handle: CycleA, Width: 10, Height: 10}},
    Portal{Key: "cycle-b", Anchor: CycleA, Width: 10, Height: 10,
      Container{Handle: CycleB, Width: 10, Height: 10}},
  }
}

internal class PortalForeignAnchorCell : Cell {
  private let handle ElementHandle

  internal init(handle ElementHandle) {
    this.handle = handle
  }

  override func Build() Blob -> Container{Handle: handle, Width: 10, Height: 10}
}
