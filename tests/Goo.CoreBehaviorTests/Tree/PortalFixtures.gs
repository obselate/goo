package Goo

import System
import System.Numerics

internal class PortalFixtures {
  func DeclarativeModalFocusTrapContract() bool {
    let cell = DeclarativePortalCell{ Options: FocusScopeOptions{ Modal: true } }
    let window = Window{ Root: cell, Size: LayoutSize(200, 100) }
    window.UpdateTree()
    if !cell.Trigger.Focus() { return false }
    cell.Open = true
    cell.Rebuild()
    window.UpdateTree()
    if cell.First.AttachedNode()?.Focused != true || cell.Trigger.Focus() { return false }
    window.InputForTest.QueueKeyPress(Key.Tab, KeyModifiers.None)
    window.DrainQueuedInputForTest()
    if cell.Initial.AttachedNode()?.Focused != true { return false }
    window.InputForTest.QueueKeyPress(Key.Tab, KeyModifiers.None)
    window.DrainQueuedInputForTest()
    return cell.First.AttachedNode()?.Focused == true
  }

  func DeclarativePortalRestoreFocusContract() bool {
    for restore in []bool{ false, true } {
      let cell = DeclarativePortalCell{ Options: FocusScopeOptions{ Modal: true, RestoreFocus: restore } }
      let window = Window{ Root: cell, Size: LayoutSize(200, 100) }
      window.UpdateTree()
      if !cell.Trigger.Focus() { return false }
      cell.Open = true
      cell.Rebuild()
      window.UpdateTree()
      cell.Options = FocusScopeOptions{ RestoreFocus: restore }
      cell.Rebuild()
      window.UpdateTree()
      cell.Open = false
      cell.Rebuild()
      window.UpdateTree()
      if cell.Trigger.AttachedNode()?.Focused != restore { return false }
    }
    return true
  }

  func DeclarativePortalInitialFocusContract() bool {
    let cell = DeclarativePortalCell{}
    cell.Options = FocusScopeOptions{ Modal: true, InitialFocus: cell.Initial }
    let window = Window{ Root: cell, Size: LayoutSize(200, 100) }
    window.UpdateTree()
    cell.Open = true
    cell.Rebuild()
    window.UpdateTree()
    return cell.Initial.AttachedNode()?.Focused == true && cell.First.AttachedNode()?.Focused == false
  }

  func DeclarativePortalDismissalContract() bool {
    let cell = DeclarativePortalCell{ Options: FocusScopeOptions{ Modal: true }, Dismissable: true }
    let window = Window{ Root: cell, Size: LayoutSize(200, 100) }
    window.UpdateTree()
    cell.Open = true
    cell.Rebuild()
    window.UpdateTree()
    guard let tree = window.Tree, let scrim = Portals.Overlay(tree)?.Children[0] else { return false }
    if scrim.Rect.W != 200 || scrim.Rect.H != 100 || scrim.BackgroundColor != Color.Transparent { return false }
    if !cell.Initial.Focus() { return false }
    window.QueueCompositionForTest("pending", 0, 1)
    window.DrainTextInputForTest()
    window.InputForTest.QueueKeyPress(Key.Escape, KeyModifiers.None)
    window.DrainQueuedInputForTest()
    if cell.Dismissals != 0 { return false }
    window.InputForTest.QueueKeyPress(Key.Escape, KeyModifiers.None)
    window.DrainQueuedInputForTest()
    if cell.Dismissals != 1 || cell.Reason != PopupDismissReason.Escape { return false }
    window.InputForTest.QueuePointerPress(180.0F, 80.0F)
    window.InputForTest.QueuePointerRelease(180.0F, 80.0F)
    window.DrainQueuedInputForTest()
    return cell.Dismissals == 2 && cell.Reason == PopupDismissReason.OutsideInteraction && cell.Clicks == 0
  }

  func NonmodalPortalDismissesEscapeWithOutsideFocusContract() bool {
    let cell = DeclarativePortalCell{ Dismissable: true }
    let window = Window{ Root: cell, Size: LayoutSize(200, 100) }
    window.UpdateTree()
    cell.Open = true
    cell.Rebuild()
    window.UpdateTree()
    if !cell.Trigger.Focus() || cell.Trigger.AttachedNode()?.Focused != true { return false }
    window.InputForTest.QueueKeyPress(Key.Escape, KeyModifiers.None)
    window.DrainQueuedInputForTest()
    if cell.Dismissals != 1 || cell.Reason != PopupDismissReason.Escape || !cell.Trigger.Focus() { return false }
    cell.Dismissable = false
    cell.Rebuild()
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    return cell.Trigger.AttachedNode()?.Focused == true && FocusScopes.TraversalRoot(root) == root
  }

  func PopupMeasuredPlacementContract() bool {
    let owner = Window{ Size: LayoutSize(200, 100), UiScale: 1.5F }
    owner.UpdateTree()
    using let popup = PopupWindow(owner, PopupMeasurementCell{})
    let measured = popup.ResolveSizeForTest(nil, LayoutSize(100, 60))
    if measured != LayoutSize(100, 60) { throw InvalidOperationException("bounded popup size: ${measured}") }
    let natural = popup.ResolveSizeForTest(nil, nil)
    if Math.Abs(natural.Width * 1.5 - Math.Round(120.5 * 1.5)) > 0.0001
      || Math.Abs(natural.Height * 1.5 - Math.Round(80.25 * 1.5)) > 0.0001 { return false }
    let explicitSize = popup.ResolveSizeForTest(LayoutSize(250.5, 160.25), LayoutSize(100, 60))
    if explicitSize != LayoutSize(250.5, 160.25) { return false }
    owner.PopupAvailableSize = () -> LayoutSize(80, 50)
    if popup.ResolveSizeForTest(nil, LayoutSize(100, 60)) != LayoutSize(80, 50) { return false }
    for percentage in []float64{ 50, 100 } {
      owner.PopupAvailableSize = () -> LayoutSize(200, 100)
      using let relative = PopupWindow(owner, PopupPercentageCell{ Percentage: percentage })
      let expected = LayoutSize(200 * percentage / 100, 100 * percentage / 100)
      let first = relative.ResolveSizeForTest(nil, nil)
      if first != expected { throw InvalidOperationException("percentage ${percentage} first ${first}, expected ${expected}") }
      relative.LayoutForTest(expected)
      if relative.RootSizeForTest != expected { throw InvalidOperationException("percentage ${percentage} layout ${relative.RootSizeForTest}, expected ${expected}") }
      let updated = relative.ResolveSizeForTest(nil, nil)
      if updated != expected { throw InvalidOperationException("percentage ${percentage} update ${updated}, expected ${expected}") }
      relative.LayoutForTest(expected)
      if relative.RootSizeForTest != expected { throw InvalidOperationException("percentage ${percentage} updated layout ${relative.RootSizeForTest}, expected ${expected}") }
      relative.ResolveSizeForTest(expected, nil)
      relative.LayoutForTest(expected)
      if relative.RootSizeForTest != LayoutSize(expected.Width * percentage / 100, expected.Height * percentage / 100) {
        throw InvalidOperationException("percentage ${percentage} explicit layout ${relative.RootSizeForTest}")
      }
    }
    for size in []LayoutSize{ LayoutSize(0, 1), LayoutSize(Double.NaN, 1), LayoutSize(1, Double.PositiveInfinity) } {
      var rejected = false
      try { PopupWindow.ValidatePlacement(ElementRect{}, size, nil, PortalPlacement.BottomStart) }
      catch (ArgumentOutOfRangeException) { rejected = true }
      if !rejected { return false }
    }
    return true
  }
  func UiScaleLayoutInputAndAnchoredPortalContract() bool {
    let cell = PortalPlacementCell{}
    let window = Window{Root: cell, Size: LayoutSize(float64(300) / 1.25, float64(200) / 1.25),  UiScale: 1.25F}
    window.UpdateTree()
    let popup = cell.Popup.BorderBox
    let physicalScale = float64(window.UiScale)
    if window.Tree?.Rect.W != 240.0F || window.Tree?.Rect.H != 160.0F
      || Math.Abs(popup.X * physicalScale - (float64(window.NativeWidth) - 113.0)) > 0.0001
      || Math.Abs(popup.Y * physicalScale - (100.0 * physicalScale - 63.0)) > 0.0001
      || Math.Abs(popup.Width * physicalScale - 113.0) > 0.0001
      || Math.Abs(popup.Height * physicalScale - 63.0) > 0.0001 { return false }
    window.PlatformInput.PointerPress(0, PointerDevice.Mouse, 200.0F, 75.0F,
      PointerButton.Primary, KeyModifiers{}, 1.0F)
    window.PlatformInput.PointerRelease(0, PointerDevice.Mouse, 200.0F, 75.0F,
      PointerButton.Primary, KeyModifiers{}, 0.0F)
    if cell.Clicks != 1 { return false }
    let normal = PortalInputCell{}
    let hitWindow = Window{Root: normal, Size: LayoutSize(float64(250) / 1.25, float64(125) / 1.25),  UiScale: 1.25F}
    hitWindow.UpdateTree()
    hitWindow.PlatformInput.PointerPress(0, PointerDevice.Mouse, 100.0F, 100.0F,
      PointerButton.Primary, KeyModifiers{}, 1.0F)
    hitWindow.PlatformInput.PointerRelease(0, PointerDevice.Mouse, 100.0F, 100.0F,
      PointerButton.Primary, KeyModifiers{}, 0.0F)
    if normal.NormalClicks != 1 { return false }
    window.UiScale = 1.0F
    window.UpdateTree()
    if window.Tree?.Rect.W != 300.0F || window.Tree?.Rect.H != 200.0F { return false }
    let child = Window{Owner: window}
    if child.UiScale != 1.0F { return false }
    window.UiScale = 1.5F
    if child.UiScale != 1.5F { return false }
    child.UiScale = 1.25F
    window.UiScale = 0.8F
    if child.UiScale != 1.25F { return false }
    window.UiScale = 10.0F
    if window.UiScale != 3.0F { return false }
    window.UiScale = 0.0F
    return window.UiScale == 0.5F
  }

  func WindowPointPortalSharesDevicePixelRowsWithTreeContract() bool {
    for padding in []float64{ 4, 6 } {
      for scale in []float32{ 1.0F, 1.25F, 1.5F, 2.25F } {
        for display in []float32{ 1, 1.5F } {
          if display != 1 && scale != 1.5F { continue }
          for capped in []bool{ false, true } {
            let cell = PortalRowAlignmentCell{ Padding: padding, Capped: capped }
            let window = Window{ Root: cell, Size: LayoutSize(600, 600), }
            window.SetDisplayScaleForTest(display)
            cell.Scale = window.PixelScale
            window.UpdateTree()
            window.UiScale = scale
            window.Size = LayoutSize(600, 600)
            cell.Scale = window.PixelScale
            cell.Rebuild()
            var notifications = 0
            cell.Field.MetricsChanged += metrics -> {
              if !metrics.IsMounted { return }
              notifications++
              cell.FieldBox = metrics.RawBorderBox
              cell.Rebuild()
            }
            window.UpdateTree()
            window.UpdateTree()
            let snapped = cell.Field.BorderBox
            let before = notifications
            let density = float64(window.PixelScale)
            for move in []float64{ 0, 0.1 } {
              cell.Offset = move
              cell.Rebuild()
              window.UpdateTree()
              window.UpdateTree()
              let fieldRow = cell.FieldText.BorderBox.Y * density
              let optionRow = cell.OptionText.BorderBox.Y * density
              if !capped && Math.Round(fieldRow) != Math.Round(optionRow) {
                throw InvalidOperationException("display=${display}, scale=${scale}, padding=${padding}, move=${move}, field=${fieldRow}, option=${optionRow}")
              }
              if capped {
                let box = cell.Popup.BorderBox
                if Math.Round(box.Y * density) < Math.Round(4.0 * density)
                  || Math.Round((box.Y + box.Height) * density) > Math.Round(596.0 * density) { return false }
              }
            }
            if cell.Field.BorderBox.Y != snapped.Y || notifications <= before { return false }
          }
        }
      }
    }
    for rotate in []bool{ false, true } {
      let cell = RawBoundsTransformCell{ Rotate: rotate }
      let window = Window{ Root: cell, Size: LayoutSize(100, 100), }
      window.UpdateTree()
      let actual = cell.Handle.RawBorderBox
      let expected = rotate
        ? ElementRect{ X: -0.5, Y: 11.5, Width: 20, Height: 10 }
        : ElementRect{ X: -0.5, Y: -3.5, Width: 20, Height: 40 }
      if Math.Abs(actual.X - expected.X) > 0.0001 || Math.Abs(actual.Y - expected.Y) > 0.0001
        || Math.Abs(actual.Width - expected.Width) > 0.0001 || Math.Abs(actual.Height - expected.Height) > 0.0001 {
        throw InvalidOperationException("raw transform rotate=${rotate}, actual=${actual}")
      }
    }
    return true
  }

  func TranslatedWindowPointPortalSharesDeviceRowsContract() bool {
    let cell = PortalRowAlignmentCell{ Padding: 6, Translate: 6, Offset: 1 }
    let window = Window{ Root: cell, Size: LayoutSize(720, 520), }
    window.SetDisplayScaleForTest(1.5F)
    cell.Scale = window.PixelScale
    window.UpdateTree()
    window.UiScale = 1.5F
    window.Size = LayoutSize(720, 520)
    cell.Scale = window.PixelScale
    cell.Field.MetricsChanged += metrics -> {
      if !metrics.IsMounted { return }
      cell.FieldBox = metrics.RawBorderBox
      cell.Rebuild()
    }
    cell.Rebuild()
    window.UpdateTree()
    window.UpdateTree()
    let density = float64(window.PixelScale)
    let fieldRow = cell.FieldText.BorderBox.Y * density
    let optionRow = cell.OptionText.BorderBox.Y * density
    if MathF.Round(float32(fieldRow)) != MathF.Round(float32(optionRow)) {
      throw InvalidOperationException("translated field=${fieldRow}, option=${optionRow}")
    }
    guard let root = window.Tree, let field = cell.Field.AttachedNode() else { return false }
    let border = cell.Field.BorderBox
    let raw = cell.Field.RawBorderBox
    let content = cell.Field.ContentBox
    let translation = Math.Round(6 * density) / density
    if border.Y != float64(field.Rect.Y + float32(translation))
      || raw.Y != float64(167.5F + float32(translation))
      || content.Y != float64(BoxGeometry.ContentTop(field) + float32(translation)) {
      throw InvalidOperationException("border=${border.Y}, raw=${raw.Y}, rect=${field.Rect.Y}, translation=${translation}, field=${fieldRow}, option=${optionRow}")
    }
    return hitTopmost(root, float32(border.X + 1), float32(border.Y + 0.01)) == field
      && hitTopmost(root, float32(border.X + 1), float32(border.Y - 0.01)) != field
  }

  func OverlayOrderingInputAndGeometryContract() bool {
    let cell = PortalInputCell{}
    let window = Window{ Root: cell, Size: LayoutSize(200, 100), }
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
    let window = Window{ Root: cell, Size: LayoutSize(200, 80), }
    window.AccessibilityAdapter = adapter
    window.UpdateTree()
    guard let root = window.Tree else { return false }
    let portal = root.Children[0]
    let target = portal.Children[0]
    if root.Children[1].Rect.Y != 0.0F { return false }
    guard let retained = target.Fiber as PortalRetainedCell ? else { return false }
    guard let semantic = findPortalAccessibility(adapter.Tree?.Root, "portal target") else { return false }
    let semanticId = semantic.Id
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
    let window = Window{ Root: cell, Size: LayoutSize(240, 160), }
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

  func AnchoredSubrectangleAndCollisionBoundsContract() bool {
    let cell = PortalPlacementCell{}
    let window = Window{ Root: cell, Size: LayoutSize(240, 160), }
    window.UpdateTree()
    cell.AnchorRect = ElementRect{ X: 5, Y: 2, Width: 10, Height: 8 }
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 150.0, 110.0, 90.0, 50.0) { return false }
    cell.CollisionBounds = ElementRect{ X: 20, Y: 15, Width: 180, Height: 130 }
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 110.0, 52.0, 90.0, 50.0) { return false }
    cell.CollisionBounds = ElementRect{ X: 20, Y: 70, Width: 180, Height: 70 }
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 110.0, 70.0, 90.0, 32.0) { return false }
    cell.Placement = PortalPlacement.RightStart
    cell.CollisionBounds = ElementRect{ X: 20, Y: 15, Width: 180, Height: 130 }
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 85.0, 95.0, 90.0, 50.0) { return false }
    cell.Placement = PortalPlacement.BottomStart
    cell.Rebuild()
    window.UpdateTree()
    guard let anchor = cell.Anchor.AttachedNode() else { return false }
    let builds = cell.Builds
    Transforming.SetScale(anchor, 2.0F)
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 110.0, 44.0, 90.0, 50.0) { return false }
    Transforming.SetScale(anchor, 1.0F)
    Transforming.SetTranslateX(anchor, Length{ Unit: LengthUnit.Px, Value: -80.0F })
    window.UpdateTree()
    if cell.Builds != builds
      || !samePortalBox(cell.Popup.BorderBox, 95.0, 52.0, 90.0, 50.0) { return false }
    if !cell.Scroll.JumpTo(20.0, 30.0) { return false }
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 75.0, 80.0, 90.0, 50.0) { return false }
    cell.Placement = PortalPlacement.RightStart
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 85.0, 72.0, 90.0, 50.0) { return false }
    cell.CollisionBounds = ElementRect{ X: 90, Y: 15, Width: 70, Height: 100 }
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 90.0, 65.0, 70.0, 50.0) { return false }
    cell.AnchorRect = nil
    cell.CollisionBounds = nil
    cell.Rebuild()
    window.UpdateTree()
    return samePortalBox(cell.Popup.BorderBox, 90.0, 70.0, 90.0, 50.0)
  }

  func AnchoredPlacementSizesToSelectedSideContract() bool {
    let cell = PortalSideSizeCell{}
    let window = Window{ Root: cell, Size: LayoutSize(720, 520), }
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 270.0, 192.0, 320.0, 250.0) { return false }
    window.HandleResize(720, 320)
    cell.Bounds = ElementRect{ X: 8, Y: 8, Width: 704, Height: 304 }
    cell.Rebuild()
    for pass in 0 ... 8 {
      window.UpdateTree()
      if !samePortalBox(cell.Popup.BorderBox, 270.0, 8.0, 320.0, 152.0)
        || window.PortalLayoutNeedsForTest() { return false }
    }
    cell.Placement = PortalPlacement.BottomStart
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 270.0, 8.0, 320.0, 152.0) { return false }
    window.HandleResize(720, 520)
    cell.Bounds = ElementRect{ X: 8, Y: 8, Width: 704, Height: 504 }
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 270.0, 192.0, 320.0, 250.0) { return false }
    cell.Placement = PortalPlacement.TopEnd
    cell.Height = 40.0
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 8.0, 120.0, 320.0, 40.0) { return false }
    cell.Placement = PortalPlacement.LeftStart
    cell.Width = 600.0
    cell.Height = 250.0
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 310.0, 160.0, 402.0, 250.0) { return false }
    cell.Width = 80.0
    cell.Rebuild()
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 190.0, 160.0, 80.0, 250.0) { return false }
    guard let anchor = cell.Anchor.AttachedNode() else { return false }
    Transforming.SetTranslateX(anchor, Length{ Unit: LengthUnit.Px, Value: 400.0F })
    window.UpdateTree()
    if !samePortalBox(cell.Popup.BorderBox, 590.0, 160.0, 80.0, 250.0) { return false }
    Transforming.SetTranslateX(anchor, Length{ Unit: LengthUnit.Px })
    window.HandleResize(720, 320)
    cell.Width = 600.0
    cell.Bounds = ElementRect{ X: 8, Y: 8, Width: 704, Height: 304 }
    for ordinal in 0 ... 12 {
      cell.Placement = PortalPlacement(ordinal)
      cell.Rebuild()
      window.UpdateTree()
      let box = cell.Popup.BorderBox
      if box.X < 8.0 || box.Y < 8.0 || box.X + box.Width > 712.0
        || box.Y + box.Height > 312.0 { return false }
      if ordinal < 6 {
        if box.Y + box.Height > 160.0 && box.Y < 192.0 { return false }
      } else {
        if box.X + box.Width > 270.0 && box.X < 310.0 { return false }
      }
    }
    return true
  }

  func ClippedAnchorPreservesMountedEditorContract() bool {
    let cell = PortalClippedAnchorCell{}
    let adapter = AccessibilityTestAdapter{}
    let window = Window{ Root: cell, Size: LayoutSize(240, 160),  AccessibilityAdapter: adapter }
    window.UpdateTree()
    guard let root = window.Tree, let entry = cell.Editor.AttachedNode(),
      let portal = entry.Parent, let retained = entry.Fiber as PortalClippedEditorCell ? else { return false }
    guard let focusScope = Portals.State(portal)?.Scope else { return false }
    if !cell.Editor.Focus() { return false }
    window.QueueCompositionForTest("pending", 1, 2)
    window.DrainTextInputForTest()
    window.UpdateTree()
    guard let before = window.InputForTest.EditorSnapshot() else { return false }
    let builds = retained.Builds
    let hostBuilds = cell.Builds
    let box = cell.Editor.BorderBox
    if !Portals.Presented(portal) || hitTopmost(root, float32(box.X + 5.0),
      float32(box.Y + 5.0)) != entry || before.CompositionStart < 0 { return false }
    if !cell.Scroll.JumpTo(0.0, 70.0) { return false }
    window.UpdateTree()
    if portal.PaintInputHidden { return false }
    if !cell.Scroll.JumpTo(0.0, 80.0) { return false }
    window.UpdateTree()
    let hiddenBox = cell.Editor.BorderBox
    guard let hidden = window.InputForTest.EditorSnapshot() else { return false }
    if !portal.PortalAnchorClipped || !portal.PaintInputHidden || Portals.Presented(portal)
      || hitTopmost(root, float32(hiddenBox.X + 5.0), float32(hiddenBox.Y + 5.0)) == entry
      || findPortalAccessibility(adapter.Tree?.Root, "retained editor") != nil
      || !entry.Focused || !focusScope.IsActive || cell.Editor.AttachedNode() != entry || entry.Fiber != retained
      || retained.Builds != builds || cell.Builds != hostBuilds
      || hidden.Text != before.Text || hidden.SelectionStart != before.SelectionStart
      || hidden.SelectionEnd != before.SelectionEnd
      || hidden.CompositionStart != before.CompositionStart
      || hidden.CompositionEnd != before.CompositionEnd { return false }
    if !cell.Scroll.JumpTo(0.0, 0.0) { return false }
    window.UpdateTree()
    if portal.PaintInputHidden || !Portals.Presented(portal) || !entry.Focused || !focusScope.IsActive
      || retained.Builds != builds || cell.Builds != hostBuilds
      || !samePortalBox(cell.Editor.BorderBox, box.X, box.Y, box.Width, box.Height)
      || hitTopmost(root, float32(box.X + 5.0), float32(box.Y + 5.0)) != entry
      || findPortalAccessibility(adapter.Tree?.Root, "retained editor") == nil { return false }
    cell.HideWhenClipped = false
    cell.Rebuild()
    window.UpdateTree()
    if !cell.Scroll.JumpTo(0.0, 80.0) { return false }
    window.UpdateTree()
    return !portal.PaintInputHidden && entry.Focused && cell.Editor.AttachedNode() == entry
  }

  func AnchoredPlacementLifecycleAndDependencyContract() bool {
    let otherAnchor = ElementHandle{}
    let other = Window{ Root: PortalForeignAnchorCell(otherAnchor),
      Size: LayoutSize(40, 40), }
    other.UpdateTree()
    let cell = PortalAnchorLifecycleCell{}
    let adapter = AccessibilityTestAdapter{}
    let window = Window{ Root: cell, Size: LayoutSize(200, 120), }
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

  func FocusScopeCloseRestoreContract() bool {
    let cell = FocusScopeCloseCell{}
    let window = Window{ Root: cell, Size: LayoutSize(200, 100), }
    window.UpdateTree()
    for nested in []bool{ false, true } {
      for restore in []bool{ false, true } {
        cell.Open = true
        cell.Rebuild()
        window.UpdateTree()
        if !cell.Trigger.Focus() { return false }
        let registration = cell.Outer.BeginFocusScope()
        window.UpdateTree()
        var child FocusScope?
        if nested {
          child = cell.Inner.BeginFocusScope()
          window.UpdateTree()
        }
        if cell.Trigger.AttachedNode()?.Focused != false { return false }
        registration.Dispose(restore)
        child?.Dispose()
        cell.Open = false
        cell.Rebuild()
        window.UpdateTree()
        if cell.Trigger.AttachedNode()?.Focused != restore { return false }
      }
    }
    return true
  }
}

public sealed partial class PopupWindow {
  internal func ResolveSizeForTest(size LayoutSize?, maximum LayoutSize?) LayoutSize -> resolveSize(size, maximum)
  internal prop RootSizeForTest LayoutSize { get -> LayoutSize(float64(window.Tree?.Rect.W ?? 0), float64(window.Tree?.Rect.H ?? 0)) }
  internal func LayoutForTest(size LayoutSize) {
    window.Size = size
    window.UpdateTree()
  }
}

internal class PopupMeasurementCell : Cell {
  override func Build() Blob -> Container{ Width: 120.5, Height: 80.25 }
}

internal class PopupPercentageCell : Cell {
  internal var Percentage float64
  override func Build() Blob -> Container{ Width: Percent(Percentage), Height: Percent(Percentage) }
}

internal class DeclarativePortalCell : Cell {
  internal let Trigger ElementHandle = ElementHandle()
  internal let First ElementHandle = ElementHandle()
  internal let Initial ElementHandle = ElementHandle()
  internal var Options FocusScopeOptions?
  internal var Open bool
  internal var Dismissable bool
  internal var Dismissals int32
  internal var Clicks int32
  internal var Reason PopupDismissReason

  override func Build() Blob {
    let root = Container{ Width: Percent(100), Height: Percent(100),
      Button{ Handle: Trigger, Width: Percent(100), Height: Percent(100), OnClick: () -> { Clicks++ } } }
    if Open {
      root.Add(Portal{ Key: "dialog", Width: 100, Height: 60,
        FocusScope: Options, AccessibilityRole: AccessibilityRole.Dialog, AccessibilityName: "dialog",
        OnDismiss: Dismissable ? Dismiss : nil,
        Button{ Handle: First, AutoFocus: true, Height: 20 },
        TextEntry{ Handle: Initial, Height: 20 },
      })
    }
    return root
  }

  private func Dismiss(reason PopupDismissReason) {
    Dismissals++
    Reason = reason
  }
}

internal class FocusScopeCloseCell : Cell {
  internal let Trigger ElementHandle = ElementHandle{}
  internal let Outer ElementHandle = ElementHandle{}
  internal let Inner ElementHandle = ElementHandle{}
  internal var Open bool

  override func Build() Blob {
    let root = Container{ Width: 200, Height: 100,
      Button{ Key: "trigger", Handle: Trigger, Height: 20 },
    }
    if Open {
      root.Children.Add(Container{ Key: "scope", Handle: Outer, Focusable: true, Height: 40,
        Container{ Handle: Inner, Focusable: true, TabStop: false, Height: 40,
          Button{ Height: 20 },
        },
      })
    }
    return root
  }
}

public partial class Window {
  internal prop InputForTest InputCoordinator { get -> input }

  internal func SetDisplayScaleForTest(value float32) {
    dpi = Vector2(value, value)
  }

  internal func PortalLayoutNeedsForTest() bool {
    guard let root = node else { return false }
    return layout.NeedsLayout(root, portalRoot, float32(NativeWidth), float32(NativeHeight))
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
    return LayoutSize(child.Width, child.Height)
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
      Portal{Key: "low", ZIndex: 10, Width: 40, Height: 40, Transform: PanelTransform{ TranslateX: 120, TranslateY: 20 }, TransformOriginX: Percent(0), TransformOriginY: Percent(0),
        Container{ Key: "low-target", Width: 40, Height: 40,
          OnClick: () -> LowClicks++ },
      },
      Portal{Key: "equal", ZIndex: EqualZ, Width: 40, Height: 40, Transform: PanelTransform{ TranslateX: 120, TranslateY: 20 }, TransformOriginX: Percent(0), TransformOriginY: Percent(0),
        Container{ Key: "equal-target", Handle: EqualHandle, Width: 40, Height: 40,
          OnClick: () -> EqualClicks++,
          OnPointerDown: (e PointerEvent) -> {
            TargetX = e.Position.X
            TargetWindowX = e.WindowPosition.X
          },
        },
      },
      Portal{Key: "miss", ZIndex: 20, Width: 20, Height: 20, Transform: PanelTransform{ TranslateX: 170, TranslateY: 70 }, TransformOriginX: Percent(0), TransformOriginY: Percent(0),
        Container{ Width: 20, Height: 20, OnClick: () -> EqualClicks++ },
      },
      Portal{Key: "resize", Width: Percent(50), Height: 10,
        Container{ Handle: ResizeHandle, Width: Percent(100), Height: 10 },
      },
    },
    Container{ Key: "normal", Position: PositionType.Absolute,
      Width: Percent(100), Height: Percent(100),
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
  internal let TargetHandle ElementHandle = ElementHandle{}
  internal var Reversed bool
  internal var ShowPortal bool = true

  override func Build() Blob {
    let root = Container{
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
    let portal = Portal{Key: "portal", ZIndex: 5, Width: 40, Height: 40, Transform: PanelTransform{ TranslateX: 40 }, TransformOriginX: Percent(0), TransformOriginY: Percent(0),
      FocusScope: FocusScopeOptions(),
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
  internal var AnchorRect ElementRect?
  internal var CollisionBounds ElementRect?
  internal var Clicks int32
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return Container{Width: Percent(100), Height: Percent(100),
      Container{Handle: Scroll, Width: 200, Height: 120, Overflow: Overflow.Scroll,
        Container{Width: 300, Height: 300, Position: PositionType.Relative,
          Container{Handle: Anchor, Position: PositionType.Absolute,
            Left: 170, Top: 100, Width: 20, Height: 20},
          Portal{Handle: Popup, Anchor: Anchor,
            Placement: Placement,
            AnchorRect: AnchorRect,
            CollisionBounds: CollisionBounds,
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

internal class RawBoundsTransformCell : Cell {
  internal let Handle ElementHandle = ElementHandle{}
  internal var Rotate bool
  override func Build() Blob -> Container{ Width: 100, Height: 100,
    Container{ Position: PositionType.Absolute, Left: 0.5, Top: 0.5, Width: 50, Height: 50,
      Container{ Handle: Handle, Position: PositionType.Absolute, Left: 4, Top: 6, Width: 10, Height: 20,
        Transform: Rotate ? PanelTransform{ Rotate: 90 } : PanelTransform{ Scale: 2 },
        TransformOriginX: Percent(50), TransformOriginY: Percent(50) },
    },
  }
}

internal class PortalRowAlignmentCell : Cell {
  internal let Field ElementHandle = ElementHandle{}
  internal let FieldText ElementHandle = ElementHandle{}
  internal let OptionText ElementHandle = ElementHandle{}
  internal var Padding float64 = 4
  internal let Popup ElementHandle = ElementHandle{}
  internal var Capped bool
  internal var Scale float32
  internal var FieldBox ElementRect
  internal var Offset float64
  internal var Translate float64
  internal var Clicks int32

  override func Build() Blob -> Container{ Width: Percent(100), Height: Percent(100),
    Container{ Width: 400, Height: 220, Overflow: Overflow.Hidden,
      Transform: PanelTransform{ TranslateY: Translate },
      Container{ Handle: Field, Position: PositionType.Absolute, Left: 40, Top: (Padding == 6 ? 166.5 : 166) + Offset, Width: 320, Height: 32, Padding: Padding,
        OnClick: () -> Clicks++,
        Text{ Handle: FieldText, Content: "Field" },
      },
      Portal{ Handle: Popup, Position: PositionType.Absolute,
        Left: FieldBox.X + Math.Floor(4.889 * float64(Scale) + 0.5) / float64(Scale),
        Top: Capped ? 4 : FieldBox.Y,
        Width: 310.222, Height: Capped ? 592 : 32,
        Container{ Width: Percent(100), Height: Percent(100), Padding: Padding,
          Text{ Handle: OptionText, Content: "Option" },
        },
      },
    },
  }
}

internal class PortalSideSizeCell : Cell {
  internal let Anchor ElementHandle = ElementHandle{}
  internal let Popup ElementHandle = ElementHandle{}
  internal var Placement PortalPlacement = PortalPlacement.TopStart
  internal var Bounds ElementRect = ElementRect{ X: 8, Y: 8, Width: 704, Height: 504 }
  internal var Width float64 = 320.0
  internal var Height float64 = 250.0

  override func Build() Blob -> Container{ Width: Percent(100), Height: Percent(100),
    Container{ Handle: Anchor, Position: PositionType.Absolute,
      Left: 260, Top: 156, Width: 60, Height: 40 },
    Portal{ Handle: Popup, Anchor: Anchor,
      AnchorRect: ElementRect{ X: 10, Y: 4, Width: 40, Height: 32 },
      CollisionBounds: Bounds, Placement: Placement, Overflow: Overflow.Scroll,
      MinWidth: Width, MinHeight: Height,
      Container{ Width: Width, Height: Height },
    },
  }
}

internal class PortalClippedAnchorCell : Cell {
  internal let Scroll ElementHandle = ElementHandle{}
  internal let Anchor ElementHandle = ElementHandle{}
  internal let Editor ElementHandle = ElementHandle{}
  internal let Popup ElementHandle = ElementHandle{}
  internal var HideWhenClipped bool = true
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return Container{ Width: Percent(100), Height: Percent(100),
      Container{ Handle: Scroll, Width: 200, Height: 100, Overflow: Overflow.Scroll,
        Container{ Width: 200, Height: 400,
          Container{ Handle: Anchor, Position: PositionType.Absolute,
            Left: 10, Top: 60, Width: 30, Height: 30 },
          Portal{ Handle: Popup, Anchor: Anchor, HideWhenAnchorClipped: HideWhenClipped,
            AnchorRect: ElementRect{ X: 0, Y: 5, Width: 30, Height: 10 },
            Width: 120, Height: 30, FocusScope: FocusScopeOptions(),
            Cell.Mount[PortalRetainedInput, PortalClippedEditorCell]("editor", PortalRetainedInput(Editor)),
          },
        },
      },
    }
  }
}

internal class PortalClippedEditorCell : Cell[PortalRetainedInput] {
  internal var Builds int32

  override func Build() Blob {
    Builds++
    return TextEntry{ Handle: Input.Target, Key: "retained-editor",
      Width: 120, Height: 30, Value: "seed",
      Accessibility: Accessibility{ Role: AccessibilityRole.TextInput, Name: "retained editor" } }
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
