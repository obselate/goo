package Goo

import System
import System.Collections.Generic

internal sealed class VectorLinearGradient : Gradient {
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

internal sealed class VectorRadialGradient : Gradient {
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
  private let animation VectorAssetAnimation?

  public init(viewBoxX float64, viewBoxY float64, viewBoxWidth float64,
    viewBoxHeight float64, roots []VectorNode) {
      document = VectorAssetDocument(viewBoxX, viewBoxY, viewBoxWidth,
        viewBoxHeight, roots)
      animation = nil
    }

  internal init(viewBoxX float64, viewBoxY float64, viewBoxWidth float64,
    viewBoxHeight float64, roots []VectorNode, animation VectorAssetAnimation) {
      document = VectorAssetDocument(viewBoxX, viewBoxY, viewBoxWidth,
        viewBoxHeight, roots)
      if animation.Nodes.Length != document.Nodes.Length {
        throw ArgumentException("Animation node count does not match the vector asset", "animation")
      }
      this.animation = animation
  }
  public prop ViewBoxX float32{ get -> float32(document.ViewBoxX) }
  public prop ViewBoxY float32{ get -> float32(document.ViewBoxY) }
  public prop ViewBoxWidth float32{ get -> float32(document.ViewBoxWidth) }
  public prop ViewBoxHeight float32{ get -> float32(document.ViewBoxHeight) }
  public prop Nodes IReadOnlyList[VectorNode]{ get -> document.PublicNodes }
  public prop NodeCount int32{ get -> document.Nodes.Length }
  public prop ContourCount int32{ get -> document.ContourCount }
  public prop CurveCount int32{ get -> document.CurveCount }
  public prop PaintCount int32{ get -> document.PaintCount }
  public prop StrokeCount int32{ get -> document.StrokeCount }
  public prop ClipCount int32{ get -> document.ClipCount }

  public func NodeAt(index int32) VectorNode {
    if index < 0 || index >= document.Nodes.Length {
      throw ArgumentOutOfRangeException("index")
    }
    return document.Nodes[index]
  }

  public func PathForNode(index int32) VectorPath -> NodeAt(index).Path

  internal func PlayerNodeAt(index int32) VectorAnimationNode -> motion().Nodes[index]

  internal func PlayerPaintAt(index int32) VectorAnimationPaint -> motion().Paints[index]

  internal func PlayerStrokeAt(index int32) VectorAnimationStroke -> motion().Strokes[index]

  internal func PlayerTrackAt(index int32) VectorAnimationTrack -> motion().Tracks[index]

  internal func PlayerMorphKeyframeAt(index int32) VectorAnimationKeyframe -> motion().Keyframes[index]

  internal func PlayerMorphCurveAt(index int32) VectorAnimationCurve -> motion().MorphCurves[index]

  internal func PlayerMutablePathForNode(index int32) VectorPath {
    let path = document.Nodes[index].Path
    guard let owner = path.NormalizedOwner else { return path }
    let mutableOwner = VectorPathNormalizedOwner(owner.QuadraticCount,
      owner.ContourCount, 0.0, 0.0, document.ViewBoxWidth, document.ViewBoxHeight)
    mutableOwner.Update(owner.Quadratics, owner.QuadraticCount,
      owner.Contours, owner.ContourCount)
    return VectorPath.CreateMutableNormalized(mutableOwner, 0.0, 0.0,
      document.ViewBoxWidth, document.ViewBoxHeight)
  }

  internal prop HasPlaybackTracks bool{
    get {
      guard let current = animation else { return false }
      return current.Tracks.Length != 0
    }
  }

  internal prop PlaybackTrackCount int32{
    get {
      guard let current = animation else { return 0 }
      return current.Tracks.Length
    }
  }

  internal prop PlaybackPaintCount int32{ get -> motion().Paints.Length }

  internal prop PlaybackStrokeCount int32{ get -> motion().Strokes.Length }

  internal func PlayerKeyframeAt(index int32) VectorAnimationKeyframe -> motion().Keyframes[index]

  internal func PlayerDashValueAt(index int32) float32 -> motion().DashValues[index]

  public func Render(key string?) Blob ->
  Cell.Mount[VectorAssetRenderInput, VectorAssetDisplayCell](key,
    VectorAssetRenderInput{ Asset: this, Fit: ShapeFit.Contain })

  public func Render() Blob -> Render(nil)

  internal func BuildStaticTree() Container -> BuildStaticTree(ShapeFit.Contain)

  internal func BuildStaticTree(fit ShapeFit) Container {
    let result = Container{
      Width: Percent(100.0),
      Height: Percent(100.0),
      Position: PositionType.Relative,
      AspectRatio: document.ViewBoxWidth / document.ViewBoxHeight,
    }
    let content = Container{
      Width: document.ViewBoxWidth,
      Height: document.ViewBoxHeight,
      Position: PositionType.Absolute,
      Left: 0.0,
      Top: 0.0,
      TransformOriginX: Percent(0.0),
      TransformOriginY: Percent(0.0),
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
      Width: Percent(100.0),
      Height: Percent(100.0),
      Position: PositionType.Absolute,
      Left: 0.0,
      Top: 0.0,
      TransformOriginX: Percent(0.0),
      TransformOriginY: Percent(0.0),
      Transform: node.Transform,
      Opacity: node.Opacity,
    }
    let content = if hasClip {
      Container{
        Width: Percent(100.0),
        Height: Percent(100.0),
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
          Width: Percent(100.0),
          Height: Percent(100.0),
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
          Width: Percent(100.0),
          Height: Percent(100.0),
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
          Width: Percent(100.0),
          Height: Percent(100.0),
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
        Width: Percent(100.0),
        Height: Percent(100.0),
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

  private func motion() VectorAssetAnimation {
    guard let current = animation else {
      throw InvalidOperationException("Authored vector assets have no playback data")
    }
    return current
  }
}
