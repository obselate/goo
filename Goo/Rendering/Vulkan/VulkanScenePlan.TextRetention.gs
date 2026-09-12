package Goo

import System

internal class VulkanRetainedTextValidation {
  shared {
    internal func ValidRuns(segment VulkanRetainedTextSegment) bool {
      var index int32 = 0
      var count int32 = 0
      while index < segment.RunCount {
        let run = segment.Runs[index]
        if run.FirstInstance != count || run.InstanceCount <= 0
          || run.PipelineKind > 1u
          || !run.AtlasId.IsValid
          || run.AtlasId.Kind != SceneResourceKind.Atlas
          || run.InstanceCount > segment.GlyphCount - count{
            return false
          }
        count = count + run.InstanceCount
        index = index + 1
      }
      return count == segment.GlyphCount
    }

    internal func ValidBounds(value ConservativeBounds) bool -> !value.IsEmpty
      && !Single.IsNaN(value.X) && !Single.IsInfinity(value.X)
      && !Single.IsNaN(value.Y) && !Single.IsInfinity(value.Y)
      && !Single.IsNaN(value.Width) && !Single.IsInfinity(value.Width)
      && !Single.IsNaN(value.Height) && !Single.IsInfinity(value.Height)
  }
}

internal partial class SceneFrame {
  internal func AppendRetainedTextSnapshot(
    ownerId uint64,
    version uint64,
    snapshot VulkanRetainedTextSnapshot,
    ownRectClip bool,
    rectClip RectClipRecord) bool{
      RequireClosedChunk()
      let clipDrawCount = ownRectClip ? 2 : 0
      if activeClipChainId != 0 || snapshot.SegmentCount < 0
        || snapshot.ResourceCount < 0
        || snapshot.SegmentCount > snapshot.Segments.Length
        || drawRefCount > Int32.MaxValue - clipDrawCount
        || snapshot.SegmentCount > Int32.MaxValue - drawRefCount - clipDrawCount
        || snapshot.ResourceCount > Int32.MaxValue - resourceRefCount{
          return false
        }

      var expectedResources int32 = 0
      var index int32 = 0
      while index < snapshot.SegmentCount {
        var value = snapshot.Segments[index]
        value.FirstInstance = -1
        guard let segment = value.Segment else {
          return false
        }
        if !ValidRetainedTextSegment(value, segment) {
          return false
        }
        if segment.GlyphCount > Int32.MaxValue - segment.RunCount {
          return false
        }
        let segmentResourceCount = segment.GlyphCount + segment.RunCount
        if expectedResources > snapshot.ResourceCount
          || segmentResourceCount > snapshot.ResourceCount - expectedResources{
            return false
          }
        expectedResources = expectedResources + segmentResourceCount
        index = index + 1
      }
      if expectedResources != snapshot.ResourceCount {
        return false
      }

      let chunk = BeginChunk(ownerId, version, snapshot.ChunkBounds, true)
      if ownRectClip {
        AddRectClipBegin(rectClip)
      }
      index = 0
      while index < snapshot.SegmentCount {
        var value = snapshot.Segments[index]
        value.FirstInstance = -1
        guard let segment = value.Segment else {
          throw InvalidOperationException("retained text segment is unavailable")
        }
        AppendValidatedRetainedTextSegment(value, segment)
        index = index + 1
      }
      chunks[chunk].RetentionState = SceneChunkRetentionState.ExactLeafHit
      EndChunk()
      if ownRectClip {
        BeginChunk(ownerId, version, rectClip.Bounds, false)
        AddRectClipEnd(rectClip)
        EndChunk()
      }
      return true
    }

  private func AppendValidatedRetainedTextSegment(
    value CachedTextSegmentRefRecord,
    segment VulkanRetainedTextSegment) {
      RequireOpenChunk()
      Grow[CachedTextSegmentRefRecord](&cachedTextSegments, cachedTextSegmentCount, NextCount(cachedTextSegmentCount))
      Grow[ResourceId](&resourceRefs, resourceRefCount, resourceRefCount + segment.GlyphCount + segment.RunCount)
      var glyphIndex int32 = 0
      while glyphIndex < segment.GlyphCount {
        AddResourceReference(segment.GlyphResources[glyphIndex])
        glyphIndex = glyphIndex + 1
      }
      var runIndex int32 = 0
      while runIndex < segment.RunCount {
        AddResourceReference(segment.Runs[runIndex].AtlasId)
        runIndex = runIndex + 1
      }
      let index = cachedTextSegmentCount
      cachedTextSegments[index] = value
      cachedTextSegmentCount = NextCount(cachedTextSegmentCount)
      recordOperations = recordOperations + 1uL
      AppendDrawRef(DrawRef{ Kind: SceneDrawKind.CachedTextSegment, Index: index,
        Flags: 0u, ClipChainId: value.ClipChainId })
    }

  private func ValidRetainedTextSegment(
    value CachedTextSegmentRefRecord,
    segment VulkanRetainedTextSegment) bool -> value.SegmentId != 0uL
    && value.SegmentId == segment.Id
    && value.SegmentVersion != 0uL
    && value.SegmentVersion == segment.Version
    && value.GlyphCount > 0
    && value.GlyphCount == segment.GlyphCount
    && value.ClipChainId == activeClipChainId
    && value.FirstInstance == -1
    && segment.AtlasGeneration != 0uL
    && segment.RecordCount == segment.GlyphCount
    && segment.RecordCount > 0
    && segment.RecordCount <= segment.Records.Length
    && segment.GlyphResourceCount == segment.GlyphCount
    && segment.GlyphResourceCount <= segment.GlyphResources.Length
    && segment.GlyphCount <= segment.GlyphAtlasTexelOffsets.Length
    && segment.GlyphCount <= segment.GlyphAtlasTexelCounts.Length
    && segment.GlyphCount <= segment.GlyphEffectAtlasTexelOffsets.Length
    && segment.GlyphCount <= segment.GlyphEffectAtlasTexelCounts.Length
    && segment.RunCount > 0
    && segment.RunCount <= segment.Runs.Length
    && VulkanRetainedTextValidation.ValidBounds(value.Bounds)
    && value.Bounds.X == segment.Bounds.X
    && value.Bounds.Y == segment.Bounds.Y
    && value.Bounds.Width == segment.Bounds.Width
    && value.Bounds.Height == segment.Bounds.Height
    && VulkanRetainedTextValidation.ValidRuns(segment)

}
