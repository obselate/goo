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

  internal init(parsed CompiledVector) {
    ViewBoxX = float64(parsed.ViewBoxX)
    ViewBoxY = float64(parsed.ViewBoxY)
    ViewBoxWidth = float64(parsed.ViewBoxWidth)
    ViewBoxHeight = float64(parsed.ViewBoxHeight)
    let nodes = [parsed.NodeCount]VectorNode
    let clipRecords = [parsed.ClipCount]VectorAssetClipRecord
    var clipIndex int32 = 0
    while clipIndex < parsed.ClipCount {
      let source = parsed.ClipAt(clipIndex)
      let path = normalizeVectorPath(
        parsed.PathForContours(int32(source.ContourStart), int32(source.ContourCount)),
        ViewBoxX, ViewBoxY, ViewBoxWidth, ViewBoxHeight)
      clipRecords[clipIndex] = VectorAssetClipRecord{
        Path: path,
        FillRule: FillRule(source.FillRule),
        ParentIndex: if source.HasParentClip
        { int32(source.ParentClipIndex) } else { -1 },
      }
      clipIndex++
    }
    let nodeClipIndices = [parsed.NodeCount]int32
    var nodeIndex int32 = parsed.NodeCount - 1
    while nodeIndex >= 0 {
      let source = parsed.NodeAt(nodeIndex)
      let children = if source.HasChildren {
        let childArray = [int32(source.ChildCount)]VectorNode
        var childIndex int32 = 0
        while childIndex < childArray.Length {
          childArray[childIndex] = nodes[int32(source.FirstChildIndex) + childIndex]
          childIndex++
        }
        childArray
      } else {
        []VectorNode{}
      }
      let style = VectorNodeStyle{
        Key: "node-" + nodeIndex.ToString(),
        Fill: compiledVectorFill(parsed, source),
        Stroke: compiledVectorStroke(parsed, source),
        Transform: compiledVectorTransform(source),
        Opacity: float64(source.Opacity),
        ClipPath: compiledVectorClipPath(parsed, source),
        FillRule: (source.Flags & CompiledVectorLimits.NodeEvenOdd) != 0u
        ? FillRule.EvenOdd : FillRule.NonZero,
        ClipPathFillRule: compiledVectorClipRule(parsed, source),
      }
      let normalizedPath = normalizeVectorPath(parsed.PathForNode(nodeIndex),
        ViewBoxX, ViewBoxY, ViewBoxWidth, ViewBoxHeight)
      let normalizedClip = normalizeVectorPath(style.ClipPath,
        ViewBoxX, ViewBoxY, ViewBoxWidth, ViewBoxHeight)
      let normalizedStyle = VectorNodeStyle{
        Key: style.Key,
        Fill: style.Fill,
        Stroke: style.Stroke,
        Transform: style.Transform,
        Opacity: style.Opacity,
        ClipPath: normalizedClip,
        FillRule: style.FillRule,
        ClipPathFillRule: style.ClipPathFillRule,
      }
      nodes[nodeIndex] = VectorNode(normalizedPath, normalizedStyle, children)
      nodeClipIndices[nodeIndex] = if source.HasClip
      { int32(source.ClipIndex) } else { -1 }
      nodeIndex--
    }
    let parents = [parsed.NodeCount]int32
    let firstChildren = [parsed.NodeCount]int32
    let childCounts = [parsed.NodeCount]int32
    var index int32 = 0
    while index < parsed.NodeCount {
      let source = parsed.NodeAt(index)
      parents[index] = if source.HasParent { int32(source.ParentIndex) } else { -1 }
      firstChildren[index] = if source.HasChildren { int32(source.FirstChildIndex) } else { -1 }
      childCounts[index] = int32(source.ChildCount)
      index++
    }
    let roots = List[int32]()
    index = 0
    while index < parsed.NodeCount {
      if !parsed.NodeAt(index).HasParent { roots.Add(index) }
      index++
    }
    Nodes = nodes
    Parents = parents
    FirstChildren = firstChildren
    ChildCounts = childCounts
    Roots = roots.ToArray()
    ClipRecords = clipRecords
    NodeClipIndices = nodeClipIndices
    let publicNodes = List[VectorNode]()
    for node in nodes { publicNodes.Add(node) }
    PublicNodes = ReadOnlyCollection[VectorNode](publicNodes)
    var contours int32 = 0
    var curves int32 = 0
    contours = parsed.ContourCount
    curves = parsed.CurveCount
    ContourCount = contours
    CurveCount = curves
    PaintCount = parsed.PaintCount
    StrokeCount = parsed.StrokeCount
    ClipCount = parsed.ClipCount
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

internal func compiledVectorFill(value CompiledVector,
  node CompiledVectorNodeView) VectorPaint? {
    if !node.HasPaint || node.ContourCount == 0u {
      return nil
    }
    let paint = value.PaintAt(int32(node.PaintIndex))
    if paint.Kind == CompiledVectorPaintKind.Solid {
      return VectorPaint(paint.Color)
    }
    let stops = [int32(paint.StopCount)]GradientStop
    var stopIndex int32 = 0
    while stopIndex < stops.Length {
      let stop = value.PaintStopAt(int32(paint.StopStart) + stopIndex)
      stops[stopIndex] = GradientStop{ Offset: float64(stop.Offset), Color: stop.Color }
      stopIndex++
    }
    let viewBoxWidth = float64(value.ViewBoxWidth)
    let viewBoxHeight = float64(value.ViewBoxHeight)
    let x0 = float64(paint.X0) / viewBoxWidth
    let y0 = float64(paint.Y0) / viewBoxHeight
    let x1 = float64(paint.X1) / viewBoxWidth
    let y1 = float64(paint.Y1) / viewBoxHeight
    if paint.Kind == CompiledVectorPaintKind.LinearGradient {
      return VectorPaint(CompiledVectorLinearGradient(x0, y0, x1, y1, stops))
    }
    return VectorPaint(CompiledVectorRadialGradient(x0, y0, Math.Abs(x1 - x0),
      Math.Abs(y1 - y0), stops))
  }

internal func compiledVectorStroke(value CompiledVector,
  node CompiledVectorNodeView) VectorStroke? {
    if !node.HasStroke {
      return nil
    }
    let source = value.StrokeAt(int32(node.StrokeIndex))
    if !source.HasPaint {
      return nil
    }
    let paint = value.PaintAt(int32(source.PaintIndex))
    if paint.Kind != CompiledVectorPaintKind.Solid {
      return nil
    }
    let intervals = if source.HasDashes {
      let result = [int32(source.DashCount)]float64
      var index int32 = 0
      while index < result.Length {
        result[index] = float64(value.DashValueAt(int32(source.DashStart) + index))
        index++
      }
      DashPattern(result, float64(source.DashOffset))
    } else {
      nil
    }
    return VectorStroke(float64(source.Width), VectorPaint(paint.Color),
      StrokeCap(source.Cap), StrokeJoin(source.Join), float64(source.MiterLimit), intervals)
  }

internal func compiledVectorClipPath(value CompiledVector,
  node CompiledVectorNodeView) VectorPath{
    if !node.HasClip {
      return VectorPath.Empty
    }
    let clip = value.ClipAt(int32(node.ClipIndex))
    return value.PathForContours(int32(clip.ContourStart), int32(clip.ContourCount))
  }

internal func compiledVectorClipRule(value CompiledVector,
  node CompiledVectorNodeView) FillRule-> if !node.HasClip { FillRule.NonZero } else { FillRule(value.ClipAt(int32(node.ClipIndex)).FillRule) }

internal func compiledVectorTransform(node CompiledVectorNodeView) PanelTransform {
  let a = node.M11
  let b = node.M12
  let c = node.M21
  let d = node.M22
  let firstLength = MathF.Sqrt(a * a + c * c)
  let epsilon = 0.0000001F
  if firstLength <= epsilon {
    let secondLength = MathF.Sqrt(b * b + d * d)
    if secondLength > epsilon {
      let radians = MathF.Atan2(-b, d)
      return PanelTransform{
        TranslateX: float64(node.TranslateX),
        TranslateY: float64(node.TranslateY),
        Rotate: float64(radians * 180.0F / MathF.PI),
        ScaleX: 0.0,
        ScaleY: float64(secondLength),
      }
    }
    return PanelTransform{
      TranslateX: float64(node.TranslateX),
      TranslateY: float64(node.TranslateY),
      ScaleX: 0.0,
      ScaleY: 0.0,
    }
  }
  let radians = MathF.Atan2(c, a)
  let cosine = MathF.Cos(radians)
  let sine = MathF.Sin(radians)
  let secondScale = cosine * d - sine * b
  if MathF.Abs(secondScale) <= epsilon {
    let secondLength = MathF.Sqrt(b * b + d * d)
    if secondLength > epsilon {
      let alternateRadians = MathF.Atan2(-b, d)
      let alternateCosine = MathF.Cos(alternateRadians)
      let alternateSine = MathF.Sin(alternateRadians)
      let alternateScale = alternateCosine * a + alternateSine * c
      if MathF.Abs(alternateScale) > epsilon {
        let tangentY = (-alternateSine * a + alternateCosine * c) / alternateScale
        return PanelTransform{
          TranslateX: float64(node.TranslateX),
          TranslateY: float64(node.TranslateY),
          Rotate: float64(alternateRadians * 180.0F / MathF.PI),
          ScaleX: float64(alternateScale),
          ScaleY: float64(secondLength),
          SkewY: float64(MathF.Atan(tangentY) * 180.0F / MathF.PI),
        }
      }
    }
    return PanelTransform{
      TranslateX: float64(node.TranslateX),
      TranslateY: float64(node.TranslateY),
      Rotate: float64(radians * 180.0F / MathF.PI),
      ScaleX: float64(firstLength),
      ScaleY: 0.0,
    }
  }
  let tangentX = (cosine * b + sine * d) / secondScale
  return PanelTransform{
    TranslateX: float64(node.TranslateX),
    TranslateY: float64(node.TranslateY),
    Rotate: float64(radians * 180.0F / MathF.PI),
    ScaleX: float64(firstLength),
    ScaleY: float64(secondScale),
    SkewX: float64(MathF.Atan(tangentX) * 180.0F / MathF.PI),
  }
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
