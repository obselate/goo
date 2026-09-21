package Goo

import Facebook.Yoga
import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal class ScrollTopologyValue {
  internal var Version int64
}

internal class ScrollTopology {
  shared {
    private let versions ConditionalWeakTable[Node, ScrollTopologyValue] =
    ConditionalWeakTable[Node, ScrollTopologyValue]()

    internal func Version(root Node) int64 -> versions.TryGetValue(root, out var value)
    ? value.Version : 0L

    internal func Invalidate(node Node) {
      var root = node
      while let parent = root.Parent {
        root = parent
      }
      let value = versions.GetOrCreateValue(root)
      value.Version++
    }
  }
}

internal class Layout {
  internal var config Facebook.Yoga.Config?
  internal var lastWidth float32
  internal var lastHeight float32
  internal var lastRoot Node?
  internal var laidOut bool
  internal var structureDirty bool
  internal var scrollNodes List[Node]
  internal var scrollListDirty bool
  internal var scrollSeen int64
  private var scrollRoot Node?
  private var portalRoot Node?
  private var portalLastWidth float32
  private var portalLastHeight float32
  private var portalLaidOut bool
  private var portalStructureDirty bool
  private let placedPortals HashSet[Node]

  // No web defaults: native Yoga's Column direction matches Goo's default.
  internal init() {
    config = YGConfigAPI.YGConfigNew()
    YGConfigAPI.YGConfigSetPointScaleFactor(config, 0.0F)
    scrollNodes = List[Node]()
    placedPortals = HashSet[Node]()
    scrollListDirty = true
    portalStructureDirty = true
  }

  // Walk only when structure changed; targeted style pushes keep Yoga current,
  // and Yoga's setters propagate dirt to the root for the clean early-out.
  internal func Calculate(root Node, width float32, height float32) {
    CalculateCore(root, nil, width, height)
  }

  internal func Calculate(root Node, overlayRoot Node, width float32, height float32) {
    CalculateCore(root, overlayRoot, width, height)
  }

  private func CalculateCore(root Node, overlayRoot Node?, width float32, height float32) {
    if CustomLayouts.Depth != 0 { throw InvalidOperationException("A custom layout callback cannot reenter window layout") }
    if structureDirty || root != lastRoot || root.Yoga == nil {
      syncNode(root, true)
      structureDirty = false
    }
    guard let yg = root.Yoga else {
      return
    }
    if !root.IsPortal && (!laidOut || root != lastRoot
      || width != lastWidth || height != lastHeight || YGNodeAPI.YGNodeIsDirty(yg)) {
      let availableHeight = root.Kind == NodeKind.Entry && root.Height.Unit == LengthUnit.Unset
      ? Single.NaN : height
      YGNodeAPI.YGNodeCalculateLayout(yg, width, availableHeight, yogaDirection(root.Direction))
      readRect(root, 0.0F, 0.0F)
      ScrollbarParts.Arrange(root)
    }
    lastRoot = root
    lastWidth = width
    lastHeight = height
    laidOut = true
    if let overlays = overlayRoot {
      CalculatePortals(root, overlays, width, height)
    }
  }

  private func CalculatePortals(sourceRoot Node, overlayRoot Node, width float32, height float32) {
    overlayRoot.Rect = Rect{ W: width, H: height }
    if portalStructureDirty || overlayRoot != portalRoot {
      for portal in overlayRoot.Children {
        syncNode(portal, true)
      }
      portalStructureDirty = false
    }
    let resized = !portalLaidOut || width != portalLastWidth || height != portalLastHeight
    for portal in overlayRoot.Children {
      guard let yoga = portal.Yoga else { continue }
      applyPortalConstraints(yoga, portal, width, height)
      if resized || YGNodeAPI.YGNodeIsDirty(yoga) {
        YGNodeAPI.YGNodeCalculateLayout(yoga, width, height,
          yogaDirection(portal.Direction))
      }
    }
    placePortals(sourceRoot, overlayRoot, width, height)
    portalRoot = overlayRoot
    portalLastWidth = width
    portalLastHeight = height
    portalLaidOut = true
  }

  // Raised on every reconcile (and by structural test edits); style-only
  // frames never walk.
  internal func MarkStructureDirty() {
    structureDirty = true
    portalStructureDirty = true
    scrollListDirty = true
  }

  // Cached flat list of scrolling nodes so per-pump scroll work is
  // O(scrollers), not O(tree). Rebuilt on structure or Overflow changes.
  internal func ScrollNodes(root Node) List[Node] {
    let version = ScrollTopology.Version(root)
    if scrollListDirty || scrollRoot != root || scrollSeen != version {
      scrollNodes.Clear()
      collectScroll(root)
      scrollListDirty = false
      scrollRoot = root
      scrollSeen = version
    }
    return scrollNodes
  }

  private func collectScroll(n Node) {
    let scrollable = n.Kind == NodeKind.Editor || n.OverflowX == Overflow.Scroll
      || n.OverflowY == Overflow.Scroll || Virtualization.State(n) != nil
    if scrollable {
      scrollNodes.Add(n)
    }
    for i in 0 ... n.Children.Count {
      collectScroll(n.Children[i])
    }
  }

  internal func NeedsLayout(root Node) bool -> NormalNeedsLayout(root, lastWidth, lastHeight)

  internal func NeedsLayout(root Node, overlayRoot Node) bool ->
  NeedsLayout(root, overlayRoot, lastWidth, lastHeight)

  internal func NeedsLayout(root Node, overlayRoot Node, width float32, height float32) bool {
    if NormalNeedsLayout(root, width, height) {
      return true
    }
    if portalStructureDirty || overlayRoot != portalRoot || !portalLaidOut
      || width != portalLastWidth || height != portalLastHeight {
        return true
      }
    for portal in overlayRoot.Children {
      guard let portalYoga = portal.Yoga else { return true }
      if YGNodeAPI.YGNodeIsDirty(portalYoga) { return true }
      if portalPlacementChanged(root, portal) { return true }
    }
    return false
  }

  private func NormalNeedsLayout(root Node, width float32, height float32) bool {
    if structureDirty || root != lastRoot || !laidOut
      || width != lastWidth || height != lastHeight {
        return true
      }
    guard let yoga = root.Yoga else { return true }
    return !root.IsPortal && YGNodeAPI.YGNodeIsDirty(yoga)
  }

  // Structure-only walk: attaches Yoga (with a one-time full style sync) for
  // new nodes, refreshes image measures, and repairs changed child lists.
  internal func syncNode(n Node, isRoot bool) {
    var fresh = false
    if n.Yoga == nil {
      n.Yoga = YGNodeAPI.YGNodeNewWithConfig(config)
      fresh = true
    }
    guard let yg = n.Yoga else {
      return
    }
    if fresh {
      if n.Kind == NodeKind.Text {
        YGNodeAPI.YGNodeSetContext(yg, n)
        YGNodeAPI.YGNodeSetMeasureFunc(yg, TextLayouts.Measure)
      } else if n.Kind == NodeKind.Entry {
        YGNodeAPI.YGNodeSetContext(yg, n)
        YGNodeAPI.YGNodeSetMeasureFunc(yg, EntryLayouts.Measure)
      } else if n.Kind == NodeKind.Editor {
        YGNodeAPI.YGNodeSetContext(yg, n)
        YGNodeAPI.YGNodeSetMeasureFunc(yg, TextEditorLayouts.Measure)
      } else if n.Kind == NodeKind.Image {
        YGNodeAPI.YGNodeSetContext(yg, n)
        YGNodeAPI.YGNodeSetMeasureFunc(yg, ImageLayouts.Measure)
      }
      applyAll(yg, n, isRoot)
    } else if n.Kind == NodeKind.Shape {
      // Re-derive view-box aspect: ShapePath swaps land outside style writes.
      applyFlexLayout(yg, n, isRoot)
    }
    if n.Kind == NodeKind.Image {
      ImageLayouts.Refresh(n)
    }
    if let custom = CustomLayouts.State(n) {
      if YGNodeAPI.YGNodeGetChildCount(yg) != nuint(0) { YGNodeAPI.YGNodeSetChildrenRetaining(yg, []Facebook.Yoga.Node{}) }
      YGNodeAPI.YGNodeSetContext(yg, n)
      YGNodeAPI.YGNodeSetMeasureFunc(yg, CustomLayouts.Measure)
      for child in n.Children {
        if !child.IsPortal { syncNode(child, true) }
      }
      custom.SyncChildren()
      return
    }
    // Measured editors cannot own Yoga children; slot roots are calculated in readRect.
    if n.Kind == NodeKind.Editor {
      for i in 0 ... n.Children.Count {
        let child = n.Children[i]
        if child.IsPortal { continue }
        syncNode(child, true)
        if let childYoga = child.Yoga {
          YGNodeAPI.YGNodeSetContext(childYoga, child)
          YGNodeAPI.YGNodeSetDirtiedFunc(childYoga, TextEditorLayouts.SlotChildDirty)
          if YGNodeAPI.YGNodeIsDirty(childYoga) {
            TextEditorLayouts.SlotChildDirty(childYoga)
          }
        }
      }
      return
    }
    for i in 0 ... n.Children.Count {
      if !n.Children[i].IsPortal { syncNode(n.Children[i], false) }
    }
    // Rebuilding the Yoga child list dirties the whole subtree, so only when
    // Diff actually changed the children.
    if childrenAlreadyMatch(yg, n) {
      return
    }
    syncChildren(yg, n)
  }

  private func syncChildren(yg Facebook.Yoga.Node, n Node) {
    let count = Portals.SourceChildCount(n)
    let children = [count]Facebook.Yoga.Node
    var index int32
    for child in n.Children {
      if !child.IsPortal {
        guard let childYg = child.Yoga else {
          throw InvalidOperationException("child Yoga node is unavailable")
        }
        children[index] = childYg
        index++
      }
    }
    YGNodeAPI.YGNodeSetChildrenRetaining(yg, children)
  }

  // Rect-only refresh for scroll changes; Yoga is untouched so it is cheap.
  internal func RefreshRects(root Node) {
    if laidOut && !root.IsPortal {
      readRect(root, 0.0F, 0.0F)
      ScrollbarParts.Arrange(root)
    }
  }

  internal func RefreshRects(root Node, overlayRoot Node) {
    if !laidOut {
      return
    }
    if !root.IsPortal {
      readRect(root, 0.0F, 0.0F)
      ScrollbarParts.Arrange(root)
    }
    if portalLaidOut {
      placePortals(root, overlayRoot, overlayRoot.Rect.W, overlayRoot.Rect.H)
    }
  }

  private func applyPortalConstraints(yoga Facebook.Yoga.Node, portal Node,
    width float32, height float32) {
      if portal.PortalAnchor == nil {
        restorePortalConstraints(yoga, portal)
        return
      }
      YGNodeStyleAPI.YGNodeStyleSetMinWidth(yoga,
        portalMinimum(portal.MinWidth, width))
      YGNodeStyleAPI.YGNodeStyleSetMinHeight(yoga,
        portalMinimum(portal.MinHeight, height))
      YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yoga,
        portalMaximum(portal.MaxWidth, width))
      YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yoga,
        portalMaximum(portal.MaxHeight, height))
    }

  private func restorePortalConstraints(yoga Facebook.Yoga.Node, portal Node) {
    markYogaStyle(portal, StyleField.MinWidth)
    markYogaStyle(portal, StyleField.MinHeight)
    markYogaStyle(portal, StyleField.MaxWidth)
    markYogaStyle(portal, StyleField.MaxHeight)
    applyMinMax(yoga, portal)
  }

  private func portalMinimum(value Length, available float32) float32 {
    if value.Unit == LengthUnit.Px { return clampPortalSize(value.Value, available) }
    if value.Unit == LengthUnit.Percent {
      return clampPortalSize(available * value.Value / 100.0F, available)
    }
    return Single.NaN
  }

  private func portalMaximum(value Length, available float32) float32 {
    if value.Unit == LengthUnit.Px { return clampPortalSize(value.Value, available) }
    if value.Unit == LengthUnit.Percent {
      return clampPortalSize(available * value.Value / 100.0F, available)
    }
    return available
  }

  private func clampPortalSize(value float32, available float32) float32 {
    if value < 0.0F { return 0.0F }
    return value < available ? value : available
  }

  private func portalPlacementChanged(sourceRoot Node, portal Node) bool {
    if portal.PortalAnchor == nil {
      return portal.PortalAnchorResolved || portal.PortalPlacementHidden
    }
    guard let anchor = portalAnchor(sourceRoot, portal) else {
      return portal.PortalAnchorResolved || !portal.PortalPlacementHidden
    }
    let bounds = TransformGeometry.BoundsToWindow(anchor)
    return !portal.PortalAnchorResolved
      || !samePortalRect(portal.PortalAnchorBounds, bounds)
  }

  private func placePortals(sourceRoot Node, overlayRoot Node, width float32,
    height float32) {
      placedPortals.Clear()
      var pass int32
      while pass < overlayRoot.Children.Count {
        var progressed = false
        for portal in overlayRoot.Children {
          if placedPortals.Contains(portal) { continue }
          if portal.PortalAnchor == nil {
            portal.PortalAnchorResolved = false
            portal.PortalPlacementHidden = false
            readRect(portal, 0.0F, 0.0F)
            placedPortals.Add(portal)
            progressed = true
            continue
          }
          guard let anchor = portalAnchor(sourceRoot, portal) else {
            hidePortal(portal, false, TransformBounds{})
            placedPortals.Add(portal)
            progressed = true
            continue
          }
          let bounds = TransformGeometry.BoundsToWindow(anchor)
          var dependencyInvalid = false
          if !portalDependenciesReady(anchor, portal, out dependencyInvalid) { continue }
          if dependencyInvalid {
            hidePortal(portal, true, bounds)
            placedPortals.Add(portal)
            progressed = true
            continue
          }
          let origin = portalOrigin(portal, bounds, width, height)
          portal.PortalAnchorBounds = Rect{
            X: bounds.X, Y: bounds.Y, W: bounds.W, H: bounds.H,
          }
          portal.PortalAnchorResolved = true
          portal.PortalPlacementHidden = false
          readPortalRect(portal, origin.X, origin.Y)
          placedPortals.Add(portal)
          progressed = true
        }
        if !progressed { break }
        pass++
      }
      for portal in overlayRoot.Children {
        if placedPortals.Contains(portal) { continue }
        if let anchor = portalAnchor(sourceRoot, portal) {
          hidePortal(portal, true, TransformGeometry.BoundsToWindow(anchor))
        } else {
          hidePortal(portal, false, TransformBounds{})
        }
      }
    }

  private func portalAnchor(sourceRoot Node, portal Node) Node? {
    guard let handle = portal.PortalAnchor, let anchor = handle.AttachedNode() else {
      return nil
    }
    if anchor.Retired || !ElementHandles.Owns(anchor, handle) { return nil }
    var current = anchor
    while true {
      if current == portal || current.PaintInputState != 0 { return nil }
      guard let parent = current.Parent else { return current == sourceRoot ? anchor : nil }
      current = parent
    }
  }

  private func portalDependenciesReady(node Node, portal Node,
    out invalid bool) bool {
    invalid = false
    var current = node
    while true {
      if current.IsPortal {
        if current == portal {
          invalid = true
          return true
        }
        if !placedPortals.Contains(current) { return false }
        if current.PortalPlacementHidden {
          invalid = true
          return true
        }
      }
      guard let parent = current.Parent else { return true }
      current = parent
    }
  }

  private func hidePortal(portal Node, resolved bool, bounds TransformBounds) {
    portal.PortalAnchorResolved = resolved
    if resolved {
      portal.PortalAnchorBounds = Rect{
        X: bounds.X, Y: bounds.Y, W: bounds.W, H: bounds.H,
      }
    }
    portal.PortalPlacementHidden = true
  }

  private func readPortalRect(portal Node, x float32, y float32) {
    guard let yoga = portal.Yoga else { return }
    readRect(portal, 0.0F, 0.0F,
      x - YGNodeLayoutAPI.YGNodeLayoutGetLeft(yoga),
      y - YGNodeLayoutAPI.YGNodeLayoutGetTop(yoga))
  }

  private func portalOrigin(portal Node, anchor TransformBounds, width float32,
    height float32) Rect {
      guard let yoga = portal.Yoga else { return Rect{} }
      let popupWidth = YGNodeLayoutAPI.YGNodeLayoutGetWidth(yoga)
      let popupHeight = YGNodeLayoutAPI.YGNodeLayoutGetHeight(yoga)
      let placement = portal.PortalPlacement
      let bottom = placement == PortalPlacement.BottomStart
        || placement == PortalPlacement.Bottom || placement == PortalPlacement.BottomEnd
      let top = placement == PortalPlacement.TopStart
        || placement == PortalPlacement.Top || placement == PortalPlacement.TopEnd
      let start = placement == PortalPlacement.BottomStart
        || placement == PortalPlacement.TopStart || placement == PortalPlacement.RightStart
        || placement == PortalPlacement.LeftStart
      let center = placement == PortalPlacement.Bottom || placement == PortalPlacement.Top
        || placement == PortalPlacement.Right || placement == PortalPlacement.Left
      var x = anchor.X
      var y = anchor.Y + anchor.H
      if bottom || top {
        let rtl = portal.Direction == Direction.RightToLeft
        if center { x = anchor.X + (anchor.W - popupWidth) * 0.5F }
        else if (start && rtl) || (!start && !rtl) {
          x = anchor.X + anchor.W - popupWidth
        }
        if top { y = anchor.Y - popupHeight }
        let opposite = bottom ? anchor.Y - popupHeight : anchor.Y + anchor.H
        if portalOverflow(y, popupHeight, height) > portalOverflow(opposite,
          popupHeight, height) { y = opposite }
      } else {
        y = anchor.Y
        if center { y = anchor.Y + (anchor.H - popupHeight) * 0.5F }
        else if !start { y = anchor.Y + anchor.H - popupHeight }
        let right = placement == PortalPlacement.RightStart
          || placement == PortalPlacement.Right || placement == PortalPlacement.RightEnd
        x = right ? anchor.X + anchor.W : anchor.X - popupWidth
        let opposite = right ? anchor.X - popupWidth : anchor.X + anchor.W
        if portalOverflow(x, popupWidth, width) > portalOverflow(opposite,
          popupWidth, width) { x = opposite }
      }
      return Rect{
        X: clampPortalOrigin(x, popupWidth, width),
        Y: clampPortalOrigin(y, popupHeight, height),
      }
    }

  private func portalOverflow(origin float32, size float32, available float32) float32 {
    var result = origin < 0.0F ? -origin : 0.0F
    let far = origin + size
    if far > available { result = result + far - available }
    return result
  }

  private func clampPortalOrigin(origin float32, size float32,
    available float32) float32 {
      if size >= available || origin < 0.0F { return 0.0F }
      let maximum = available - size
      return origin > maximum ? maximum : origin
    }

  private func samePortalRect(left Rect, right TransformBounds) bool ->
  left.X == right.X && left.Y == right.Y && left.W == right.W && left.H == right.H

  // Yoga positions are parent-relative; accumulate origin so Rect is absolute.
  // Scroll containers clamp their offsets and shift their children's origin.
  internal func readRect(n Node, originX float32, originY float32,
    placementX float32 = 0.0F, placementY float32 = 0.0F) {
      guard let yg = n.Yoga else {
        return
      }
      let localX = YGNodeLayoutAPI.YGNodeLayoutGetLeft(yg) + placementX
      let localY = YGNodeLayoutAPI.YGNodeLayoutGetTop(yg) + placementY
      let absX = originX + localX
      let absY = originY + localY
      let visual = LayoutTransitions.Resolve(n, absX, absY, localX, localY)
      n.Rect = Rect{
        X: visual.X,
        Y: visual.Y,
        W: YGNodeLayoutAPI.YGNodeLayoutGetWidth(yg),
        H: YGNodeLayoutAPI.YGNodeLayoutGetHeight(yg),
      }
      let editor = n.Kind == NodeKind.Editor
      let custom = CustomLayouts.State(n)
      custom?.Arrange()
      ScrollState.RefreshAxes(n)
      if editor {
        ScrollState.SyncEditor(n)
      } else if n.OverflowX == Overflow.Scroll || n.OverflowY == Overflow.Scroll {
        measureScrollExtent(n)
      }
      if editor {
        readEditorSlotRects(n)
        return
      }
      if let state = custom {
        let x = visual.X + CustomLayouts.Inset(yg, YGEdge.Left) - n.ScrollX
        let y = visual.Y + CustomLayouts.Inset(yg, YGEdge.Top) - n.ScrollY
        for child in state.Children {
          readRect(child.Node, x, y, float32(child.Bounds.X), float32(child.Bounds.Y))
        }
        return
      }
      for i in 0 ... n.Children.Count {
        if !n.Children[i].IsPortal {
          readRect(n.Children[i], visual.X - n.ScrollX, visual.Y - n.ScrollY)
        }
      }
    }

  private func readEditorSlotRects(n Node) {
    let contentWidth = BoxGeometry.ViewportWidth(n)
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if child.IsPortal { continue }
      guard let yoga = child.Yoga else { continue }
      let availableWidth = child.EditorSlotBlock ? contentWidth : Single.NaN
      YGNodeAPI.YGNodeCalculateLayout(yoga, availableWidth, Single.NaN,
        yogaDirection(n.Direction))
      guard let origin = TextEditorLayouts.SlotOrigin(n, child.EditorSlotKey) else {
        child.Visibility = Visibility.Hidden
        continue
      }
      child.Visibility = Visibility.Visible
      readRect(child, n.Rect.X + origin.X, n.Rect.Y + origin.Y)
    }
  }

  // Content extent from Yoga's relative child geometry; every pass re-clamps
  // so content shrink can never leave an out-of-range offset behind.
  private func measureScrollExtent(n Node) {
    var cw = 0.0F
    var ch = 0.0F
    if let custom = CustomLayouts.State(n) {
      cw = custom.ContentWidth
      ch = custom.ContentHeight
    } else if let extent = Virtualization.ContentExtent(n) {
      cw = extent.Width
      ch = extent.Height
    } else {
      for i in 0 ... n.Children.Count {
        if n.Children[i].IsPortal { continue }
        guard let cy = n.Children[i].Yoga else {
          continue
        }
        let right = YGNodeLayoutAPI.YGNodeLayoutGetLeft(cy) + YGNodeLayoutAPI.YGNodeLayoutGetWidth(cy)
        let bottom = YGNodeLayoutAPI.YGNodeLayoutGetTop(cy) + YGNodeLayoutAPI.YGNodeLayoutGetHeight(cy)
        if right > cw { cw = right }
        if bottom > ch { ch = bottom }
      }
    }
    ScrollState.SetExtent(n, cw, ch)
  }
}

internal func nodeFromYoga(yoga Facebook.Yoga.Node) Node {
  guard let node = YGNodeAPI.YGNodeGetContext(yoga) as Node else {
    throw InvalidOperationException("Yoga node has no Goo context")
  }
  return node
}

internal func applyAll(yg Facebook.Yoga.Node, n Node, isRoot bool) {
  applyDirection(yg, n)
  applySize(yg, n)
  applyEdges(yg, n)
  applyFlex(yg, n)
  applyMinMax(yg, n)
  applyFlexLayout(yg, n, isRoot)
  applyPosition(yg, n)
  applyDisplay(yg, n)
}

internal func yogaDirection(direction Direction) YGDirection -> switch direction {
  case Direction.Auto: YGDirection.LTR
  case Direction.LeftToRight: YGDirection.LTR
  case Direction.RightToLeft: YGDirection.RTL
  case _: throw NotSupportedException("Layout.yogaDirection: unhandled Direction " + direction.ToString())
}

internal func applyDirection(yg Facebook.Yoga.Node, n Node) {
  let direction = yogaDirection(n.Direction)
  if YGNodeStyleAPI.YGNodeStyleGetDirection(yg) != direction {
    YGNodeStyleAPI.YGNodeStyleSetDirection(yg, direction)
  }
}

// Push-on-change: one resolved style write lands in Yoga through the same
// appliers the mount-time sync uses. Nil Yoga means the mount sync covers it.
internal func syncYogaField(n Node, f StyleField) {
  guard let yg = n.Yoga else {
    return
  }
  switch f {
    case StyleField.Direction { applyDirection(yg, n) }
    case StyleField.Width { applySize(yg, n) }
    case StyleField.Height { applySize(yg, n) }
    case StyleField.MinWidth { applyMinMax(yg, n) }
    case StyleField.MinHeight { applyMinMax(yg, n) }
    case StyleField.MaxWidth { applyMinMax(yg, n) }
    case StyleField.MaxHeight { applyMinMax(yg, n) }
    case StyleField.AspectRatio { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.Padding { applyEdges(yg, n) }
    case StyleField.PaddingLeft { applyEdges(yg, n) }
    case StyleField.PaddingTop { applyEdges(yg, n) }
    case StyleField.PaddingRight { applyEdges(yg, n) }
    case StyleField.PaddingBottom { applyEdges(yg, n) }
    case StyleField.Margin { applyEdges(yg, n) }
    case StyleField.MarginLeft { applyEdges(yg, n) }
    case StyleField.MarginTop { applyEdges(yg, n) }
    case StyleField.MarginRight { applyEdges(yg, n) }
    case StyleField.MarginBottom { applyEdges(yg, n) }
    case StyleField.Gap { applyEdges(yg, n) }
    case StyleField.RowGap { applyEdges(yg, n) }
    case StyleField.ColumnGap { applyEdges(yg, n) }
    case StyleField.BorderLeftWidth {
      if n.Kind != NodeKind.Shape { applyBorderEdge(yg, YGEdge.Left, n.BorderLeftWidth) }
    }
    case StyleField.BorderTopWidth {
      if n.Kind != NodeKind.Shape { applyBorderEdge(yg, YGEdge.Top, n.BorderTopWidth) }
    }
    case StyleField.BorderRightWidth {
      if n.Kind != NodeKind.Shape { applyBorderEdge(yg, YGEdge.Right, n.BorderRightWidth) }
    }
    case StyleField.BorderBottomWidth {
      if n.Kind != NodeKind.Shape { applyBorderEdge(yg, YGEdge.Bottom, n.BorderBottomWidth) }
    }
    case StyleField.ShapeStrokeWidth { applyBorderEdges(yg, n) }
    case StyleField.FlexDirection { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.FlexWrap { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.JustifyContent { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.AlignItems { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.AlignSelf { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.AlignContent { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.FlexBasis { applyFlexLayout(yg, n, n.Parent == nil) }
    case StyleField.FlexGrow { applyFlex(yg, n) }
    case StyleField.FlexShrink { applyFlex(yg, n) }
    case StyleField.Position { applyPosition(yg, n) }
    case StyleField.Left { applyPosition(yg, n) }
    case StyleField.Top { applyPosition(yg, n) }
    case StyleField.Right { applyPosition(yg, n) }
    case StyleField.Bottom { applyPosition(yg, n) }
    case StyleField.Display { applyDisplay(yg, n) }
    case StyleField.OverflowX { applyDisplay(yg, n) }
    case StyleField.OverflowY { applyDisplay(yg, n) }
    default { }
  }
}

internal func markYogaStyle(n Node, field StyleField) {
  n.YogaStyleMask = styleMaskWith(n.YogaStyleMask, field)
}

internal func clearYogaStyle(n Node, field StyleField) bool {
  if !styleMaskHas(n.YogaStyleMask, field) {
    return false
  }
  n.YogaStyleMask = styleMaskWithout(n.YogaStyleMask, field)
  return true
}

internal func applySize(yg Facebook.Yoga.Node, n Node) {
  switch n.Width.Unit {
    case LengthUnit.Px {
      YGNodeStyleAPI.YGNodeStyleSetWidth(yg, n.Width.Value)
      markYogaStyle(n, StyleField.Width)
    }
    case LengthUnit.Percent {
      YGNodeStyleAPI.YGNodeStyleSetWidthPercent(yg, n.Width.Value)
      markYogaStyle(n, StyleField.Width)
    }
    case LengthUnit.Auto {
      YGNodeStyleAPI.YGNodeStyleSetWidthAuto(yg)
      markYogaStyle(n, StyleField.Width)
    }
    default {
      if clearYogaStyle(n, StyleField.Width) {
        YGNodeStyleAPI.YGNodeStyleSetWidthAuto(yg)
      }
    }
  }
  switch n.Height.Unit {
    case LengthUnit.Px {
      YGNodeStyleAPI.YGNodeStyleSetHeight(yg, n.Height.Value)
      markYogaStyle(n, StyleField.Height)
    }
    case LengthUnit.Percent {
      YGNodeStyleAPI.YGNodeStyleSetHeightPercent(yg, n.Height.Value)
      markYogaStyle(n, StyleField.Height)
    }
    case LengthUnit.Auto {
      YGNodeStyleAPI.YGNodeStyleSetHeightAuto(yg)
      markYogaStyle(n, StyleField.Height)
    }
    default {
      if clearYogaStyle(n, StyleField.Height) {
        YGNodeStyleAPI.YGNodeStyleSetHeightAuto(yg)
      }
    }
  }
}

internal func applyEdges(yg Facebook.Yoga.Node, n Node) {
  applyPaddingEdge(yg, n, YGEdge.All, n.Padding, StyleField.Padding)
  applyPaddingEdge(yg, n, YGEdge.Left, n.PaddingLeft, StyleField.PaddingLeft)
  applyPaddingEdge(yg, n, YGEdge.Top, n.PaddingTop, StyleField.PaddingTop)
  applyPaddingEdge(yg, n, YGEdge.Right, n.PaddingRight, StyleField.PaddingRight)
  applyPaddingEdge(yg, n, YGEdge.Bottom, n.PaddingBottom, StyleField.PaddingBottom)

  applyBorderEdges(yg, n)

  applyMarginEdge(yg, n, YGEdge.All, n.Margin, StyleField.Margin)
  applyMarginEdge(yg, n, YGEdge.Left, n.MarginLeft, StyleField.MarginLeft)
  applyMarginEdge(yg, n, YGEdge.Top, n.MarginTop, StyleField.MarginTop)
  applyMarginEdge(yg, n, YGEdge.Right, n.MarginRight, StyleField.MarginRight)
  applyMarginEdge(yg, n, YGEdge.Bottom, n.MarginBottom, StyleField.MarginBottom)

  applyGapEdge(yg, n, YGGutter.All, n.Gap, StyleField.Gap)
  applyGapEdge(yg, n, YGGutter.Row, n.RowGap, StyleField.RowGap)
  applyGapEdge(yg, n, YGGutter.Column, n.ColumnGap, StyleField.ColumnGap)
}

internal func applyPaddingEdge(
  yg Facebook.Yoga.Node, n Node, edge YGEdge, v Length, field StyleField) {
    switch v.Unit {
      case LengthUnit.Px {
        YGNodeStyleAPI.YGNodeStyleSetPadding(yg, edge, v.Value)
        markYogaStyle(n, field)
      }
      case LengthUnit.Percent {
        YGNodeStyleAPI.YGNodeStyleSetPaddingPercent(yg, edge, v.Value)
        markYogaStyle(n, field)
      }
      default {
        if clearYogaStyle(n, field) {
          YGNodeStyleAPI.YGNodeStyleSetPadding(yg, edge, YogaValue.YGValueUndefined.Value)
        }
      }
    }
  }

internal func applyBorderEdge(yg Facebook.Yoga.Node, edge YGEdge, width Length) {
  let value = width.Unit == LengthUnit.Px ? width.Value : 0.0F
  if YGNodeStyleAPI.YGNodeStyleGetBorder(yg, edge) != value {
    YGNodeStyleAPI.YGNodeStyleSetBorder(yg, edge, value)
  }
}

internal func applyBorderEdges(yg Facebook.Yoga.Node, n Node) {
  if n.Kind == NodeKind.Shape {
    applyBorderEdge(yg, YGEdge.Left, n.BorderLeftWidth)
    applyBorderEdge(yg, YGEdge.Top, n.BorderLeftWidth)
    applyBorderEdge(yg, YGEdge.Right, n.BorderLeftWidth)
    applyBorderEdge(yg, YGEdge.Bottom, n.BorderLeftWidth)
    return
  }
  applyBorderEdge(yg, YGEdge.Left, n.BorderLeftWidth)
  applyBorderEdge(yg, YGEdge.Top, n.BorderTopWidth)
  applyBorderEdge(yg, YGEdge.Right, n.BorderRightWidth)
  applyBorderEdge(yg, YGEdge.Bottom, n.BorderBottomWidth)
}

internal func applyMarginEdge(
  yg Facebook.Yoga.Node, n Node, edge YGEdge, v Length, field StyleField) {
    switch v.Unit {
      case LengthUnit.Px {
        YGNodeStyleAPI.YGNodeStyleSetMargin(yg, edge, v.Value)
        markYogaStyle(n, field)
      }
      case LengthUnit.Percent {
        YGNodeStyleAPI.YGNodeStyleSetMarginPercent(yg, edge, v.Value)
        markYogaStyle(n, field)
      }
      default {
        if clearYogaStyle(n, field) {
          YGNodeStyleAPI.YGNodeStyleSetMargin(yg, edge, YogaValue.YGValueUndefined.Value)
        }
      }
    }
  }

internal func applyGapEdge(
  yg Facebook.Yoga.Node, n Node, gutter YGGutter, v Length, field StyleField) {
    switch v.Unit {
      case LengthUnit.Px {
        YGNodeStyleAPI.YGNodeStyleSetGap(yg, gutter, v.Value)
        markYogaStyle(n, field)
      }
      case LengthUnit.Percent {
        YGNodeStyleAPI.YGNodeStyleSetGapPercent(yg, gutter, v.Value)
        markYogaStyle(n, field)
      }
      default {
        if clearYogaStyle(n, field) {
          YGNodeStyleAPI.YGNodeStyleSetGap(yg, gutter, YogaValue.YGValueUndefined.Value)
        }
      }
    }
  }

internal func applyFlex(yg Facebook.Yoga.Node, n Node) {
  YGNodeStyleAPI.YGNodeStyleSetFlexGrow(yg, float32(n.FlexGrow))
  YGNodeStyleAPI.YGNodeStyleSetFlexShrink(yg, float32(n.FlexShrink))
}

internal func applyMinMax(yg Facebook.Yoga.Node, n Node) {
  switch n.MinWidth.Unit {
    case LengthUnit.Px {
      YGNodeStyleAPI.YGNodeStyleSetMinWidth(yg, n.MinWidth.Value)
      markYogaStyle(n, StyleField.MinWidth)
    }
    case LengthUnit.Percent {
      YGNodeStyleAPI.YGNodeStyleSetMinWidthPercent(yg, n.MinWidth.Value)
      markYogaStyle(n, StyleField.MinWidth)
    }
    default {
      if clearYogaStyle(n, StyleField.MinWidth) {
        YGNodeStyleAPI.YGNodeStyleSetMinWidth(yg, YogaValue.YGValueUndefined.Value)
      }
    }
  }
  switch n.MinHeight.Unit {
    case LengthUnit.Px {
      YGNodeStyleAPI.YGNodeStyleSetMinHeight(yg, n.MinHeight.Value)
      markYogaStyle(n, StyleField.MinHeight)
    }
    case LengthUnit.Percent {
      YGNodeStyleAPI.YGNodeStyleSetMinHeightPercent(yg, n.MinHeight.Value)
      markYogaStyle(n, StyleField.MinHeight)
    }
    default {
      if clearYogaStyle(n, StyleField.MinHeight) {
        YGNodeStyleAPI.YGNodeStyleSetMinHeight(yg, YogaValue.YGValueUndefined.Value)
      }
    }
  }
  switch n.MaxWidth.Unit {
    case LengthUnit.Px {
      YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yg, n.MaxWidth.Value)
      markYogaStyle(n, StyleField.MaxWidth)
    }
    case LengthUnit.Percent {
      YGNodeStyleAPI.YGNodeStyleSetMaxWidthPercent(yg, n.MaxWidth.Value)
      markYogaStyle(n, StyleField.MaxWidth)
    }
    default {
      if clearYogaStyle(n, StyleField.MaxWidth) {
        YGNodeStyleAPI.YGNodeStyleSetMaxWidth(yg, YogaValue.YGValueUndefined.Value)
      }
    }
  }
  switch n.MaxHeight.Unit {
    case LengthUnit.Px {
      YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yg, n.MaxHeight.Value)
      markYogaStyle(n, StyleField.MaxHeight)
    }
    case LengthUnit.Percent {
      YGNodeStyleAPI.YGNodeStyleSetMaxHeightPercent(yg, n.MaxHeight.Value)
      markYogaStyle(n, StyleField.MaxHeight)
    }
    default {
      if clearYogaStyle(n, StyleField.MaxHeight) {
        YGNodeStyleAPI.YGNodeStyleSetMaxHeight(yg, YogaValue.YGValueUndefined.Value)
      }
    }
  }
}

// Explicit enum mapping prevents ordinal drift. Compare before Yoga enum writes.
internal func applyFlexLayout(yg Facebook.Yoga.Node, n Node, isRoot bool) {
  let flexDirection = switch n.FlexDirection {
    case FlexDirection.Column: YGFlexDirection.Column
    case FlexDirection.ColumnReverse: YGFlexDirection.ColumnReverse
    case FlexDirection.Row: YGFlexDirection.Row
    case FlexDirection.RowReverse: YGFlexDirection.RowReverse
    case _: throw NotSupportedException("Layout.applyFlexLayout: unhandled FlexDirection " + n.FlexDirection.ToString())
  }
  if YGNodeStyleAPI.YGNodeStyleGetFlexDirection(yg) != flexDirection {
    YGNodeStyleAPI.YGNodeStyleSetFlexDirection(yg, flexDirection)
  }
  let flexWrap = switch n.FlexWrap {
    case FlexWrap.NoWrap: YGWrap.NoWrap
    case FlexWrap.Wrap: YGWrap.Wrap
    case FlexWrap.WrapReverse: YGWrap.WrapReverse
    case _: throw NotSupportedException("Layout.applyFlexLayout: unhandled FlexWrap " + n.FlexWrap.ToString())
  }
  if YGNodeStyleAPI.YGNodeStyleGetFlexWrap(yg) != flexWrap {
    YGNodeStyleAPI.YGNodeStyleSetFlexWrap(yg, flexWrap)
  }
  let justifyContent = switch n.JustifyContent {
    case JustifyContent.FlexStart: YGJustify.FlexStart
    case JustifyContent.Center: YGJustify.Center
    case JustifyContent.FlexEnd: YGJustify.FlexEnd
    case JustifyContent.SpaceBetween: YGJustify.SpaceBetween
    case JustifyContent.SpaceAround: YGJustify.SpaceAround
    case JustifyContent.SpaceEvenly: YGJustify.SpaceEvenly
    case _: throw NotSupportedException("Layout.applyFlexLayout: unhandled JustifyContent " + n.JustifyContent.ToString())
  }
  if YGNodeStyleAPI.YGNodeStyleGetJustifyContent(yg) != justifyContent {
    YGNodeStyleAPI.YGNodeStyleSetJustifyContent(yg, justifyContent)
  }
  let alignItems = mapAlignItems(n.AlignItems)
  if YGNodeStyleAPI.YGNodeStyleGetAlignItems(yg) != alignItems {
    YGNodeStyleAPI.YGNodeStyleSetAlignItems(yg, alignItems)
  }
  let alignSelf = mapAlignSelf(n.AlignSelf)
  if YGNodeStyleAPI.YGNodeStyleGetAlignSelf(yg) != alignSelf {
    YGNodeStyleAPI.YGNodeStyleSetAlignSelf(yg, alignSelf)
  }
  let alignContent = mapAlignContent(n.AlignContent)
  if YGNodeStyleAPI.YGNodeStyleGetAlignContent(yg) != alignContent {
    YGNodeStyleAPI.YGNodeStyleSetAlignContent(yg, alignContent)
  }
  switch n.FlexBasis.Unit {
    case LengthUnit.Px {
      YGNodeStyleAPI.YGNodeStyleSetFlexBasis(yg, n.FlexBasis.Value)
      markYogaStyle(n, StyleField.FlexBasis)
    }
    case LengthUnit.Percent {
      YGNodeStyleAPI.YGNodeStyleSetFlexBasisPercent(yg, n.FlexBasis.Value)
      markYogaStyle(n, StyleField.FlexBasis)
    }
    case LengthUnit.Auto {
      YGNodeStyleAPI.YGNodeStyleSetFlexBasisAuto(yg)
      markYogaStyle(n, StyleField.FlexBasis)
    }
    default {
      if clearYogaStyle(n, StyleField.FlexBasis) {
        YGNodeStyleAPI.YGNodeStyleSetFlexBasisAuto(yg)
      }
    }
  }
  // Unsized non-root Shapes inherit their view-box aspect.
  let aspect = if n.AspectRatio <= 0.0 && !isRoot && n.Kind == NodeKind.Shape
    && !(isSized(n.Width) && isSized(n.Height)) {
      n.ShapePath.ViewBoxWidth / n.ShapePath.ViewBoxHeight
    } else {
      n.AspectRatio
    }
  let yogaAspect = float32(aspect)
  if aspect > 0.0 && yogaAspect > 0.0F && !Single.IsInfinity(yogaAspect) {
    YGNodeStyleAPI.YGNodeStyleSetAspectRatio(yg, yogaAspect)
    markYogaStyle(n, StyleField.AspectRatio)
  } else if clearYogaStyle(n, StyleField.AspectRatio) {
    YGNodeStyleAPI.YGNodeStyleSetAspectRatio(yg, YogaValue.YGValueUndefined.Value)
  }
}

internal func isSized(v Length) bool -> v.Unit == LengthUnit.Px || v.Unit == LengthUnit.Percent

internal func mapAlignItems(a AlignItems) YGAlign -> switch a {
  case AlignItems.Stretch: YGAlign.Stretch
  case AlignItems.FlexStart: YGAlign.FlexStart
  case AlignItems.Center: YGAlign.Center
  case AlignItems.FlexEnd: YGAlign.FlexEnd
  case AlignItems.Baseline: YGAlign.Baseline
  case _: throw NotSupportedException("Layout.mapAlignItems: unhandled AlignItems " + a.ToString())
}

internal func mapAlignSelf(a AlignSelf) YGAlign -> switch a {
  case AlignSelf.Auto: YGAlign.Auto
  case AlignSelf.Stretch: YGAlign.Stretch
  case AlignSelf.FlexStart: YGAlign.FlexStart
  case AlignSelf.Center: YGAlign.Center
  case AlignSelf.FlexEnd: YGAlign.FlexEnd
  case AlignSelf.Baseline: YGAlign.Baseline
  case _: throw NotSupportedException("Layout.mapAlignSelf: unhandled AlignSelf " + a.ToString())
}

internal func mapAlignContent(a AlignContent) YGAlign -> switch a {
  case AlignContent.FlexStart: YGAlign.FlexStart
  case AlignContent.Center: YGAlign.Center
  case AlignContent.FlexEnd: YGAlign.FlexEnd
  case AlignContent.Stretch: YGAlign.Stretch
  case AlignContent.SpaceBetween: YGAlign.SpaceBetween
  case AlignContent.SpaceAround: YGAlign.SpaceAround
  case _: throw NotSupportedException("Layout.mapAlignContent: unhandled AlignContent " + a.ToString())
}

internal func applyPosition(yg Facebook.Yoga.Node, n Node) {
  let positionType = n.Position == PositionType.Absolute ? YGPositionType.Absolute : n.Position == PositionType.Static ? YGPositionType.Static : YGPositionType.Relative
  if YGNodeStyleAPI.YGNodeStyleGetPositionType(yg) != positionType {
    YGNodeStyleAPI.YGNodeStyleSetPositionType(yg, positionType)
  }
  applyPositionEdge(yg, n, YGEdge.Left, n.Left, StyleField.Left)
  applyPositionEdge(yg, n, YGEdge.Top, n.Top, StyleField.Top)
  applyPositionEdge(yg, n, YGEdge.Right, n.Right, StyleField.Right)
  applyPositionEdge(yg, n, YGEdge.Bottom, n.Bottom, StyleField.Bottom)
}

internal func applyPositionEdge(
  yg Facebook.Yoga.Node, n Node, edge YGEdge, v Length, field StyleField) {
    switch v.Unit {
      case LengthUnit.Px {
        YGNodeStyleAPI.YGNodeStyleSetPosition(yg, edge, v.Value)
        markYogaStyle(n, field)
      }
      case LengthUnit.Percent {
        YGNodeStyleAPI.YGNodeStyleSetPositionPercent(yg, edge, v.Value)
        markYogaStyle(n, field)
      }
      default {
        if clearYogaStyle(n, field) {
          YGNodeStyleAPI.YGNodeStyleSetPosition(yg, edge, YogaValue.YGValueUndefined.Value)
        }
      }
    }
  }

internal func applyDisplay(yg Facebook.Yoga.Node, n Node) {
  let display = switch n.Display {
    case Display.Flex: YGDisplay.Flex
    case Display.None: YGDisplay.None
    case _: throw NotSupportedException("Layout.applyDisplay: unhandled Display " + n.Display.ToString())
  }
  if YGNodeStyleAPI.YGNodeStyleGetDisplay(yg) != display {
    YGNodeStyleAPI.YGNodeStyleSetDisplay(yg, display)
  }
  let overflow = if n.OverflowX == Overflow.Scroll || n.OverflowY == Overflow.Scroll {
    YGOverflow.Scroll
  } else if n.OverflowX == Overflow.Hidden || n.OverflowY == Overflow.Hidden {
    YGOverflow.Hidden
  } else {
    YGOverflow.Visible
  }
  if YGNodeStyleAPI.YGNodeStyleGetOverflow(yg) != overflow {
    YGNodeStyleAPI.YGNodeStyleSetOverflow(yg, overflow)
  }
}

// Reference equality per slot: Diff reuses Node instances, and syncNode reuses
// their Yoga nodes, so an unchanged child list is the same handles in order.
internal func childrenAlreadyMatch(yg Facebook.Yoga.Node, n Node) bool {
  let count = Portals.SourceChildCount(n)
  if uint32(YGNodeAPI.YGNodeGetChildCount(yg)) != uint32(count) {
    return false
  }
  var index int32
  for child in n.Children {
    if !child.IsPortal {
      guard let childYg = child.Yoga else {
        return false
      }
      if YGNodeAPI.YGNodeGetChild(yg, nuint(index)) != childYg {
        return false
      }
      index++
    }
  }
  return true
}

internal func clampOffset(v float32, max float32) float32 {
  if v < 0.0F { return 0.0F }
  return if v > max { max } else { v }
}

internal func maxScrollX(n Node) float32 ->
  if n.OverflowX != Overflow.Scroll && n.Kind != NodeKind.Editor { 0.0F }
  else { let viewport = scrollViewportWidth(n)
    n.ContentW > viewport ? n.ContentW - viewport : 0.0F }

internal func maxScrollY(n Node) float32 ->
  if n.OverflowY != Overflow.Scroll && n.Kind != NodeKind.Editor { 0.0F }
  else { let viewport = scrollViewportHeight(n)
    n.ContentH > viewport ? n.ContentH - viewport : 0.0F }
