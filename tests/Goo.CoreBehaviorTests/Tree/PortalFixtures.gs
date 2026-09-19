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
}

public partial class Window {
  internal prop InputForTest InputCoordinator { get -> input }
}

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
