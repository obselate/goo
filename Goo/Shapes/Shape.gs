package Goo

import System

/// Selects how path geometry maps into the padded layout bounds.
/// Contain is the centered aspect-preserving default.
public enum ShapeFit { Contain; Cover; Fill; None }

/// Selects the rule for filling overlapping path regions.
public enum FillRule { NonZero; EvenOdd }

/// Selects the cap style for stroked paths.
public enum StrokeCap { Butt; Round; Square }

/// Selects the join style for stroked paths.
public enum StrokeJoin { Miter; Round; Bevel }

/// Displays a vector path with fill and one uniform stroke. Side-specific border declarations apply to boxes only.
public class Shape : Blob {
  private var miterLimit float64
  private var cornerRadius float64
  private var strokeStart float64
  private var strokeEnd float64

  internal override func coreBlob() {
  }

  /// Gets or sets the vector path to display.
  public prop Path VectorPath{ get; init; }
  /// Gets or sets the geometry fit. Cover clips, Fill stretches, and None preserves view-box units.
  public prop Fit ShapeFit{ get; init; }
  /// Gets or sets the fill rule. The default is NonZero.
  public prop FillRule FillRule{ get; init; }
  /// Gets or sets the stroke cap style. The default is Butt.
  public prop StrokeCap StrokeCap{ get; init; }
  /// Gets or sets the stroke join style. The default is Miter.
  public prop StrokeJoin StrokeJoin{ get; init; }
  /// Gets or sets the non-negative finite miter limit. The default is 4.
  public prop MiterLimit float64{
    get -> miterLimit
    init{
      if !motionFiniteFloat32(value) || value < 0.0 {
        throw ArgumentOutOfRangeException("MiterLimit")
      }
      miterLimit = value
    }
  }
  /// Gets or sets the non-negative finite corner radius in logical pixels.
  public prop CornerRadius float64{
    get -> cornerRadius
    init{
      if !motionFiniteFloat32(value) || value < 0.0 {
        throw ArgumentOutOfRangeException("CornerRadius")
      }
      cornerRadius = value
    }
  }
  /// Gets or sets the stroke dash pattern.
  public prop Dashes DashPattern? { get; init; }
  /// Gets or sets the stroke start in [0, 1]. Lengths use flattened geometry
  /// after fit mapping, summed across contours in path order.
  /// On mount, StrokeStart must not exceed StrokeEnd.
  public prop StrokeStart float64{
    get -> strokeStart
    init{
      if !motionFiniteFloat32(value) || value < 0.0 || value > 1.0 {
        throw ArgumentOutOfRangeException("StrokeStart")
      }
      strokeStart = value
    }
  }
  /// Gets or sets the stroke end in [0, 1]. Equal bounds omit the stroke;
  /// fill remains unchanged. Trim precedes dashes, whose phase starts at each
  /// trimmed contour. Trim preserves fully included closed contours; partial
  /// contours use StrokeCap at their open ends.
  public prop StrokeEnd float64{
    get -> strokeEnd
    init{
      if !motionFiniteFloat32(value) || value < 0.0 || value > 1.0 {
        throw ArgumentOutOfRangeException("StrokeEnd")
      }
      strokeEnd = value
    }
  }

  internal prop StrokeInset bool{ get; init; }

  /// Creates a shape with default paint options.
  public init() {
    Path = VectorPath.Empty
    Fit = ShapeFit.Contain
    FillRule = FillRule.NonZero
    StrokeCap = StrokeCap.Butt
    StrokeJoin = StrokeJoin.Miter
    StrokeInset = true
    miterLimit = 4.0
    strokeEnd = 1.0
  }
}
