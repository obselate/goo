package Goo

import Facebook.Yoga
import System
import System.Runtime.CompilerServices

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

}
