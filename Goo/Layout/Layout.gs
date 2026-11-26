package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Numerics

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

internal partial class Layout {
  internal var TransitionPhase LayoutTransitionPhase
  internal var HasWindowLayoutTransitions bool
  private var standalone bool
  private var standaloneTransitions bool
  internal let Engine FlexLayoutEngine = FlexLayoutEngine.Shared
  internal var Density float32 = 1.0F
  internal var lastWidth float32
  internal var lastHeight float32
  internal var lastRoot Node?
  internal var laidOut bool
  internal var NormalPasses int32
  internal var PopupMeasuredWidth float32?
  internal var PopupMeasuredHeight float32?
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

  internal init() {
    scrollNodes = List[Node]()
    placedPortals = HashSet[Node]()
    scrollListDirty = true
    portalStructureDirty = true
  }

  internal func SetPixelDensity(value float32) {
    if Density == value { return }
    Density = value
    laidOut = false
    portalLaidOut = false
  }

  internal func Calculate(root Node, width float32, height float32) {
    standalone = true
    CalculateCore(root, nil, width, height)
  }

  internal func Calculate(root Node, overlayRoot Node, width float32, height float32) {
    CalculateCore(root, overlayRoot, width, height)
  }

  private func CalculateCore(root Node, overlayRoot Node?, width float32, height float32) {
    if CustomLayouts.Depth != 0 { throw InvalidOperationException("A custom layout callback reentered window layout: use LayoutContext.MeasureChild and ArrangeChild instead of requesting window layout from Measure or Arrange.") }
    CustomLayouts.ViewportWidth = width
    CustomLayouts.ViewportHeight = height
    CustomLayouts.Density = Density
    if structureDirty {
      FlexLayoutEngine.Invalidate(root)
      structureDirty = false
    }
    if let overlays = overlayRoot { overlays.Rect = Rect{W: width, H: height} }
    resolveLengths(root, width, height)
    if !root.IsPortal && NormalNeedsLayout(root, width, height) {
      NormalPasses++
      var request = Engine.RootRequest(width, height, Density, root.Direction)
      if root.Kind == NodeKind.Entry && root.Height.Unit == LengthUnit.Unset { request.Height = FlexConstraint{} }
      if root.Width.Unit == LengthUnit.Percent && PopupMeasuredWidth is {} measuredWidth {
        request.Width = FlexConstraint.Exact(measuredWidth)
      }
      if root.Height.Unit == LengthUnit.Percent && PopupMeasuredHeight is {} measuredHeight {
        request.Height = FlexConstraint.Exact(measuredHeight)
      }
      Engine.ArrangeSubtree(root, request)
      resolveFinalIntrinsic(root, request)
      if overlayRoot == nil {
        standaloneTransitions = false
        TransitionPhase = LayoutTransitionPhase.StandaloneSizes
        try {
          readRect(root, 0.0F, 0.0F)
          if standaloneTransitions {
            TransitionPhase = LayoutTransitionPhase.StandalonePositions
            readRect(root, 0.0F, 0.0F)
          }
        } finally { TransitionPhase = LayoutTransitionPhase.Immediate }
      } else {
        readRect(root, 0.0F, 0.0F)
      }
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
    for portal in overlayRoot.Children {
      if portal.PortalAnchor != nil { continue }
      let request = Engine.RootRequest(width, height, Density, portal.Direction)
      Engine.ArrangeSubtree(portal, request)
      resolveFinalIntrinsic(portal, request)
    }
    portalStructureDirty = false
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
    lengthRoot = nil
    sizedListDirty = true
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
      if !portal.FlexMeasures.HasCommitted && !portal.PortalPlacementHidden && portal.Display != Display.None { return true }
      if portalPlacementChanged(root, portal) { return true }
    }
    return false
  }

  private func NormalNeedsLayout(root Node, width float32, height float32) bool {
    if structureDirty || root != lastRoot || !laidOut
      || width != lastWidth || height != lastHeight {
        return true
      }
    return !root.IsPortal && !root.FlexMeasures.HasCommitted && (root.Display != Display.None || root.LogicalLayout.Valid)
  }

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

  internal func RefreshScrollPlacement(root Node, overlayRoot Node) {
    if !laidOut || root != lastRoot { return }
    let scrollers = ScrollNodes(root)
    for index in 0 ... scrollers.Count {
      let scroller = scrollers[index]
      if scroller.Kind == NodeKind.Editor {
        ScrollState.SyncEditor(scroller)
      }
      scroller.PlacedScrollX = scroller.ScrollX
      scroller.PlacedScrollY = scroller.ScrollY
      if scroller.Kind == NodeKind.Editor {
        readEditorSlotRects(scroller, scroller.PaintInputHidden, false)
      }
      ScrollbarParts.Arrange(scroller, false)
    }
    if portalLaidOut && overlayRoot == portalRoot {
      placePortals(root, overlayRoot, overlayRoot.Rect.W, overlayRoot.Rect.H)
    }
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
    let bounds = portalAnchorBounds(portal, anchor)
    return !portal.PortalAnchorResolved
      || !samePortalRect(portal.PortalAnchorBounds, bounds)
      || portal.PortalAnchorClipped != portalAnchorClipped(portal, anchor, bounds)
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
            portal.PortalAnchorClipped = false
            readRect(portal, 0.0F, 0.0F)
            ScrollbarParts.Arrange(portal)
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
          let bounds = portalAnchorBounds(portal, anchor)
          var dependencyInvalid = false
          if !portalDependenciesReady(anchor, portal, out dependencyInvalid) { continue }
          if dependencyInvalid {
            hidePortal(portal, true, bounds)
            placedPortals.Add(portal)
            progressed = true
            continue
          }
          let collision = portal.PortalBounds?.CollisionBounds
            ?? ElementRect{Width: float64(width), Height: float64(height)}
          var request = Engine.RootRequest(width, height, Density, portal.Direction)
          request.Override = FlexOverride.Capped
          request.Width = FlexConstraint.Cap(float32(collision.Width))
          request.Height = FlexConstraint.Cap(float32(collision.Height))
          let desired = Engine.MeasureSubtree(portal, request)
          let placement = resolvePortalPlacement(portal, bounds, collision, desired)
          let space = portalSideSpace(placement, bounds, collision)
          if int32(placement) < int32(PortalPlacement.RightStart) {
            request.Height = FlexConstraint.Cap(space)
          } else {
            request.Width = FlexConstraint.Cap(space)
          }
          Engine.ArrangeSubtree(portal, request)
          resolveFinalIntrinsic(portal, request)
          let origin = portalOrigin(portal, placement, bounds, width, height)
          portal.PortalAnchorBounds = Rect{
            X: bounds.X, Y: bounds.Y, W: bounds.W, H: bounds.H,
          }
          portal.PortalAnchorResolved = true
          portal.PortalPlacementHidden = false
          portal.PortalAnchorClipped = portalAnchorClipped(portal, anchor, bounds)
          readPortalRect(portal, origin.X, origin.Y)
          ScrollbarParts.Arrange(portal)
          placedPortals.Add(portal)
          progressed = true
        }
        if !progressed { break }
        pass++
      }
      for portal in overlayRoot.Children {
        if placedPortals.Contains(portal) { continue }
        if let anchor = portalAnchor(sourceRoot, portal) {
          hidePortal(portal, true, portalAnchorBounds(portal, anchor))
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

  private func portalAnchorBounds(portal Node, anchor Node) TransformBounds {
    guard let rect = portal.PortalBounds?.AnchorRect else {
      return TransformGeometry.BoundsToWindow(anchor)
    }
    return TransformGeometry.BoundsToWindow(anchor,
      anchor.Rect.X + float32(rect.X), anchor.Rect.Y + float32(rect.Y),
      float32(rect.Width), float32(rect.Height))
  }

  private func portalAnchorClipped(portal Node, anchor Node, bounds TransformBounds) bool {
    if portal.PortalBounds?.HideWhenAnchorClipped != true { return false }
    var ancestor Node? = anchor
    while let current = ancestor {
      if current.PortalAnchorClipped { return true }
      if current.IsPortal { break }
      ancestor = current.Parent
    }
    return TransformGeometry.VisibleBoundsToWindow(anchor,
      ElementRect{ X: float64(bounds.X), Y: float64(bounds.Y),
        Width: float64(bounds.W), Height: float64(bounds.H) },
      float64(lastWidth), float64(lastHeight)) == nil
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
    readRect(portal, 0.0F, 0.0F,
      snapPlacement(0.0F, x, Density) - portal.LogicalLayout.Snapped.X,
      snapPlacement(0.0F, y, Density) - portal.LogicalLayout.Snapped.Y)
  }

  private func portalSideSpace(placement PortalPlacement, anchor TransformBounds,
    bounds ElementRect) float32 {
    let side = int32(placement) / 3
    let space = switch side {
      case 0: float32(bounds.Y + bounds.Height) - anchor.Y - anchor.H
      case 1: anchor.Y - float32(bounds.Y)
      case 2: float32(bounds.X + bounds.Width) - anchor.X - anchor.W
      case _: anchor.X - float32(bounds.X)
    }
    let extent = side < 2 ? float32(bounds.Height) : float32(bounds.Width)
    return clampPortalSize(space, extent)
  }

  private func resolvePortalPlacement(portal Node, anchor TransformBounds,
    bounds ElementRect, desired FlexSize) PortalPlacement {
    let preferred = portal.PortalPlacement
    let ordinal = int32(preferred)
    let opposite = PortalPlacement(ordinal + ((ordinal / 3) % 2 == 0 ? 3 : -3))
    let size = ordinal < int32(PortalPlacement.RightStart)
      ? desired.Height : desired.Width
    let available = portalSideSpace(preferred, anchor, bounds)
    return size > available && portalSideSpace(opposite, anchor, bounds) > available
      ? opposite : preferred
  }

  private func portalOrigin(portal Node, placement PortalPlacement,
    anchor TransformBounds, width float32, height float32) Rect {
      let popupWidth = portal.LogicalLayout.Snapped.W
      let popupHeight = portal.LogicalLayout.Snapped.H
      let bounds = portal.PortalBounds?.CollisionBounds
        ?? ElementRect{ Width: float64(width), Height: float64(height) }
      let left = float32(bounds.X)
      let topEdge = float32(bounds.Y)
      let availableWidth = float32(bounds.Width)
      let availableHeight = float32(bounds.Height)
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
      } else {
        y = anchor.Y
        if center { y = anchor.Y + (anchor.H - popupHeight) * 0.5F }
        else if !start { y = anchor.Y + anchor.H - popupHeight }
        let right = placement == PortalPlacement.RightStart
          || placement == PortalPlacement.Right || placement == PortalPlacement.RightEnd
        x = right ? anchor.X + anchor.W : anchor.X - popupWidth
      }
      return Rect{
        X: left + clampPortalOrigin(x - left, popupWidth, availableWidth),
        Y: topEdge + clampPortalOrigin(y - topEdge, popupHeight, availableHeight),
      }
    }

  private func clampPortalOrigin(origin float32, size float32,
    available float32) float32 {
      if size >= available || origin < 0.0F { return 0.0F }
      let maximum = available - size
      return origin > maximum ? maximum : origin
    }

  private func samePortalRect(left Rect, right TransformBounds) bool ->
  left.X == right.X && left.Y == right.Y && left.W == right.W && left.H == right.H

  internal func readRect(n Node, originX float32, originY float32,
    placementX float32 = 0.0F, placementY float32 = 0.0F, hidden bool = false,
    projectedX float32 = 0.0F, projectedY float32 = 0.0F, idealX float32 = 0.0F, idealY float32 = 0.0F) {
      if !n.LogicalLayout.Valid && !hidden && n.Display != Display.None { return }
      let localX = n.LogicalLayout.Snapped.X + placementX
      let localY = n.LogicalLayout.Snapped.Y + placementY
      if TransitionPhase == LayoutTransitionPhase.StandaloneSizes && n.RetainedLayoutTransition != nil {
        standaloneTransitions = true
      }
      let absX = originX + localX + projectedX
      let absY = originY + localY + projectedY
      let visual = LayoutTransitions.Resolve(n, absX, absY, localX, localY,
        n.LogicalLayout.Snapped.W, n.LogicalLayout.Snapped.H,
        TransitionPhase, projectedX, projectedY, idealX, idealY)
      n.Rect = visual
      let hiddenSubtree = hidden || n.Display == Display.None
      let editor = n.Kind == NodeKind.Editor
      let custom = CustomLayouts.State(n)
      if !hiddenSubtree { custom?.Arrange() }
      ScrollState.RefreshAxes(n)
      if editor {
        ScrollState.SyncEditor(n)
      } else if n.OverflowX == Overflow.Scroll || n.OverflowY == Overflow.Scroll {
        measureScrollExtent(n)
      }
      n.PlacedScrollX = n.ScrollX
      n.PlacedScrollY = n.ScrollY
      if editor {
        if !LayoutOrigin.Baseline && TransitionPhase != LayoutTransitionPhase.Staged {
          n.EditorState?.AcceptPresentation()
        }
        readEditorSlotRects(n, hiddenSubtree)
        n.HitContained = true
        return
      }
      if n.Kind == NodeKind.Image {
        for i in 0 ... n.Children.Count {
          let child = n.Children[i]
          if child.IsPortal { continue }
          if !hiddenSubtree {
            Engine.ArrangeSubtree(child, Engine.RootRequest(n.LogicalLayout.Snapped.W,
              n.LogicalLayout.Snapped.H, Density, n.LogicalLayout.Direction))
          }
          readRect(child, visual.X, visual.Y, hidden: hiddenSubtree)
        }
        n.HitContained = false
        return
      }
      if let state = custom {
        let x = visual.X + BoxGeometry.Inset(n, PhysicalEdge.Left)
        let y = visual.Y + BoxGeometry.Inset(n, PhysicalEdge.Top)
        for child in state.Children {
          readRect(child.Node, x, y, snapPlacement(x, float32(child.Bounds.X), Density),
            snapPlacement(y, float32(child.Bounds.Y), Density), hiddenSubtree)
        }
      } else if n.RetainedSizedState != nil {
        arrangeSized(n, hiddenSubtree)
      } else {
        var ideal = false
        let projected = !hiddenSubtree && TransitionPhase != LayoutTransitionPhase.StandaloneSizes
          && (HasWindowLayoutTransitions || standaloneTransitions) && LayoutPlacement.NeedsProjection(n, ref ideal)
        var placement = projected ? LayoutPlacement(n) : LayoutPlacement{}
        var idealPlacement = ideal ? LayoutPlacement(n, true) : LayoutPlacement{}
        for i in 0 ... n.Children.Count {
          let child = n.Children[i]
          if !child.IsPortal {
            let offset = projected ? placement.Next(child) : Vector2.Zero
            let idealOffset = ideal ? idealPlacement.Next(child) : offset
            readRect(child, visual.X, visual.Y, hidden: hiddenSubtree, projectedX: offset.X, projectedY: offset.Y,
              idealX: idealOffset.X, idealY: idealOffset.Y)
          }
        }
      }
      n.HitContained = !(n.Kind == NodeKind.Shape && n.ShapeVectorEffect == VectorEffect.NonScalingStroke)
      for i in 0 ... n.Children.Count {
        let child = n.Children[i]
        if child.IsPortal { continue }
        if !child.HitContained || child.HasVisualTransform
          || n.OverflowX == Overflow.Visible && (child.Rect.X < n.Rect.X
            || child.Rect.X + child.Rect.W > n.Rect.X + n.Rect.W)
          || n.OverflowY == Overflow.Visible && (child.Rect.Y < n.Rect.Y
            || child.Rect.Y + child.Rect.H > n.Rect.Y + n.Rect.H) {
          n.HitContained = false
          break
        }
      }
    }

  private func snapPlacement(origin float32, offset float32, density float32) float32 ->
  density > 0.0F ? float32(Math.Floor(float64((origin + offset) * density) + 0.5)) / density - origin : offset

  private func readEditorSlotRects(n Node, hidden bool, calculate bool = true) {
    let layout = TextEditorLayouts.For(n, BoxGeometry.ContentWidth(n), BoxGeometry.ContentHeight(n))
    let contentWidth = layout.ParagraphWidth
    for i in 0 ... n.Children.Count {
      let child = n.Children[i]
      if child.IsPortal { continue }
      if (calculate || !child.FlexMeasures.HasCommitted) && !hidden {
        let availableWidth = child.EditorSlotBlock ? contentWidth : Single.NaN
        var request = Engine.RootRequest(availableWidth, Single.NaN, Density, n.LogicalLayout.Direction)
        request.Baseline = true
        Engine.ArrangeSubtree(child, request)
      }
      guard let origin = TextEditorLayouts.SlotOrigin(n, child.EditorSlotKey) else {
        if child.Visibility != Visibility.Hidden {
          child.Visibility = Visibility.Hidden
          child.MarkSceneDirty()
        }
        continue
      }
      let wasVisible = child.Visibility == Visibility.Visible
      child.Visibility = Visibility.Visible
      let x = n.Rect.X + origin.X
      let y = n.Rect.Y + origin.Y
      if calculate || !wasVisible || child.Rect.X != x + child.LogicalLayout.Snapped.X
        || child.Rect.Y != y + child.LogicalLayout.Snapped.Y
        || child.Rect.W != child.LogicalLayout.Snapped.W
        || child.Rect.H != child.LogicalLayout.Snapped.H {
          readRect(child, x, y, hidden: hidden)
          child.MarkSceneDirty()
        }
    }
  }

  // Content extent from committed relative child geometry; every pass re-clamps
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
      let insetX = n.RetainedSizedState != nil ? 0.0F : BoxGeometry.Inset(n, PhysicalEdge.Left)
      let insetY = n.RetainedSizedState != nil ? 0.0F : BoxGeometry.Inset(n, PhysicalEdge.Top)
      for i in 0 ... n.Children.Count {
        let child = n.Children[i]
        if child.IsPortal || !child.LogicalLayout.Valid { continue }
        let right = child.LogicalLayout.Snapped.X + child.LogicalLayout.Snapped.W - insetX
        let bottom = child.LogicalLayout.Snapped.Y + child.LogicalLayout.Snapped.H - insetY
        if right > cw { cw = right }
        if bottom > ch { ch = bottom }
      }
    }
    ScrollState.SetExtent(n, cw, ch)
  }
}

internal func clampOffset(v float32, max float32) float32 {
  if v < 0.0F { return 0.0F }
  return if v > max { max } else { v }
}

internal func maxScrollX(n Node) float32 ->
  if n.OverflowX != Overflow.Scroll && n.Kind != NodeKind.Editor { 0.0F }
  else { scrollRange(n, n.ContentW - scrollViewportWidth(n)) }

internal func maxScrollY(n Node) float32 ->
  if n.OverflowY != Overflow.Scroll && n.Kind != NodeKind.Editor { 0.0F }
  else { scrollRange(n, n.ContentH - scrollViewportHeight(n)) }

internal func scrollRange(n Node, overflow float32) float32 {
  if overflow <= 0.0F { return 0.0F }
  let scale = TransformGeometry.PixelDensity(n)
  return MathF.Ceiling(overflow * scale) / scale
}
