package Goo

import System
import System.Collections.Generic

internal sealed class CompiledVectorLinearGradient : Gradient {
  private let stops IReadOnlyList[GradientStop]
  private let x0 float64
  private let y0 float64
  private let x1 float64
  private let y1 float64
  private let contentHash int32

  public prop Stops IReadOnlyList[GradientStop]{ get -> stops }
  internal prop X0 float64{ get -> x0 }
  internal prop Y0 float64{ get -> y0 }
  internal prop X1 float64{ get -> x1 }
  internal prop Y1 float64{ get -> y1 }
  internal prop ContentHashForCache int32{ get -> contentHash }

  internal init(x0 float64, y0 float64, x1 float64, y1 float64,
    stops []GradientStop) {
      this.x0 = x0
      this.y0 = y0
      this.x1 = x1
      this.y1 = y1
      this.stops = validateGradientStops(stops)
      contentHash = computeGradientContentHash4(3, x0, y0, x1, y1, this.stops)
    }
}

internal sealed class CompiledVectorRadialGradient : Gradient {
  private let stops IReadOnlyList[GradientStop]
  private let centerX float64
  private let centerY float64
  private let radiusX float64
  private let radiusY float64
  private let contentHash int32

  public prop Stops IReadOnlyList[GradientStop]{ get -> stops }
  internal prop CenterX float64{ get -> centerX }
  internal prop CenterY float64{ get -> centerY }
  internal prop RadiusX float64{ get -> radiusX }
  internal prop RadiusY float64{ get -> radiusY }
  internal prop ContentHashForCache int32{ get -> contentHash }

  internal init(centerX float64, centerY float64, radiusX float64,
    radiusY float64, stops []GradientStop) {
      this.centerX = centerX
      this.centerY = centerY
      this.radiusX = radiusX
      this.radiusY = radiusY
      this.stops = validateGradientStops(stops)
      contentHash = computeGradientContentHash4(4, centerX, centerY, radiusX, radiusY, this.stops)
    }
}

public sealed class VectorAsset {
  private const MaxRenderDepth int32 = 1024
  private let document VectorAssetDocument
  private let serialized CompiledVector?

  public init(viewBoxX float64, viewBoxY float64, viewBoxWidth float64,
    viewBoxHeight float64, roots []VectorNode) {
      document = VectorAssetDocument(viewBoxX, viewBoxY, viewBoxWidth,
        viewBoxHeight, roots)
      serialized = nil
    }

  shared {
    public func Load(bytes []uint8) VectorAsset -> VectorAsset(CompiledVector.Load(bytes))

    public func TryLoad(bytes []uint8) VectorAsset? {
      guard let parsed = CompiledVector.TryLoad(bytes) else { return nil }
      return VectorAsset(parsed)
    }
  }

  internal init(parsed CompiledVector) {
    document = VectorAssetDocument(parsed)
    serialized = parsed
  }

  public prop Version uint16{
    get {
      guard let current = serialized else { return uint16(0) }
      return current.Version
    }
  }
  public prop Flags uint32{
    get {
      guard let current = serialized else { return uint32(0) }
      return current.Flags
    }
  }
  public prop ByteCount int32{
    get {
      guard let current = serialized else { return 0 }
      return current.ByteCount
    }
  }
  public prop ViewBoxX float32{ get -> float32(document.ViewBoxX) }
  public prop ViewBoxY float32{ get -> float32(document.ViewBoxY) }
  public prop ViewBoxWidth float32{ get -> float32(document.ViewBoxWidth) }
  public prop ViewBoxHeight float32{ get -> float32(document.ViewBoxHeight) }
  public prop Nodes IReadOnlyList[VectorNode]{ get -> document.PublicNodes }
  public prop NodeCount int32{ get -> document.Nodes.Length }
  public prop ContourCount int32{ get -> document.ContourCount }
  public prop CurveCount int32{ get -> document.CurveCount }
  public prop MorphCurveCount int32{
    get {
      guard let current = serialized else { return 0 }
      return current.MorphCurveCount
    }
  }
  public prop PaintCount int32{ get -> document.PaintCount }
  public prop StrokeCount int32{ get -> document.StrokeCount }
  public prop ClipCount int32{ get -> document.ClipCount }
  public prop TrackCount int32{
    get {
      guard let current = serialized else { return 0 }
      return current.TrackCount
    }
  }
  public prop KeyframeCount int32{
    get {
      guard let current = serialized else { return 0 }
      return current.KeyframeCount
    }
  }

  public func NodeAt(index int32) VectorNode {
    if index < 0 || index >= document.Nodes.Length {
      throw ArgumentOutOfRangeException("index")
    }
    return document.Nodes[index]
  }

  public func PathForNode(index int32) VectorPath -> NodeAt(index).Path

  internal func PlayerNodeAt(index int32) CompiledVectorNodeView -> compiled().NodeAt(index)

  internal func PlayerPaintAt(index int32) CompiledVectorPaintView -> compiled().PaintAt(index)

  internal func PlayerStrokeAt(index int32) CompiledVectorStrokeView -> compiled().StrokeAt(index)

  internal func PlayerTrackAt(index int32) CompiledVectorTrackView -> compiled().TrackAt(index)

  internal func PlayerMorphKeyframeAt(index int32) CompiledVectorMorphKeyframeView -> compiled().MorphKeyframeAt(index)

  internal func PlayerMorphCurveAt(index int32) CompiledVectorMorphCurveView -> compiled().MorphCurveAt(index)

  internal func PlayerMutablePathForNode(index int32) VectorPath {
    let path = compiled().MutablePathForNode(index)
    guard let owner = path.NormalizedOwner else { return path }
    return VectorPath.CreateMutableNormalized(owner, 0.0, 0.0,
      document.ViewBoxWidth, document.ViewBoxHeight)
  }

  internal prop HasPlaybackTracks bool{
    get {
      guard let current = serialized else { return false }
      return current.TrackCount != 0
    }
  }

  internal func PlayerKeyframeAt(index int32) CompiledVectorKeyframeView -> compiled().KeyframeAt(index)

  internal func PlayerDashValueAt(index int32) float32 -> compiled().DashValueAt(index)

  public func Render(key string?) Blob ->
  Cell.Mount[VectorAssetRenderInput, VectorAssetDisplayCell](key,
    VectorAssetRenderInput{ Asset: this, Fit: ShapeFit.Contain })

  public func Render() Blob -> Render(nil)

  internal func BuildStaticTree() Container -> BuildStaticTree(ShapeFit.Contain)

  internal func BuildStaticTree(fit ShapeFit) Container {
    let result = Container{
      Width: Length.Percent(100.0),
      Height: Length.Percent(100.0),
      Position: PositionType.Relative,
      AspectRatio: document.ViewBoxWidth / document.ViewBoxHeight,
    }
    let content = Container{
      Width: document.ViewBoxWidth,
      Height: document.ViewBoxHeight,
      Position: PositionType.Absolute,
      Left: 0.0,
      Top: 0.0,
      TransformOriginX: Length.Percent(0.0),
      TransformOriginY: Length.Percent(0.0),
      Transform: ViewBoxTransform(),
      VectorViewport: VectorViewport{
        NativeWidth: document.ViewBoxWidth,
        NativeHeight: document.ViewBoxHeight,
        Fit: fit,
      },
    }
    for index in document.Roots {
      content.Children.Add(BuildNode(index, 0, ShapeFit.Fill))
    }
    result.Children.Add(content)
    return result
  }

  private func BuildNode(index int32, depth int32, fit ShapeFit) Container {
    if depth >= MaxRenderDepth {
      throw InvalidOperationException("Vector asset render depth exceeded")
    }
    let node = document.Nodes[index]
    let clipIndex = document.NodeClipIndices[index]
    let hasClip = clipIndex >= 0
    let result = Container{
      Key: if let key = node.Key { key } else { "node-" + index.ToString() },
      Width: Length.Percent(100.0),
      Height: Length.Percent(100.0),
      Position: PositionType.Absolute,
      Left: 0.0,
      Top: 0.0,
      TransformOriginX: Length.Percent(0.0),
      TransformOriginY: Length.Percent(0.0),
      Transform: node.Transform,
      Opacity: node.Opacity,
    }
    let content = if hasClip {
      Container{
        Width: Length.Percent(100.0),
        Height: Length.Percent(100.0),
        Position: PositionType.Absolute,
        Left: 0.0,
        Top: 0.0,
      }
    } else {
      result
    }
    AddFill(content, index, node, fit)
    AddStroke(content, index, node, fit)
    let firstChild = document.FirstChildren[index]
    if firstChild >= 0 {
      var childIndex = firstChild
      let childEnd = childIndex + document.ChildCounts[index]
      while childIndex < childEnd {
        content.Children.Add(BuildNode(childIndex, depth + 1, fit))
        childIndex++
      }
    }
    if hasClip {
      result.Children.Add(WrapClip(clipIndex, content, fit, 0))
    }
    return result
  }

  private func AddFill(result Container, index int32, node VectorNode,
    fit ShapeFit) {
      guard let paint = node.Fill else { return }
      if node.Path.CommandCount == 0 { return }
      let shape = if let gradient = paint.Gradient {
        Shape{
          Key: "fill-" + index.ToString(),
          Path: node.Path,
          Fit: fit,
          FillRule: node.FillRule,
          Width: Length.Percent(100.0),
          Height: Length.Percent(100.0),
          Position: PositionType.Absolute,
          Left: 0.0,
          Top: 0.0,
          BackgroundGradient: gradient,
        }
      } else {
        Shape{
          Key: "fill-" + index.ToString(),
          Path: node.Path,
          Fit: fit,
          FillRule: node.FillRule,
          Width: Length.Percent(100.0),
          Height: Length.Percent(100.0),
          Position: PositionType.Absolute,
          Left: 0.0,
          Top: 0.0,
          BackgroundColor: paint.Color,
        }
      }
      result.Children.Add(shape)
    }

  private func AddStroke(result Container, index int32, node VectorNode,
    fit ShapeFit) {
      guard let stroke = node.Stroke else { return }
      if node.Path.CommandCount == 0 || stroke.Width <= 0.0 {
        return
      }
      guard let gradient = stroke.Paint.Gradient else {
        let shape = Shape{
          Key: "stroke-" + index.ToString(),
          Path: node.Path,
          Fit: fit,
          FillRule: node.FillRule,
          StrokeCap: stroke.Cap,
          StrokeJoin: stroke.Join,
          MiterLimit: stroke.MiterLimit,
          Dashes: stroke.Dashes,
          BorderWidth: stroke.Width,
          BorderColor: stroke.Paint.Color,
          Width: Length.Percent(100.0),
          Height: Length.Percent(100.0),
          Position: PositionType.Absolute,
          Left: 0.0,
          Top: 0.0,
          BackgroundColor: Color.Transparent,
          StrokeInset: false,
        }
        result.Children.Add(shape)
        return
      }
    }

  private func WrapClip(index int32, content Container, fit ShapeFit,
    depth int32) Container{
      if depth >= MaxRenderDepth {
        throw InvalidOperationException("Vector asset clip depth exceeded")
      }
      if index < 0 || index >= document.ClipRecords.Length {
        throw ArgumentOutOfRangeException("index")
      }
      let clip = document.ClipRecords[index]
      let inner = if clip.ParentIndex >= 0 {
        WrapClip(clip.ParentIndex, content, fit, depth + 1)
      } else {
        content
      }
      let result = Container{
        Width: Length.Percent(100.0),
        Height: Length.Percent(100.0),
        Position: PositionType.Absolute,
        Left: 0.0,
        Top: 0.0,
        ClipPath: clip.Path,
        ClipPathFit: fit,
        ClipPathFillRule: clip.FillRule,
      }
      result.Children.Add(inner)
      return result
    }

  private func ViewBoxTransform() PanelTransform -> PanelTransform {
    TranslateX: -document.ViewBoxX,
    TranslateY: -document.ViewBoxY,
  }

  private func compiled() CompiledVector {
    guard let current = serialized else {
      throw InvalidOperationException("Authored vector assets have no playback data")
    }
    return current
  }
}

public sealed class CompiledVectorAsset {
  private let inner VectorAsset

  private init(parsed CompiledVector) {
    inner = VectorAsset(parsed)
  }

  shared {
    public func Load(bytes []uint8) CompiledVectorAsset ->
    CompiledVectorAsset(CompiledVector.Load(bytes))

    public func TryLoad(bytes []uint8) CompiledVectorAsset? {
      guard let parsed = CompiledVector.TryLoad(bytes) else { return nil }
      return CompiledVectorAsset(parsed)
    }
  }

  public prop Version uint16{ get -> inner.Version }
  public prop Flags uint32{ get -> inner.Flags }
  public prop ByteCount int32{ get -> inner.ByteCount }
  public prop ViewBoxX float32{ get -> inner.ViewBoxX }
  public prop ViewBoxY float32{ get -> inner.ViewBoxY }
  public prop ViewBoxWidth float32{ get -> inner.ViewBoxWidth }
  public prop ViewBoxHeight float32{ get -> inner.ViewBoxHeight }
  public prop NodeCount int32{ get -> inner.NodeCount }
  public prop ContourCount int32{ get -> inner.ContourCount }
  public prop CurveCount int32{ get -> inner.CurveCount }
  public prop MorphCurveCount int32{ get -> inner.MorphCurveCount }
  public prop PaintCount int32{ get -> inner.PaintCount }
  public prop StrokeCount int32{ get -> inner.StrokeCount }
  public prop ClipCount int32{ get -> inner.ClipCount }
  public prop TrackCount int32{ get -> inner.TrackCount }
  public prop KeyframeCount int32{ get -> inner.KeyframeCount }

  public func PathForNode(index int32) VectorPath -> inner.PathForNode(index)

  public func Render(key string?) Blob -> inner.Render(key)

  public func Render() Blob -> inner.Render()
}
