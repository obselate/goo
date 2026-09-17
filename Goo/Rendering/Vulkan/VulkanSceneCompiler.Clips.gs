package Goo

import Facebook.Yoga
import System
import System.Runtime.CompilerServices

internal partial class VulkanSceneCompiler {
  private func ShapePaintNeedsMask(node Node) bool {
    if node.Kind != NodeKind.Shape {
      return false
    }
    if node.BackgroundGradient != nil {
      return true
    }
    if !node.HasBackgroundImageState {
      return false
    }
    return BackgroundImageLayouts.Path(node) != ""
      || BackgroundImageLayouts.Source(node) != nil
  }

  private func TryResolvePathClipParentDepth(
    parentChainId int32,
    out parentDepth int32) bool{
      parentDepth = 0
      if parentChainId < 0 || parentChainId >= frame.ClipChainCount {
        return false
      }
      parentDepth = parentChainId == 0 ? 0 : frame.ClipChains[parentChainId].Depth
      return parentDepth < MaxPathClipDepth
    }

  private func AppendZeroPathClip(
    parentChainId int32,
    stableId uint64,
    contentKey uint64) VulkanScenePathClipResult{
      let chain = frame.AddZeroClipChain(parentChainId, stableId, contentKey)
      clipChainCount = frame.ClipChainCount - 1
      return VulkanScenePathClipResult{ Emitted: true, ChainIndex: chain }
    }

  private func PublishPathClip(
    parentChainId int32,
    parentDepth int32,
    stableId uint64,
    contentKey uint64,
    path VulkanPathRenderable,
    bounds ConservativeBounds,
    mapping PathMapping,
    fit ShapeFit,
    fillRule uint32,
    transformIndex int32) VulkanScenePathClipResult{
      let mask = frame.AddClipMask(ClipMaskRecord{
        StableId: stableId,
        PathId: path.PathId,
        AtlasId: path.AtlasId,
        AtlasWordOffset: path.BaseWord,
        AtlasWordCount: path.WordCount,
        Bounds: bounds,
        PathBounds: MappedPathBounds(path.Bounds, mapping),
        Fit: fit,
        FillRule: fillRule,
        ScaleX: mapping.ScaleX,
        ScaleY: mapping.ScaleY,
        TranslateX: mapping.TranslateX,
        TranslateY: mapping.TranslateY,
        TransformIndex: transformIndex,
        ContentKey: contentKey,
      })
      clipMaskCount = frame.ClipMaskCount
      let chain = frame.AddClipChain(ClipChainRecord{
        StableId: stableId,
        ParentIndex: parentChainId,
        MaskIndex: mask,
        Depth: parentDepth + 1,
        Flags: uint32(SceneClipChainFlags.None),
        ContentKey: contentKey,
      })
      clipChainCount = frame.ClipChainCount - 1
      return VulkanScenePathClipResult{ Emitted: true, ChainIndex: chain }
    }

  private func ResolveShapePaintClip(
    node Node,
    bounds ConservativeBounds,
    shape ResolvedShapeGeometry,
    transformIndex int32,
    parentChainId int32) VulkanScenePathClipResult{
      if !TryResolvePathClipParentDepth(parentChainId, out var parentDepth) {
        return VulkanScenePathClipResult{}
      }
      let mapping = shape.Mapping
      let shapePath = shape.Path
      let stableId = ShapePaintMaskId(node)
      let contentKey = ClipContentKey(node, shapePath, ShapeFit.Fill,
        uint32(node.ShapeFillRule), bounds, transformIndex)
      let geometry = PathGeometry.For(shapePath)
      let closedBounds = ClosedPathBounds(geometry)
      if !geometry.HasFillContour || closedBounds.IsEmpty {
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      guard let renderer = pathScene else {
        return VulkanScenePathClipResult{}
      }
      let path = renderer.Emit(shapePath, node.ShapeFillRule)
      if !path.Renderable {
        if path.PathId.IsValid && path.AtlasId.IsValid && path.WordCount != 0u
          && path.UploadPending{
            return AppendZeroPathClip(parentChainId, stableId, contentKey)
          }
        return VulkanScenePathClipResult{}
      }
      return PublishPathClip(parentChainId, parentDepth, stableId, contentKey, path,
        bounds, mapping, ShapeFit.Fill, path.FillRule, transformIndex)
    }

  private func ShapePaintMaskId(node Node) uint64 -> OwnerId(node) | ShapePaintMaskBit

  private func ResolveRoundedOverflowClip(
    node Node,
    bounds ConservativeBounds,
    clipBounds ConservativeBounds,
    transformIndex int32,
    parentChainId int32) VulkanScenePathClipResult{
      if bounds.IsEmpty {
        return VulkanScenePathClipResult{}
      }
      if !TryResolvePathClipParentDepth(parentChainId, out var parentDepth) {
        return VulkanScenePathClipResult{}
      }
      if clipBounds.IsEmpty {
        let stableId = OwnerId(node) | OverflowClipMaskBit
        var contentKey = HashPathBounds(stableId, clipBounds)
        contentKey = MixPathHash(contentKey, OverflowClipMaskBit)
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      let entry = if roundedOverflowPaths.TryGetValue(node, out var existing) {
        existing
      } else {
        let created = VulkanRoundedOverflowPathCacheEntry()
        roundedOverflowPaths.Add(node, created)
        created
      }
      let topLeft = PaddingEdgeRadius(node, node.BorderTopLeftRadius,
        node.BorderRadius, bounds, clipBounds, true, true)
      let topRight = PaddingEdgeRadius(node, node.BorderTopRightRadius,
        node.BorderRadius, bounds, clipBounds, false, true)
      let bottomRight = PaddingEdgeRadius(node, node.BorderBottomRightRadius,
        node.BorderRadius, bounds, clipBounds, false, false)
      let bottomLeft = PaddingEdgeRadius(node, node.BorderBottomLeftRadius,
        node.BorderRadius, bounds, clipBounds, true, false)
      let clipPath = entry.Resolve(
        topLeft / clipBounds.Width, topLeft / clipBounds.Height,
        topRight / clipBounds.Width, topRight / clipBounds.Height,
        bottomRight / clipBounds.Width, bottomRight / clipBounds.Height,
        bottomLeft / clipBounds.Width, bottomLeft / clipBounds.Height)
      let stableId = OwnerId(node) | OverflowClipMaskBit
      let mapping = PathGeometry.Map(clipPath, ShapeFit.Fill,
        clipBounds.X, clipBounds.Y, clipBounds.Width, clipBounds.Height)
      var contentKey = ClipContentKey(node, clipPath, ShapeFit.Fill,
        uint32(FillRule.NonZero), clipBounds, transformIndex)
      contentKey = MixPathHash(contentKey, OverflowClipMaskBit)
      if !mapping.Valid || mapping.ScaleX == 0.0F || mapping.ScaleY == 0.0F {
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      guard let renderer = pathScene else {
        return VulkanScenePathClipResult{}
      }
      let path = renderer.Emit(clipPath, FillRule.NonZero)
      if !path.Renderable {
        if path.PathId.IsValid && path.AtlasId.IsValid && path.WordCount != 0u
          && path.UploadPending{
            return AppendZeroPathClip(parentChainId, stableId, contentKey)
          }
        return VulkanScenePathClipResult{}
      }
      return PublishPathClip(parentChainId, parentDepth, stableId, contentKey, path,
        clipBounds, mapping, ShapeFit.Fill, path.FillRule, transformIndex)
    }

  private func ResolveMixedOverflowClip(
    node Node,
    bounds ConservativeBounds,
    transformIndex int32,
    parentChainId int32,
    clipsX bool) VulkanScenePathClipResult{
      if !TryResolvePathClipParentDepth(parentChainId, out var parentDepth) {
        return VulkanScenePathClipResult{}
      }
      if clipsX ? bounds.Width <= 0.0F : bounds.Height <= 0.0F {
        let stableId = OwnerId(node) | OverflowClipMaskBit
        var contentKey = HashPathBounds(stableId, bounds)
        contentKey = MixPathHash(contentKey, OverflowClipMaskBit)
        contentKey = MixPathHash(contentKey, clipsX ? 1uL : 2uL)
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      let clipBounds = MixedOverflowBounds(node, bounds, clipsX)
      if clipBounds.IsEmpty {
        return VulkanScenePathClipResult{}
      }
      let entry = if roundedOverflowPaths.TryGetValue(node, out var existing) {
        existing
      } else {
        let created = VulkanRoundedOverflowPathCacheEntry()
        roundedOverflowPaths.Add(node, created)
        created
      }
      let clipPath = entry.Resolve(0.0F, 0.0F, 0.0F, 0.0F,
        0.0F, 0.0F, 0.0F, 0.0F)
      let mapping = PathGeometry.Map(clipPath, ShapeFit.Fill,
        clipBounds.X, clipBounds.Y, clipBounds.Width, clipBounds.Height)
      let stableId = OwnerId(node) | OverflowClipMaskBit
      var contentKey = ClipContentKey(node, clipPath, ShapeFit.Fill,
        uint32(FillRule.NonZero), clipBounds, transformIndex)
      contentKey = MixPathHash(contentKey, OverflowClipMaskBit)
      contentKey = MixPathHash(contentKey, clipsX ? 1uL : 2uL)
      if !mapping.Valid || mapping.ScaleX == 0.0F || mapping.ScaleY == 0.0F {
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      guard let renderer = pathScene else {
        return VulkanScenePathClipResult{}
      }
      let path = renderer.Emit(clipPath, FillRule.NonZero)
      if !path.Renderable {
        if path.PathId.IsValid && path.AtlasId.IsValid && path.WordCount != 0u
          && path.UploadPending{
            return AppendZeroPathClip(parentChainId, stableId, contentKey)
          }
        return VulkanScenePathClipResult{}
      }
      let geometry = PathGeometry.For(clipPath)
      let closedBounds = ClosedPathBounds(geometry)
      if !geometry.HasFillContour || closedBounds.IsEmpty {
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      return PublishPathClip(parentChainId, parentDepth, stableId, contentKey, path,
        clipBounds, mapping, ShapeFit.Fill, path.FillRule, transformIndex)
    }

  private func MixedOverflowBounds(
    node Node,
    bounds ConservativeBounds,
    clipsX bool) ConservativeBounds{
      let clippedExtent = clipsX ? bounds.Width : bounds.Height
      if clippedExtent <= 0.0F || clipViewportWidth <= 0.0F
        || clipViewportHeight <= 0.0F {
          return ConservativeBounds{}
        }
      let topLeft = TransformGeometry.WindowToNode(node, 0.0F, 0.0F)
      let topRight = TransformGeometry.WindowToNode(node, clipViewportWidth, 0.0F)
      let bottomLeft = TransformGeometry.WindowToNode(node, 0.0F, clipViewportHeight)
      let bottomRight = TransformGeometry.WindowToNode(node,
        clipViewportWidth, clipViewportHeight)
      if !topLeft.Valid || !topRight.Valid || !bottomLeft.Valid || !bottomRight.Valid {
        return ConservativeBounds{}
      }
      if clipsX {
        let minimum = MathF.Min(MathF.Min(topLeft.Y, topRight.Y),
          MathF.Min(bottomLeft.Y, bottomRight.Y))
        let maximum = MathF.Max(MathF.Max(topLeft.Y, topRight.Y),
          MathF.Max(bottomLeft.Y, bottomRight.Y))
        let height = maximum - minimum + MixedOverflowMargin * 2.0F
        if !finiteVulkanSceneValue(minimum) || !finiteVulkanSceneValue(maximum)
          || !finiteVulkanSceneValue(height) || height <= 0.0F {
            return ConservativeBounds{}
          }
        return ConservativeBounds{
          X: bounds.X,
          Y: minimum - MixedOverflowMargin,
          Width: bounds.Width,
          Height: height,
        }
      }
      let minimum = MathF.Min(MathF.Min(topLeft.X, topRight.X),
        MathF.Min(bottomLeft.X, bottomRight.X))
      let maximum = MathF.Max(MathF.Max(topLeft.X, topRight.X),
        MathF.Max(bottomLeft.X, bottomRight.X))
      let width = maximum - minimum + MixedOverflowMargin * 2.0F
      if !finiteVulkanSceneValue(minimum) || !finiteVulkanSceneValue(maximum)
        || !finiteVulkanSceneValue(width) || width <= 0.0F {
          return ConservativeBounds{}
        }
      return ConservativeBounds{
        X: minimum - MixedOverflowMargin,
        Y: bounds.Y,
        Width: width,
        Height: bounds.Height,
      }
    }

  private func MarkShapePaintUnsupported(node Node) {
    if let gradient = node.BackgroundGradient {
      let primitive = switch gradient {
        case linear is VectorLinearGradient: VulkanSceneUnsupportedPrimitive.LinearGradient
        case radial is VectorRadialGradient: VulkanSceneUnsupportedPrimitive.RadialGradient
        case linear is LinearGradient: VulkanSceneUnsupportedPrimitive.LinearGradient
        case radial is RadialGradient: VulkanSceneUnsupportedPrimitive.RadialGradient
        case _: VulkanSceneUnsupportedPrimitive.Gradient
      }
      MarkUnsupported(node, VulkanSceneUnsupportedKind.Gradient,
        VulkanSceneUnsupportedField.BackgroundGradient, primitive)
    }
    if node.HasBackgroundImageState {
      let path = BackgroundImageLayouts.Path(node)
      let source = BackgroundImageLayouts.Source(node)
      if path != "" && source == nil {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BackgroundImage,
          VulkanSceneUnsupportedPrimitive.BackgroundImage)
      } else if source != nil {
        RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BackgroundImageSource,
          VulkanSceneUnsupportedPrimitive.BackgroundImage)
      }
    }
  }

  private func ResolvePathClip(
    node Node,
    bounds ConservativeBounds,
    transformIndex int32,
    parentChainId int32) VulkanScenePathClipResult{
      if !node.HasClipPath {
        return VulkanScenePathClipResult{}
      }
      guard let clip = ClipPaths.Get(node) else {
        return VulkanScenePathClipResult{}
      }
      if !TryResolvePathClipParentDepth(parentChainId, out var parentDepth) {
        return VulkanScenePathClipResult{}
      }
      let contentKey = ClipContentKey(node, clip.Path, clip.Fit,
        uint32(clip.FillRule), bounds, transformIndex)
      let stableId = OwnerId(node)
      let geometry = PathGeometry.For(clip.Path)
      let closedBounds = ClosedPathBounds(geometry)
      if !geometry.HasFillContour || closedBounds.IsEmpty {
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      guard let renderer = pathScene else {
        return VulkanScenePathClipResult{}
      }
      let mapping = PathGeometry.Map(clip.Path, clip.Fit,
        bounds.X, bounds.Y, bounds.Width, bounds.Height)
      if !mapping.Valid || mapping.ScaleX == 0.0F || mapping.ScaleY == 0.0F {
        return AppendZeroPathClip(parentChainId, stableId, contentKey)
      }
      let path = renderer.Emit(clip.Path, clip.FillRule)
      if !path.Renderable {
        if path.PathId.IsValid && path.AtlasId.IsValid && path.WordCount != 0u
          && path.UploadPending{
            return AppendZeroPathClip(parentChainId, stableId, contentKey)
          }
        return VulkanScenePathClipResult{}
      }
      return PublishPathClip(parentChainId, parentDepth, stableId, contentKey, path,
        bounds, mapping, clip.Fit, uint32(clip.FillRule), transformIndex)
    }

  private func MarkPathClipUnsupported(node Node) {
    MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
      VulkanSceneUnsupportedField.ClipPath,
      VulkanSceneUnsupportedPrimitive.ClipPath)
    if ClipPaths.Fit(node) != ShapeFit.Fill {
      RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ClipPathFit,
        VulkanSceneUnsupportedPrimitive.ClipPath)
    }
  }

  private func ClosedPathBounds(geometry PathGeometry) ConservativeBounds {
    if geometry.EdgeCount == 0 {
      return ConservativeBounds{}
    }
    var minimumX = Single.PositiveInfinity
    var minimumY = Single.PositiveInfinity
    var maximumX = Single.NegativeInfinity
    var maximumY = Single.NegativeInfinity
    var index int32 = 0
    while index < geometry.EdgeCount {
      let edge = geometry.Edges[index]
      if edge.X0 < minimumX { minimumX = edge.X0 }
      if edge.X1 < minimumX { minimumX = edge.X1 }
      if edge.Y0 < minimumY { minimumY = edge.Y0 }
      if edge.Y1 < minimumY { minimumY = edge.Y1 }
      if edge.X0 > maximumX { maximumX = edge.X0 }
      if edge.X1 > maximumX { maximumX = edge.X1 }
      if edge.Y0 > maximumY { maximumY = edge.Y0 }
      if edge.Y1 > maximumY { maximumY = edge.Y1 }
      index = index + 1
    }
    if !finiteVulkanSceneValue(minimumX) || !finiteVulkanSceneValue(minimumY)
      || !finiteVulkanSceneValue(maximumX) || !finiteVulkanSceneValue(maximumY) {
        return ConservativeBounds{}
      }
    return ConservativeBounds{
      X: minimumX,
      Y: minimumY,
      Width: maximumX - minimumX,
      Height: maximumY - minimumY,
    }
  }

  private func MappedPathBounds(source ConservativeBounds, mapping PathMapping) ConservativeBounds {
    let left = source.X * mapping.ScaleX + mapping.TranslateX
    let top = source.Y * mapping.ScaleY + mapping.TranslateY
    let right = (source.X + source.Width) * mapping.ScaleX + mapping.TranslateX
    let bottom = (source.Y + source.Height) * mapping.ScaleY + mapping.TranslateY
    let x = left < right ? left : right
    let y = top < bottom ? top : bottom
    let width = MathF.Abs(right - left)
    let height = MathF.Abs(bottom - top)
    return ConservativeBounds{ X: x, Y: y, Width: width, Height: height }
  }

  private func ClipContentKey(
    node Node,
    path VectorPath,
    fit ShapeFit,
    fillRule uint32,
    bounds ConservativeBounds,
    transformIndex int32) uint64{
      var hash = PathHashOffset
      hash = MixPathHash(hash, OwnerId(node))
      hash = MixPathHash(hash, path.Hash)
      hash = MixPathHash(hash, path.GeometryRevision)
      hash = MixPathHash(hash, uint64(int32(fit)))
      hash = MixPathHash(hash, uint64(fillRule))
      if node.Kind == NodeKind.Shape {
        hash = MixPathHash(hash, node.ShapeStrokeInset ? 1uL : 0uL)
      }
      hash = HashPathBounds(hash, bounds)
      var index = transformIndex
      var guardCount int32 = 0
      while index >= 0 && index < frame.TransformCount && guardCount < frame.TransformCount {
        let transform = frame.Transforms[index]
        hash = HashPathFloat(hash, transform.A)
        hash = HashPathFloat(hash, transform.B)
        hash = HashPathFloat(hash, transform.C)
        hash = HashPathFloat(hash, transform.D)
        hash = HashPathFloat(hash, transform.TX)
        hash = HashPathFloat(hash, transform.TY)
        index = transform.ParentIndex
        guardCount = guardCount + 1
      }
      return hash
    }

  private func HashPathBounds(hash uint64, value ConservativeBounds) uint64 {
    var result = HashPathFloat(hash, value.X)
    result = HashPathFloat(result, value.Y)
    result = HashPathFloat(result, value.Width)
    return HashPathFloat(result, value.Height)
  }

  private func HashPathFloat(hash uint64, value float32) uint64 -> MixPathHash(hash, uint64(uint32(BitConverter.SingleToInt32Bits(value))))

  private func MixPathHash(hash uint64, value uint64) uint64 -> (hash ^ value) * PathHashPrime

}
