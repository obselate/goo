package Goo

import System

/// Selects the edge or center region occupied by a child inside a Dock layout.
public enum DockEdge {
  /// Docks the child to the inline-start edge (left in left-to-right, right in right-to-left).
  Start;
  /// Docks the child to the inline-end edge (right in left-to-right, left in right-to-left).
  End;
  /// Docks the child to the top edge.
  Top;
  /// Docks the child to the bottom edge.
  Bottom;
  /// Docks the child to the physical left edge regardless of reading direction.
  Left;
  /// Docks the child to the physical right edge regardless of reading direction.
  Right;
  /// Places the child in the remaining center area after all docked edges are carved out.
  Fill
}

/// Sequentially docks children along container edges and gives remaining space to Fill children.
public sealed class Dock : LayoutAlgorithm {
  shared {
    /// Gets a shared Dock instance with LastChildFill enabled.
    public let Default Dock = Dock()

    /// Identifies the per-child DockEdge trait.
    public let Edge LayoutKey[DockEdge] = LayoutKey[DockEdge](DockEdge.Start)

    private func setEdge(child Blob, edge DockEdge) Blob {
      if child == nil { throw ArgumentNullException("child") }
      return child.WithLayoutTrait(Edge, edge)
    }

    /// Docks a child to the top edge and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    public func Top(child Blob) Blob -> setEdge(child, DockEdge.Top)

    /// Docks a child to the bottom edge and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    public func Bottom(child Blob) Blob -> setEdge(child, DockEdge.Bottom)

    /// Docks a child to the inline-start edge and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    public func Start(child Blob) Blob -> setEdge(child, DockEdge.Start)

    /// Docks a child to the inline-end edge and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    public func End(child Blob) Blob -> setEdge(child, DockEdge.End)

    /// Docks a child to the physical left edge and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    public func Left(child Blob) Blob -> setEdge(child, DockEdge.Left)

    /// Docks a child to the physical right edge and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    public func Right(child Blob) Blob -> setEdge(child, DockEdge.Right)

    /// Assigns a child to fill the remaining center area and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    public func Fill(child Blob) Blob -> setEdge(child, DockEdge.Fill)
  }

  private var lastChildFill bool = true

  /// Gets or sets whether the last visible child without an explicit Dock.Edge trait fills the remaining area. Defaults to true.
  public prop LastChildFill bool {
    get -> lastChildFill
    init -> lastChildFill = value
  }

  /// Initializes a Dock layout with LastChildFill enabled.
  public init() { }

  private func effectiveEdge(context LayoutContext, index int32, lastVisible int32) DockEdge {
    if context.TryGetChildTrait(index, Edge, out var edge) {
      if !Enum.IsDefined(edge) { throw ArgumentOutOfRangeException("DockEdge") }
      return edge
    }
    return (lastChildFill && index == lastVisible) ? DockEdge.Fill : DockEdge.Start
  }

  private func scanChildren(
    context LayoutContext,
    count int32,
    out lastVisible int32,
    out edgeCount int32,
    out hasFill bool
  ) {
    lastVisible = -1
    for i in 0 ... count {
      if context.ChildDisplay(i) != Display.None { lastVisible = i }
    }
    edgeCount = 0
    hasFill = false
    for i in 0 ... count {
      if context.ChildDisplay(i) == Display.None { continue }
      if effectiveEdge(context, i, lastVisible) == DockEdge.Fill {
        hasFill = true
      } else {
        edgeCount++
      }
    }
  }

  /// Measures docked edge strips followed by any Fill children to determine the container's desired content size.
  /// @param context The bounded layout context for the current measure pass.
  /// @param available The maximum available content size.
  /// @returns The minimum content size needed to accommodate all docked edges and Fill children.
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    let count = context.ChildCount
    scanChildren(context, count, out var lastVisible, out var remainingEdges, out var hasFill)
    let rowGap = context.RowGap
    let colGap = context.ColumnGap
    var remW = available.Width
    var remH = available.Height
    var usedW = 0.0
    var usedH = 0.0
    var minW = 0.0
    var minH = 0.0

    for i in 0 ... count {
      if context.ChildDisplay(i) == Display.None { continue }
      let edge = effectiveEdge(context, i, lastVisible)
      if edge == DockEdge.Fill { continue }
      remainingEdges--
      let needsGap = remainingEdges > 0 || hasFill
      let measured = context.MeasureChild(
        i,
        LayoutConstraint.AtMost(remW),
        LayoutConstraint.AtMost(remH)
      )
      if edge == DockEdge.Top || edge == DockEdge.Bottom {
        if usedW + measured.Width > minW { minW = usedW + measured.Width }
        let step = measured.Height + (needsGap ? rowGap : 0.0)
        usedH += step
        if usedH > minH { minH = usedH }
        if Double.IsFinite(remH) { remH = Math.Max(0.0, remH - step) }
      } else {
        if usedH + measured.Height > minH { minH = usedH + measured.Height }
        let step = measured.Width + (needsGap ? colGap : 0.0)
        usedW += step
        if usedW > minW { minW = usedW }
        if Double.IsFinite(remW) { remW = Math.Max(0.0, remW - step) }
      }
    }

    if hasFill {
      let wLimit = LayoutConstraint.AtMost(remW)
      let hLimit = LayoutConstraint.AtMost(remH)
      for i in 0 ... count {
        if context.ChildDisplay(i) == Display.None { continue }
        if effectiveEdge(context, i, lastVisible) != DockEdge.Fill { continue }
        let measured = context.MeasureChild(i, wLimit, hLimit)
        if usedW + measured.Width > minW { minW = usedW + measured.Width }
        if usedH + measured.Height > minH { minH = usedH + measured.Height }
      }
    }

    return LayoutSize(minW, minH)
  }

  /// Arranges docked edge strips in child order, then places all Fill children in the remaining rectangle.
  /// @param context The bounded layout context for the current arrange pass.
  /// @param finalSize The resolved content size.
  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    let count = context.ChildCount
    scanChildren(context, count, out var lastVisible, out var remainingEdges, out var hasFill)
    let rowGap = context.RowGap
    let colGap = context.ColumnGap
    let rtl = context.Direction == Direction.RightToLeft

    var remX = 0.0
    var remY = 0.0
    var remW = finalSize.Width
    var remH = finalSize.Height

    for i in 0 ... count {
      if context.ChildDisplay(i) == Display.None {
        context.ArrangeChild(i, ElementRect{})
        continue
      }
      let edge = effectiveEdge(context, i, lastVisible)
      if edge == DockEdge.Fill { continue }
      remainingEdges--
      let needsGap = remainingEdges > 0 || hasFill

      let physical = if edge == DockEdge.Start {
        rtl ? DockEdge.Right : DockEdge.Left
      } else if edge == DockEdge.End {
        rtl ? DockEdge.Left : DockEdge.Right
      } else {
        edge
      }

      if physical == DockEdge.Top || physical == DockEdge.Bottom {
        let measured = context.MeasureChild(
          i,
          LayoutConstraint.Exactly(remW),
          LayoutConstraint.AtMost(remH)
        )
        let h = Math.Min(measured.Height, remH)
        let y = physical == DockEdge.Top ? remY : remY + remH - h
        context.ArrangeChild(i, ElementRect{ X: remX, Y: y, Width: remW, Height: h })
        let step = Math.Min(remH, h + (needsGap ? rowGap : 0.0))
        if physical == DockEdge.Top { remY += step }
        remH = Math.Max(0.0, remH - step)
      } else {
        let measured = context.MeasureChild(
          i,
          LayoutConstraint.AtMost(remW),
          LayoutConstraint.Exactly(remH)
        )
        let w = Math.Min(measured.Width, remW)
        let x = physical == DockEdge.Left ? remX : remX + remW - w
        context.ArrangeChild(i, ElementRect{ X: x, Y: remY, Width: w, Height: remH })
        let step = Math.Min(remW, w + (needsGap ? colGap : 0.0))
        if physical == DockEdge.Left { remX += step }
        remW = Math.Max(0.0, remW - step)
      }
    }

    if hasFill {
      let fillRect = ElementRect{ X: remX, Y: remY, Width: remW, Height: remH }
      for i in 0 ... count {
        if context.ChildDisplay(i) == Display.None { continue }
        if effectiveEdge(context, i, lastVisible) == DockEdge.Fill {
          context.ArrangeChild(i, fillRect)
        }
      }
    }
  }

  internal func MatchesLayout(other Dock) bool -> lastChildFill == other.lastChildFill
}
