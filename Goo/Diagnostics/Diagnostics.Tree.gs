package Goo

import Facebook.Yoga
import System
import System.Collections.Generic
import System.Globalization
import System.Runtime.CompilerServices
import System.Text

internal class DiagnosticNodeIdentityValue {
  internal let Id int64
  internal let Target string

  internal init(value int64, target string) {
    Id = value
    Target = target
  }
}

internal class DiagnosticNodeIdentity {
  private let values ConditionalWeakTable[Node, DiagnosticNodeIdentityValue]
  private var nextValue int64

  internal init() {
    values = ConditionalWeakTable[Node, DiagnosticNodeIdentityValue]()
    nextValue = 1
  }

  internal func Get(n Node) int64 {
    if values.TryGetValue(n, out var value) {
      return value.Id
    }
    let assigned = nextValue
    nextValue = nextValue == Int64.MaxValue ? 1 : nextValue + 1
    values.Add(n, DiagnosticNodeIdentityValue(assigned, Guid.NewGuid().ToString("N")))
    return assigned
  }

  internal func Target(n Node) string {
    Get(n)
    if values.TryGetValue(n, out var value) { return value.Target }
    throw InvalidOperationException("Diagnostic target identity is unavailable.")
  }

  internal func TryGet(n Node) int64? -> if values.TryGetValue(n, out var value) { value.Id } else { nil }

}

internal class DiagnosticTreeState {
  private let owner Window?
  private let identity DiagnosticNodeIdentity
  private var previous Dictionary[int64, DiagnosticNodeSnapshot]
  private var nodes Dictionary[int64, WeakReference]
  private var targets Dictionary[string, int64]
  private var previousRoot WeakReference?
  private var revisionNumber int64
  private var initialized bool
  private var previousHoveredId int64
  private var previousSelectedId int64

  internal init(window Window? = nil) {
    owner = window
    identity = DiagnosticNodeIdentity()
    previous = Dictionary[int64, DiagnosticNodeSnapshot]()
    nodes = Dictionary[int64, WeakReference]()
    targets = Dictionary[string, int64](StringComparer.Ordinal)
  }

  internal func Invalidate() {
    initialized = false
    previous.Clear()
    nodes.Clear()
    targets.Clear()
    previousRoot = nil
    previousHoveredId = 0
    previousSelectedId = 0
  }

  internal func Capture(root Node?, windowId string, hovered Node?, selected Node?,
    semantics AccessibilityManager? = nil) DiagnosticSnapshot {
    revisionNumber = revisionNumber == Int64.MaxValue ? 1 : revisionNumber + 1
    let current Dictionary[int64, DiagnosticNodeSnapshot] = Dictionary[int64, DiagnosticNodeSnapshot]()
    let added = List[DiagnosticNodeSnapshot]()
    let updated = List[DiagnosticNodeSnapshot]()
    let removed = List[int64]()
    var rootId int64
    if let treeRoot = root {
      rootId = identity.Get(treeRoot)
      collect(treeRoot, nil, 0, current, semantics)
      previousRoot = WeakReference(treeRoot)
    } else {
      previousRoot = nil
    }

    let full = !initialized
    for pair in current {
      if full || !previous.ContainsKey(pair.Key) {
        added.Add(pair.Value)
      } else if previous[pair.Key].Fingerprint != pair.Value.Fingerprint {
        updated.Add(pair.Value)
      }
    }
    for pair in previous {
      if !current.ContainsKey(pair.Key) {
        removed.Add(pair.Key)
      }
    }
    let staleNodes = List[int64]()
    for pair in nodes {
      if !current.ContainsKey(pair.Key) { staleNodes.Add(pair.Key) }
    }
    for id in staleNodes { nodes.Remove(id) }
    targets.Clear()
    for pair in current { targets[pair.Value.Target] = pair.Key }
    let hoveredId = nodeId(hovered, current)
    let selectedId = nodeId(selected, current)
    let selectionChanged = hoveredId != previousHoveredId || selectedId != previousSelectedId
    previousHoveredId = hoveredId
    previousSelectedId = selectedId
    previous = current
    initialized = true
    return DiagnosticSnapshot(revisionNumber, full, windowId,
      optionalId(rootId), optionalId(hoveredId), optionalId(selectedId), added, updated, removed,
      selectionChanged)
  }

  internal func FullSnapshot(current DiagnosticSnapshot) DiagnosticSnapshot {
    let added = List[DiagnosticNodeSnapshot](previous.Count)
    for pair in previous { added.Add(pair.Value) }
    return DiagnosticSnapshot(current.Sequence, true, current.WindowId, current.RootId, current.HoveredId,
      current.SelectedId, added, List[DiagnosticNodeSnapshot](), List[int64](), false)
  }

  internal func Find(id int64) DiagnosticNodeSnapshot? -> if previous.TryGetValue(id, out var node) { node } else { nil }

  internal func FindNode(id int64) Node? {
    if !nodes.TryGetValue(id, out var reference) { return nil }
    let target = reference.Target as Node?
    guard let node = target else {
      nodes.Remove(id)
      return nil
    }
    if node.Retired {
      nodes.Remove(id)
      return nil
    }
    return node
  }

  internal func FindTarget(target string) Node? -> if !targets.TryGetValue(target, out var id) { nil } else { FindNode(id) }

  internal func FindTargetSnapshot(target string) DiagnosticNodeSnapshot? -> if !targets.TryGetValue(target, out var id) { nil } else { Find(id) }

  private func nodeId(node Node?, values Dictionary[int64, DiagnosticNodeSnapshot]) int64 {
    guard let value = node else { return 0 }
    let id = identity.TryGet(value)
    guard let assigned = id else { return 0 }
    return values.ContainsKey(assigned) ? assigned : 0
  }

  private func optionalId(value int64) int64 ? -> value == 0 ? nil : value

  private func collect(n Node, parent Node?, childIndex int32,
    destination Dictionary[int64, DiagnosticNodeSnapshot], semantics AccessibilityManager?) {
      if n.Retired {
        return
      }
      let id = identity.Get(n)
      nodes[id] = WeakReference(n)
      let snapshot = makeSnapshot(n, parent, childIndex, id, semantics)
      destination.Add(id, snapshot)
      var index int32
      for child in n.Children {
        collect(child, n, index, destination, semantics)
        index = index + 1
      }
    }

  private func makeSnapshot(n Node, parent Node?, childIndex int32, id int64,
    semantics AccessibilityManager?)
  DiagnosticNodeSnapshot{
    let result = DiagnosticNodeSnapshot()
    result.Id = id
    result.Target = identity.Target(n)
    result.ParentId = if let owner = parent { identity.Get(owner) } else { nil }
    result.ChildIndex = childIndex
    let childIds = List[int64](n.Children.Count)
    for child in n.Children {
      if !child.Retired { childIds.Add(identity.Get(child)) }
    }
    result.ChildIds = childIds
    result.Kind = n.IsPortal ? "Portal" : n.Kind.ToString()
    result.Key = n.Key ?? ""
    result.Content = n.Content
    result.OwnerType = if let owner = n.Fiber { owner.GetType().Name } else { "" }
    let border = TransformGeometry.BoundsToWindow(n)
    result.BorderBox = DiagnosticRect{
      X: float64(border.X), Y: float64(border.Y), Width: float64(border.W), Height: float64(border.H),
    }
    result.Bounds = result.BorderBox
    let borderLeft = resolvedBorder(n, YGEdge.Left)
    let borderTop = resolvedBorder(n, YGEdge.Top)
    let borderRight = resolvedBorder(n, YGEdge.Right)
    let borderBottom = resolvedBorder(n, YGEdge.Bottom)
    var paddingWidth = n.Rect.W - borderLeft - borderRight
    var paddingHeight = n.Rect.H - borderTop - borderBottom
    if paddingWidth < 0.0F { paddingWidth = 0.0F }
    if paddingHeight < 0.0F { paddingHeight = 0.0F }
    let padding = TransformGeometry.BoundsToWindow(n,
      n.Rect.X + borderLeft, n.Rect.Y + borderTop,
      paddingWidth, paddingHeight)
    result.PaddingBox = DiagnosticRect{
      X: float64(padding.X), Y: float64(padding.Y),
      Width: float64(padding.W), Height: float64(padding.H),
    }
    let contentLeft = BoxGeometry.ContentLeft(n)
    let contentTop = BoxGeometry.ContentTop(n)
    let contentWidth = BoxGeometry.ContentWidth(n)
    let contentHeight = BoxGeometry.ContentHeight(n)
    let content = TransformGeometry.BoundsToWindow(n, contentLeft, contentTop,
      contentWidth, contentHeight)
    result.ContentBox = DiagnosticRect{
      X: float64(content.X), Y: float64(content.Y),
      Width: float64(content.W), Height: float64(content.H),
    }
    let marginLeft = resolvedMargin(n, YGEdge.Left)
    let marginTop = resolvedMargin(n, YGEdge.Top)
    let marginRight = resolvedMargin(n, YGEdge.Right)
    let marginBottom = resolvedMargin(n, YGEdge.Bottom)
    let margin = TransformGeometry.BoundsToWindow(n,
      n.Rect.X - marginLeft, n.Rect.Y - marginTop,
      n.Rect.W + marginLeft + marginRight, n.Rect.H + marginTop + marginBottom)
    result.MarginBox = DiagnosticRect{
      X: float64(margin.X), Y: float64(margin.Y),
      Width: float64(margin.W), Height: float64(margin.H),
    }
    result.ClipBox = visibleBounds(n, result.BorderBox)
    result.Visible = result.ClipBox.Width > 0.0 && result.ClipBox.Height > 0.0
    result.Clipped = !sameRect(result.ClipBox, result.BorderBox)
    result.ClipApproximate = hasComplexClip(n)
    result.ScrollOffset = DiagnosticPoint{ X: float64(n.ScrollX), Y: float64(n.ScrollY) }
    result.ContentSize = DiagnosticPoint{ X: float64(n.ContentW), Y: float64(n.ContentH) }
    result.Width = lengthText(n.Width)
    result.Height = lengthText(n.Height)
    result.MinWidth = lengthText(n.MinWidth)
    result.MinHeight = lengthText(n.MinHeight)
    result.MaxWidth = lengthText(n.MaxWidth)
    result.MaxHeight = lengthText(n.MaxHeight)
    result.Padding = lengthText(n.Padding)
    result.PaddingLeft = lengthText(n.PaddingLeft)
    result.PaddingTop = lengthText(n.PaddingTop)
    result.PaddingRight = lengthText(n.PaddingRight)
    result.PaddingBottom = lengthText(n.PaddingBottom)
    result.Margin = lengthText(n.Margin)
    result.MarginLeft = lengthText(n.MarginLeft)
    result.MarginTop = lengthText(n.MarginTop)
    result.MarginRight = lengthText(n.MarginRight)
    result.MarginBottom = lengthText(n.MarginBottom)
    result.Gap = lengthText(n.Gap)
    result.RowGap = lengthText(n.RowGap)
    result.ColumnGap = lengthText(n.ColumnGap)
    result.FlexBasis = lengthText(n.FlexBasis)
    result.Left = lengthText(n.Left)
    result.Top = lengthText(n.Top)
    result.Right = lengthText(n.Right)
    result.Bottom = lengthText(n.Bottom)
    result.FlexDirection = n.FlexDirection.ToString()
    result.FlexWrap = n.FlexWrap.ToString()
    result.JustifyContent = n.JustifyContent.ToString()
    result.AlignItems = n.AlignItems.ToString()
    result.AlignSelf = n.AlignSelf.ToString()
    result.AlignContent = n.AlignContent.ToString()
    result.Position = n.Position.ToString()
    result.Display = n.Display.ToString()
    result.Direction = n.Direction.ToString()
    result.OverflowX = n.OverflowX.ToString()
    result.OverflowY = n.OverflowY.ToString()
    result.FlexGrow = n.FlexGrow
    result.FlexShrink = n.FlexShrink
    result.AspectRatio = n.AspectRatio
    result.Opacity = n.Opacity
    result.BackgroundColor = colorText(n.BackgroundColor)
    result.BorderColor = colorText(n.BorderLeftColor)
    result.BorderWidth = lengthText(n.BorderLeftWidth) + ","
    +lengthText(n.BorderTopWidth) + "," + lengthText(n.BorderRightWidth) + ","
    +lengthText(n.BorderBottomWidth)
    result.BorderRadius = lengthText(n.BorderRadius)
    result.FontFamily = n.FontFamily
    result.FontSize = lengthText(n.FontSize)
    result.FontWeight = n.FontWeight
    result.FontStyle = n.FontStyle.ToString()
    result.Color = colorText(n.Color)
    result.TextAlign = n.TextAlign.ToString()
    result.TextWrap = n.TextWrap.ToString()
    result.TextTrimming = n.TextTrimming.ToString()
    result.Hovered = n.Hovered
    result.Pressed = n.Pressed
    result.Focused = n.Focused
    result.Disabled = n.Disabled
    result.Focusable = n.Focusable
    result.HitTestSelf = n.HitTestSelf
    result.HasClickHandler = n.OnClick != nil
    result.HasPointerHandlers = n.OnPointerDown != nil || n.OnPointerMove != nil
      || n.OnPointerUp != nil || n.OnPointerCancel != nil || n.OnWheel != nil
    result.HasKeyboardHandlers = InputCallbacks.KeyDown(n) != nil || InputCallbacks.KeyUp(n) != nil
    let accessibility = if let manager = semantics { manager.DiagnosticNodeFor(n) } else { nil }
    if let accessibility = accessibility {
      result.AccessibilityId = accessibility.Id.Value
      result.AccessibilityRole = accessibility.Role.ToString()
      result.AccessibilityCustomRole = accessibility.CustomRole
      result.AccessibilityName = accessibility.Name
      result.AccessibilityDescription = accessibility.Description
      result.AccessibilityValue = accessibility.Value
      result.AccessibilityHidden = false
      result.AccessibilityChecked = accessibility.Checked.ToString()
      result.AccessibilitySelected = accessibility.Selected
      result.AccessibilityExpanded = accessibility.Expanded
      result.AccessibilityReadOnly = accessibility.ReadOnly
      result.AccessibilityRequired = accessibility.Required
      result.AccessibilityInvalid = accessibility.Invalid
      result.AccessibilityBusy = accessibility.Busy
      result.AccessibilityState = accessibility.Live.ToString()
      result.SelectionStart = accessibility.SelectionStart
      result.SelectionLength = accessibility.SelectionLength
      result.Caret = accessibility.Caret
      if let text = accessibility.TextSnapshot {
        result.TextLength = text.Length
        result.TextTruncated = text.Length > 16384
        result.Text = text.GetText(TextRange{Start: 0, Length: Math.Min(text.Length, 16384)})
      } else {
        result.Text = accessibility.Value
        result.TextLength = result.Text.Length
      }
    } else {
      result.AccessibilityHidden = true
    }
    resolveActionability(n, result)
    result.Configuration = configurationText(result)
    result.Computed = computedText(result)
    result.State = stateText(result)
    result.Events = eventsText(result)
    result.Fingerprint = fingerprint(result)
    return result
  }

  private func visibleBounds(n Node, border DiagnosticRect) DiagnosticRect {
    if hidden(n) { return DiagnosticRect{} }
    var result = border
    var current Node? = n
    while let ancestor = current {
      if ancestor.HasClipPath {
        if let clipPath = ClipPaths.Get(ancestor) {
          let mapping = PathGeometry.Map(clipPath.Path, clipPath.Fit,
            ancestor.Rect.X, ancestor.Rect.Y, ancestor.Rect.W, ancestor.Rect.H)
          let geometry = PathGeometry.For(clipPath.Path)
          if mapping.Valid {
            let path = TransformGeometry.BoundsToWindow(ancestor,
              geometry.MinX * mapping.ScaleX + mapping.TranslateX,
              geometry.MinY * mapping.ScaleY + mapping.TranslateY,
              (geometry.MaxX - geometry.MinX) * mapping.ScaleX,
              (geometry.MaxY - geometry.MinY) * mapping.ScaleY)
            result = intersectX(result, float64(path.X), float64(path.X + path.W))
            result = intersectY(result, float64(path.Y), float64(path.Y + path.H))
          } else {
            return DiagnosticRect{}
          }
        }
      }
      if ancestor != n {
        let clip = if ancestor.Kind == NodeKind.Editor {
          TransformGeometry.BoundsToWindow(ancestor, BoxGeometry.ContentLeft(ancestor),
            BoxGeometry.ContentTop(ancestor), BoxGeometry.ContentWidth(ancestor),
            BoxGeometry.ContentHeight(ancestor))
        } else { TransformGeometry.BoundsToWindow(ancestor) }
        if (ancestor.Parent == nil && !ancestor.IsPortal) || ancestor.Kind == NodeKind.Editor
          || ancestor.OverflowX != Overflow.Visible {
          result = intersectX(result, float64(clip.X), float64(clip.X + clip.W))
        }
        if (ancestor.Parent == nil && !ancestor.IsPortal) || ancestor.Kind == NodeKind.Editor
          || ancestor.OverflowY != Overflow.Visible {
          result = intersectY(result, float64(clip.Y), float64(clip.Y + clip.H))
        }
      }
      if ancestor.IsPortal {
        if let window = owner {
          result = intersectX(result, 0.0, float64(window.Width))
          result = intersectY(result, 0.0, float64(window.Height))
        }
        break
      }
      current = ancestor.Parent
    }
    return result
  }

  private func intersectX(value DiagnosticRect, left float64, right float64) DiagnosticRect {
    let start = Math.Max(value.X, left)
    let end = Math.Min(value.X + value.Width, right)
    return DiagnosticRect{X: start, Y: value.Y, Width: Math.Max(0.0, end - start), Height: value.Height}
  }

  private func intersectY(value DiagnosticRect, top float64, bottom float64) DiagnosticRect {
    let start = Math.Max(value.Y, top)
    let end = Math.Min(value.Y + value.Height, bottom)
    return DiagnosticRect{X: value.X, Y: start, Width: value.Width, Height: Math.Max(0.0, end - start)}
  }

  private func hidden(n Node) bool {
    var current Node? = n
    while let value = current {
      if value.PaintInputHidden { return true }
      current = value.Parent
    }
    return false
  }

  private func disabled(n Node) bool {
    var current Node? = n
    while let value = current {
      if value.Disabled { return true }
      current = value.Parent
    }
    return false
  }

  private func resolveActionability(n Node, result DiagnosticNodeSnapshot) {
    guard let window = owner else {
      result.ActionStatus = "unavailable"
      return
    }
    if window.IsInputBlocked {
      result.ActionStatus = "window-blocked"
      return
    }
    if hidden(n) {
      result.ActionStatus = "hidden"
      return
    }
    if disabled(n) {
      result.ActionStatus = "disabled"
      return
    }
    guard let root = window.Tree else {
      result.ActionStatus = "detached"
      return
    }
    if !FocusScopes.Allows(root, n) {
      result.ActionStatus = "modal-blocked"
      return
    }
    if !result.Visible {
      result.ActionStatus = "clipped"
      return
    }
    if !n.HitTestSelf && !n.Focusable && n.OnClick == nil && n.OnPointerDown == nil
      && n.OnPointerMove == nil && n.OnPointerUp == nil && n.OnWheel == nil {
      result.ActionStatus = "not-hit-testable"
      return
    }
    guard let point = verifiedPoint(root, n, result.ClipBox) else {
      result.ActionStatus = "no-verified-point"
      return
    }
    result.Actionable = true
    result.ActionStatus = "actionable"
    result.ActionPoint = point
  }

  private func verifiedPoint(root Node, target Node, bounds DiagnosticRect) DiagnosticPoint? {
    let factors = []float64{0.5, 0.25, 0.75, 0.1, 0.9}
    for y in factors {
      for x in factors {
        let point = DiagnosticPoint{X: bounds.X + bounds.Width * x, Y: bounds.Y + bounds.Height * y}
        if pointTargets(root, target, point) { return point }
      }
    }
    return nil
  }

  private func pointTargets(root Node, target Node, point DiagnosticPoint) bool {
    guard let hit = hitTopmost(root, float32(point.X), float32(point.Y)) else { return false }
    return FocusScopes.Contains(target, hit) && canReceiveInput(hit) && FocusScopes.Allows(root, hit)
  }

  private func sameRect(left DiagnosticRect, right DiagnosticRect) bool -> left.X == right.X
    && left.Y == right.Y && left.Width == right.Width && left.Height == right.Height

  private func hasComplexClip(n Node) bool {
    var current Node? = n
    while let value = current {
      if value.HasClipPath || value.HasVisualTransform { return true }
      if value.IsPortal { break }
      current = value.Parent
    }
    return false
  }

  private func lengthText(value Length) string {
    if value.Unit == LengthUnit.Auto { return "auto" }
    if value.Unit == LengthUnit.Percent { return value.Magnitude.ToString(CultureInfo.InvariantCulture) + "%" }
    return if value.Unit == LengthUnit.Px { value.Magnitude.ToString(CultureInfo.InvariantCulture) + "px" } else { "unset" }
  }

  private func colorText(value Color) string -> value.R.ToString(CultureInfo.InvariantCulture) + ","
  +value.G.ToString(CultureInfo.InvariantCulture) + ","
  +value.B.ToString(CultureInfo.InvariantCulture) + ","
  +value.A.ToString(CultureInfo.InvariantCulture)

  private func resolvedBorder(n Node, edge YGEdge) float32 {
    guard let yoga = n.Yoga else { return 0.0F }
    return finiteEdge(YGNodeLayoutAPI.YGNodeLayoutGetBorder(yoga, edge))
  }

  private func resolvedMargin(n Node, edge YGEdge) float32 {
    guard let yoga = n.Yoga else { return 0.0F }
    return finiteEdge(YGNodeLayoutAPI.YGNodeLayoutGetMargin(yoga, edge))
  }

  private func finiteEdge(value float32) float32 -> if Single.IsNaN(value) || Single.IsInfinity(value) { 0.0F } else { value }

  private func configurationText(value DiagnosticNodeSnapshot) string {
    let builder = StringBuilder()
    builder.Append(value.Width).Append(" ").Append(value.Height).Append(" ").Append(value.MinWidth).Append(" ").Append(value.MinHeight).Append(" ").Append(value.MaxWidth).Append(" ").Append(value.MaxHeight).Append(" ").Append(value.Padding).Append(" ").Append(value.PaddingLeft).Append(" ").Append(value.PaddingTop).Append(" ").Append(value.PaddingRight).Append(" ").Append(value.PaddingBottom).Append(" ").Append(value.Margin).Append(" ").Append(value.MarginLeft).Append(" ").Append(value.MarginTop).Append(" ").Append(value.MarginRight).Append(" ").Append(value.MarginBottom).Append(" ").Append(value.Gap).Append(" ").Append(value.RowGap).Append(" ").Append(value.ColumnGap).Append(" ").Append(value.FlexBasis).Append(" ").Append(value.Left).Append(" ").Append(value.Top).Append(" ").Append(value.Right).Append(" ").Append(value.Bottom).Append(" ").Append(value.FlexDirection).Append(" ").Append(value.FlexWrap).Append(" ").Append(value.JustifyContent).Append(" ").Append(value.AlignItems).Append(" ").Append(value.AlignSelf).Append(" ").Append(value.AlignContent).Append(" ").Append(value.Position).Append(" ").Append(value.FlexGrow).Append(" ").Append(value.FlexShrink).Append(" ").Append(value.AspectRatio)
    return builder.ToString()
  }

  private func computedText(value DiagnosticNodeSnapshot) string {
    let builder = StringBuilder()
    builder.Append(value.Display).Append(" ").Append(value.Direction).Append(" ").Append(value.OverflowX).Append("/").Append(value.OverflowY).Append(" ").Append(value.Opacity).Append(" ").Append(value.BackgroundColor).Append(" ").Append(value.BorderColor).Append(" ").Append(value.BorderWidth).Append(" ").Append(value.BorderRadius).Append(" ").Append(value.FontFamily).Append(" ").Append(value.FontSize).Append(" ").Append(value.FontWeight).Append(" ").Append(value.FontStyle).Append(" ").Append(value.Color).Append(" ").Append(value.TextAlign).Append(" ").Append(value.TextWrap).Append(" ").Append(value.TextTrimming)
    return builder.ToString()
  }

  private func stateText(value DiagnosticNodeSnapshot) string {
    let builder = StringBuilder()
    if value.Hovered { builder.Append("hover ") }
    if value.Pressed { builder.Append("pressed ") }
    if value.Focused { builder.Append("focused ") }
    if value.Disabled { builder.Append("disabled ") }
    if value.Focusable { builder.Append("focusable ") }
    return builder.ToString().Trim()
  }

  private func eventsText(value DiagnosticNodeSnapshot) string {
    let builder = StringBuilder()
    if value.HasClickHandler { builder.Append("click ") }
    if value.HasPointerHandlers { builder.Append("pointer ") }
    if value.HasKeyboardHandlers { builder.Append("keyboard ") }
    return builder.ToString().Trim()
  }

  private func fingerprint(value DiagnosticNodeSnapshot) string {
    let builder = StringBuilder()
    builder.Append(value.Id).Append('|').Append(value.ParentId).Append('|').Append(value.ChildIndex).Append('|').Append(value.Kind).Append('|').Append(value.Key).Append('|').Append(value.Content).Append('|').Append(value.OwnerType).Append('|').Append(rectText(value.Bounds)).Append('|').Append(rectText(value.BorderBox)).Append('|').Append(rectText(value.PaddingBox)).Append('|').Append(rectText(value.ContentBox)).Append('|').Append(rectText(value.MarginBox)).Append('|').Append(rectText(value.ClipBox)).Append('|').Append(value.ScrollOffset.X).Append('|').Append(value.ScrollOffset.Y).Append('|').Append(value.ContentSize.X).Append('|').Append(value.ContentSize.Y).Append('|').Append(value.Configuration).Append('|').Append(value.Computed).Append('|').Append(value.State).Append('|').Append(value.Events).Append('|').Append(value.AccessibilityRole).Append('|').Append(value.AccessibilityCustomRole).Append('|').Append(value.AccessibilityName).Append('|').Append(value.AccessibilityDescription).Append('|').Append(value.AccessibilityValue).Append('|').Append(value.AccessibilityHidden).Append('|').Append(value.AccessibilityChecked).Append('|').Append(value.AccessibilitySelected).Append('|').Append(value.AccessibilityExpanded).Append('|').Append(value.AccessibilityReadOnly).Append('|').Append(value.AccessibilityRequired).Append('|').Append(value.AccessibilityInvalid).Append('|').Append(value.AccessibilityBusy).Append('|').Append(value.AccessibilityState)
    builder.Append('|').Append(value.Target).Append('|').Append(value.Visible).Append('|').Append(value.Clipped)
      .Append('|').Append(value.ClipApproximate).Append('|').Append(value.Actionable).Append('|').Append(value.ActionStatus)
    if let actionPoint = value.ActionPoint {
      builder.Append('|').Append(actionPoint.X).Append('|').Append(actionPoint.Y)
    } else {
      builder.Append("|null|null")
    }
    builder.Append('|').Append(value.AccessibilityId).Append('|').Append(value.Text).Append('|').Append(value.TextLength)
      .Append('|').Append(value.TextTruncated).Append('|').Append(value.SelectionStart)
      .Append('|').Append(value.SelectionLength).Append('|').Append(value.Caret)
    for id in value.ChildIds { builder.Append('|').Append(id) }
    return builder.ToString()
  }

  private func rectText(value DiagnosticRect) string -> value.X.ToString(CultureInfo.InvariantCulture) + ","
  +value.Y.ToString(CultureInfo.InvariantCulture) + ","
  +value.Width.ToString(CultureInfo.InvariantCulture) + ","
  +value.Height.ToString(CultureInfo.InvariantCulture)
}
