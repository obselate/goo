package Goo

import System

internal struct VulkanSceneTextChunkProof {
  internal var HasText bool
  internal var CachedTextSegmentStart int32
  internal var CachedTextSegmentCount int32
}

internal struct VulkanSceneImageChunkProof {
  internal var HasImage bool
  internal var CachedImageStart int32
  internal var CachedImageCount int32
}

internal struct VulkanSceneCachedImageProof {
  internal var Bounds ConservativeBounds
  internal var SourceX float32
  internal var SourceY float32
  internal var SourceWidth float32
  internal var SourceHeight float32
  internal var Opacity float32
  internal var Sampling uint32
  internal var TransformIndex int32
}

internal class VulkanSceneRetentionProofStore {
  private var chunks []VulkanSceneChunkIdentity
  private var draws []VulkanSceneDrawIdentity
  private var nextDraws []VulkanSceneDrawIdentity
  private var resources []ResourceId
  private var nextResources []ResourceId
  private var textProofs []VulkanSceneTextChunkProof
  private var nextTextProofs []VulkanSceneTextChunkProof
  private var imageProofs []VulkanSceneImageChunkProof
  private var nextImageProofs []VulkanSceneImageChunkProof
  private var cachedTextSegments []CachedTextSegmentRefRecord
  private var nextCachedTextSegments []CachedTextSegmentRefRecord
  private var cachedImages []VulkanSceneCachedImageProof
  private var nextCachedImages []VulkanSceneCachedImageProof
  private var chunkCount int32
  private var drawCount int32
  private var resourceCount int32
  private var cachedTextSegmentCount int32
  private var cachedImageCount int32
  private var ready bool

  internal init(capacity int32) {
    if capacity <= 0 {
      throw ArgumentOutOfRangeException("capacity")
    }
    chunks = [capacity]VulkanSceneChunkIdentity
    draws = [capacity]VulkanSceneDrawIdentity
    nextDraws = [capacity]VulkanSceneDrawIdentity
    resources = [capacity]ResourceId
    nextResources = [capacity]ResourceId
    textProofs = [capacity]VulkanSceneTextChunkProof
    nextTextProofs = [capacity]VulkanSceneTextChunkProof
    imageProofs = [capacity]VulkanSceneImageChunkProof
    nextImageProofs = [capacity]VulkanSceneImageChunkProof
    cachedTextSegments = [capacity]CachedTextSegmentRefRecord
    nextCachedTextSegments = [capacity]CachedTextSegmentRefRecord
    cachedImages = [capacity]VulkanSceneCachedImageProof
    nextCachedImages = [capacity]VulkanSceneCachedImageProof
  }

  internal prop Ready bool{
    get -> ready
  }

  internal prop ChunkCount int32{
    get -> chunkCount
  }

  internal prop Chunks []VulkanSceneChunkIdentity{
    get -> chunks
  }

  internal prop Draws []VulkanSceneDrawIdentity{
    get -> draws
  }

  internal prop Resources []ResourceId{
    get -> resources
  }

  internal prop TextProofs []VulkanSceneTextChunkProof{
    get -> textProofs
  }

  internal prop CachedTextSegments []CachedTextSegmentRefRecord{
    get -> cachedTextSegments
  }

  internal prop CachedTextSegmentCount int32{
    get -> cachedTextSegmentCount
  }

  internal prop ImageProofs []VulkanSceneImageChunkProof{
    get -> imageProofs
  }

  internal prop CachedImages []VulkanSceneCachedImageProof{
    get -> cachedImages
  }

  internal prop CachedImageCount int32{
    get -> cachedImageCount
  }

  internal func EnsureFor(frame SceneFrame) {
    if frame == nil {
      throw ArgumentNullException("frame")
    }
    EnsureChunkCapacity(frame.ChunkCount)
    var requiredDraws int64 = 0L
    var requiredResources int64 = 0L
    var requiredSegments int64 = 0L
    var requiredImages int64 = 0L
    var chunkIndex int32 = 0
    while chunkIndex < frame.ChunkCount {
      let chunk = frame.Chunks[chunkIndex]
      if chunk.RetentionState == SceneChunkRetentionState.Generic {
        if chunk.FirstDraw < 0 || chunk.DrawCount < 0
          || chunk.FirstDraw > frame.DrawRefCount
          || chunk.DrawCount > frame.DrawRefCount - chunk.FirstDraw
          || chunk.FirstResource < 0 || chunk.ResourceCount < 0
          || chunk.FirstResource > frame.ResourceRefCount
          || chunk.ResourceCount > frame.ResourceRefCount - chunk.FirstResource{
            throw InvalidOperationException("Vulkan retained scene chunk range is invalid")
          }
        requiredDraws = requiredDraws + int64(chunk.DrawCount)
        requiredResources = requiredResources + int64(chunk.ResourceCount)
        var drawIndex int32 = 0
        while drawIndex < chunk.DrawCount {
          let kind = frame.DrawRefs[chunk.FirstDraw + drawIndex].Kind
          if kind == SceneDrawKind.CachedTextSegment {
            requiredSegments = requiredSegments + 1L
          } else if kind == SceneDrawKind.CachedImage {
            requiredImages = requiredImages + 1L
          }
          drawIndex = drawIndex + 1
        }
      }
      chunkIndex = chunkIndex + 1
    }
    if requiredDraws > int64(Int32.MaxValue)
      || requiredResources > int64(Int32.MaxValue)
      || requiredSegments > int64(Int32.MaxValue)
      || requiredImages > int64(Int32.MaxValue) {
        throw InvalidOperationException("Vulkan retained scene proof capacity is exhausted")
      }
    EnsureDrawCapacity(int32(requiredDraws))
    EnsureResourceCapacity(int32(requiredResources))
    EnsureSegmentCapacity(int32(requiredSegments))
    EnsureImageCapacity(int32(requiredImages))
  }

  internal func Capture(frame SceneFrame) {
    EnsureFor(frame)
    var drawCursor int32 = 0
    var resourceCursor int32 = 0
    var segmentCursor int32 = 0
    var imageCursor int32 = 0
    var index int32 = 0
    while index < frame.ChunkCount {
      let current = frame.Chunks[index]
      var proofDrawStart int32 = -1
      var proofResourceStart int32 = -1
      var proofValid = false
      var textProof = VulkanSceneTextChunkProof{
        HasText: false,
        CachedTextSegmentStart: -1,
        CachedTextSegmentCount: 0,
      }
      var imageProof = VulkanSceneImageChunkProof{
        HasImage: false,
        CachedImageStart: -1,
        CachedImageCount: 0,
      }
      if current.RetentionState == SceneChunkRetentionState.Generic {
        proofDrawStart = drawCursor
        proofResourceStart = resourceCursor
        proofValid = true
        var drawIndex int32 = 0
        while drawIndex < current.DrawCount {
          let reference = frame.DrawRefs[current.FirstDraw + drawIndex]
          var retained = VulkanSceneDrawIdentity{
            Kind: reference.Kind,
            Flags: reference.Flags,
            ClipChainId: reference.ClipChainId,
            Solid: SolidBoxRecord{},
            Rounded: RoundedBoxRecord{},
            Border: PerEdgeBorderRecord{},
          }
          if reference.Kind == SceneDrawKind.SolidBox {
            retained.Solid = frame.SolidBoxes[reference.Index]
          } else if reference.Kind == SceneDrawKind.RoundedBox {
            retained.Rounded = frame.RoundedBoxes[reference.Index]
          } else if reference.Kind == SceneDrawKind.PerEdgeBorder {
            retained.Border = frame.PerEdgeBorders[reference.Index]
          } else if reference.Kind == SceneDrawKind.CachedImage {
            if !imageProof.HasImage {
              imageProof.HasImage = true
              imageProof.CachedImageStart = imageCursor
            }
            let currentImage = frame.CachedImages[reference.Index]
            nextCachedImages[imageCursor] = VulkanSceneCachedImageProof{
              Bounds: currentImage.Bounds,
              SourceX: currentImage.SourceX,
              SourceY: currentImage.SourceY,
              SourceWidth: currentImage.SourceWidth,
              SourceHeight: currentImage.SourceHeight,
              Opacity: currentImage.Opacity,
              Sampling: currentImage.Sampling,
              TransformIndex: currentImage.TransformIndex,
            }
            imageCursor = imageCursor + 1
            imageProof.CachedImageCount = imageProof.CachedImageCount + 1
          } else if reference.Kind == SceneDrawKind.CachedTextSegment {
            if !textProof.HasText {
              textProof.HasText = true
              textProof.CachedTextSegmentStart = segmentCursor
            }
            nextCachedTextSegments[segmentCursor] =
            frame.CachedTextSegments[reference.Index]
            segmentCursor = segmentCursor + 1
            textProof.CachedTextSegmentCount =
            textProof.CachedTextSegmentCount + 1
          } else {
            proofValid = false
          }
          nextDraws[drawCursor] = retained
          drawCursor = drawCursor + 1
          drawIndex = drawIndex + 1
        }
        var resourceIndex int32 = 0
        while resourceIndex < current.ResourceCount {
          nextResources[resourceCursor] = frame.ResourceRefs[
            current.FirstResource + resourceIndex]
          resourceCursor = resourceCursor + 1
          resourceIndex = resourceIndex + 1
        }
      }
      nextTextProofs[index] = textProof
      nextImageProofs[index] = imageProof
      var exactLeafKind SceneDrawKind = SceneDrawKind.SolidBox
      if current.RetentionState != SceneChunkRetentionState.Generic
        && current.DrawCount == 1 {
          exactLeafKind = frame.DrawRefs[current.FirstDraw].Kind
        }
      chunks[index] = VulkanSceneChunkIdentity{
        OwnerId: current.OwnerId,
        Version: current.Version,
        Bounds: current.Bounds,
        ContentKey: current.ContentKey,
        TopologyKey: current.TopologyKey,
        RetentionState: current.RetentionState,
        ExactLeafKind: exactLeafKind,
        ProofDrawStart: proofDrawStart,
        ProofDrawCount: current.DrawCount,
        ProofResourceStart: proofResourceStart,
        ProofResourceCount: current.ResourceCount,
        ProofValid: proofValid,
      }
      index = index + 1
    }
    let previousDraws = draws
    draws = nextDraws
    nextDraws = previousDraws
    let previousResources = resources
    resources = nextResources
    nextResources = previousResources
    let previousTextProofs = textProofs
    textProofs = nextTextProofs
    nextTextProofs = previousTextProofs
    let previousImageProofs = imageProofs
    imageProofs = nextImageProofs
    nextImageProofs = previousImageProofs
    let previousSegments = cachedTextSegments
    cachedTextSegments = nextCachedTextSegments
    nextCachedTextSegments = previousSegments
    let previousImages = cachedImages
    cachedImages = nextCachedImages
    nextCachedImages = previousImages
    chunkCount = frame.ChunkCount
    drawCount = drawCursor
    resourceCount = resourceCursor
    cachedTextSegmentCount = segmentCursor
    cachedImageCount = imageCursor
    ready = true
  }

  private func EnsureChunkCapacity(required int32) {
    let capacity = ArrayGrowthCapacity(Max(chunks.Length,
      Max(textProofs.Length, nextTextProofs.Length)), required, 1)
    if capacity > chunks.Length {
      let expanded = [capacity]VulkanSceneChunkIdentity
      Array.Copy(chunks, expanded, chunkCount)
      chunks = expanded
    }
    if capacity > textProofs.Length {
      let expanded = [capacity]VulkanSceneTextChunkProof
      Array.Copy(textProofs, expanded, chunkCount)
      textProofs = expanded
    }
    if capacity > nextTextProofs.Length {
      nextTextProofs = [capacity]VulkanSceneTextChunkProof
    }
    if capacity > imageProofs.Length {
      let expanded = [capacity]VulkanSceneImageChunkProof
      Array.Copy(imageProofs, expanded, chunkCount)
      imageProofs = expanded
    }
    if capacity > nextImageProofs.Length {
      nextImageProofs = [capacity]VulkanSceneImageChunkProof
    }
  }

  private func EnsureDrawCapacity(required int32) {
    let capacity = ArrayGrowthCapacity(Max(draws.Length, nextDraws.Length), required, 1)
    if capacity > draws.Length {
      let expanded = [capacity]VulkanSceneDrawIdentity
      Array.Copy(draws, expanded, drawCount)
      draws = expanded
    }
    if capacity > nextDraws.Length {
      nextDraws = [capacity]VulkanSceneDrawIdentity
    }
  }

  private func EnsureResourceCapacity(required int32) {
    let capacity = ArrayGrowthCapacity(Max(resources.Length, nextResources.Length), required, 1)
    if capacity > resources.Length {
      let expanded = [capacity]ResourceId
      Array.Copy(resources, expanded, resourceCount)
      resources = expanded
    }
    if capacity > nextResources.Length {
      nextResources = [capacity]ResourceId
    }
  }

  private func EnsureSegmentCapacity(required int32) {
    let capacity = ArrayGrowthCapacity(Max(cachedTextSegments.Length,
      nextCachedTextSegments.Length), required, 1)
    if capacity > cachedTextSegments.Length {
      let expanded = [capacity]CachedTextSegmentRefRecord
      Array.Copy(cachedTextSegments, expanded, cachedTextSegmentCount)
      cachedTextSegments = expanded
    }
    if capacity > nextCachedTextSegments.Length {
      nextCachedTextSegments = [capacity]CachedTextSegmentRefRecord
    }
  }

  private func EnsureImageCapacity(required int32) {
    let capacity = ArrayGrowthCapacity(Max(cachedImages.Length,
      nextCachedImages.Length), required, 1)
    if capacity > cachedImages.Length {
      let expanded = [capacity]VulkanSceneCachedImageProof
      Array.Copy(cachedImages, expanded, cachedImageCount)
      cachedImages = expanded
    }
    if capacity > nextCachedImages.Length {
      nextCachedImages = [capacity]VulkanSceneCachedImageProof
    }
  }

  private func Max(left int32, right int32) int32
  -> left > right ? left : right
}
