package Goo

import System
import System.Collections.Generic

/// Selects how path geometry maps into the padded layout bounds.
/// Contain is the centered aspect-preserving default.
public enum ShapeFit { Contain; Cover; Fill; None }

/// Selects the rule for filling overlapping path regions.
public enum FillRule { NonZero; EvenOdd }

/// Selects the cap style for stroked paths.
public enum StrokeCap { Butt; Round; Square }

/// Selects the join style for stroked paths.
public enum StrokeJoin { Miter; Round; Bevel }

/// Selects whether strokes scale with geometry or remain in window logical pixels.
public enum VectorEffect { None; NonScalingStroke }

/// Displays a vector path with fill and one uniform stroke.
/// Use Fill and Stroke for path paint. Legacy paint without either throws:
/// "Shape paint moved to Fill and Stroke".
public class Shape : Blob {
  private var declarationPath VectorPath
  private var declarationFit ShapeFit
  private var declarationFill VectorPaint?
  private var declarationStroke VectorStroke?
  private var declarationFillRule FillRule
  private var declarationUseCurrentColor bool
  private var cornerRadius float64
  private var strokeStart float64
  private var strokeEnd float64
  private var paintEntries StyleEntries?
  private var filteredStyles Dictionary[StyleEntries, StyleEntries]?

  internal override func coreBlob() {
  }

  /// Gets or sets the vector path to display.
  /// Reuse one path and position instances with Transform to share encoded geometry.
  public prop Path VectorPath {
    get -> declarationPath
    set {
      CheckMutable()
      declarationPath = value
    }
  }
  /// Gets or sets the geometry fit. Cover clips, Fill stretches, and None preserves view-box units.
  public prop Fit ShapeFit {
    get -> declarationFit
    set {
      CheckMutable()
      declarationFit = value
    }
  }
  /// Gets or sets the optional path fill. A gradient takes priority over UseCurrentColor.
  public prop Fill VectorPaint? {
    get -> declarationFill
    set {
      CheckMutable()
      declarationFill = value
    }
  }
  /// Gets or sets the complete stroke paint and options. Gradient strokes are not supported.
  public prop Stroke VectorStroke? {
    get -> declarationStroke
    set {
      CheckMutable()
      declarationStroke = value
    }
  }
  /// Gets or sets the fill rule. The default is NonZero.
  public prop FillRule FillRule {
    get -> declarationFillRule
    set {
      CheckMutable()
      declarationFillRule = value
    }
  }
  /// Uses the inherited Color for solid fill when true. The default is false.
  /// A gradient Fill and the Stroke paint are unchanged.
  public prop UseCurrentColor bool {
    get -> declarationUseCurrentColor
    set {
      CheckMutable()
      declarationUseCurrentColor = value
    }
  }
  /// Gets or sets the non-negative finite corner radius in logical pixels.
  public prop CornerRadius float64{
    get -> cornerRadius
    set {
      CheckMutable()
      if !motionFiniteFloat32(value) || value < 0.0 {
        throw ArgumentOutOfRangeException("CornerRadius")
      }
      cornerRadius = value
    }
  }
  /// Gets or sets the stroke start in [0, 1], summed across contours in path order.
  /// None measures flattened geometry after fit mapping.
  /// NonScalingStroke measures geometry after the full transform.
  /// On mount, StrokeStart must not exceed StrokeEnd.
  public prop StrokeStart float64{
    get -> strokeStart
    set {
      CheckMutable()
      if !motionFiniteFloat32(value) || value < 0.0 || value > 1.0 {
        throw ArgumentOutOfRangeException("StrokeStart")
      }
      strokeStart = value
    }
  }
  /// Gets or sets the stroke end in [0, 1]. Equal bounds omit the stroke;
  /// fill remains unchanged. Trim precedes dashes, whose phase starts at each
  /// trimmed contour. Trim preserves fully included closed contours; partial
  /// contours use the stroke's Cap at their open ends.
  public prop StrokeEnd float64{
    get -> strokeEnd
    set {
      CheckMutable()
      if !motionFiniteFloat32(value) || value < 0.0 || value > 1.0 {
        throw ArgumentOutOfRangeException("StrokeEnd")
      }
      strokeEnd = value
    }
  }

  internal prop StrokeInset bool{ get; init; }

  internal func PaintEntries() StyleEntries? {
    if let cached = paintEntries { return cached }
    let source = FilterPaintEntries(Entries())
    if Fill == nil && Stroke == nil { return source }
    let result = StyleEntries{}
    if let entries = source { result.AddRange(entries) }
    let fill = Fill?.Color ?? Color.Transparent
    let stroke = Stroke?.Paint.Color ?? Color.Transparent
    result.Add(StyleEntry{Field: StyleField.BackgroundColor, A: fill.R, B: fill.G, C: fill.B, D: fill.A})
    result.Add(StyleEntry{Field: StyleField.BackgroundGradient, Payload: Fill?.Gradient})
    result.Add(StyleEntry{Field: StyleField.ShapeStrokeWidth, A: float32(Stroke?.Width ?? 0.0), B: float32(int32(LengthUnit.Px))})
    result.Add(StyleEntry{Field: StyleField.ShapeStrokeColor, A: stroke.R, B: stroke.G, C: stroke.B, D: stroke.A})
    paintEntries = result
    return result
  }

  internal func FilterPaintEntries(source StyleEntries?) StyleEntries? {
    guard let entries = source else { return nil }
    if let cache = filteredStyles {
      if cache.TryGetValue(entries, out var filtered) { return filtered }
    }
    var cursor = entries.Cursor()
    var legacy = false
    while cursor.MoveNext() {
      let field = cursor.Current.Field
      if field is StyleField.BackgroundColor or StyleField.BackgroundGradient
        or StyleField.ShapeStrokeWidth or StyleField.ShapeStrokeColor { legacy = true }
    }
    if !legacy { return source }
    if Fill == nil && Stroke == nil {
      throw InvalidOperationException("Shape paint moved to Fill and Stroke")
    }
    let result = StyleEntries{}
    cursor = entries.Cursor()
    while cursor.MoveNext() {
      let field = cursor.Current.Field
      if field is StyleField.BackgroundColor or StyleField.BackgroundGradient
        or StyleField.ShapeStrokeWidth or StyleField.ShapeStrokeColor { continue }
      result.Add(cursor.Current)
    }
    if filteredStyles == nil { filteredStyles = Dictionary[StyleEntries, StyleEntries]() }
    filteredStyles?.Add(entries, result)
    return result
  }

  /// Creates a shape with default paint options.
  public init() {
    Path = VectorPath.Empty
    Fit = ShapeFit.Contain
    FillRule = FillRule.NonZero
    StrokeInset = true
    strokeEnd = 1.0
  }
}
