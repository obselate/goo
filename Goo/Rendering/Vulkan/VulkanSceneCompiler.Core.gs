package Goo

import System
import Facebook.Yoga
import System.Runtime.CompilerServices

private sealed class VulkanRoundedOverflowPathCacheEntry {
  private const QuadraticCapacity int32 = 12
  private const Diagonal float32 = 0.7071067811865475F
  private const Control float32 = 0.41421356237309503F
  private let owner VectorPathNormalizedOwner
  private let path VectorPath
  private let quadratics []PathQuadratic
  private let contours []PathContour
  private var topLeftX float32
  private var topLeftY float32
  private var topRightX float32
  private var topRightY float32
  private var bottomRightX float32
  private var bottomRightY float32
  private var bottomLeftX float32
  private var bottomLeftY float32
  private var ready bool

  internal init() {
    owner = VectorPathNormalizedOwner(QuadraticCapacity, 1, 0.0, 0.0, 1.0, 1.0)
    path = VectorPath.CreateMutableNormalized(owner, 0.0, 0.0, 1.0, 1.0)
    quadratics = [QuadraticCapacity]PathQuadratic
    contours = [1]PathContour
  }

  internal func Resolve(
    nextTopLeftX float32,
    nextTopLeftY float32,
    nextTopRightX float32,
    nextTopRightY float32,
    nextBottomRightX float32,
    nextBottomRightY float32,
    nextBottomLeftX float32,
    nextBottomLeftY float32) VectorPath{
      if ready && topLeftX == nextTopLeftX && topLeftY == nextTopLeftY
        && topRightX == nextTopRightX && topRightY == nextTopRightY
        && bottomRightX == nextBottomRightX && bottomRightY == nextBottomRightY
        && bottomLeftX == nextBottomLeftX && bottomLeftY == nextBottomLeftY{
          return path
        }
      let topRightCenterX = 1.0F - nextTopRightX
      let topRightCenterY = nextTopRightY
      let bottomRightCenterX = 1.0F - nextBottomRightX
      let bottomRightCenterY = 1.0F - nextBottomRightY
      let bottomLeftCenterX = nextBottomLeftX
      let bottomLeftCenterY = 1.0F - nextBottomLeftY
      let topLeftCenterX = nextTopLeftX
      let topLeftCenterY = nextTopLeftY

      SetQuadratic(0,
        nextTopLeftX, 0.0F,
        (nextTopLeftX + 1.0F - nextTopRightX) * 0.5F, 0.0F,
        1.0F - nextTopRightX, 0.0F)
      SetQuadratic(1,
        1.0F - nextTopRightX, 0.0F,
        topRightCenterX + nextTopRightX * Control, topRightCenterY - nextTopRightY,
        topRightCenterX + nextTopRightX * Diagonal,
        topRightCenterY - nextTopRightY * Diagonal)
      SetQuadratic(2,
        topRightCenterX + nextTopRightX * Diagonal,
        topRightCenterY - nextTopRightY * Diagonal,
        topRightCenterX + nextTopRightX, topRightCenterY - nextTopRightY * Control,
        1.0F, nextTopRightY)
      SetQuadratic(3,
        1.0F, nextTopRightY,
        1.0F, (nextTopRightY + 1.0F - nextBottomRightY) * 0.5F,
        1.0F, 1.0F - nextBottomRightY)
      SetQuadratic(4,
        1.0F, 1.0F - nextBottomRightY,
        bottomRightCenterX + nextBottomRightX,
        bottomRightCenterY + nextBottomRightY * Control,
        bottomRightCenterX + nextBottomRightX * Diagonal,
        bottomRightCenterY + nextBottomRightY * Diagonal)
      SetQuadratic(5,
        bottomRightCenterX + nextBottomRightX * Diagonal,
        bottomRightCenterY + nextBottomRightY * Diagonal,
        bottomRightCenterX + nextBottomRightX * Control, bottomRightCenterY + nextBottomRightY,
        1.0F - nextBottomRightX, 1.0F)
      SetQuadratic(6,
        1.0F - nextBottomRightX, 1.0F,
        (1.0F - nextBottomRightX + nextBottomLeftX) * 0.5F, 1.0F,
        nextBottomLeftX, 1.0F)
      SetQuadratic(7,
        nextBottomLeftX, 1.0F,
        bottomLeftCenterX - nextBottomLeftX * Control, bottomLeftCenterY + nextBottomLeftY,
        bottomLeftCenterX - nextBottomLeftX * Diagonal,
        bottomLeftCenterY + nextBottomLeftY * Diagonal)
      SetQuadratic(8,
        bottomLeftCenterX - nextBottomLeftX * Diagonal,
        bottomLeftCenterY + nextBottomLeftY * Diagonal,
        bottomLeftCenterX - nextBottomLeftX, bottomLeftCenterY + nextBottomLeftY * Control,
        0.0F, 1.0F - nextBottomLeftY)
      SetQuadratic(9,
        0.0F, 1.0F - nextBottomLeftY,
        0.0F, (1.0F - nextBottomLeftY + nextTopLeftY) * 0.5F,
        0.0F, nextTopLeftY)
      SetQuadratic(10,
        0.0F, nextTopLeftY,
        topLeftCenterX - nextTopLeftX, topLeftCenterY - nextTopLeftY * Control,
        topLeftCenterX - nextTopLeftX * Diagonal,
        topLeftCenterY - nextTopLeftY * Diagonal)
      SetQuadratic(11,
        topLeftCenterX - nextTopLeftX * Diagonal,
        topLeftCenterY - nextTopLeftY * Diagonal,
        topLeftCenterX - nextTopLeftX * Control, topLeftCenterY - nextTopLeftY,
        nextTopLeftX, 0.0F)
      contours[0] = PathContour{ Start: 0, End: QuadraticCapacity, Closed: true }
      owner.Update(quadratics, QuadraticCapacity, contours, 1)
      topLeftX = nextTopLeftX
      topLeftY = nextTopLeftY
      topRightX = nextTopRightX
      topRightY = nextTopRightY
      bottomRightX = nextBottomRightX
      bottomRightY = nextBottomRightY
      bottomLeftX = nextBottomLeftX
      bottomLeftY = nextBottomLeftY
      ready = true
      return path
    }

  private func SetQuadratic(index int32, x0 float32, y0 float32, cx float32, cy float32,
    x1 float32, y1 float32) {
      quadratics[index] = PathQuadratic{ X0: x0, Y0: y0, CX: cx, CY: cy, X1: x1, Y1: y1 }
    }
}

internal struct VulkanSceneTraversalContext {
  internal var ParentTransformIndex int32
  internal var ParentRectClipIndex int32
  internal var ParentOpacity float32
  internal var ParentAxisAligned bool
  internal var ParentRectClipDepth int32
  internal var ParentPathClipChainId int32
  internal var ParentIsolation bool
  internal var ExactCullContextSafe bool
  internal var ActiveClipBounds ConservativeBounds
}

internal partial class VulkanSceneCompiler {
  private const BackgroundOwnerId uint64 = 1uL
  private const FirstNodeOwnerId uint64 = 2uL
  private const OverflowClipMaskBit uint64 = 1uL << 62
  private const ShapePaintMaskBit uint64 = 1uL << 63
  private const MaxRectClipDepth int32 = 64
  private const MaxPathClipDepth int32 = 8
  private const MixedOverflowMargin float32 = 2.0F
  private const PathHashOffset uint64 = 1469598103934665603uL
  private const PathHashPrime uint64 = 1099511628211uL

  private let frame SceneFrame
  private let owners ConditionalWeakTable[Node, VulkanSceneOwnerId]
  private let ownerToken object
  private let roundedOverflowPaths ConditionalWeakTable[Node,
    VulkanRoundedOverflowPathCacheEntry]
  private let unsupportedDetails []VulkanSceneUnsupportedDetail
  private let strokeCache PathStrokeCache
  private var textScene VulkanTextScene?
  private var imageScene VulkanImageScene?
  private var pathScene VulkanPathScene?
  private var nextOwnerId uint64
  private var frameVersion uint64
  private var clipViewportWidth float32
  private var clipViewportHeight float32
  private var visibleNodeCount int32
  private var emittedNodeCount int32
  private var unsupportedNodeCount int32
  private var unsupportedPrimitiveCount int32
  private var unsupportedDetailCount int32
  private var unsupportedDetailDropped int32
  private var skippedNodeCount int32
  private var exactTextClipCandidateCount int32
  private var exactTextClipCullCount int32
  private var cachedTextPaintCullCount int32
  private var scrollNodeCount int32
  private var unsupportedMask uint32
  private var clipCount int32
  private var pathClipCount int32
  private var clipMaskCount int32
  private var clipChainCount int32
  private var transformCount int32
  private var blendModeSupported bool
  private var exactTextClipCullEnabled bool
  private var backgroundDrawn bool
  private var lastResult VulkanSceneCompileResult

  internal convenience init() {
    init(32)
  }

  internal init(capacity int32) {
    if capacity <= 0 {
      throw ArgumentOutOfRangeException("capacity")
    }
    frame = SceneFrame(capacity)
    InitializeRetention(capacity)
    owners = ConditionalWeakTable[Node, VulkanSceneOwnerId]()
    ownerToken = Object()
    roundedOverflowPaths = ConditionalWeakTable[Node, VulkanRoundedOverflowPathCacheEntry]()
    unsupportedDetails = [capacity]VulkanSceneUnsupportedDetail
    strokeCache = PathStrokeCache.Shared
    nextOwnerId = FirstNodeOwnerId
    blendModeSupported = true
    exactTextClipCullEnabled = true

  }

  internal prop Frame SceneFrame{
    get -> frame
  }

  internal prop LastResult VulkanSceneCompileResult{
    get -> lastResult
  }

  internal func SetTextScene(value VulkanTextScene?) {
    textScene = value
  }

  internal func SetImageScene(value VulkanImageScene?) {
    imageScene = value
  }

  internal func SetPathScene(value VulkanPathScene?) {
    pathScene = value
  }

  internal func SetBlendModeSupport(value bool) {
    blendModeSupported = value
  }
  internal func SetExactTextClipCullEnabled(value bool) {
    exactTextClipCullEnabled = value
  }

  internal func Compile(
    root Node?,
    background Color,
    viewportWidth float32,
    viewportHeight float32) VulkanSceneCompileResult{
      ValidateViewport(viewportWidth, viewportHeight)
      clipViewportWidth = viewportWidth
      clipViewportHeight = viewportHeight
      textScene?.ResetCompileCounters()
      imageScene?.BeginCompile()
      pathScene?.BeginCompile()
      frameVersion = nextVulkanSceneVersion(frameVersion)
      frame.ResetForReuse()
      visibleNodeCount = 0
      emittedNodeCount = 0
      unsupportedNodeCount = 0
      unsupportedPrimitiveCount = 0
      unsupportedDetailCount = 0
      unsupportedDetailDropped = 0
      skippedNodeCount = 0
      exactTextClipCandidateCount = 0
      exactTextClipCullCount = 0
      cachedTextPaintCullCount = 0
      scrollNodeCount = 0
      unsupportedMask = 0u
      clipCount = 0
      pathClipCount = 0
      clipMaskCount = 0
      clipChainCount = 0
      transformCount = 0
      backgroundDrawn = false

      let viewport = ConservativeBounds{
        X: 0.0F,
        Y: 0.0F,
        Width: viewportWidth,
        Height: viewportHeight,
      }
      frame.BeginChunk(BackgroundOwnerId, frameVersion, viewport, true)
      frame.SetActiveClipChain(0)
      if background.A > 0.0F {
        frame.AddSolidBox(SolidBoxRecord{
          Bounds: viewport,
          Color: background.ToPackedRgba(),
          Opacity: 1.0F,
          TransformIndex: -1,
        })
        backgroundDrawn = true
      }
      frame.EndChunk()

      var rootOwnerId uint64 = 0uL
      if let node = root {
        rootOwnerId = OwnerId(node)
        CompileNode(node, VulkanSceneTraversalContext{
          ParentTransformIndex: -1,
          ParentRectClipIndex: -1,
          ParentOpacity: 1.0F,
          ParentAxisAligned: true,
          ParentRectClipDepth: 0,
          ParentPathClipChainId: 0,
          ParentIsolation: false,
          ExactCullContextSafe: true,
          ActiveClipBounds: viewport,
        })
      }

      ClassifyRetainedChunks()

      lastResult.FrameVersion = frameVersion
      lastResult.RootOwnerId = rootOwnerId
      lastResult.ChunkCount = frame.ChunkCount
      lastResult.DrawCount = frame.DrawRefCount
      lastResult.VisibleNodeCount = visibleNodeCount
      lastResult.EmittedNodeCount = emittedNodeCount
      lastResult.UnsupportedNodeCount = unsupportedNodeCount
      lastResult.UnsupportedPrimitiveCount = unsupportedPrimitiveCount
      lastResult.SkippedNodeCount = skippedNodeCount
      lastResult.ScrollNodeCount = scrollNodeCount
      lastResult.ClipCount = clipCount
      lastResult.PathClipCount = pathClipCount
      lastResult.ClipMaskCount = clipMaskCount
      lastResult.ClipChainCount = clipChainCount
      lastResult.PathResourceDeferred = pathScene?.ResourceDeferred == true
      lastResult.TransformCount = transformCount
      lastResult.UnsupportedMask = unsupportedMask
      lastResult.UnsupportedDetails = unsupportedDetails
      lastResult.UnsupportedDetailCount = unsupportedDetailCount
      lastResult.UnsupportedDetailDropped = unsupportedDetailDropped
      lastResult.BackgroundDrawn = backgroundDrawn
      lastResult.RetainedLeaf = retainedLeaf
      lastResult.RetainedBorder = retainedBorder
      lastResult.RetainedParentBox = retainedParentBox
      lastResult.RetainedText = retainedText
      lastResult.ExactTextClipCandidateCount = exactTextClipCandidateCount
      lastResult.ExactTextClipCullCount = exactTextClipCullCount
      lastResult.CachedTextPaintCullCount = cachedTextPaintCullCount
      lastResult.TextLayoutRequestCount = if let scene = textScene {
        scene.TextLayoutRequestCount
      } else { 0 }
      return lastResult
    }

  private func CompilerTransform(node Node) PrimitiveTransform {
    if !node.HasVisualTransform {
      return PrimitiveTransform{ A: 1.0F, D: 1.0F }
    }
    let matrix = TransformGeometry.Matrix(node)
    return PrimitiveTransform{
      A: matrix.A,
      B: matrix.C,
      C: matrix.B,
      D: matrix.D,
      TX: matrix.TX,
      TY: matrix.TY,
    }
  }

  private func ComposeCompilerTransform(
    outer PrimitiveTransform,
    inner PrimitiveTransform) PrimitiveTransform -> PrimitiveTransform{
      A: outer.A * inner.A + outer.C * inner.B,
      B: outer.B * inner.A + outer.D * inner.B,
      C: outer.A * inner.C + outer.C * inner.D,
      D: outer.B * inner.C + outer.D * inner.D,
      TX: outer.A * inner.TX + outer.C * inner.TY + outer.TX,
      TY: outer.B * inner.TX + outer.D * inner.TY + outer.TY,
    }

  private func ResolveCompilerFrameTransform(index int32) PrimitiveTransform {
    var result = PrimitiveTransform{ A: 1.0F, D: 1.0F }
    var current = index
    var steps int32 = 0
    while current >= 0 {
      if current >= frame.TransformCount || steps >= frame.TransformCount {
        throw InvalidOperationException("Vulkan scene transform chain is invalid")
      }
      let value = frame.Transforms[current]
      let record = PrimitiveTransform{
        A: value.A,
        B: value.B,
        C: value.C,
        D: value.D,
        TX: value.TX,
        TY: value.TY,
      }
      result = ComposeCompilerTransform(record, result)
      current = value.ParentIndex
      steps = steps + 1
    }
    return result
  }

  private func TransformCompilerBounds(
    bounds ConservativeBounds,
    transform PrimitiveTransform) ConservativeBounds{
      if bounds.IsEmpty {
        return bounds
      }
      let x0 = transform.A * bounds.X + transform.C * bounds.Y + transform.TX
      let y0 = transform.B * bounds.X + transform.D * bounds.Y + transform.TY
      let x1 = transform.A * bounds.Right + transform.C * bounds.Y + transform.TX
      let y1 = transform.B * bounds.Right + transform.D * bounds.Y + transform.TY
      let x2 = transform.A * bounds.X + transform.C * bounds.Bottom + transform.TX
      let y2 = transform.B * bounds.X + transform.D * bounds.Bottom + transform.TY
      let x3 = transform.A * bounds.Right + transform.C * bounds.Bottom + transform.TX
      let y3 = transform.B * bounds.Right + transform.D * bounds.Bottom + transform.TY
      let left = MathF.Min(MathF.Min(x0, x1), MathF.Min(x2, x3))
      let top = MathF.Min(MathF.Min(y0, y1), MathF.Min(y2, y3))
      let right = MathF.Max(MathF.Max(x0, x1), MathF.Max(x2, x3))
      let bottom = MathF.Max(MathF.Max(y0, y1), MathF.Max(y2, y3))
      return ConservativeBounds{
        X: left,
        Y: top,
        Width: right - left,
        Height: bottom - top,
      }
    }

  private func IntersectBounds(
    first ConservativeBounds,
    second ConservativeBounds) ConservativeBounds{
      if first.IsEmpty || second.IsEmpty {
        return ConservativeBounds{}
      }
      let left = first.X > second.X ? first.X : second.X
      let top = first.Y > second.Y ? first.Y : second.Y
      let right = first.Right < second.Right ? first.Right : second.Right
      let bottom = first.Bottom < second.Bottom ? first.Bottom : second.Bottom
      if right <= left || bottom <= top {
        return ConservativeBounds{}
      }
      return ConservativeBounds{
        X: left,
        Y: top,
        Width: right - left,
        Height: bottom - top,
      }
    }

  private func StrictPlainTextViewportCullEligible(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds,
    parentTransformIndex int32,
    parentAxisAligned bool,
    parentIsolated bool) bool -> parentTransformIndex == -1 && parentAxisAligned && !parentIsolated
    && StrictPlainTextContentEligible(node, owner, bounds)

  private func StrictPlainTextContentEligible(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds) bool{
      if node.Kind != NodeKind.Text || node.Children.Count != 0 {
        return false
      }
      if owner.CachedTextCullVersion == node.ScenePaintVersion
        && owner.CachedTextCullBounds.X == bounds.X
        && owner.CachedTextCullBounds.Y == bounds.Y
        && owner.CachedTextCullBounds.Width == bounds.Width
        && owner.CachedTextCullBounds.Height == bounds.Height{
          return owner.CachedTextCullEligible
        }
      let fontSize = TextLayouts.fontSize(node)
      let lineHeight = TextLayouts.resolvedLineHeight(node)
      let contentHeight = TextLayouts.ContentHeight(node)
      let eligible = node.TextWrap == TextWrap.NoWrap
        && node.TextTrimming == TextTrimming.Ellipsis
        && node.Width.Unit == LengthUnit.Px
        && node.Height.Unit == LengthUnit.Px
        && node.FontSize.Unit == LengthUnit.Px
        && finiteVulkanSceneValue(fontSize) && fontSize > 0.0F
        && finiteVulkanSceneValue(lineHeight) && lineHeight > 0.0F
        && finiteVulkanSceneValue(contentHeight) && contentHeight >= lineHeight
        && !node.HasTextShadowState
        && !node.HasTextStrokeState
        && node.TextDecoration == TextDecoration.None
        && PassiveTextPresentations.Read(node) == nil
        && node.BackgroundColor.A <= 0.0F
        && node.BackgroundGradient == nil
        && !node.HasBackgroundImageState
        && !node.HasOutlineState
        && boxShadowCount(node.BoxShadows) == 0
        && !node.HasClipPath
        && ((node.OverflowX == Overflow.Visible
            && node.OverflowY == Overflow.Visible)
            || (node.OverflowX == Overflow.Hidden
                && node.OverflowY == Overflow.Hidden
                && !HasRadius(node, bounds)))
        && !node.HasTransformState
        && !node.HasVisualTransform
        && node.ScrollX == 0.0F
        && node.ScrollY == 0.0F
        && node.BlendMode == BlendMode.Normal
        && !HasBorderWidth(node, bounds)
        && node.BorderTopColor.A <= 0.0F
        && node.BorderRightColor.A <= 0.0F
        && node.BorderBottomColor.A <= 0.0F
        && node.BorderLeftColor.A <= 0.0F
      owner.CachedTextCullVersion = node.ScenePaintVersion
      owner.CachedTextCullBounds = bounds
      owner.CachedTextCullEligible = eligible
      return eligible
    }

  private func PreflightRectOverflowClip(
    node Node,
    bounds ConservativeBounds,
    axisAligned bool,
    parentClipDepth int32) VulkanRectOverflowClipPreflight{
      let clipsX = node.OverflowX != Overflow.Visible
      let clipsY = node.OverflowY != Overflow.Visible
      let bothAxes = clipsX && clipsY
      let depthExceeded = parentClipDepth >= MaxRectClipDepth
      return VulkanRectOverflowClipPreflight{
        ClipsX: clipsX,
        ClipsY: clipsY,
        BothAxes: bothAxes,
        HasRadius: bothAxes && HasRadius(node, bounds),
        DepthExceeded: depthExceeded,
        RectangularEmittable: bothAxes && axisAligned && !depthExceeded,
      }
    }

  private func TextEditorContentBounds(node Node) ConservativeBounds -> ConservativeBounds {
    X: TextLayouts.ContentLeft(node),
    Y: TextLayouts.ContentTop(node),
    Width: TextLayouts.ContentWidth(node),
    Height: TextLayouts.ContentHeight(node),
  }

  private func ExactTextClipCullEligible(
    node Node,
    bounds ConservativeBounds,
    exactCullContextSafe bool,
    parentAxisAligned bool,
    preflight VulkanRectOverflowClipPreflight) bool{
      if node.Kind != NodeKind.Text || node.Children.Count != 0
        || !exactCullContextSafe
        || !finiteVulkanSceneValue(bounds.X) || !finiteVulkanSceneValue(bounds.Y)
        || !finiteVulkanSceneValue(bounds.Width) || !finiteVulkanSceneValue(bounds.Height)
        || bounds.IsEmpty
        || node.OverflowX != Overflow.Hidden
        || node.OverflowY != Overflow.Hidden
        || !preflight.BothAxes || preflight.HasRadius
        || !preflight.RectangularEmittable
        || !parentAxisAligned
        || node.Width.Unit != LengthUnit.Px
        || node.Height.Unit != LengthUnit.Px
        || node.FontSize.Unit != LengthUnit.Px
        || !finiteVulkanSceneValue(node.FontSize.Px) || node.FontSize.Px <= 0.0F
        || node.TextWrap != TextWrap.NoWrap
        || node.TextTrimming != TextTrimming.Ellipsis
        || node.HasTextShadowState
        || node.HasTextStrokeState
        || node.TextDecoration != TextDecoration.None
        || PassiveTextPresentations.Read(node) != nil
        || node.BackgroundColor.A > 0.0F
        || node.BackgroundGradient != nil
        || node.HasBackgroundImageState
        || node.HasOutlineState
        || boxShadowCount(node.BoxShadows) != 0
        || node.HasClipPath
        || node.HasTransformState
        || node.HasVisualTransform
        || node.BlendMode != BlendMode.Normal
        || styleMaskHas(node.AppliedMask, StyleField.ShaderEffect)
        || HasBorderWidth(node, bounds)
        || node.BorderTopColor.A > 0.0F
        || node.BorderRightColor.A > 0.0F
        || node.BorderBottomColor.A > 0.0F
        || node.BorderLeftColor.A > 0.0F {
          return false
        }
      return true
    }

  private func ExactCullContextForChildren(
    contextSafe bool,
    node Node,
    isolates bool,
    axisAligned bool,
    preflight VulkanRectOverflowClipPreflight) bool{
      if !contextSafe || isolates || !axisAligned
        || node.HasTransformState || node.HasVisualTransform || node.HasClipPath
        || node.BlendMode != BlendMode.Normal{
          return false
        }
      if preflight.ClipsX != preflight.ClipsY {
        return false
      }
      if preflight.BothAxes
        && (!preflight.RectangularEmittable || preflight.HasRadius) {
          return false
        }
      return true
    }

  private func StrictTextViewportCulled(
    node Node,
    owner VulkanSceneOwnerId,
    bounds ConservativeBounds,
    activeClipBounds ConservativeBounds,
    parentTransformIndex int32,
    parentAxisAligned bool,
    parentIsolated bool) bool{
      if !IntersectBounds(bounds, activeClipBounds).IsEmpty {
        return false
      }
      if !StrictPlainTextViewportCullEligible(node, owner, bounds, parentTransformIndex,
        parentAxisAligned, parentIsolated) {
          return false
        }
      guard let scene = textScene else { return false }
      var paintBounds ConservativeBounds
      let hasPaintBounds = scene.TryGetCachedTextPaintBounds(
        node, owner, bounds, out paintBounds)
      if !hasPaintBounds {
        return false
      }
      return IntersectBounds(paintBounds, activeClipBounds).IsEmpty
    }

  private func EmittedPathClipBounds(
    value VulkanScenePathClipResult) ConservativeBounds{
      if !value.Emitted || value.ChainIndex < 0
        || value.ChainIndex >= frame.ClipChainCount{
          return ConservativeBounds{}
        }
      let chain = frame.ClipChains[value.ChainIndex]
      if chain.MaskIndex < 0 || chain.MaskIndex >= frame.ClipMaskCount {
        return ConservativeBounds{}
      }
      let mask = frame.ClipMasks[chain.MaskIndex]
      let transform = ResolveCompilerFrameTransform(mask.TransformIndex)
      let outerBounds = TransformCompilerBounds(mask.Bounds, transform)
      let pathBounds = TransformCompilerBounds(mask.PathBounds, transform)
      let clipped = IntersectBounds(outerBounds, pathBounds)
      return clipped.IsEmpty ? outerBounds : clipped.Inflate(1.0F)
    }

  private func LayerSubtreeBounds(
    node Node,
    parentTransform PrimitiveTransform,
    activeClipBounds ConservativeBounds) ConservativeBounds{
      if node.Retired || node.Display == Display.None || node.Visibility == Visibility.Hidden
        || EffectiveOpacity(1.0F, node.Opacity) <= 0.0F {
          return ConservativeBounds{}
        }
      let transform = ComposeCompilerTransform(parentTransform, CompilerTransform(node))
      var result = TransformCompilerBounds(
        ExpandedChunkBounds(node, NodeBounds(node), ShadowContextSupported(node)), transform)
      result = IntersectBounds(result, activeClipBounds)
      let children = Stacking.Children(node)
      var index int32 = 0
      while index < children.Count {
        let child = LayerSubtreeBounds(children[index], transform, activeClipBounds)
        if result.IsEmpty {
          result = child
        } else if !child.IsEmpty {
          result = unionVulkanSceneBounds(result, child)
        }
        index = index + 1
      }
      return result
    }

  private func MakeLayerRecord(
    ownerId uint64,
    bounds ConservativeBounds,
    opacity float32,
    blendMode BlendMode,
    effect ShaderEffect?) LayerRecord{
      var layerBounds = bounds
      if layerBounds.IsEmpty {
        layerBounds = ConservativeBounds{ Width: 1.0F, Height: 1.0F }
      }
      var captureBounds = layerBounds
      var effectProgramId uint64
      var effectVersion uint64
      var effectIndex int32 = -1
      var flags uint32
      if let shader = effect {
        var snapshot ShaderEffectSnapshot
        shader.CopySnapshot(out snapshot)
        effectProgramId = snapshot.ProgramId
        effectVersion = snapshot.Version
        effectIndex = frame.AddShaderEffect(snapshot)
        if snapshot.SamplesBackdrop {
          flags = uint32(LayerRecordFlags.SamplesBackdrop)
          if snapshot.BackdropOutset > 0.0F {
            captureBounds = layerBounds.Inflate(snapshot.BackdropOutset)
          }
        }
      }
      let originX = MathF.Floor(captureBounds.X)
      let originY = MathF.Floor(captureBounds.Y)
      let right = MathF.Ceiling(captureBounds.Right)
      let bottom = MathF.Ceiling(captureBounds.Bottom)
      let extentWidth = uint32(MathF.Max(1.0F, right - originX))
      let extentHeight = uint32(MathF.Max(1.0F, bottom - originY))
      return LayerRecord{
        Bounds: layerBounds,
        Opacity: opacity,
        BlendMode: uint32(int32(blendMode)),
        OffscreenTargetId: ResourceId{
          Kind: SceneResourceKind.OffscreenTarget,
          LogicalId: ownerId,
          Version: frameVersion,
        },
        EffectProgramId: effectProgramId,
        EffectVersion: effectVersion,
        EffectIndex: effectIndex,
        Flags: flags,
        TransformIndex: -1,
        OriginX: originX,
        OriginY: originY,
        ExtentWidth: extentWidth,
        ExtentHeight: extentHeight,
      }
    }

  private func CompileRetainedParentChildren(
    node Node,
    context VulkanSceneTraversalContext) {
      let children = Stacking.Children(node)
      var index int32 = 0
      while index < children.Count {
        CompileNode(children[index], context)
        index = index + 1
      }
      frame.SetActiveClipChain(context.ParentPathClipChainId)
    }

  private func CompileNode(
    node Node,
    context VulkanSceneTraversalContext) {
      let owner = Owner(node)
      let ownerId = owner.Value
      frame.SetActiveClipChain(context.ParentPathClipChainId)
      if node.Retired || node.Display == Display.None || node.Visibility == Visibility.Hidden {
        InvalidateRetainedBox(owner)
        InvalidateRetainedText(owner)
        skippedNodeCount = skippedNodeCount + 1
        return
      }

      let opacity = EffectiveOpacity(context.ParentOpacity, node.Opacity)
      if opacity <= 0.0F {
        InvalidateRetainedBox(owner)
        InvalidateRetainedText(owner)
        skippedNodeCount = skippedNodeCount + 1
        return
      }
      let localOpacity = EffectiveOpacity(1.0F, node.Opacity)
      let shaderEffect = if styleMaskHas(node.AppliedMask, StyleField.ShaderEffect) {
        node.ShaderEffect
      } else { nil }
      let isolatesOpacity = node.Children.Count != 0 && localOpacity < 1.0F
      let isolatesBlend = blendModeSupported && BlendModeSupported(node.BlendMode)
        && node.BlendMode != BlendMode.Normal
      let combinesEffectAndBlend = shaderEffect != nil && isolatesBlend
      let isolates = isolatesOpacity || isolatesBlend || shaderEffect != nil
      visibleNodeCount = visibleNodeCount + 1
      if node.ScrollX != 0.0F || node.ScrollY != 0.0F {
        scrollNodeCount = scrollNodeCount + 1
      }
      let bounds = NodeBounds(node)
      let earlyOverflowPreflight = PreflightRectOverflowClip(
        node, bounds, context.ParentAxisAligned, context.ParentRectClipDepth)
      let exactCandidate = ExactTextClipCullEligible(node, bounds,
        context.ExactCullContextSafe, context.ParentAxisAligned, earlyOverflowPreflight)
      if exactCandidate {
        exactTextClipCandidateCount = exactTextClipCandidateCount + 1
        if exactTextClipCullEnabled
          && IntersectBounds(bounds, context.ActiveClipBounds).IsEmpty{
            InvalidateRetainedBox(owner)
            InvalidateRetainedText(owner)
            frame.AppendPlaceholderChunk(ownerId, frameVersion, bounds)
            skippedNodeCount = skippedNodeCount + 1
            exactTextClipCullCount = exactTextClipCullCount + 1
            return
          }
      }
      let viewportCulled = StrictTextViewportCulled(
        node, owner, bounds, context.ActiveClipBounds,
        context.ParentTransformIndex, context.ParentAxisAligned, context.ParentIsolation)
      if viewportCulled {
        cachedTextPaintCullCount = cachedTextPaintCullCount + 1
        InvalidateRetainedBox(owner)
        if node.Kind == NodeKind.Text
          && RetainedTextEligible(node, owner, bounds, opacity, context) {
            frame.AppendPlaceholderChunk(ownerId, frameVersion, bounds)
            skippedNodeCount = skippedNodeCount + 1
            return
          }
        InvalidateRetainedText(owner)
        skippedNodeCount = skippedNodeCount + 1
        return
      }
      if node.Kind == NodeKind.Lava {
        InvalidateRetainedBox(owner)
        InvalidateRetainedText(owner)
        frame.BeginChunk(ownerId, frameVersion, bounds, true)
        let transform = AddNodeTransform(node, context.ParentTransformIndex)
        transformCount = frame.TransformCount
        frame.AddLava(LavaRecord{
          Bounds: bounds,
          Flow: float32(node.LavaFlow),
          Form: float32(node.LavaForm),
          Blend: float32(node.LavaBlend),
          Light: float32(node.LavaLight),
          Hue: float32(node.LavaHue),
          Rainbow: node.LavaRainbow ? 1u : 0u,
          Rotation: node.LavaRotation,
          Seed: node.LavaSeed,
          TransformIndex: transform.Index,
        })
        frame.EndChunk()
        emittedNodeCount = emittedNodeCount + 1
        return
      }
      var retainedLeafEligible = false
      var retainedTextEligible = false
      if node.Kind == NodeKind.Text || node.Kind == NodeKind.Entry {
        InvalidateRetainedBox(owner)
        IncrementSaturated(ref retainedText.Total)
        retainedTextEligible = RetainedTextEligible(node, owner, bounds, opacity, context)
        if retainedTextEligible {
          if TryAppendRetainedText(node, owner, bounds, opacity,
            context.ParentTransformIndex, context.ParentRectClipIndex, context.ParentRectClipDepth,
            context.ActiveClipBounds) {
              emittedNodeCount = emittedNodeCount + 1
              return
            }
        } else {
          InvalidateRetainedText(owner)
          IncrementSaturated(ref retainedText.Fallback)
        }
      } else if node.Children.Count == 0 {
        InvalidateRetainedText(owner)
        let retainedBorderCandidate = RetainedBorderCandidate(node, bounds)
        if retainedBorderCandidate {
          IncrementSaturated(ref retainedBorder.Total)
          var retainedBorderRecord PerEdgeBorderRecord
          let retainedBorderEligible = RetainedBorderEligible(node, bounds, opacity,
            context, out retainedBorderRecord)
          if retainedBorderEligible {
            if TryAppendRetainedBorderLeaf(node, owner, ownerId, bounds,
              retainedBorderRecord) {
                emittedNodeCount = emittedNodeCount + 1
                return
              }
            InvalidateRetainedBox(owner)
            AppendRetainedBorderLeafRebuild(node, owner, ownerId, bounds,
              retainedBorderRecord)
            return
          }
          InvalidateRetainedBox(owner)
          IncrementSaturated(ref retainedBorder.Fallback)
        } else {
          IncrementSaturated(ref retainedLeaf.Total)
          retainedLeafEligible = RetainedLeafEligible(node, bounds, opacity, context)
          if retainedLeafEligible {
            if TryAppendRetainedLeaf(node, owner, ownerId, bounds, opacity) {
              emittedNodeCount = emittedNodeCount + 1
              return
            }
            InvalidateRetainedBox(owner)
          } else {
            InvalidateRetainedBox(owner)
            IncrementSaturated(ref retainedLeaf.Fallback)
          }
          if retainedLeafEligible {
            AppendRetainedLeafRebuild(node, owner, ownerId, bounds, opacity)
            return
          }
        }
      } else {
        InvalidateRetainedText(owner)
        let retainedParentBoxEligible = RetainedParentBoxEligible(
          node, bounds, opacity, context)
        if retainedParentBoxEligible {
          IncrementSaturated(ref retainedParentBox.Total)
          if TryAppendRetainedBox(node, owner, ownerId, bounds, opacity, false) {
            emittedNodeCount = emittedNodeCount + 1
            CompileRetainedParentChildren(node, context)
            return
          }
          InvalidateRetainedBox(owner)
          AppendRetainedBoxRebuild(node, owner, ownerId, bounds, opacity, false)
          CompileRetainedParentChildren(node, context)
          return
        }
        if owner.RetainedLeafValid && !owner.RetainedBoxIsLeaf {
          InvalidateRetainedBox(owner)
          IncrementSaturated(ref retainedParentBox.Fallback)
        } else if owner.RetainedLeafValid {
          InvalidateRetainedBox(owner)
        }
      }
      let shadowEligible = ShadowContextSupported(node)
      let chunkBounds = ExpandedChunkBounds(node, bounds, shadowEligible)
      MarkUnsupportedNode(node)
      RecordUnsupportedFields(node, bounds)

      let chunk = frame.BeginChunk(ownerId, frameVersion, chunkBounds, true)
      let transform = AddNodeTransform(node, context.ParentTransformIndex)
      transformCount = frame.TransformCount
      let axisAligned = context.ParentAxisAligned && transform.AxisAligned
      let subtreeBounds = isolates
      ? LayerSubtreeBounds(node, ResolveCompilerFrameTransform(context.ParentTransformIndex),
        context.ActiveClipBounds) : ConservativeBounds{}
      var layerRecord LayerRecord
      var outerLayerRecord LayerRecord
      var innerLayerRecord LayerRecord
      if isolates {
        if combinesEffectAndBlend {
          innerLayerRecord = MakeLayerRecord(ownerId, subtreeBounds, 1.0F,
            BlendMode.Normal, shaderEffect)
          outerLayerRecord = MakeLayerRecord(ownerId, subtreeBounds, localOpacity,
            node.BlendMode, nil)
          if (innerLayerRecord.Flags & uint32(LayerRecordFlags.SamplesBackdrop)) != 0u {
            innerLayerRecord.Flags = innerLayerRecord.Flags
            | uint32(LayerRecordFlags.BorrowsParentBackdrop)
            outerLayerRecord.OriginX = innerLayerRecord.OriginX
            outerLayerRecord.OriginY = innerLayerRecord.OriginY
            outerLayerRecord.ExtentWidth = innerLayerRecord.ExtentWidth
            outerLayerRecord.ExtentHeight = innerLayerRecord.ExtentHeight
          }
        } else {
          layerRecord = MakeLayerRecord(ownerId, subtreeBounds, localOpacity,
            isolatesBlend ? node.BlendMode : BlendMode.Normal, shaderEffect)
        }
        frame.SetActiveClipChain(context.ParentPathClipChainId)
        if combinesEffectAndBlend {
          frame.AddLayerBegin(outerLayerRecord)
          frame.AddLayerBegin(innerLayerRecord)
        } else {
          frame.AddLayerBegin(layerRecord)
        }
      }
      let pathClip = ResolvePathClip(node, bounds, transform.Index, context.ParentPathClipChainId)
      var activePathClipChainId = context.ParentPathClipChainId
      if node.HasClipPath && ClipPaths.Path(node).CommandCount != 0 {
        if pathClip.Emitted {
          activePathClipChainId = pathClip.ChainIndex
          pathClipCount = pathClipCount + 1
        } else {
          MarkPathClipUnsupported(node)
        }
      }
      let overflowPreflight = PreflightRectOverflowClip(
        node, bounds, axisAligned, context.ParentRectClipDepth)
      let clipsX = overflowPreflight.ClipsX
      let clipsY = overflowPreflight.ClipsY
      let bothAxes = overflowPreflight.BothAxes
      let hasRadius = overflowPreflight.HasRadius
      let paddingEdgeBounds = PaddingEdgeBounds(node, bounds)
      var overflowPathClipChainId = activePathClipChainId
      var roundedOverflowClip = false
      var mixedOverflowClip = false
      if hasRadius {
        let roundedClip = ResolveRoundedOverflowClip(node, bounds, paddingEdgeBounds,
          transform.Index, activePathClipChainId)
        if roundedClip.Emitted {
          overflowPathClipChainId = roundedClip.ChainIndex
          roundedOverflowClip = true
        }
      } else if clipsX != clipsY {
        let mixedClip = ResolveMixedOverflowClip(node, paddingEdgeBounds, transform.Index,
          activePathClipChainId, clipsX)
        if mixedClip.Emitted {
          overflowPathClipChainId = mixedClip.ChainIndex
          mixedOverflowClip = true
        }
      }
      var shapePaintClip = false
      let nodeContentClipChainId = node.Kind == NodeKind.Shape
      ? overflowPathClipChainId : activePathClipChainId
      var paintPathClipChainId = nodeContentClipChainId
      if ShapePaintNeedsMask(node) {
        let shapeClip = ResolveShapePaintClip(node, bounds, transform.Index,
          nodeContentClipChainId)
        if shapeClip.Emitted {
          paintPathClipChainId = shapeClip.ChainIndex
          shapePaintClip = true
        } else {
          MarkShapePaintUnsupported(node)
        }
      }
      frame.SetActiveClipChain(paintPathClipChainId)
      let contentOpacity = isolates ? 1.0F : opacity
      if node.Kind != NodeKind.Shape {
        PaintNodeBackground(node, bounds, contentOpacity, transform.Index)
      }
      var clipIndex int32 = -1
      var childClipDepth = context.ParentRectClipDepth
      if clipsX || clipsY {
        if bothAxes {
          let depthExceeded = overflowPreflight.DepthExceeded
          let pathDepthExceeded = activePathClipChainId >= 0
            && activePathClipChainId < frame.ClipChainCount
            && (activePathClipChainId == 0
              ? 0 : frame.ClipChains[activePathClipChainId].Depth) >= MaxPathClipDepth
          if overflowPreflight.RectangularEmittable {
            let clip = RectClipRecord{
              Bounds: paddingEdgeBounds,
              TransformIndex: transform.Index,
              ParentIndex: context.ParentRectClipIndex,
            }
            clipIndex = frame.AddRectClipBegin(clip)
            clipCount = clipCount + 1
            childClipDepth = context.ParentRectClipDepth + 1
          }
          if !roundedOverflowClip && !axisAligned {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              VulkanSceneUnsupportedField.OverflowX,
              VulkanSceneUnsupportedPrimitive.RectClipNonAxisAligned)
            RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.OverflowY,
              VulkanSceneUnsupportedPrimitive.RectClipNonAxisAligned)
            if hasRadius {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.BorderRadius,
                VulkanSceneUnsupportedPrimitive.RectClipRounded)
            }
            if depthExceeded || pathDepthExceeded {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ClipDepth,
                VulkanSceneUnsupportedPrimitive.RectClipDepth)
            }
          } else if !roundedOverflowClip && hasRadius {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              VulkanSceneUnsupportedField.BorderRadius,
              VulkanSceneUnsupportedPrimitive.RectClipRounded)
            if depthExceeded || pathDepthExceeded {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ClipDepth,
                VulkanSceneUnsupportedPrimitive.RectClipDepth)
            }
          } else if !roundedOverflowClip && depthExceeded {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              VulkanSceneUnsupportedField.ClipDepth,
              VulkanSceneUnsupportedPrimitive.RectClipDepth)
          }
        } else {
          if !mixedOverflowClip {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Clip,
              clipsX ? VulkanSceneUnsupportedField.OverflowX : VulkanSceneUnsupportedField.OverflowY,
              VulkanSceneUnsupportedPrimitive.RectClipMixedAxis)
            let pathDepthExceeded = activePathClipChainId >= 0
              && activePathClipChainId < frame.ClipChainCount
              && (activePathClipChainId == 0
                ? 0 : frame.ClipChains[activePathClipChainId].Depth) >= MaxPathClipDepth
            if pathDepthExceeded {
              RecordUnsupportedDetail(node, VulkanSceneUnsupportedField.ClipDepth,
                VulkanSceneUnsupportedPrimitive.RectClipDepth)
            }
          }
        }
      }
      var textComplete bool
      PaintNode(node, bounds, contentOpacity, transform.Index, axisAligned, childClipDepth,
        shapePaintClip, nodeContentClipChainId, overflowPathClipChainId, out textComplete)
      let inheritedChildClipIndex = clipIndex >= 0 ? clipIndex : context.ParentRectClipIndex
      var editorContentClipIndex int32 = -1
      var editorContentBounds ConservativeBounds
      if node.Kind == NodeKind.Editor {
        editorContentBounds = TextEditorContentBounds(node)
        if !editorContentBounds.IsEmpty && TextEditorSupported(node)
          && TextClipSupported(node, axisAligned, childClipDepth) {
            frame.SetActiveClipChain(overflowPathClipChainId)
            editorContentClipIndex = frame.AddRectClipBegin(RectClipRecord{
              Bounds: editorContentBounds,
              TransformIndex: transform.Index,
              ParentIndex: inheritedChildClipIndex,
            })
            clipCount = clipCount + 1
            childClipDepth = childClipDepth + 1
            PaintEditorContent(node, contentOpacity, transform.Index)
          }
      }
      frame.SetActiveClipChain(overflowPathClipChainId)
      frame.EndChunk()
      if retainedTextEligible {
        if textComplete && CaptureRetainedTextSnapshot(owner, chunk) {
          StoreRetainedTextFingerprint(node, owner, bounds, opacity,
            context.ParentTransformIndex, context.ParentRectClipDepth, context.ActiveClipBounds)
          frame.Chunks[chunk].RetentionState = SceneChunkRetentionState.ExactLeafRebuild
          IncrementSaturated(ref retainedText.Rebuild)
        } else {
          InvalidateRetainedText(owner)
          IncrementSaturated(ref retainedText.Fallback)
        }
      }
      emittedNodeCount = emittedNodeCount + 1

      let childClipIndex = editorContentClipIndex >= 0
      ? editorContentClipIndex : inheritedChildClipIndex
      var childClipBounds = context.ActiveClipBounds
      let resolvedTransform = ResolveCompilerFrameTransform(transform.Index)
      if clipIndex >= 0 {
        childClipBounds = IntersectBounds(childClipBounds,
          TransformCompilerBounds(paddingEdgeBounds, resolvedTransform))
      }
      if pathClip.Emitted {
        childClipBounds = IntersectBounds(childClipBounds,
          EmittedPathClipBounds(pathClip))
      }
      if roundedOverflowClip {
        childClipBounds = IntersectBounds(childClipBounds,
          EmittedPathClipBounds(VulkanScenePathClipResult{
            Emitted: true,
            ChainIndex: overflowPathClipChainId,
          }))
      }
      if mixedOverflowClip {
        childClipBounds = IntersectBounds(childClipBounds,
          EmittedPathClipBounds(VulkanScenePathClipResult{
            Emitted: true,
            ChainIndex: overflowPathClipChainId,
          }))
      }
      if editorContentClipIndex >= 0 {
        childClipBounds = IntersectBounds(childClipBounds,
          TransformCompilerBounds(editorContentBounds, resolvedTransform))
      }
      let childExactCullContextSafe = ExactCullContextForChildren(
        context.ExactCullContextSafe, node, isolates, axisAligned, overflowPreflight)
      let childContext = VulkanSceneTraversalContext{
        ParentTransformIndex: transform.Index,
        ParentRectClipIndex: childClipIndex,
        ParentOpacity: isolates ? 1.0F : opacity,
        ParentAxisAligned: axisAligned,
        ParentRectClipDepth: childClipDepth,
        ParentPathClipChainId: overflowPathClipChainId,
        ParentIsolation: context.ParentIsolation || isolates || node.HasTransformState
          || node.HasClipPath || clipsX || clipsY || node.ScrollX != 0.0F
          || node.ScrollY != 0.0F || node.BlendMode != BlendMode.Normal
          || editorContentClipIndex >= 0,
        ExactCullContextSafe: childExactCullContextSafe,
        ActiveClipBounds: childClipBounds,
      }
      let children = Stacking.Children(node)
      var index int32 = 0
      while index < children.Count
        && (node.Kind != NodeKind.Editor || editorContentClipIndex >= 0) {
          CompileNode(children[index], childContext)
          index = index + 1
        }

      if editorContentClipIndex >= 0 || clipIndex >= 0 {
        frame.SetActiveClipChain(context.ParentPathClipChainId)
        frame.BeginChunk(ownerId, frameVersion, bounds, false)
        if editorContentClipIndex >= 0 {
          frame.AddRectClipEnd(RectClipRecord{
            Bounds: editorContentBounds,
            TransformIndex: transform.Index,
            ParentIndex: inheritedChildClipIndex,
          })
        }
        if clipIndex >= 0 {
          frame.AddRectClipEnd(RectClipRecord{
            Bounds: paddingEdgeBounds,
            TransformIndex: transform.Index,
            ParentIndex: context.ParentRectClipIndex,
          })
        }
        frame.EndChunk()
      }
      if node.Kind != NodeKind.Shape && (HasBorderWidth(node, bounds)
          || (node.Kind == NodeKind.Image && boxShadowCount(node.BoxShadows) != 0)) {
            frame.SetActiveClipChain(activePathClipChainId)
            frame.BeginChunk(ownerId, frameVersion, bounds, true)
            if node.Kind == NodeKind.Image {
              PaintBoxShadows(node, bounds, contentOpacity, transform.Index, true)
            }
            PaintBorder(node, bounds, contentOpacity, transform.Index)
            frame.EndChunk()
          }
      if HasScrollBars(node) {
        frame.SetActiveClipChain(activePathClipChainId)
        frame.BeginChunk(ownerId, frameVersion, bounds, true)
        PaintScrollBars(node, contentOpacity, transform.Index)
        frame.EndChunk()
      }
      let outlineBounds = OutlineBounds(node, bounds)
      if !outlineBounds.IsEmpty {
        frame.SetActiveClipChain(activePathClipChainId)
        frame.BeginChunk(ownerId, frameVersion, outlineBounds, true)
        PaintOutline(node, bounds, contentOpacity, transform.Index)
        frame.EndChunk()
      }
      if isolates {
        frame.SetActiveClipChain(context.ParentPathClipChainId)
        frame.BeginChunk(ownerId, frameVersion, subtreeBounds, false)
        if combinesEffectAndBlend {
          frame.AddLayerEnd(innerLayerRecord)
          frame.AddLayerEnd(outerLayerRecord)
        } else {
          frame.AddLayerEnd(layerRecord)
        }
        frame.EndChunk()
      }
      frame.SetActiveClipChain(context.ParentPathClipChainId)
    }

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
    transformIndex int32,
    parentChainId int32) VulkanScenePathClipResult{
      if !TryResolvePathClipParentDepth(parentChainId, out var parentDepth) {
        return VulkanScenePathClipResult{}
      }
      let strokeWidth = node.BorderLeftWidth.Px
      let strokeInset = if node.ShapeStrokeInset { strokeWidth } else { 0.0F }
      let halfStroke = strokeInset * 0.5F
      let paddingLeft = resolveEdgePadding(node, YGEdge.Left, bounds.Width)
      let paddingTop = resolveEdgePadding(node, YGEdge.Top, bounds.Width)
      let paddingRight = resolveEdgePadding(node, YGEdge.Right, bounds.Width)
      let paddingBottom = resolveEdgePadding(node, YGEdge.Bottom, bounds.Width)
      let contentLeft = bounds.X + paddingLeft + halfStroke
      let contentTop = bounds.Y + paddingTop + halfStroke
      let contentWidth = bounds.Width - paddingLeft - paddingRight - strokeInset
      let contentHeight = bounds.Height - paddingTop - paddingBottom - strokeInset
      let mapping = PathGeometry.Map(node.ShapePath, node.ShapeFit,
        contentLeft, contentTop, contentWidth, contentHeight)
      let shapePath = if mapping.Valid {
        PathRoundedCache.Shared.Resolve(node.ShapePath, mapping, node.ShapeCornerRadius)
      } else {
        VectorPath.Empty
      }
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
        case linear is CompiledVectorLinearGradient: VulkanSceneUnsupportedPrimitive.LinearGradient
        case radial is CompiledVectorRadialGradient: VulkanSceneUnsupportedPrimitive.RadialGradient
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

  private func Owner(node Node) VulkanSceneOwnerId {
    if Object.ReferenceEquals(node.VulkanOwnerToken, ownerToken) {
      if let cached = node.VulkanOwner { return cached }
    }
    if owners.TryGetValue(node, out var existing) {
      node.VulkanOwnerToken = ownerToken
      node.VulkanOwner = existing
      return existing
    }
    if nextOwnerId >= OverflowClipMaskBit {
      throw OverflowException("Vulkan scene owner id overflow")
    }
    let value = VulkanSceneOwnerId(nextOwnerId)
    owners.Add(node, value)
    node.VulkanOwnerToken = ownerToken
    node.VulkanOwner = value
    nextOwnerId = nextOwnerId + 1uL
    return value
  }

  private func OwnerId(node Node) uint64 -> Owner(node).Value

  private func MarkUnsupportedNode(node Node) {
    switch node.Kind {
      case NodeKind.Text {
        if textScene == nil {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Text,
            VulkanSceneUnsupportedField.None,
            VulkanSceneUnsupportedPrimitive.Text)
          unsupportedNodeCount = unsupportedNodeCount + 1
        }
      }
      case NodeKind.Image {
        let source = node.ImageSource
        if (node.ImagePath != "" && source == nil)
          || (source != nil && imageScene == nil) {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Image,
              VulkanSceneUnsupportedField.None,
              VulkanSceneUnsupportedPrimitive.Image)
            unsupportedNodeCount = unsupportedNodeCount + 1
          }
      }
      case NodeKind.Shape {
        if node.ShapePath.CommandCount != 0 && pathScene == nil {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Shape,
            VulkanSceneUnsupportedField.None,
            VulkanSceneUnsupportedPrimitive.Shape)
          unsupportedNodeCount = unsupportedNodeCount + 1
        }
      }
      case NodeKind.Entry {
        if !TextEntrySupported(node) {
          MarkUnsupported(node, VulkanSceneUnsupportedKind.Entry,
            VulkanSceneUnsupportedField.None,
            VulkanSceneUnsupportedPrimitive.TextEntry)
          unsupportedNodeCount = unsupportedNodeCount + 1
        }
      }
      case NodeKind.Editor {
        if let _ = node.EditorState {
          if !TextEditorSupported(node) {
            MarkUnsupported(node, VulkanSceneUnsupportedKind.Editor,
              VulkanSceneUnsupportedField.None,
              VulkanSceneUnsupportedPrimitive.TextEditor)
            unsupportedNodeCount = unsupportedNodeCount + 1
          }
        }
      }
      case _ { }
    }
  }

  private func MarkUnsupported(kind VulkanSceneUnsupportedKind) {
    unsupportedMask = unsupportedMask | uint32(kind)
    unsupportedPrimitiveCount = unsupportedPrimitiveCount + 1
  }

  private func MarkUnsupported(node Node, kind VulkanSceneUnsupportedKind,
    field VulkanSceneUnsupportedField, primitive VulkanSceneUnsupportedPrimitive) {
      MarkUnsupported(kind)
      RecordUnsupportedDetail(node, field, primitive)
    }

  private func RecordUnsupportedDetail(node Node, field VulkanSceneUnsupportedField,
    primitive VulkanSceneUnsupportedPrimitive) {
      if unsupportedDetailCount >= unsupportedDetails.Length {
        unsupportedDetailDropped = unsupportedDetailDropped + 1
        return
      }
      unsupportedDetails[unsupportedDetailCount] = VulkanSceneUnsupportedDetail{
        OwnerId: OwnerId(node),
        NodeKind: node.Kind,
        Blob: BlobKind(node),
        Field: field,
        Primitive: primitive,
      }
      unsupportedDetailCount = unsupportedDetailCount + 1
    }

  private func BlobKind(node Node) VulkanSceneUnsupportedBlobKind {
    switch node.Kind {
      case NodeKind.Container { return VulkanSceneUnsupportedBlobKind.Container }
      case NodeKind.Button { return VulkanSceneUnsupportedBlobKind.Button }
      case NodeKind.Text { return VulkanSceneUnsupportedBlobKind.Text }
      case NodeKind.Entry { return VulkanSceneUnsupportedBlobKind.TextEntry }
      case NodeKind.Editor { return VulkanSceneUnsupportedBlobKind.TextEditor }
      case NodeKind.Shape { return VulkanSceneUnsupportedBlobKind.Shape }
      case NodeKind.Image { return VulkanSceneUnsupportedBlobKind.Image }
      case _ { return VulkanSceneUnsupportedBlobKind.None }
    }
  }
}
