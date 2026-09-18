package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel

/// Describes one immutable vector fill paint.
public sealed class VectorPaint {
  private let color Color
  private let gradient Gradient?

  /// Gets the solid color, or transparent when this paint is a gradient.
  public prop Color Color{ get -> color }
  /// Gets the gradient, or nil for a solid paint.
  public prop Gradient Gradient? { get -> gradient }

  /// Creates a solid vector paint.
  public init(color Color) {
    this.color = color
    gradient = nil
  }

  /// Creates a gradient vector paint.
  public init(gradient Gradient) {
    if Object.ReferenceEquals(gradient, nil) {
      throw ArgumentNullException("gradient")
    }
    color = Color.Transparent
    this.gradient = gradient
  }

}

/// Describes one immutable vector stroke.
public sealed class VectorStroke {
  private let width float64
  private let paint VectorPaint
  private let cap StrokeCap
  private let join StrokeJoin
  private let miterLimit float64
  private let dashes DashPattern?

  /// Gets the non-negative stroke width in view-box units.
  public prop Width float64{ get -> width }
  /// Gets the stroke paint.
  public prop Paint VectorPaint{ get -> paint }
  /// Gets the line cap style.
  public prop Cap StrokeCap{ get -> cap }
  /// Gets the line join style.
  public prop Join StrokeJoin{ get -> join }
  /// Gets the finite miter limit.
  public prop MiterLimit float64{ get -> miterLimit }
  /// Gets the optional dash pattern.
  public prop Dashes DashPattern? { get -> dashes }

  /// Creates a stroke with default cap, join, and miter settings.
  public init(width float64, paint VectorPaint) {
    if !finiteVectorValue(width) || width < 0.0 {
      throw ArgumentOutOfRangeException("width")
    }
    if Object.ReferenceEquals(paint, nil) {
      throw ArgumentNullException("paint")
    }
    this.width = width
    this.paint = paint
    cap = StrokeCap.Butt
    join = StrokeJoin.Miter
    miterLimit = 4.0
    dashes = nil
  }

  /// Creates a solid-color stroke with default cap, join, and miter settings.
  public convenience init(width float64, color Color) {
    init(width, VectorPaint(color))
  }

  /// Creates a fully specified immutable stroke.
  public init(width float64, paint VectorPaint, cap StrokeCap, join StrokeJoin,
    miterLimit float64, dashes DashPattern?) {
      if !finiteVectorValue(width) || width < 0.0 {
        throw ArgumentOutOfRangeException("width")
      }
      if Object.ReferenceEquals(paint, nil) {
        throw ArgumentNullException("paint")
      }
      if !finiteVectorValue(miterLimit) || miterLimit < 0.0 {
        throw ArgumentOutOfRangeException("miterLimit")
      }
      this.width = width
      this.paint = paint
      this.cap = cap
      this.join = join
      this.miterLimit = miterLimit
      this.dashes = dashes
    }
}

/// Describes immutable paint and composition options for a vector node.
public struct VectorNodeStyle {
  private var key string?
  private var fill VectorPaint?
  private var stroke VectorStroke?
  private var transform PanelTransform
  private var opacityOffset float64
  private var clipPath VectorPath = VectorPath.Empty
  private var fillRule FillRule = FillRule.NonZero
  private var clipFillRule FillRule = FillRule.NonZero

  /// Gets the stable key used for this node when rendered.
  public prop Key string? { get -> key; init -> key = value }
  /// Gets this node's optional fill paint.
  public prop Fill VectorPaint? { get -> fill; init -> fill = value }
  /// Gets this node's optional stroke.
  public prop Stroke VectorStroke? { get -> stroke; init -> stroke = value }
  /// Gets this node's local transform.
  public prop Transform PanelTransform{ get -> transform; init -> transform = value }
  /// Gets this node's local opacity.
  public prop Opacity float64{
    get -> 1.0 + opacityOffset
    init{
      if !finiteVectorValue(value) || value < 0.0 || value > 1.0 {
        throw ArgumentOutOfRangeException("opacity")
      }
      opacityOffset = value - 1.0
    }
  }
  /// Gets this node's optional clip path.
  public prop ClipPath VectorPath{
    get -> clipPath
    init -> clipPath = value
  }
  /// Gets this node's fill rule.
  public prop FillRule FillRule{ get -> fillRule; init -> fillRule = value }
  /// Gets this node's clip fill rule.
  public prop ClipPathFillRule FillRule{ get -> clipFillRule; init -> clipFillRule = value }

}

/// Describes one immutable vector node and its composed children.
public sealed class VectorNode {
  private let key string?
  private let path VectorPath
  private let fill VectorPaint?
  private let stroke VectorStroke?
  private let transform PanelTransform
  private let opacity float64
  private let clipPath VectorPath
  private let fillRule FillRule
  private let clipFillRule FillRule
  private let children IReadOnlyList[VectorNode]

  /// Gets this node's path.
  public prop Path VectorPath{ get -> path }
  /// Gets the stable key used for this node when rendered.
  public prop Key string? { get -> key }
  /// Gets this node's optional fill paint.
  public prop Fill VectorPaint? { get -> fill }
  /// Gets this node's optional stroke.
  public prop Stroke VectorStroke? { get -> stroke }
  /// Gets this node's local transform.
  public prop Transform PanelTransform{ get -> transform }
  /// Gets this node's local opacity.
  public prop Opacity float64{ get -> opacity }
  /// Gets this node's optional clip path.
  public prop ClipPath VectorPath{ get -> clipPath }
  /// Gets this node's fill rule.
  public prop FillRule FillRule{ get -> fillRule }
  /// Gets this node's clip fill rule.
  public prop ClipPathFillRule FillRule{ get -> clipFillRule }
  /// Gets the immutable node options.
  public prop Style VectorNodeStyle{ get -> VectorNodeStyle {
    Key: key,
    Fill: fill,
    Stroke: stroke,
    Transform: transform,
    Opacity: opacity,
    ClipPath: clipPath,
    FillRule: fillRule,
    ClipPathFillRule: clipFillRule,
  } }
  /// Gets the immutable child sequence.
  public prop Children IReadOnlyList[VectorNode]{ get -> children }

  /// Creates a path node with no paint or children.
  public convenience init(path VectorPath) {
    init(path, VectorNodeStyle{}, []VectorNode{})
  }

  /// Creates a path node with immutable style options.
  public convenience init(path VectorPath, style VectorNodeStyle) {
    init(path, style, []VectorNode{})
  }

  /// Creates a path node with immutable style options.
  public init(path VectorPath, style VectorNodeStyle, children []VectorNode) {
    this.key = style.Key
    this.path = path
    this.fill = style.Fill
    this.stroke = style.Stroke
    this.transform = style.Transform
    this.opacity = style.Opacity
    this.clipPath = style.ClipPath
    this.fillRule = style.FillRule
    this.clipFillRule = style.ClipPathFillRule
    let immutableChildren = copyVectorChildren(children)
    this.children = immutableChildren
  }

  /// Creates a group node with children.
  public convenience init(children []VectorNode) {
    init(VectorPath.Empty, VectorNodeStyle{}, children)
  }
}

internal data struct VectorAssetClipRecord {
  internal let Path VectorPath
  internal let FillRule FillRule
  internal let ParentIndex int32
}

internal sealed class VectorAssetDocument {
  internal let ViewBoxX float64
  internal let ViewBoxY float64
  internal let ViewBoxWidth float64
  internal let ViewBoxHeight float64
  internal let Nodes []VectorNode
  internal let PublicNodes IReadOnlyList[VectorNode]
  internal let Parents []int32
  internal let FirstChildren []int32
  internal let ChildCounts []int32
  internal let Roots []int32
  internal let ClipRecords []VectorAssetClipRecord
  internal let NodeClipIndices []int32
  internal let ContourCount int32
  internal let CurveCount int32
  internal let PaintCount int32
  internal let StrokeCount int32
  internal let ClipCount int32

  internal init(viewBoxX float64, viewBoxY float64, viewBoxWidth float64,
    viewBoxHeight float64, roots []VectorNode) {
      validateVectorViewBox(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
      if Object.ReferenceEquals(roots, nil) {
        throw ArgumentNullException("roots")
      }
      var rootIndex int32 = 0
      while rootIndex < roots.Length {
        if Object.ReferenceEquals(roots[rootIndex], nil) {
          throw ArgumentException("roots cannot contain nil", "roots")
        }
        rootIndex++
      }
      let active = List[VectorNode]()
      rootIndex = 0
      while rootIndex < roots.Length {
        validateVectorNodeGraph(roots[rootIndex], 0, active)
        rootIndex++
      }
      let normalizedRoots = [roots.Length]VectorNode
      rootIndex = 0
      while rootIndex < roots.Length {
        normalizedRoots[rootIndex] = normalizeVectorNode(roots[rootIndex],
          viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
        rootIndex++
      }
      let nodes = List[VectorNode]()
      let parents = List[int32]()
      let firstChildren = List[int32]()
      let childCounts = List[int32]()
      let rootIndices = List[int32]()
      rootIndex = 0
      while rootIndex < normalizedRoots.Length {
        rootIndices.Add(nodes.Count)
        nodes.Add(normalizedRoots[rootIndex])
        parents.Add(-1)
        firstChildren.Add(-1)
        childCounts.Add(0)
        rootIndex++
      }
      var queueIndex int32 = 0
      while queueIndex < nodes.Count {
        let node = nodes[queueIndex]
        let first = nodes.Count
        let children = node.Children
        var childIndex int32 = 0
        while childIndex < children.Count {
          nodes.Add(children[childIndex])
          parents.Add(queueIndex)
          firstChildren.Add(-1)
          childCounts.Add(0)
          childIndex++
        }
        if children.Count > 0 {
          firstChildren[queueIndex] = first
          childCounts[queueIndex] = children.Count
        }
        queueIndex++
      }
      ViewBoxX = viewBoxX
      ViewBoxY = viewBoxY
      ViewBoxWidth = viewBoxWidth
      ViewBoxHeight = viewBoxHeight
      Nodes = nodes.ToArray()
      PublicNodes = ReadOnlyCollection[VectorNode](nodes)
      Parents = parents.ToArray()
      FirstChildren = firstChildren.ToArray()
      ChildCounts = childCounts.ToArray()
      Roots = rootIndices.ToArray()
      let clipRecords = List[VectorAssetClipRecord]()
      let nodeClipIndices = [Nodes.Length]int32
      var nodeIndex int32 = 0
      while nodeIndex < Nodes.Length {
        let node = Nodes[nodeIndex]
        if node.ClipPath.CommandCount != 0 {
          nodeClipIndices[nodeIndex] = clipRecords.Count
          clipRecords.Add(VectorAssetClipRecord{
            Path: node.ClipPath,
            FillRule: node.ClipPathFillRule,
            ParentIndex: -1,
          })
        } else {
          nodeClipIndices[nodeIndex] = -1
        }
        nodeIndex++
      }
      ClipRecords = clipRecords.ToArray()
      NodeClipIndices = nodeClipIndices
      var contours int32 = 0
      var curves int32 = 0
      var paints int32 = 0
      var strokes int32 = 0
      var clips int32 = 0
      for node in Nodes {
        let geometry = PathGeometry.For(node.Path)
        contours = contours + geometry.ContourCount
        curves = curves + geometry.QuadraticCount
        if node.Fill != nil { paints++ }
        if let currentStroke = node.Stroke {
          paints++
          strokes++
          if currentStroke.Paint.Gradient != nil {
            throw NotSupportedException("Gradient vector strokes are not supported")
          }
        }
        if node.ClipPath.CommandCount != 0 { clips++ }
      }
      ContourCount = contours
      CurveCount = curves
      PaintCount = paints
      StrokeCount = strokes
      ClipCount = clips
    }

}

internal func normalizeVectorNode(node VectorNode, viewBoxX float64,
  viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) VectorNode{
    let source = node.Style
    let sourceChildren = node.Children
    let children = [sourceChildren.Count]VectorNode
    var childIndex int32 = 0
    while childIndex < sourceChildren.Count {
      children[childIndex] = normalizeVectorNode(sourceChildren[childIndex],
        viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
      childIndex++
    }
    let style = VectorNodeStyle{
      Key: source.Key,
      Fill: source.Fill,
      Stroke: source.Stroke,
      Transform: source.Transform,
      Opacity: source.Opacity,
      ClipPath: normalizeVectorPath(source.ClipPath, viewBoxX, viewBoxY,
        viewBoxWidth, viewBoxHeight),
      FillRule: source.FillRule,
      ClipPathFillRule: source.ClipPathFillRule,
    }
    return VectorNode(normalizeVectorPath(node.Path, viewBoxX, viewBoxY,
      viewBoxWidth, viewBoxHeight), style, children)
  }

internal func normalizeVectorPath(path VectorPath, viewBoxX float64,
  viewBoxY float64, viewBoxWidth float64, viewBoxHeight float64) VectorPath{
    let geometry = PathGeometry.For(path)
    let quadratics = [geometry.QuadraticCount]PathQuadratic
    var curveIndex int32 = 0
    while curveIndex < quadratics.Length {
      quadratics[curveIndex] = geometry.Quadratics[curveIndex]
      curveIndex++
    }
    let contours = [geometry.ContourCount]PathContour
    var contourIndex int32 = 0
    while contourIndex < contours.Length {
      contours[contourIndex] = geometry.Contours[contourIndex]
      contourIndex++
    }
    return VectorPath.CreateNormalized(quadratics, contours, 0.0, 0.0,
      viewBoxWidth, viewBoxHeight)
  }

internal func validateVectorNodeGraph(node VectorNode, depth int32,
  active List[VectorNode]) {
    if depth >= 1024 {
      throw InvalidOperationException("Vector asset render depth exceeded")
    }
    if active.Contains(node) {
      throw ArgumentException("Vector node graph contains a cycle", "roots")
    }
    active.Add(node)
    for child in node.Children {
      if Object.ReferenceEquals(child, nil) {
        throw ArgumentException("children cannot contain nil", "children")
      }
      validateVectorNodeGraph(child, depth + 1, active)
    }
    active.RemoveAt(active.Count - 1)
  }

internal func copyVectorChildren(children []VectorNode) IReadOnlyList[VectorNode] {
  if Object.ReferenceEquals(children, nil) {
    throw ArgumentNullException("children")
  }
  let copy = List[VectorNode]()
  for child in children {
    if Object.ReferenceEquals(child, nil) {
      throw ArgumentException("children cannot contain nil", "children")
    }
    copy.Add(child)
  }
  return ReadOnlyCollection[VectorNode](copy)
}

internal func finiteVectorValue(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value)
  && !Single.IsNaN(float32(value)) && !Single.IsInfinity(float32(value))

internal func validateVectorViewBox(x float64, y float64, width float64, height float64) {
  if !finiteVectorValue(x) { throw ArgumentOutOfRangeException("viewBoxX") }
  if !finiteVectorValue(y) { throw ArgumentOutOfRangeException("viewBoxY") }
  if !finiteVectorValue(width) || width <= 0.0 {
    throw ArgumentOutOfRangeException("viewBoxWidth")
  }
  if !finiteVectorValue(height) || height <= 0.0 {
    throw ArgumentOutOfRangeException("viewBoxHeight")
  }
}
