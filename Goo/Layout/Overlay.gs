package Goo

import System

/// Configures per-child alignment and sizing participation inside an Overlay layout.
public data struct OverlayPlacement {
  /// Gets or sets the horizontal alignment override, or nil to inherit the container's HorizontalAlign.
  public prop HorizontalAlign LayoutAlign? { get; init }
  /// Gets or sets the vertical alignment override, or nil to inherit the container's VerticalAlign.
  public prop VerticalAlign LayoutAlign? { get; init }
  /// Gets or sets whether this child is excluded from the container's measured size. Defaults to false.
  public prop IgnoreSize bool { get; init }
}

/// Stacks children in the same content box in paint order and sizes the container to participating children.
public sealed class Overlay : LayoutAlgorithm {
  shared {
    /// Gets a shared Overlay instance with default Stretch alignment on both axes.
    public let Default Overlay = Overlay()

    /// Identifies the per-child OverlayPlacement trait.
    public let Placement LayoutKey[OverlayPlacement] = LayoutKey[OverlayPlacement]()

    /// Attaches Overlay placement options to a child blob and returns that child for fluent composition.
    /// @param child The child blob to configure.
    /// @param horizontal Optional horizontal alignment override.
    /// @param vertical Optional vertical alignment override.
    /// @param ignoreSize When true, excludes the child from the container's measured size.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    /// @exception ArgumentOutOfRangeException Thrown when an alignment value is not a defined LayoutAlign.
    public func Place(
      child Blob,
      horizontal LayoutAlign? = nil,
      vertical LayoutAlign? = nil,
      ignoreSize bool = false
    ) Blob {
      if child == nil { throw ArgumentNullException("child") }
      if let h = horizontal {
        if !Enum.IsDefined(h) { throw ArgumentOutOfRangeException("horizontal") }
      }
      if let v = vertical {
        if !Enum.IsDefined(v) { throw ArgumentOutOfRangeException("vertical") }
      }
      return child.WithLayoutTrait(
        Placement,
        OverlayPlacement{
          HorizontalAlign: horizontal,
          VerticalAlign: vertical,
          IgnoreSize: ignoreSize
        }
      )
    }

    internal func AlignOffset(align LayoutAlign, available float64, measured float64, rtl bool) float64 {
      let effective = if rtl && align == LayoutAlign.Start {
        LayoutAlign.End
      } else if rtl && align == LayoutAlign.End {
        LayoutAlign.Start
      } else {
        align
      }
      return switch effective {
        case LayoutAlign.Center: Math.Max(0.0, (available - measured) * 0.5)
        case LayoutAlign.End: Math.Max(0.0, available - measured)
        case _: 0.0
      }
    }
  }

  private var horizontalAlign LayoutAlign = LayoutAlign.Stretch
  private var verticalAlign LayoutAlign = LayoutAlign.Stretch

  /// Gets or sets the default horizontal alignment for children without an explicit override. Defaults to Stretch.
  /// @exception ArgumentOutOfRangeException Thrown when set to an undefined LayoutAlign.
  public prop HorizontalAlign LayoutAlign {
    get -> horizontalAlign
    init {
      if !Enum.IsDefined(value) { throw ArgumentOutOfRangeException("HorizontalAlign") }
      horizontalAlign = value
    }
  }

  /// Gets or sets the default vertical alignment for children without an explicit override. Defaults to Stretch.
  /// @exception ArgumentOutOfRangeException Thrown when set to an undefined LayoutAlign.
  public prop VerticalAlign LayoutAlign {
    get -> verticalAlign
    init {
      if !Enum.IsDefined(value) { throw ArgumentOutOfRangeException("VerticalAlign") }
      verticalAlign = value
    }
  }

  /// Initializes an Overlay layout with Stretch alignment on both axes.
  public init() { }

  /// Measures participating children and returns the maximum width and height.
  /// @param context The bounded layout context for the current measure pass.
  /// @param available The maximum available content size.
  /// @returns The combined desired content size.
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    let count = context.ChildCount
    var maxW = 0.0
    var maxH = 0.0
    let wLimit = LayoutConstraint.AtMost(available.Width)
    let hLimit = LayoutConstraint.AtMost(available.Height)
    for i in 0 ... count {
      if context.ChildDisplay(i) == Display.None { continue }
      let placement = context.ChildTrait(i, Placement)
      if placement.IgnoreSize { continue }
      let measured = context.MeasureChild(i, wLimit, hLimit)
      if measured.Width > maxW { maxW = measured.Width }
      if measured.Height > maxH { maxH = measured.Height }
    }
    return LayoutSize(maxW, maxH)
  }

  /// Arranges every child inside the final content box in declaration paint order.
  /// @param context The bounded layout context for the current arrange pass.
  /// @param finalSize The resolved content size.
  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    let count = context.ChildCount
    let rtl = context.Direction == Direction.RightToLeft
    let finalW = finalSize.Width
    let finalH = finalSize.Height
    for i in 0 ... count {
      if context.ChildDisplay(i) == Display.None {
        context.ArrangeChild(i, ElementRect{})
        continue
      }
      let placement = context.ChildTrait(i, Placement)
      let hAlign = placement.HorizontalAlign ?? horizontalAlign
      let vAlign = placement.VerticalAlign ?? verticalAlign
      if !Enum.IsDefined(hAlign) || !Enum.IsDefined(vAlign) {
        throw ArgumentOutOfRangeException("OverlayPlacement")
      }
      if hAlign == LayoutAlign.Stretch && vAlign == LayoutAlign.Stretch {
        context.ArrangeChild(i, ElementRect{ X: 0.0, Y: 0.0, Width: finalW, Height: finalH })
        continue
      }
      let wConstraint = hAlign == LayoutAlign.Stretch
        ? LayoutConstraint.Exactly(finalW) : LayoutConstraint.AtMost(finalW)
      let hConstraint = vAlign == LayoutAlign.Stretch
        ? LayoutConstraint.Exactly(finalH) : LayoutConstraint.AtMost(finalH)
      let measured = context.MeasureChild(i, wConstraint, hConstraint)
      let w = hAlign == LayoutAlign.Stretch ? finalW : Math.Min(measured.Width, finalW)
      let h = vAlign == LayoutAlign.Stretch ? finalH : Math.Min(measured.Height, finalH)
      let x = AlignOffset(hAlign, finalW, w, rtl)
      let y = AlignOffset(vAlign, finalH, h, false)
      context.ArrangeChild(i, ElementRect{ X: x, Y: y, Width: w, Height: h })
    }
  }

  internal func MatchesLayout(other Overlay) bool ->
    horizontalAlign == other.horizontalAlign && verticalAlign == other.verticalAlign
}
