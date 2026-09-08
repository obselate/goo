package Goo

import System
import System.Diagnostics
import System.Threading

import Hexa.NET.SDL3
internal data struct VulkanPresentationLatencyTestSample {
  internal var Token uint64
  internal var Kind int32
  internal var StartTimestamp int64
  internal var HandoffTimestamp int64
  internal var CompletionObservedTimestamp int64
  internal var PresentId uint64
  internal var PresentFenceObserved bool
}

internal data struct VulkanSceneRetentionTestSnapshot {
  internal var SceneVersion uint64
  internal var ActiveImageIndex uint32
  internal var ActiveSceneVersion uint64
  internal var ActiveAppliedSceneVersion uint64
  internal var ActivePendingSceneVersion uint64
  internal var AcquiredImageState bool
  internal var SwapchainImageCount uint32
  internal var InitializedImageCount uint32
  internal var MinimumImageSceneVersion uint64
  internal var AppliedImageCount uint32
  internal var ActiveImagePromoted bool
  internal var PendingImageCount uint32
  internal var PendingSceneVersion uint64
  internal var DamageX int32
  internal var DamageY int32
  internal var DamageWidth int32
  internal var DamageHeight int32
  internal var PartialRedraw bool
  internal var FullRedraw bool
  internal var DirtyChunkCount uint32
  internal var ReusedChunkCount uint32
  internal var SkippedNodeCount int32
  internal var ExactTextClipCandidateCount int32
  internal var ExactTextClipCullCount int32
  internal var CachedTextPaintCullCount int32
  internal var TextLayoutRequestCount int32
  internal var DrawCount int32
  internal var ResourceCount int32
  internal var TextSegmentCount int32
  internal var RetainedLeafHitCount uint64
  internal var RetainedLeafRebuildCount uint64
  internal var RetainedLeafFallbackCount uint64
  internal var RetainedLeafInvalidationCount uint64
  internal var RetainedLeafTotalCount uint64
  internal var RetainedTextHitCount uint64
  internal var RetainedTextRebuildCount uint64
  internal var RetainedTextFallbackCount uint64
  internal var RetainedTextInvalidationCount uint64
  internal var RetainedTextTotalCount uint64
  internal var RetainedBorderHitCount uint64
  internal var RetainedBorderRebuildCount uint64
  internal var RetainedBorderFallbackCount uint64
  internal var RetainedBorderInvalidationCount uint64
  internal var RetainedBorderTotalCount uint64
  internal var RetainedParentBoxHitCount uint64
  internal var RetainedParentBoxRebuildCount uint64
  internal var RetainedParentBoxFallbackCount uint64
  internal var RetainedParentBoxInvalidationCount uint64
  internal var RetainedParentBoxTotalCount uint64
  internal var RoundedLeafCount uint32
  internal var RoundedLeafBoundsX float32
  internal var RoundedLeafBoundsY float32
  internal var RoundedLeafBoundsWidth float32
  internal var RoundedLeafBoundsHeight float32
  internal var RoundedLeafRadiusTopLeft float32
  internal var RoundedLeafRadiusTopRight float32
  internal var RoundedLeafRadiusBottomRight float32
  internal var RoundedLeafRadiusBottomLeft float32
  internal var RoundedLeafColor uint32
  internal var RoundedLeafOpacity float32
  internal var MutatedSolidLeafFound bool
  internal var MutatedSolidLeafBoundsX float32
  internal var MutatedSolidLeafBoundsY float32
  internal var MutatedSolidLeafBoundsWidth float32
  internal var MutatedSolidLeafBoundsHeight float32
  internal var MutatedSolidLeafColor uint32
  internal var MutatedSolidLeafOpacity float32
  internal var BorderLeafFound bool
  internal var BorderLeafCount uint32
  internal var BorderLeafBoundsX float32
  internal var BorderLeafBoundsY float32
  internal var BorderLeafBoundsWidth float32
  internal var BorderLeafBoundsHeight float32
  internal var BorderLeafTopWidth float32
  internal var BorderLeafRightWidth float32
  internal var BorderLeafBottomWidth float32
  internal var BorderLeafLeftWidth float32
  internal var BorderLeafRadiusTopLeft float32
  internal var BorderLeafRadiusTopRight float32
  internal var BorderLeafRadiusBottomRight float32
  internal var BorderLeafRadiusBottomLeft float32
  internal var BorderLeafTopColor uint32
  internal var BorderLeafRightColor uint32
  internal var BorderLeafBottomColor uint32
  internal var BorderLeafLeftColor uint32
  internal var BorderLeafStyle uint32
  internal var BorderLeafTransformIndex int32
}

internal data struct VulkanClipMaskRetentionTestSnapshot {
  internal var SlotIndex int32
  internal var DrawCount int32
  internal var MaskCount int32
  internal var ClipChainCount int32
  internal var LayerCount int32
  internal var ByteCount VkDeviceSize
  internal var WrittenBytes VkDeviceSize
  internal var SkippedBytes VkDeviceSize
  internal var MappedWrites uint64
  internal var Flushes uint64
  internal var RetainedReuse uint64
  internal var RetentionEligible bool
  internal var Retained bool
  internal var RetentionValid bool
  internal var TotalWrittenBytes VkDeviceSize
  internal var TotalSkippedBytes VkDeviceSize
  internal var TotalMappedWrites uint64
  internal var TotalFlushes uint64
  internal var TotalRetainedReuse uint64
}

internal data struct VulkanPrimitiveFrameRetentionTestSnapshot {
  internal var SlotIndex int32
  internal var RecordCount int32
  internal var ByteCount VkDeviceSize
  internal var Capacity VkDeviceSize
  internal var BufferGeneration uint64
  internal var PlannedTransferBytes VkDeviceSize
  internal var SkippedTransferBytes VkDeviceSize
  internal var DirtyRecordCount int32
  internal var UploadRangeCount int32
  internal var FullUpload bool
  internal var CpuWriteOperations uint64
  internal var NativeFlushCalls uint64
  internal var RetainedReuse uint64
  internal var LastUseSerial uint64
  internal var Prepared bool
  internal var CpuWrittenBytes uint64
  internal var TotalCpuWrittenBytes uint64
  internal var CpuComparedBytes uint64
  internal var TotalCpuComparedBytes uint64
  internal var HistoryCopiedBytes uint64
  internal var TotalHistoryCopiedBytes uint64
  internal var FlushRequests uint64
  internal var TotalFlushRequests uint64
  internal var SubmittedTransferBytes uint64
  internal var TotalSubmittedTransferBytes uint64
  internal var RecordedCopyCommands uint64
  internal var TotalRecordedCopyCommands uint64
  internal var RecordedBarriers uint64
  internal var TotalRecordedBarriers uint64
  internal var TotalPlannedTransferBytes VkDeviceSize
  internal var TotalSkippedTransferBytes VkDeviceSize
  internal var TotalDirtyRecordCount uint64
  internal var TotalUploadRangeCount uint64
  internal var TotalFullUploads uint64
  internal var TotalCpuWriteOperations uint64
  internal var TotalNativeFlushCalls uint64
  internal var TotalRetainedReuse uint64
}
internal data struct VulkanTextFrameRetentionTestSnapshot {
  internal var SlotIndex int32
  internal var SegmentCount int32
  internal var RunCount int32
  internal var RecordCount int32
  internal var ByteCount VkDeviceSize
  internal var Capacity VkDeviceSize
  internal var BufferGeneration uint64
  internal var TopologyKey uint64
  internal var WrittenBytes VkDeviceSize
  internal var SkippedBytes VkDeviceSize
  internal var DirtySegmentCount int32
  internal var UploadRangeCount int32
  internal var FullUpload bool
  internal var MappedWrites uint64
  internal var Flushes uint64
  internal var RetainedReuse uint64
  internal var LastUseSerial uint64
  internal var Prepared bool
  internal var TotalSegmentCount uint64
  internal var TotalRunCount uint64
  internal var TotalRecordCount uint64
  internal var TotalWrittenBytes VkDeviceSize
  internal var TotalSkippedBytes VkDeviceSize
  internal var TotalDirtySegmentCount uint64
  internal var TotalUploadRangeCount uint64
  internal var TotalFullUploads uint64
  internal var TotalMappedWrites uint64
  internal var TotalFlushes uint64
  internal var TotalRetainedReuse uint64
  internal var TotalCapacity VkDeviceSize
  internal var TotalBufferGeneration uint64
  internal var TotalLastUseSerial uint64
  internal var TotalPrepared uint64
}

internal data struct VulkanFrameSubmissionTestSnapshot {
  internal var Slot0Serial uint64
  internal var Slot1Serial uint64
}
internal data struct VulkanGraphicsTimelineTestSnapshot {
  internal var Available bool
  internal var Timeline uint64
  internal var RuntimeGeneration uint64
  internal var LastEnqueuedSerial uint64
  internal var CompletedSerial uint64
  internal var CompletedResult VkResult
  internal var PendingWindowSerial uint64
  internal var ReadbackSerial uint64
  internal var ReadbackPendingReconcile bool
}
internal data struct VulkanGraphicsTimelineValidationTestSnapshot {
  internal var Threw bool
  internal var MailboxIdle bool
  internal var SerialBefore uint64
  internal var SerialAfter uint64
  internal var MailboxSerial uint64
}
internal data struct VulkanShaderEffectPipelineIdentityTestSnapshot {
  internal var EntryCount int32
  internal var UniquePipelineCount int32
  internal var FirstPipeline uint64
  internal var AllHandlesEqual bool
  internal var SameObjectStable bool
}
internal data struct VulkanWindowFramebufferExtentTestSnapshot {
  internal var Width int32
  internal var Height int32
}

internal partial class VulkanWindowTarget {
  internal func MaterializePipelineCacheForTest() VulkanPipelineCacheMetrics {
    guard let activeRuntime = runtime else {
      return VulkanPipelineCacheMetrics{}
    }
    guard let activeGeneration = generation else {
      return activeRuntime.PipelineCache.Metrics
    }
    activeRuntime.PrimitiveState.PipelinesFor(activeGeneration.Format).MaterializePipelines()
    activeRuntime.PrimitiveState.ClipMaskPipelineFor(VulkanClipMaskFormat.R8Unorm)
    activeRuntime.PrimitiveState.ClipMaskPipelineFor(VulkanClipMaskFormat.Rgba8Unorm)
    return activeRuntime.PipelineCache.Metrics
  }

  internal func DiagnosticCountersSnapshotForTest() VulkanDiagnosticCounterSnapshot {
    if let current = diagnostics {
      return current.Counters
    }
    return VulkanDiagnosticCounterSnapshot{}
  }
  internal func ImageResourceStatsForTest() VulkanImageResourceStats ->
  imageResources?.Stats ?? VulkanImageResourceStats{}
  internal func TimestampSupportedForTest() bool {
    if let current = timestampState {
      return current.TimestampQueriesSupported
    }
    return false
  }

  internal func SetMainPassTimestampSinkForTest(
    sink Action[VulkanDiagnosticTimestampSnapshot]?) {
      timestampState?.SetMainPassTimestampSink(sink)
    }
  internal func SetAllTimestampSinkForTest(
    sink Action[VulkanDiagnosticTimestampSnapshot]?) {
      timestampState?.SetAllTimestampSink(sink)
    }

  internal func DiagnosticFrameIdForTest() uint64 -> nextFrameId
  internal func FramebufferExtentForTest()
  VulkanWindowFramebufferExtentTestSnapshot{
    if let current = generation {
      return VulkanWindowFramebufferExtentTestSnapshot{
        Width: int32(current.Extent.width),
        Height: int32(current.Extent.height),
      }
    }
    return VulkanWindowFramebufferExtentTestSnapshot{
      Width: framebufferWidth,
      Height: framebufferHeight,
    }
  }

  internal func SceneRetentionSnapshotForTest() VulkanSceneRetentionTestSnapshot {
    let sceneVersion = activeSceneVersion
    var swapchainImageCount uint32 = 0u
    var initializedImageCount uint32 = 0u
    var minimumImageSceneVersion uint64 = 0uL
    var appliedImageCount uint32 = 0u
    var pendingImageCount uint32 = 0u
    var pendingSceneVersion uint64 = 0uL
    var activeImageIndexForSnapshot uint32 = 0u
    var activeAppliedSceneVersionForSnapshot uint64 = 0uL
    var activePendingSceneVersion uint64 = 0uL
    let acquiredImageState = lastPresentedImageStateValid
    if acquiredImageState {
      activeImageIndexForSnapshot = lastPresentedImageIndex
      activeAppliedSceneVersionForSnapshot = lastPresentedAppliedSceneVersion
      activePendingSceneVersion = lastPresentedPendingSceneVersion
    }
    if let current = generation {
      swapchainImageCount = current.ImageCount
      minimumImageSceneVersion = uint64.MaxValue
      var imageIndex uint32 = 0u
      while imageIndex < swapchainImageCount {
        let applied = current.AppliedSceneVersion(imageIndex)
        let pending = current.PendingSceneVersion(imageIndex)
        let known = applied > pending ? applied : pending
        if applied != 0uL {
          appliedImageCount = appliedImageCount + 1u
        }
        if pending != 0uL {
          pendingImageCount = pendingImageCount + 1u
          if pending > pendingSceneVersion {
            pendingSceneVersion = pending
          }
        }
        if applied != 0uL || pending != 0uL {
          initializedImageCount = initializedImageCount + 1u
        }
        if known < minimumImageSceneVersion {
          minimumImageSceneVersion = known
        }
        imageIndex = imageIndex + 1u
      }
      if swapchainImageCount == 0u {
        minimumImageSceneVersion = 0uL
      }
    }
    var dirtyChunkCount uint32 = 0u
    var reusedChunkCount uint32 = 0u
    let frame = sceneCompiler.Frame
    var chunkIndex int32 = 0
    while chunkIndex < frame.ChunkCount {
      if frame.Chunks[chunkIndex].Dirty {
        dirtyChunkCount = dirtyChunkCount + 1u
      } else {
        reusedChunkCount = reusedChunkCount + 1u
      }
      chunkIndex = chunkIndex + 1
    }
    var roundedLeafCount uint32 = 0u
    var roundedLeafBounds ConservativeBounds{}
    var roundedLeafRadiusTopLeft float32 = 0.0F
    var roundedLeafRadiusTopRight float32 = 0.0F
    var roundedLeafRadiusBottomRight float32 = 0.0F
    var roundedLeafRadiusBottomLeft float32 = 0.0F
    var roundedLeafColor uint32 = 0u
    var roundedLeafOpacity float32 = 0.0F
    let logicalWidth = host.LogicalWidth > 0 ? host.LogicalWidth : framebufferWidth
    let logicalHeight = host.LogicalHeight > 0 ? host.LogicalHeight : framebufferHeight
    let payloadScaleX = logicalWidth > 0
    ? float32(framebufferWidth) / float32(logicalWidth) : 1.0F
    let payloadScaleY = logicalHeight > 0
    ? float32(framebufferHeight) / float32(logicalHeight) : 1.0F
    var mutatedSolidLeafFound bool = false
    var mutatedSolidLeafBounds ConservativeBounds{}
    var mutatedSolidLeafColor uint32 = 0u
    var mutatedSolidLeafOpacity float32 = 0.0F
    var borderLeafFound bool = false
    var borderLeafCount uint32 = 0u
    var borderLeaf PerEdgeBorderRecord{}
    var drawIndex int32 = 0
    while drawIndex < frame.DrawRefCount {
      let draw = frame.DrawRefs[drawIndex]
      if draw.Kind == SceneDrawKind.RoundedBox
        && draw.Index >= 0 && draw.Index < frame.RoundedBoxCount{
          let record = frame.RoundedBoxes[draw.Index]
          roundedLeafCount = roundedLeafCount + 1u
          if roundedLeafCount == 1u {
            roundedLeafBounds = record.Bounds
            roundedLeafRadiusTopLeft = record.RadiusTopLeft
            roundedLeafRadiusTopRight = record.RadiusTopRight
            roundedLeafRadiusBottomRight = record.RadiusBottomRight
            roundedLeafRadiusBottomLeft = record.RadiusBottomLeft
            roundedLeafColor = record.Color
            roundedLeafOpacity = record.Opacity
          }
        } else if draw.Kind == SceneDrawKind.SolidBox
        && draw.Index >= 0 && draw.Index < frame.SolidBoxCount{
          let record = frame.SolidBoxes[draw.Index]
          let inX = record.Bounds.X > 80.0F * payloadScaleX
            && record.Bounds.X < 160.0F * payloadScaleX
          let inY = record.Bounds.Y > 0.0F
            && record.Bounds.Y < 16.0F * payloadScaleY
          let widthMatches = record.Bounds.Width > 63.0F * payloadScaleX
            && record.Bounds.Width < 65.0F * payloadScaleX
          let heightMatches = record.Bounds.Height > 31.0F * payloadScaleY
            && record.Bounds.Height < 33.0F * payloadScaleY
          if inX && inY && widthMatches && heightMatches {
            mutatedSolidLeafFound = true
            mutatedSolidLeafBounds = record.Bounds
            mutatedSolidLeafColor = record.Color
            mutatedSolidLeafOpacity = record.Opacity
          }
        } else if draw.Kind == SceneDrawKind.PerEdgeBorder
        && draw.Index >= 0 && draw.Index < frame.PerEdgeBorderCount{
          let record = frame.PerEdgeBorders[draw.Index]
          let inX = record.Bounds.X > 160.0F * payloadScaleX
            && record.Bounds.X < 176.0F * payloadScaleX
          let inY = record.Bounds.Y > 0.0F
            && record.Bounds.Y < 16.0F * payloadScaleY
          if inX && inY {
            borderLeafCount = borderLeafCount + 1u
            if !borderLeafFound {
              borderLeafFound = true
              borderLeaf = record
            }
          }
        }
      drawIndex = drawIndex + 1
    }
    let damage = activeDamageRegion
    let partialRedraw = activePartialRedraw
    return VulkanSceneRetentionTestSnapshot{
      SceneVersion: sceneVersion,
      ActiveImageIndex: activeImageIndexForSnapshot,
      ActiveSceneVersion: activeSceneVersion,
      ActiveAppliedSceneVersion: activeAppliedSceneVersionForSnapshot,
      ActivePendingSceneVersion: activePendingSceneVersion,
      AcquiredImageState: acquiredImageState,
      SwapchainImageCount: swapchainImageCount,
      InitializedImageCount: initializedImageCount,
      MinimumImageSceneVersion: minimumImageSceneVersion,
      AppliedImageCount: appliedImageCount,
      ActiveImagePromoted: acquiredImageState && lastPresentedImagePromoted,
      PendingImageCount: pendingImageCount,
      PendingSceneVersion: pendingSceneVersion,
      DamageX: damage.X,
      DamageY: damage.Y,
      DamageWidth: damage.Width,
      DamageHeight: damage.Height,
      PartialRedraw: partialRedraw,
      FullRedraw: !partialRedraw,
      DirtyChunkCount: dirtyChunkCount,
      ReusedChunkCount: reusedChunkCount,
      SkippedNodeCount: sceneCompiler.LastResult.SkippedNodeCount,
      ExactTextClipCandidateCount: sceneCompiler.LastResult.ExactTextClipCandidateCount,
      ExactTextClipCullCount: sceneCompiler.LastResult.ExactTextClipCullCount,
      CachedTextPaintCullCount: sceneCompiler.LastResult.CachedTextPaintCullCount,
      TextLayoutRequestCount: sceneCompiler.LastResult.TextLayoutRequestCount,
      DrawCount: sceneCompiler.LastResult.DrawCount,
      ResourceCount: frame.ResourceRefCount,
      TextSegmentCount: frame.CachedTextSegmentCount,
      RetainedLeafHitCount: sceneCompiler.RetainedLeafHitCount,
      RetainedLeafRebuildCount: sceneCompiler.RetainedLeafRebuildCount,
      RetainedLeafFallbackCount: sceneCompiler.RetainedLeafFallbackCount,
      RetainedLeafInvalidationCount: sceneCompiler.RetainedLeafInvalidationCount,
      RetainedLeafTotalCount: sceneCompiler.RetainedLeafTotalCount,
      RetainedTextHitCount: sceneCompiler.RetainedTextHitCount,
      RetainedTextRebuildCount: sceneCompiler.RetainedTextRebuildCount,
      RetainedTextFallbackCount: sceneCompiler.RetainedTextFallbackCount,
      RetainedTextInvalidationCount: sceneCompiler.RetainedTextInvalidationCount,
      RetainedTextTotalCount: sceneCompiler.RetainedTextTotalCount,
      RetainedBorderHitCount: sceneCompiler.RetainedBorderHitCount,
      RetainedBorderRebuildCount: sceneCompiler.RetainedBorderRebuildCount,
      RetainedBorderFallbackCount: sceneCompiler.RetainedBorderFallbackCount,
      RetainedBorderInvalidationCount: sceneCompiler.RetainedBorderInvalidationCount,
      RetainedBorderTotalCount: sceneCompiler.RetainedBorderTotalCount,
      RetainedParentBoxHitCount: sceneCompiler.RetainedParentBoxHitCount,
      RetainedParentBoxRebuildCount: sceneCompiler.RetainedParentBoxRebuildCount,
      RetainedParentBoxFallbackCount: sceneCompiler.RetainedParentBoxFallbackCount,
      RetainedParentBoxInvalidationCount: sceneCompiler.RetainedParentBoxInvalidationCount,
      RetainedParentBoxTotalCount: sceneCompiler.RetainedParentBoxTotalCount,
      RoundedLeafCount: roundedLeafCount,
      RoundedLeafBoundsX: roundedLeafBounds.X,
      RoundedLeafBoundsY: roundedLeafBounds.Y,
      RoundedLeafBoundsWidth: roundedLeafBounds.Width,
      RoundedLeafBoundsHeight: roundedLeafBounds.Height,
      RoundedLeafRadiusTopLeft: roundedLeafRadiusTopLeft,
      RoundedLeafRadiusTopRight: roundedLeafRadiusTopRight,
      RoundedLeafRadiusBottomRight: roundedLeafRadiusBottomRight,
      RoundedLeafRadiusBottomLeft: roundedLeafRadiusBottomLeft,
      RoundedLeafColor: roundedLeafColor,
      RoundedLeafOpacity: roundedLeafOpacity,
      MutatedSolidLeafFound: mutatedSolidLeafFound,
      MutatedSolidLeafBoundsX: mutatedSolidLeafBounds.X,
      MutatedSolidLeafBoundsY: mutatedSolidLeafBounds.Y,
      MutatedSolidLeafBoundsWidth: mutatedSolidLeafBounds.Width,
      MutatedSolidLeafBoundsHeight: mutatedSolidLeafBounds.Height,
      MutatedSolidLeafColor: mutatedSolidLeafColor,
      MutatedSolidLeafOpacity: mutatedSolidLeafOpacity,
      BorderLeafFound: borderLeafFound,
      BorderLeafCount: borderLeafCount,
      BorderLeafBoundsX: borderLeaf.Bounds.X,
      BorderLeafBoundsY: borderLeaf.Bounds.Y,
      BorderLeafBoundsWidth: borderLeaf.Bounds.Width,
      BorderLeafBoundsHeight: borderLeaf.Bounds.Height,
      BorderLeafTopWidth: borderLeaf.TopWidth,
      BorderLeafRightWidth: borderLeaf.RightWidth,
      BorderLeafBottomWidth: borderLeaf.BottomWidth,
      BorderLeafLeftWidth: borderLeaf.LeftWidth,
      BorderLeafRadiusTopLeft: borderLeaf.RadiusTopLeft,
      BorderLeafRadiusTopRight: borderLeaf.RadiusTopRight,
      BorderLeafRadiusBottomRight: borderLeaf.RadiusBottomRight,
      BorderLeafRadiusBottomLeft: borderLeaf.RadiusBottomLeft,
      BorderLeafTopColor: borderLeaf.TopColor,
      BorderLeafRightColor: borderLeaf.RightColor,
      BorderLeafBottomColor: borderLeaf.BottomColor,
      BorderLeafLeftColor: borderLeaf.LeftColor,
      BorderLeafStyle: borderLeaf.Style,
      BorderLeafTransformIndex: borderLeaf.TransformIndex,
    }
  }

  internal func PrimitiveFrameRetentionSnapshotForTest()
  VulkanPrimitiveFrameRetentionTestSnapshot{
    guard let renderer = primitiveRenderer else {
      return VulkanPrimitiveFrameRetentionTestSnapshot{}
    }
    let stats = renderer.PrimitiveFrameStats
    return VulkanPrimitiveFrameRetentionTestSnapshot{
      SlotIndex: stats.SlotIndex,
      RecordCount: stats.RecordCount,
      ByteCount: stats.ByteCount,
      Capacity: stats.Capacity,
      BufferGeneration: stats.BufferGeneration,
      PlannedTransferBytes: stats.PlannedTransferBytes,
      SkippedTransferBytes: stats.SkippedTransferBytes,
      DirtyRecordCount: stats.DirtyRecordCount,
      UploadRangeCount: stats.UploadRangeCount,
      FullUpload: stats.FullUpload,
      CpuWriteOperations: stats.CpuWriteOperations,
      NativeFlushCalls: stats.NativeFlushCalls,
      RetainedReuse: stats.RetainedReuse,
      LastUseSerial: stats.LastUseSerial,
      Prepared: stats.Prepared,
      CpuWrittenBytes: stats.CpuWrittenBytes,
      TotalCpuWrittenBytes: stats.TotalCpuWrittenBytes,
      CpuComparedBytes: stats.CpuComparedBytes,
      TotalCpuComparedBytes: stats.TotalCpuComparedBytes,
      HistoryCopiedBytes: stats.HistoryCopiedBytes,
      TotalHistoryCopiedBytes: stats.TotalHistoryCopiedBytes,
      FlushRequests: stats.FlushRequests,
      TotalFlushRequests: stats.TotalFlushRequests,
      SubmittedTransferBytes: stats.SubmittedTransferBytes,
      TotalSubmittedTransferBytes: stats.TotalSubmittedTransferBytes,
      RecordedCopyCommands: stats.RecordedCopyCommands,
      TotalRecordedCopyCommands: stats.TotalRecordedCopyCommands,
      RecordedBarriers: stats.RecordedBarriers,
      TotalRecordedBarriers: stats.TotalRecordedBarriers,
      TotalPlannedTransferBytes: stats.TotalPlannedTransferBytes,
      TotalSkippedTransferBytes: stats.TotalSkippedTransferBytes,
      TotalDirtyRecordCount: stats.TotalDirtyRecordCount,
      TotalUploadRangeCount: stats.TotalUploadRangeCount,
      TotalFullUploads: stats.TotalFullUploads,
      TotalCpuWriteOperations: stats.TotalCpuWriteOperations,
      TotalNativeFlushCalls: stats.TotalNativeFlushCalls,
      TotalRetainedReuse: stats.TotalRetainedReuse,
    }
  }
  internal func TextFrameRetentionSnapshotForTest()
  VulkanTextFrameRetentionTestSnapshot{
    guard let renderer = primitiveRenderer else {
      return VulkanTextFrameRetentionTestSnapshot{}
    }
    let stats = renderer.TextFrameStats
    return VulkanTextFrameRetentionTestSnapshot{
      SlotIndex: stats.SlotIndex,
      SegmentCount: stats.SegmentCount,
      RunCount: stats.RunCount,
      RecordCount: stats.RecordCount,
      ByteCount: stats.ByteCount,
      Capacity: stats.Capacity,
      BufferGeneration: stats.BufferGeneration,
      TopologyKey: stats.TopologyKey,
      WrittenBytes: stats.WrittenBytes,
      SkippedBytes: stats.SkippedBytes,
      DirtySegmentCount: stats.DirtySegmentCount,
      UploadRangeCount: stats.UploadRangeCount,
      FullUpload: stats.FullUpload,
      MappedWrites: stats.MappedWrites,
      Flushes: stats.Flushes,
      RetainedReuse: stats.RetainedReuse,
      LastUseSerial: stats.LastUseSerial,
      Prepared: stats.Prepared,
      TotalSegmentCount: stats.TotalSegmentCount,
      TotalRunCount: stats.TotalRunCount,
      TotalRecordCount: stats.TotalRecordCount,
      TotalWrittenBytes: stats.TotalWrittenBytes,
      TotalSkippedBytes: stats.TotalSkippedBytes,
      TotalDirtySegmentCount: stats.TotalDirtySegmentCount,
      TotalUploadRangeCount: stats.TotalUploadRangeCount,
      TotalFullUploads: stats.TotalFullUploads,
      TotalMappedWrites: stats.TotalMappedWrites,
      TotalFlushes: stats.TotalFlushes,
      TotalRetainedReuse: stats.TotalRetainedReuse,
      TotalCapacity: stats.TotalCapacity,
      TotalBufferGeneration: stats.TotalBufferGeneration,
      TotalLastUseSerial: stats.TotalLastUseSerial,
      TotalPrepared: stats.TotalPrepared,
    }
  }

  internal func FrameSubmissionSerialsForTest() VulkanFrameSubmissionTestSnapshot -> VulkanFrameSubmissionTestSnapshot {
    Slot0Serial: frameSlots.Slot(0u)?.SubmissionSerial ?? 0uL,
    Slot1Serial: frameSlots.Slot(1u)?.SubmissionSerial ?? 0uL,
  }

  internal func GraphicsTimelineForTest() VulkanGraphicsTimelineTestSnapshot {
    guard let activeRuntime = runtime else {
      return VulkanGraphicsTimelineTestSnapshot{}
    }
    var completed uint64
    let completedResult = activeRuntime.GetCompletedGraphicsSubmissionSerial(out completed)
    return VulkanGraphicsTimelineTestSnapshot{
      Available: activeRuntime.GraphicsTimeline != 0uL,
      Timeline: uint64(activeRuntime.GraphicsTimeline),
      RuntimeGeneration: activeRuntime.Generation,
      LastEnqueuedSerial: activeRuntime.QueueWorker.LastEnqueuedGraphicsSubmissionSerial,
      CompletedSerial: completed,
      CompletedResult: completedResult,
      PendingWindowSerial: pendingGlobalSubmissionSerial,
      ReadbackSerial: readbackRequest?.SubmissionSerial ?? 0uL,
      ReadbackPendingReconcile: readbackRequest?.SubmissionPendingReconcile == true,
    }
  }

  internal func PollGraphicsSubmissionForTest(serial uint64) VkResult {
    guard let activeRuntime = runtime else {
      return VkConstants.VK_NOT_READY
    }
    return activeRuntime.PollGraphicsSubmission(serial)
  }

  internal func WaitGraphicsSubmissionForTest(serial uint64, timeout uint64) VkResult {
    guard let activeRuntime = runtime else {
      return VkConstants.VK_NOT_READY
    }
    return activeRuntime.WaitGraphicsSubmission(serial, timeout)
  }

  internal func GraphicsTimelineValidationRollbackForTest()
  VulkanGraphicsTimelineValidationTestSnapshot{
    guard let activeRuntime = runtime else {
      return VulkanGraphicsTimelineValidationTestSnapshot{}
    }
    let worker = activeRuntime.QueueWorker
    let mailbox = worker.CreateMailbox(nil)
    let serialBefore = worker.LastEnqueuedGraphicsSubmissionSerial
    var threw = false
    mailbox.PrepareSubmit(nint(0), 0uL, 0uL)
    if !mailbox.BeginSubmit() {
      throw InvalidOperationException("Timeline validation mailbox was not idle")
    }
    try {
      activeRuntime.EnqueueGraphicsSubmission(mailbox, serial -> {
        throw InvalidOperationException("timeline validation probe")
      })
    } catch (error InvalidOperationException) {
      threw = true
    }
    return VulkanGraphicsTimelineValidationTestSnapshot{
      Threw: threw,
      MailboxIdle: mailbox.Phase == VulkanQueueMailboxPhase.Idle,
      SerialBefore: serialBefore,
      SerialAfter: worker.LastEnqueuedGraphicsSubmissionSerial,
      MailboxSerial: mailbox.SubmitSerial,
    }
  }

  internal func AbandonAcquiredFrameForTest() VkResult {
    if !frameBegun || activeFrameSlot == nil {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    let result = TryAbandonRecordedFrameForRetry()
    RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
    if result == VkConstants.VK_SUCCESS {
      CloseDiagnosticFrame(false)
      ClearActiveFrame()
    } else {
      if result != VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkTeardownFailed(result)
      }
      HandleFrameFailure(result, VulkanDiagnosticEventIds.PresentWait)
    }
    return result
  }

  internal func SetForceFullRedrawForTest(value bool) {
    forceFullRedraw = value
  }

  internal func SetExactTextClipCullForTest(value bool) {
    sceneCompiler.SetExactTextClipCullEnabled(value)
  }
}

public partial class Window {
  private var suppressNativeEventPumpForTest bool

  private func VulkanTargetForTest() VulkanWindowTarget ? ->
  windowTarget as VulkanWindowTarget?

  private func SdlHostForTest() SdlHost ? -> host as SdlHost?

  internal func MaterializePipelineCacheForTest() VulkanPipelineCacheMetrics {
    guard let target = VulkanTargetForTest() else {
      return VulkanPipelineCacheMetrics{}
    }
    return target.MaterializePipelineCacheForTest()
  }

  internal func ImageResourceStatsForTest() VulkanImageResourceStats ->
  VulkanTargetForTest()?.ImageResourceStatsForTest() ?? VulkanImageResourceStats{}

  internal func RuntimeHoldNextQueueSubmitForTest() {
    VulkanTargetForTest()?.HoldNextQueueSubmitForTest()
  }

  internal func RuntimeHoldNextQueuePresentForTest() {
    VulkanTargetForTest()?.HoldNextQueuePresentForTest()
  }

  internal func RuntimeDeferNextQueueEnqueueForTest() {
    VulkanSharedRuntime.DeferNextQueueEnqueueForTest()
  }

  internal func RuntimeAcquireAndAbandonFrameForTest() VkResult {
    guard let target = VulkanTargetForTest() else {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    target.BeginFrame()
    return target.AbandonAcquiredFrameForTest()
  }

  internal func RuntimeWaitForHeldQueueCallForTest(timeoutMs int32) bool -> VulkanSharedRuntime.WaitForHeldQueueCallForTest(timeoutMs)

  internal func RuntimeQueueWorkPendingForTest() bool -> VulkanTargetForTest()?.QueueWorkPending ?? false

  internal func SchedulerWaitMsForTest(nowTicks float64) int32 -> SchedulerWaitMs(nowTicks)

  internal func DeferSchedulerFrameForTest(seconds float64) {
    host?.DeferFrame(float64(Stopwatch.GetTimestamp()) + seconds * float64(Stopwatch.Frequency))
  }

  internal func PollQueueCompletionForTest() bool {
    let completed = VulkanTargetForTest()?.PollQueueCompletion() == true
    if completed {
      markFrameRendered()
      SdlHostForTest()?.FramePacing.MarkFrame(float64(Stopwatch.GetTimestamp()))
    }
    return completed
  }

  internal func DiagnosticCountersSnapshotForTest() VulkanDiagnosticCounterSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanDiagnosticCounterSnapshot{}
    }
    return target.DiagnosticCountersSnapshotForTest()
  }
  internal func TimestampSupportedForTest() bool -> VulkanTargetForTest()?.TimestampSupportedForTest() == true

  internal func SetMainPassTimestampSinkForTest(
    sink Action[VulkanDiagnosticTimestampSnapshot]?) {
      VulkanTargetForTest()?.SetMainPassTimestampSinkForTest(sink)
    }
  internal func SetAllTimestampSinkForTest(
    sink Action[VulkanDiagnosticTimestampSnapshot]?) {
      VulkanTargetForTest()?.SetAllTimestampSinkForTest(sink)
    }
  internal func SetPresentationLatencySinkForTest(
    sink Action[VulkanPresentationLatencyTestSample]?) {
      guard let target = VulkanTargetForTest() else {
        return
      }
      guard let callback = sink else {
        target.SetPresentationLatencySink(nil)
        return
      }
      target.SetPresentationLatencySink((sample VulkanPresentationLatencySample) -> {
        callback.Invoke(VulkanPresentationLatencyTestSample{
          Token: sample.token,
          Kind: sample.kind,
          StartTimestamp: sample.startTimestamp,
          HandoffTimestamp: sample.handoffTimestamp,
          CompletionObservedTimestamp: sample.completionObservedTimestamp,
          PresentId: sample.presentId,
          PresentFenceObserved: sample.presentFenceObserved,
        })
      })
    }

  internal func BeginPresentationLatencyForTest(
    token uint64, kind int32, startTimestamp int64) {
      VulkanTargetForTest()?.BeginPresentationLatency(token, kind, startTimestamp)
    }

  internal func PresentFenceSupportedForTest() bool -> VulkanTargetForTest()?.PresentFenceSupported ?? false

  internal func DiagnosticFrameIdForTest() uint64 -> VulkanTargetForTest()?.DiagnosticFrameIdForTest() ?? 0uL
  internal func CaptureTargetForTest() VulkanWindowTarget ? -> VulkanTargetForTest()

  internal func ForceRenderForTest(dt float64) {
    requestRender()
    PumpScheduled(dt)
  }

  internal func StabilizeNativeMetricsForTest() {
    let quietTicks = int64(float64(Stopwatch.Frequency) * 0.05)
    let timeoutTicks = int64(float64(Stopwatch.Frequency) * 1.0)
    let start = Stopwatch.GetTimestamp()
    var quietStart = start
    var prior = CurrentWindowMetrics()
    while Stopwatch.GetTimestamp() - start < timeoutTicks {
      SdlRuntime.PumpEvents(Int32.MaxValue)
      consumeNativeMetrics()
      let current = CurrentWindowMetrics()
      let changed = current.LogicalWidth != prior.LogicalWidth
        || current.LogicalHeight != prior.LogicalHeight
        || current.FramebufferWidth != prior.FramebufferWidth
        || current.FramebufferHeight != prior.FramebufferHeight
      let now = Stopwatch.GetTimestamp()
      if changed {
        prior = current
        quietStart = now
      } else if now - quietStart >= quietTicks {
        return
      }
      Thread.Yield()
    }
    throw InvalidOperationException("Window metrics did not stabilize")
  }

  internal func SuppressNativeEventPumpForTest(value bool) {
    suppressNativeEventPumpForTest = value
  }

  internal func NativeEventPumpSuppressedForTest() bool -> suppressNativeEventPumpForTest

  internal func PumpForTest(dt float64) {
    PumpScheduled(dt)
  }

  internal func RequestReadbackForTest(width uint32, height uint32)
  WindowReadbackRequestStatus{
    guard let target = VulkanTargetForTest() else {
      return WindowReadbackRequestStatus.NotReady
    }
    let region = VulkanReadbackRegion{
      X: 0u,
      Y: 0u,
      Width: width,
      Height: height,
    }
    return target.RequestReadback(node, background, dpi, region)
  }

  internal func RequestReadbackForTest() WindowReadbackRequestStatus -> RequestReadbackForTest(64u, 64u)

  internal func CurrentWindowMetricsForTest() WindowMetrics -> CurrentWindowMetrics()

  internal func ApplyNativeResizeForTest(logicalWidth int32, logicalHeight int32,
    framebufferWidth int32, framebufferHeight int32) bool{
      guard let target = VulkanTargetForTest() else {
        return false
      }
      let previousGeneration = target.CurrentPresentGeneration
      if !applyNativeResize(logicalWidth, logicalHeight, framebufferWidth,
        framebufferHeight) {
          return false
        }
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 2L
      var actual = target.FramebufferExtentForTest()
      var currentGeneration = target.CurrentPresentGeneration
      while (currentGeneration == previousGeneration
          || actual.Width != framebufferWidth
          || actual.Height != framebufferHeight)
        && Stopwatch.GetTimestamp() < deadline{
          Thread.Yield()
          if !target.Resize(framebufferWidth, framebufferHeight) {
            return false
          }
          actual = target.FramebufferExtentForTest()
          currentGeneration = target.CurrentPresentGeneration
        }
      SdlHostForTest()?.SetMetricsForTest(logicalWidth, logicalHeight, actual.Width,
        actual.Height)
      this.framebufferWidth = actual.Width
      this.framebufferHeight = actual.Height
      return currentGeneration != 0uL
        && currentGeneration != previousGeneration
        && actual.Width == framebufferWidth
        && actual.Height == framebufferHeight
    }

  internal func HasDemandForTest() bool -> hasDemand()

  internal func HandleFocusChangedForTest(hasFocus bool) {
    handleFocusChanged(hasFocus)
  }

  internal func SdlWindowIdForTest() uint32 -> SdlHostForTest()?.WindowIdForTest() ?? 0u

  internal func QueueTextForTest(value string) {
    input.QueueText(value)
  }

  internal func CurrentPresentModeForTest() VkPresentModeKHR -> VulkanTargetForTest()?.CurrentPresentMode ?? VkPresentModeKHR(-1)

  internal func CurrentPresentGenerationForTest() uint64 -> VulkanTargetForTest()?.CurrentPresentGeneration ?? 0uL

  internal func FrameSubmissionSerialsForTest() VulkanFrameSubmissionTestSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanFrameSubmissionTestSnapshot{}
    }
    return target.FrameSubmissionSerialsForTest()
  }

  internal func GraphicsTimelineForTest() VulkanGraphicsTimelineTestSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanGraphicsTimelineTestSnapshot{}
    }
    return target.GraphicsTimelineForTest()
  }

  internal func PollGraphicsSubmissionForTest(serial uint64) VkResult ->
  VulkanTargetForTest()?.PollGraphicsSubmissionForTest(serial) ?? VkConstants.VK_NOT_READY

  internal func WaitGraphicsSubmissionForTest(serial uint64, timeout uint64) VkResult ->
  VulkanTargetForTest()?.WaitGraphicsSubmissionForTest(serial, timeout) ?? VkConstants.VK_NOT_READY

  internal func GraphicsTimelineValidationRollbackForTest()
  VulkanGraphicsTimelineValidationTestSnapshot{
    guard let target = VulkanTargetForTest() else {
      return VulkanGraphicsTimelineValidationTestSnapshot{}
    }
    return target.GraphicsTimelineValidationRollbackForTest()
  }

  internal func PacingRefreshRateForTest() float64 -> SdlHostForTest()?.FramePacing.RefreshRate ?? 0.0

  internal func PollReadbackForTest() VkResult {
    guard let target = VulkanTargetForTest() else {
      return VkConstants.VK_NOT_READY
    }
    return target.PollReadback()
  }

  internal func TakeReadbackForTest() VulkanReadbackResult? {
    guard let target = VulkanTargetForTest() else {
      return nil
    }
    return target.TakeReadbackResult()
  }

  internal func ReadbackRequestCountForTest() uint64 {
    guard let target = VulkanTargetForTest() else {
      return 0uL
    }
    return target.ReadbackRequestCount
  }

  internal func ReadbackCompletionCountForTest() uint64 {
    guard let target = VulkanTargetForTest() else {
      return 0uL
    }
    return target.ReadbackCompletionCount
  }

  internal func ReadbackSubmissionReadyForReconcileForTest() bool -> VulkanTargetForTest()?.ReadbackSubmissionReadyForReconcile == true

  internal func ReadbackResidentResourceBytesForTest() uint64 {
    guard let target = VulkanTargetForTest() else {
      return 0uL
    }
    return uint64(target.ReadbackResidentResourceBytes)
  }

  internal func ReadbackTimingForTest() VulkanReadbackTimingSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanReadbackTimingSnapshot{}
    }
    return target.ReadbackTiming
  }

  internal func SceneRetentionSnapshotForTest() VulkanSceneRetentionTestSnapshot {
    guard let target = VulkanTargetForTest() else {
      return VulkanSceneRetentionTestSnapshot{}
    }
    return target.SceneRetentionSnapshotForTest()
  }

  internal func SetForceFullRedrawForTest(value bool) {
    VulkanTargetForTest()?.SetForceFullRedrawForTest(value)
  }

  internal func SetExactTextClipCullForTest(value bool) {
    VulkanTargetForTest()?.SetExactTextClipCullForTest(value)
  }

  internal func InputValidateInitialForTest(handle ElementHandle, source string) bool {
    guard let n = handle.AttachedNodeFor(this) else { return false }
    if !n.Password || n.Buffer != source { return false }
    let metrics = TextMetrics()
    let shape = metrics.BufferShape(n)
    guard let state = n.EntryShape else { return false }
    if state.Display != "•••" || state.SourceStarts.Length != 3 { return false }
    if entryDisplayOffset(state, 0, TextAffinity.Downstream) != 0
      || entryDisplayOffset(state, 2, TextAffinity.Downstream) != 1
      || entryDisplayOffset(state, 13, TextAffinity.Downstream) != 2
      || entryDisplayOffset(state, 14, TextAffinity.Downstream) != 3
      || entrySourceOffset(state, 0) != 0
      || entrySourceOffset(state, 1) != 2
      || entrySourceOffset(state, 2) != 13
      || entrySourceOffset(state, 3) != 14 {
        return false
      }
    n.CaretAffinity = TextAffinity.Downstream
    if metrics.CaretX(n, 0) != shape.CaretX(0, int32(TextAffinity.Downstream))
      || metrics.CaretX(n, 2) != shape.CaretX(1, int32(TextAffinity.Downstream))
      || metrics.CaretX(n, 13) != shape.CaretX(2, int32(TextAffinity.Downstream))
      || metrics.CaretX(n, 14) != shape.CaretX(3, int32(TextAffinity.Downstream)) {
        return false
      }
    n.Anchor = 2
    n.AnchorAffinity = TextAffinity.Downstream
    n.Caret = 13
    n.CaretAffinity = TextAffinity.Upstream
    let actual = metrics.SelectionRects(n)
    let expected = shape.SelectionRects(1, 2)
    if actual.Length != expected.Length { return false }
    for index in 0 ... actual.Length {
      if actual[index] != expected[index] { return false }
    }
    var caretRect ElementRect
    if !handle.TryGetTextCaretRect(TextPosition {
      Offset: 2, Affinity: TextAffinity.Downstream,
    }, TextCoordinateSpace.Element, out caretRect) {
      return false
    }
    var hit TextPosition
    if !handle.TryGetTextPositionAt(Point {
      X: caretRect.X, Y: caretRect.Y + caretRect.Height * 0.5,
    }, TextCoordinateSpace.Element, out hit) || hit.Offset != 2 {
      return false
    }
    let rangeValues = [4]ElementRect
    let rangeDestination = rangeValues.AsSpan()
    var rangeRequired int32
    return handle.TryCopyTextRangeRects(TextRange{ Start: 2, Length: 11 },
      TextCoordinateSpace.Element, rangeDestination, out rangeRequired)
      && rangeRequired == 1 && rangeValues[0].Width > 0.0
  }

  internal func InputSelectionMappedForTest(handle ElementHandle) bool {
    guard let n = handle.AttachedNodeFor(this) else { return false }
    return n.Anchor == 2 && n.Caret == 13
  }

  internal func InputExerciseInputForTest(handle ElementHandle, source string) bool {
    guard let n = handle.AttachedNodeFor(this) else { return false }
    input.SetClipboardFallback("safe")
    let primary = KeyModifiers{ Ctrl: true }
    if !input.HandleKey(node, resolver, Key.A, primary)
      || !input.HandleKey(node, resolver, Key.C, primary)
      || !input.HandleKey(node, resolver, Key.End, KeyModifiers{})
      || !input.HandleKey(node, resolver, Key.V, primary) {
        return false
      }
    if n.Buffer != source + "safe" { return false }
    let beforeCut = n.Buffer
    if !input.HandleKey(node, resolver, Key.A, primary)
      || !input.HandleKey(node, resolver, Key.X, primary)
      || n.Buffer != beforeCut
      || !input.HandleKey(node, resolver, Key.End, KeyModifiers{}) {
        return false
      }
    let metrics = TextMetrics()
    let beforeComposition = n.Buffer
    let beforeCompositionShape = metrics.BufferShape(n)
    input.QueueComposition("z\u0301", 1, 0)
    if input.Drain(node, resolver, 0.0, nil)
      || n.Buffer != beforeComposition
      || metrics.BufferShape(n) != beforeCompositionShape{
        return false
      }
    input.QueueText("z\u0301")
    if !input.Drain(node, resolver, 0.0, nil)
      || n.Buffer != beforeComposition + "z\u0301" {
        return false
      }
    metrics.BufferShape(n)
    accessibility?.MarkDirty()
    resolver.VisualDirty = true
    return n.EntryShape!!.Display == "••••••••"
  }

  internal func InputQueuePointerMoveForTest(x float64, y float64) {
    input.QueuePointerMove(float32(x), float32(y))
  }

  internal func InputQueuePointerPressForTest(x float64, y float64) {
    input.QueuePointerPress(float32(x), float32(y), PointerButton.Primary, KeyModifiers{})
  }

  internal func InputQueuePointerReleaseForTest(x float64, y float64) {
    input.QueuePointerRelease(float32(x), float32(y), PointerButton.Primary, KeyModifiers{})
  }

  internal func InputQueueWheelForTest(x float64, y float64, dx float64, dy float64) {
    input.QueuePointerWheel(float32(x), float32(y), float32(dx), float32(dy), KeyModifiers{})
  }

  internal func InputQueueKeyPressForTest(key Key) {
    input.QueueKeyPress(key, KeyModifiers{})
  }

  internal func InputQueueKeyReleaseForTest(key Key) {
    input.QueueKeyRelease(key)
  }

  internal func PrimitiveFrameRetentionSnapshotForTest()
  VulkanPrimitiveFrameRetentionTestSnapshot{
    guard let target = VulkanTargetForTest() else {
      return VulkanPrimitiveFrameRetentionTestSnapshot{}
    }
    return target.PrimitiveFrameRetentionSnapshotForTest()
  }
  internal func TextFrameRetentionSnapshotForTest()
  VulkanTextFrameRetentionTestSnapshot{
    guard let target = VulkanTargetForTest() else {
      return VulkanTextFrameRetentionTestSnapshot{}
    }
    return target.TextFrameRetentionSnapshotForTest()
  }

  internal func ClipMaskRetentionSnapshotForTest()
  VulkanClipMaskRetentionTestSnapshot{
    guard let target = VulkanTargetForTest() else {
      return VulkanClipMaskRetentionTestSnapshot{}
    }
    let stats = target.LastClipMaskFrameStats
    let totals = target.ClipMaskFrameTotals
    return VulkanClipMaskRetentionTestSnapshot{
      SlotIndex: stats.SlotIndex,
      DrawCount: stats.DrawCount,
      MaskCount: stats.MaskCount,
      ClipChainCount: stats.ClipChainCount,
      LayerCount: stats.LayerCount,
      ByteCount: stats.ByteCount,
      WrittenBytes: stats.WrittenBytes,
      SkippedBytes: stats.SkippedBytes,
      MappedWrites: stats.MappedWrites,
      Flushes: stats.Flushes,
      RetainedReuse: stats.RetainedReuse,
      RetentionEligible: stats.RetentionEligible,
      Retained: stats.Retained,
      RetentionValid: stats.RetentionValid,
      TotalWrittenBytes: totals.WrittenBytes,
      TotalSkippedBytes: totals.SkippedBytes,
      TotalMappedWrites: totals.MappedWrites,
      TotalFlushes: totals.Flushes,
      TotalRetainedReuse: totals.RetainedReuse,
    }
  }

}

internal partial class SdlHost {
  internal func SetMetricsForTest(logicalWidth int32, logicalHeight int32,
    framebufferWidth int32, framebufferHeight int32) {
      LogicalWidth = logicalWidth
      LogicalHeight = logicalHeight
      FramebufferWidth = framebufferWidth
      FramebufferHeight = framebufferHeight
    }

  internal func WindowIdForTest() uint32 {
    if window.IsNull {
      return 0u
    }
    return SDL.GetWindowID(window)
  }

}

internal class WindowReadbackTestFixture {
  shared {
    internal func CreateClippedLavaFixture() Blob -> Container {
      Position: PositionType.Absolute,
      Left: 16,
      Top: 16,
      Width: 96,
      Height: 96,
      BorderRadius: 30,
      Overflow: Overflow.Hidden,
      Children: {
        LavaSurface{
          Width: Length.Percent(100),
          Height: Length.Percent(100),
        },
      },
    }

    internal func AbortPrimitiveMetrics(window Window, finish bool) VulkanPrimitiveFrameStats ->
    window.AbortPrimitiveMetricsForTest(finish)

    internal func VerifyFlushMetrics(window Window) {
      window.VerifyFlushMetricsForTest()
    }

    internal func ShaderEffectProgramId(effect ShaderEffect) uint64 -> effect.ProgramId

    internal func ResolvePipelineIdentity(window Window, effects []ShaderEffect,
      warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot ->
    window.ResolvePipelineIdentityForTest(effects, warmEffect)

    internal func ResolveShaderEffectPipeline(window Window, effect ShaderEffect) uint64 ->
    window.ResolveShaderEffectPipelineForTest(effect)

    internal func ShaderEffectPipelineEntryCount(window Window) int32 ->
    window.ShaderEffectPipelineEntryCountForTest()

    internal func VerifyShaderEffectDigestCollision(window Window,
      first ShaderEffectProgram, second ShaderEffectProgram) bool ->
    window.VerifyShaderEffectDigestCollisionForTest(first, second)

    internal func RejectShaderEffectWithoutVulkanArtifact(
      window Window, effect ShaderEffect) bool ->
    window.RejectShaderEffectWithoutVulkanArtifactForTest(effect)

    internal func MaterializePipelineCache(window Window) VulkanPipelineCacheMetrics ->
    window.MaterializePipelineCacheForTest()

    internal func ShaderEffectVerifyPresentationRetirement() {
      let retirement = VulkanPresentationRetirement(4u, 2u)
      let completed = retirement.RecordPresent(1uL, 0u)
      retirement.CompletePresent(completed)
      if retirement.TryBindPriorSameImageToCompletion(1uL, 0u, 0u, 1uL) {
        throw InvalidOperationException("completed presentation required a retirement bind")
      }
      retirement.RecordPresent(1uL, 0u)
      if !retirement.TryBindPriorSameImageToCompletion(1uL, 0u, 1u, 2uL) {
        throw InvalidOperationException("unresolved presentation did not bind")
      }
      if retirement.TryBindPriorSameImageToCompletion(1uL, 0u, 1u, 2uL) {
        throw InvalidOperationException("presentation retirement accepted a duplicate bind")
      }
      if retirement.CollectCompleted(1u, 2uL) != 1 {
        throw InvalidOperationException("bound presentation did not retire")
      }
    }

    internal func DiagnosticCounters(window Window) VulkanDiagnosticCounterSnapshot -> window.DiagnosticCountersSnapshotForTest()
    internal func ImageResourceStats(window Window) VulkanImageResourceStats ->
    window.ImageResourceStatsForTest()
    internal func TargetDiagnosticCounters(target VulkanWindowTarget?) VulkanDiagnosticCounterSnapshot {
      guard let active = target else { return VulkanDiagnosticCounterSnapshot{} }
      return active.DiagnosticCountersSnapshotForTest()
    }
    internal func CellDirty(cell Cell) bool -> cell.IsDirty()

    internal func CellMounted(cell Cell) bool -> cell.MountedNode() != nil

    internal func TimestampSupported(window Window) bool -> window.TimestampSupportedForTest()

    internal func SetMainPassTimestampSink(window Window,
      sink Action[VulkanDiagnosticTimestampSnapshot]?) {
        window.SetMainPassTimestampSinkForTest(sink)
      }
    internal func SetAllTimestampSink(window Window,
      sink Action[VulkanDiagnosticTimestampSnapshot]?) {
        window.SetAllTimestampSinkForTest(sink)
      }
    internal func SetPresentationLatencySink(window Window,
      sink Action[VulkanPresentationLatencyTestSample]?) {
        window.SetPresentationLatencySinkForTest(sink)
      }

    internal func BeginPresentationLatency(window Window,
      token uint64, kind int32, startTimestamp int64) {
        window.BeginPresentationLatencyForTest(token, kind, startTimestamp)
      }

    internal func PresentFenceSupported(window Window) bool -> window.PresentFenceSupportedForTest()

    internal func DiagnosticFrameId(window Window) uint64 -> window.DiagnosticFrameIdForTest()
    internal func CaptureTarget(window Window) VulkanWindowTarget ? -> window.CaptureTargetForTest()

    internal func ForceRender(window Window, dt float64,
      timeoutSeconds float64 = 2.0) {
        let baseline = window.FrameSubmissionSerialsForTest()
        window.ForceRenderForTest(dt)
        let deadline = Stopwatch.GetTimestamp()
        +int64(float64(Stopwatch.Frequency) * timeoutSeconds)
        var accepted = false
        while Stopwatch.GetTimestamp() < deadline {
          if !window.NativeEventPumpSuppressedForTest() {
            SdlRuntime.PumpEvents(Int32.MaxValue)
          }
          window.PollQueueCompletionForTest()
          let current = window.FrameSubmissionSerialsForTest()
          accepted = current.Slot0Serial != baseline.Slot0Serial
            || current.Slot1Serial != baseline.Slot1Serial
          let pending = window.RuntimeQueueWorkPendingForTest()
          if accepted && !pending {
            return
          }
          if !accepted && !pending {
            window.ForceRenderForTest(0.0)
          }
          Thread.Yield()
        }
        throw InvalidOperationException("WindowReadbackTestFixture.ForceRender did not accept and drain queue work")
      }

    internal func StabilizeNativeMetrics(window Window) {
      window.StabilizeNativeMetricsForTest()
    }

    internal func SuppressNativeEventPump(window Window, value bool) {
      window.SuppressNativeEventPumpForTest(value)
    }

    internal func ForceRenderNonblocking(window Window, dt float64) {
      window.ForceRenderForTest(dt)
    }

    internal func Pump(window Window, dt float64) {
      window.PumpForTest(dt)
    }

    internal func SdlWindowId(window Window) uint32 -> window.SdlWindowIdForTest()
    internal func PumpNativeEvents() {
      SdlRuntime.PumpEvents(Int32.MaxValue)
    }
    internal func PumpNativeEventsForTest() int32 -> SdlRuntime.PumpEvents(Int32.MaxValue)

    internal func SetForceFullRedraw(window Window, value bool) {
      window.SetForceFullRedrawForTest(value)
    }

    internal func SetExactTextClipCull(window Window, value bool) {
      window.SetExactTextClipCullForTest(value)
    }

    internal func Request(window Window) WindowReadbackRequestStatus -> window.RequestReadbackForTest()

    internal func Request(window Window, width uint32, height uint32)
    WindowReadbackRequestStatus -> window.RequestReadbackForTest(width, height)

    internal func Metrics(window Window) WindowMetrics -> window.CurrentWindowMetricsForTest()
    internal func Resize(window Window, logicalWidth int32, logicalHeight int32,
      framebufferWidth int32, framebufferHeight int32) bool{
        if logicalWidth <= 0 || logicalHeight <= 0
          || framebufferWidth <= 0 || framebufferHeight <= 0 {
            throw InvalidOperationException(
              "WindowReadbackTestFixture.Resize dimensions must be positive")
          }
        return window.ApplyNativeResizeForTest(logicalWidth, logicalHeight,
          framebufferWidth, framebufferHeight)
      }

    internal func HasDemand(window Window) bool -> window.HasDemandForTest()

    internal func SetFocus(window Window, value bool) {
      window.HandleFocusChangedForTest(value)
    }

    internal func QueueText(window Window, value string) {
      window.QueueTextForTest(value)
    }

    internal func PresentMode(window Window) VkPresentModeKHR -> window.CurrentPresentModeForTest()

    internal func PresentGeneration(window Window) uint64 -> window.CurrentPresentGenerationForTest()

    internal func FrameSubmissions(window Window) VulkanFrameSubmissionTestSnapshot -> window.FrameSubmissionSerialsForTest()

    internal func GraphicsTimeline(window Window)
    VulkanGraphicsTimelineTestSnapshot -> window.GraphicsTimelineForTest()

    internal func PollGraphicsSubmission(window Window, serial uint64) VkResult ->
    window.PollGraphicsSubmissionForTest(serial)

    internal func WaitGraphicsSubmission(window Window, serial uint64,
      timeout uint64) VkResult -> window.WaitGraphicsSubmissionForTest(serial, timeout)

    internal func GraphicsTimelineValidationRollback(window Window)
    VulkanGraphicsTimelineValidationTestSnapshot ->
    window.GraphicsTimelineValidationRollbackForTest()

    internal func RuntimeAcquireAndAbandonFrame(window Window) VkResult ->
    window.RuntimeAcquireAndAbandonFrameForTest()

    internal func PacingRefreshRate(window Window) float64 -> window.PacingRefreshRateForTest()

    internal func UpdateTree(window Window) {
      window.UpdateTree()
    }

    internal func InputValidateInitial(window Window, handle ElementHandle, source string) bool -> window.InputValidateInitialForTest(handle, source)

    internal func InputSelectionMapped(window Window, handle ElementHandle) bool -> window.InputSelectionMappedForTest(handle)

    internal func InputExerciseInput(window Window, handle ElementHandle, source string) bool -> window.InputExerciseInputForTest(handle, source)

    internal func InputQueuePointerMove(window Window, x float64, y float64) {
      window.InputQueuePointerMoveForTest(x, y)
    }

    internal func InputQueuePointerPress(window Window, x float64, y float64) {
      window.InputQueuePointerPressForTest(x, y)
    }

    internal func InputQueuePointerRelease(window Window, x float64, y float64) {
      window.InputQueuePointerReleaseForTest(x, y)
    }

    internal func InputQueueWheel(window Window, x float64, y float64,
      dx float64, dy float64) {
        window.InputQueueWheelForTest(x, y, dx, dy)
      }

    internal func InputQueueKeyPress(window Window, key Key) {
      window.InputQueueKeyPressForTest(key)
    }

    internal func InputQueueKeyRelease(window Window, key Key) {
      window.InputQueueKeyReleaseForTest(key)
    }

    internal func Poll(window Window) VkResult -> window.PollReadbackForTest()

    internal func Take(window Window) VulkanReadbackResult ? -> window.TakeReadbackForTest()

    internal func RequestCount(window Window) uint64 -> window.ReadbackRequestCountForTest()

    internal func CompletionCount(window Window) uint64 -> window.ReadbackCompletionCountForTest()

    internal func SubmissionReadyForReconcile(window Window) bool -> window.ReadbackSubmissionReadyForReconcileForTest()

    internal func ResidentResourceBytes(window Window) uint64 -> window.ReadbackResidentResourceBytesForTest()
    internal func TargetResidentResourceBytes(target VulkanWindowTarget?) uint64 {
      guard let retained = target else {
        return 0uL
      }
      return uint64(retained.ReadbackResidentResourceBytes)
    }

    internal func TargetFramebufferExtent(target VulkanWindowTarget?)
    VulkanWindowFramebufferExtentTestSnapshot{
      guard let retained = target else {
        return VulkanWindowFramebufferExtentTestSnapshot{}
      }
      return retained.FramebufferExtentForTest()
    }

    internal func Timing(window Window) VulkanReadbackTimingSnapshot -> window.ReadbackTimingForTest()

    internal func SceneRetention(window Window) VulkanSceneRetentionTestSnapshot -> window.SceneRetentionSnapshotForTest()

    internal func PrimitiveFrameRetention(window Window)
    VulkanPrimitiveFrameRetentionTestSnapshot -> window.PrimitiveFrameRetentionSnapshotForTest()
    internal func TextFrameRetention(window Window)
    VulkanTextFrameRetentionTestSnapshot -> window.TextFrameRetentionSnapshotForTest()

    internal func ClipMaskRetention(window Window)
    VulkanClipMaskRetentionTestSnapshot -> window.ClipMaskRetentionSnapshotForTest()

    internal func RuntimeHoldNextQueueSubmit(window Window) {
      window.RuntimeHoldNextQueueSubmitForTest()
    }

    internal func RuntimeHoldNextQueuePresent(window Window) {
      window.RuntimeHoldNextQueuePresentForTest()
    }

    internal func RuntimeWaitForHeldQueueCall(window Window, timeoutMs int32) bool -> window.RuntimeWaitForHeldQueueCallForTest(timeoutMs)

    internal func RuntimeReleaseHeldQueueCall() {
      VulkanSharedRuntime.ReleaseHeldQueueCallForTest()
    }

    internal func RuntimeDeferNextQueueEnqueue(window Window) {
      window.RuntimeDeferNextQueueEnqueueForTest()
    }

    internal func RuntimeQueueWorkPending(window Window) bool -> window.RuntimeQueueWorkPendingForTest()

    internal func SchedulerWaitMs(window Window, nowTicks float64) int32 ->
    window.SchedulerWaitMsForTest(nowTicks)

    internal func DeferSchedulerFrame(window Window, seconds float64) {
      window.DeferSchedulerFrameForTest(seconds)
    }

    internal func DrainWindowQueue(window Window, timeoutMs int32) {
      let timeoutTicks = int64(float64(Stopwatch.Frequency) * float64(timeoutMs) / 1000.0)
      let start = Stopwatch.GetTimestamp()
      while RuntimeQueueWorkPending(window) {
        SdlRuntime.PumpEvents(Int32.MaxValue)
        window.PollQueueCompletionForTest()
        if Stopwatch.GetTimestamp() - start >= timeoutTicks {
          throw InvalidOperationException("window queue did not drain within the timeout")
        }
        Thread.Yield()
      }
    }

    internal func RuntimeDeferredQueueEnqueueCount() int64 -> VulkanSharedRuntime.QueueEnqueueDeferralCountForTest

    internal func RunFramePacingChecks() string {
      let previousUncapped = SdlFramePacing.UncappedBenchmark
      try {
        CheckPresentModes()
        CheckFramePacingRate(60.0, uint32(1), 9)
        CheckFramePacingRate(144.0, uint32(2), 4)
        CheckFramePacingRate(60000.0 / 1001.0, uint32(3), 9)
        CheckFramePacingFallbackAndRetention()
        CheckFramePacingDefer()

        let base = 200000.0
        let pacing = SdlFramePacing{}
        pacing.Refresh(uint32(7), 60.0, base, true)
        pacing.MarkFrame(base)
        pacing.Refresh(uint32(8), 144.0, base + 10.0, false)
        FramePacingRequire(pacing.DisplayId == uint32(8),
          "Runtime pacing display change was not applied")
        FramePacingRequire(Math.Abs(pacing.RefreshRate - 144.0) < 0.000000001,
          "Runtime pacing rate change was not applied")
        FramePacingRequire(pacing.IsDue(base + 10.0),
          "Runtime pacing display change did not reset the deadline")

        SdlFramePacing.SetUncappedBenchmark(true)
        pacing.MarkFrame(base + 11.0)
        FramePacingRequire(pacing.IsDue(base + 11.0),
          "Runtime uncapped pacing seam did not make the frame due")
        FramePacingRequire(pacing.WaitMilliseconds(base + 11.0, 100) == 0,
          "Runtime uncapped pacing seam returned a wait")
      } finally {
        SdlFramePacing.SetUncappedBenchmark(previousUncapped)
      }
      FramePacingRequire(SdlFramePacing.UncappedBenchmark == previousUncapped,
        "Runtime pacing uncapped seam did not restore its state")
      return "frame-pacing-smoke: rates=60,144,60000/1001 anchored=1 reset=1 defer=1 uncapped=1 presentModes=1"
    }

    private func CheckPresentModes() {
      var selected VkPresentModeKHR
      FramePacingRequire(VulkanPresentModeSelector.TrySelect(true, false, true, true, true, out selected)
          && selected == VkConstants.VK_PRESENT_MODE_FIFO_KHR,
        "Runtime VSync-on did not select FIFO")
      FramePacingRequire(VulkanPresentModeSelector.TrySelect(true, true, true, true, true, out selected)
          && selected == VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR,
        "Runtime software VSync-on did not prefer immediate")
      FramePacingRequire(VulkanPresentModeSelector.TrySelect(true, true, false, true, true, out selected)
          && selected == VkConstants.VK_PRESENT_MODE_MAILBOX_KHR,
        "Runtime software VSync-on did not fall back to mailbox")
      FramePacingRequire(VulkanPresentModeSelector.TrySelect(true, true, false, false, true, out selected)
          && selected == VkConstants.VK_PRESENT_MODE_FIFO_KHR,
        "Runtime software VSync-on did not fall back to FIFO")
      FramePacingRequire(VulkanPresentModeSelector.TrySelect(false, false, true, true, true, out selected)
          && selected == VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR,
        "Runtime VSync-off did not prefer immediate")
      FramePacingRequire(VulkanPresentModeSelector.TrySelect(false, false, false, true, true, out selected)
          && selected == VkConstants.VK_PRESENT_MODE_MAILBOX_KHR,
        "Runtime VSync-off did not fall back to mailbox")
      FramePacingRequire(VulkanPresentModeSelector.TrySelect(false, false, false, false, true, out selected)
          && selected == VkConstants.VK_PRESENT_MODE_FIFO_KHR,
        "Runtime VSync-off did not fall back to FIFO")
      FramePacingRequire(!VulkanPresentModeSelector.TrySelect(true, false, true, true, false, out selected),
        "Runtime VSync-on accepted a surface without FIFO")
      FramePacingRequire(!VulkanPresentModeSelector.TrySelect(false, false, false, false, false, out selected),
        "Runtime present mode selection accepted an empty mode set")
      FramePacingRequire(selected != VkConstants.VK_PRESENT_MODE_FIFO_RELAXED_KHR,
        "Runtime present mode selection returned FIFO relaxed")
    }

    private func CheckFramePacingRate(rate float64, display uint32,
      expectedWaitMs int32) {
        let frequency = float64(Stopwatch.Frequency)
        let base = 100000.0
        let interval = frequency / rate
        let pacing = SdlFramePacing{}
        pacing.Refresh(display, rate, base, true)
        FramePacingRequire(pacing.DisplayId == display,
          "Runtime pacing display identity is incorrect")
        FramePacingRequire(Math.Abs(pacing.RefreshRate - rate) < 0.000000001,
          "Runtime pacing refresh rate is incorrect")
        FramePacingRequire(pacing.IsDue(base),
          "Runtime pacing reset did not make the first frame due")
        pacing.MarkFrame(base)
        FramePacingRequire(!pacing.IsDue(base + interval - 0.5),
          "Runtime pacing deadline became due early")
        FramePacingRequire(pacing.WaitMilliseconds(base + interval * 0.5, 100)
          == expectedWaitMs,
          "Runtime pacing wait rounding is incorrect")
        FramePacingRequire(pacing.IsDue(base + interval),
          "Runtime pacing deadline was not due at one refresh interval")
        let late = base + interval * 5.25
        pacing.MarkFrame(late)
        let expectedNext = base + interval * 6.0
        FramePacingRequire(!pacing.IsDue(expectedNext - 0.5),
          "Runtime pacing late-frame advancement drifted early")
        FramePacingRequire(pacing.IsDue(expectedNext + 1.0),
          "Runtime pacing late-frame advancement did not stay anchored")
      }

    private func CheckFramePacingFallbackAndRetention() {
      let base = 300000.0
      let pacing = SdlFramePacing{}
      FramePacingRequire(!pacing.HasValidSample && pacing.DisplayId == 0u,
        "Runtime pacing fallback started with a display sample")
      FramePacingRequire(Math.Abs(pacing.RefreshRate - 60.0) < 0.000000001,
        "Runtime pacing fallback rate is not 60 Hz")
      pacing.Refresh(0u, 0.0, base, true)
      FramePacingRequire(!pacing.HasValidSample && pacing.DisplayId == 0u &&
        Math.Abs(pacing.RefreshRate - 60.0) < 0.000000001,
        "Runtime pacing initial invalid sample changed the fallback")
      pacing.Refresh(uint32(5), 120.0, base + 1.0, true)
      pacing.MarkFrame(base + 1.0)
      pacing.Refresh(0u, 0.0, base + 2.0, true)
      FramePacingRequire(pacing.HasValidSample && pacing.DisplayId == uint32(5) &&
        Math.Abs(pacing.RefreshRate - 120.0) < 0.000000001,
        "Runtime pacing transient invalid sample discarded the last valid sample")
      FramePacingRequire(pacing.IsDue(base + 2.0),
        "Runtime pacing transient invalid sample did not reset the retained deadline")
      pacing.Refresh(uint32(5), -1.0, base + 3.0, false)
      FramePacingRequire(pacing.DisplayId == uint32(5) &&
        Math.Abs(pacing.RefreshRate - 120.0) < 0.000000001,
        "Runtime pacing invalid mode rate changed the retained sample")
    }

    private func CheckFramePacingDefer() {
      let base = 400000.0
      let frequency = float64(Stopwatch.Frequency)
      let interval = frequency / 60.0
      let pacing = SdlFramePacing{}
      pacing.Refresh(uint32(9), 60.0, base, true)
      pacing.Defer(base)
      FramePacingRequire(!pacing.IsDue(base + interval - 0.5),
        "Runtime pacing defer did not honor the full display cadence")
      FramePacingRequire(pacing.IsDue(base + interval + 0.5),
        "Runtime pacing defer did not release at the display cadence")
    }

    private func FramePacingRequire(condition bool, message string) {
      if !condition {
        throw InvalidOperationException(message)
      }
    }

  }
}

internal unsafe partial class VulkanSharedPrimitiveFormatState {
  internal func PipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot{
      var firstPipeline VkPipeline
      var allHandlesEqual = true
      var uniquePipelineCount int32
      for effect in effects {
        let pipeline = ResolveShaderEffectPipeline(effect)
        if firstPipeline == 0uL {
          firstPipeline = pipeline
          uniquePipelineCount = 1
        } else if pipeline != firstPipeline {
          allHandlesEqual = false
          uniquePipelineCount++
        }
      }
      let beforeWarm = shaderEffectPipelineCount
      let warmPipeline = ResolveShaderEffectPipeline(warmEffect)
      var warmIndex int32
      var sameObjectStable = warmPipeline == firstPipeline
      while warmIndex < 4096 {
        sameObjectStable = sameObjectStable
          && ResolveShaderEffectPipeline(warmEffect) == warmPipeline
        warmIndex++
      }
      sameObjectStable = sameObjectStable
        && shaderEffectPipelineCount == beforeWarm
      return VulkanShaderEffectPipelineIdentityTestSnapshot{
        EntryCount: shaderEffectPipelineCount,
        UniquePipelineCount: uniquePipelineCount,
        FirstPipeline: firstPipeline,
        AllHandlesEqual: allHandlesEqual,
        SameObjectStable: sameObjectStable,
      }
    }

  internal func VerifyDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool{
      let firstDigest = first.VulkanSpirvDigest
      let secondDigest = second.VulkanSpirvDigest
      if firstDigest.Length != secondDigest.Length {
        return false
      }
      Array.Copy(firstDigest, secondDigest, firstDigest.Length)
      let before = shaderEffectPipelineCount
      let firstPipeline = ResolveShaderEffectPipeline(ShaderEffect(first))
      let secondPipeline = ResolveShaderEffectPipeline(ShaderEffect(second))
      return firstPipeline != 0uL && secondPipeline != 0uL
        && firstPipeline != secondPipeline
        && shaderEffectPipelineCount == before + 1
    }

  internal func RejectMissingArtifactForTest(effect ShaderEffect) bool {
    try {
      ResolveShaderEffectPipeline(effect)
      return false
    } catch (error NotSupportedException) {
      return true
    }
  }

  internal prop ShaderEffectPipelineEntryCountForTest int32{
    get -> shaderEffectPipelineCount
  }
}

internal unsafe partial class VulkanPrimitiveRenderer {
  internal func PipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot ->
  primitivePipelines.PipelineIdentityForTest(effects, warmEffect)

  internal func ResolveShaderEffectPipelineForTest(effect ShaderEffect) uint64 ->
  primitivePipelines.ResolveShaderEffectPipeline(effect)

  internal func VerifyShaderEffectDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool ->
  primitivePipelines.VerifyDigestCollisionForTest(first, second)

  internal func RejectShaderEffectWithoutVulkanArtifactForTest(effect ShaderEffect) bool ->
  primitivePipelines.RejectMissingArtifactForTest(effect)

  internal prop ShaderEffectPipelineEntryCountForTest int32{
    get -> primitivePipelines.ShaderEffectPipelineEntryCountForTest
  }
}

internal unsafe partial class VulkanWindowTarget {
  internal func PipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot{
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Pipeline identity fixture requires a renderer")
      }
      return renderer.PipelineIdentityForTest(effects, warmEffect)
    }

  internal func ResolveShaderEffectPipelineForTest(effect ShaderEffect) uint64 {
    guard let renderer = primitiveRenderer else {
      throw InvalidOperationException("Pipeline identity fixture requires a renderer")
    }
    return renderer.ResolveShaderEffectPipelineForTest(effect)
  }

  internal func VerifyShaderEffectDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool{
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Pipeline identity fixture requires a renderer")
      }
      return renderer.VerifyShaderEffectDigestCollisionForTest(first, second)
    }

  internal func RejectShaderEffectWithoutVulkanArtifactForTest(effect ShaderEffect) bool {
    guard let renderer = primitiveRenderer else {
      throw InvalidOperationException("Pipeline identity fixture requires a renderer")
    }
    return renderer.RejectShaderEffectWithoutVulkanArtifactForTest(effect)
  }

  internal prop ShaderEffectPipelineEntryCountForTest int32{
    get -> primitiveRenderer?.ShaderEffectPipelineEntryCountForTest ?? 0
  }
}

internal unsafe partial class VulkanPrimitiveRenderer {
  internal func AbortPrimitiveMetricsForTest(finish bool) VulkanPrimitiveFrameStats {
    let data = primitiveFrameData
    data.BeginPrepare(0, 1000uL, 8, 123uL, uint64.MaxValue)
    var record VulkanPrimitiveGpuRecord{}
    let count = finish ? 1000 : 1
    for index in 0 ... count {
      data.WriteRecord(index, *void(&record))
    }
    data.WriteEffectData([]uint8{ 1, 2, 3, 4, 5, 6, 7, 8 }, 8)
    if finish { data.FinishPrepare() }
    data.Abort(0)
    return data.LastStats
  }
}

internal unsafe partial class VulkanWindowTarget {
  internal func AbortPrimitiveMetricsForTest(finish bool) VulkanPrimitiveFrameStats {
    var attempts = 0
    while !WaitForGpu() {
      if attempts >= 1000 { throw InvalidOperationException("Metrics fixture requires completed queue work") }
      Thread.Sleep(1)
      attempts++
    }
    guard let renderer = primitiveRenderer else { throw InvalidOperationException("Renderer missing") }
    return renderer.AbortPrimitiveMetricsForTest(finish)
  }

  internal func VerifyFlushMetricsForTest() {
    guard let allocator = memoryAllocator else { throw InvalidOperationException("Allocator missing") }
    let creation = VulkanBufferFactory.CreateMapped(device, dispatch, allocator, nil,
      128uL, uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT), VulkanMemoryPolicy.HostVisibleCoherentCached)
    let allocation = creation.Allocation
    let coherent = allocation.hostCoherent
    try {
      allocation.hostCoherent = true
      let skipped = allocator.FlushBeforeSubmit(allocation, 0uL, 128uL, out var skippedCall)
      allocation.hostCoherent = false
      let flushed = allocator.FlushBeforeSubmit(allocation, 0uL, 128uL, out var nativeCall)
      if skipped != VkConstants.VK_SUCCESS || skippedCall
        || flushed != VkConstants.VK_SUCCESS || !nativeCall{
          throw InvalidOperationException("Native flush call accounting is incorrect")
        }
    } finally {
      allocation.hostCoherent = coherent
      let destroyBuffer = dispatch.vkDestroyBuffer
      destroyBuffer(device, creation.Buffer, nil)
      allocator.Release(allocation)
    }
  }
}

public partial class Window {
  internal func AbortPrimitiveMetricsForTest(finish bool) VulkanPrimitiveFrameStats ->
  VulkanTargetForTest()!!.AbortPrimitiveMetricsForTest(finish)
  internal func VerifyFlushMetricsForTest() {
    VulkanTargetForTest()!!.VerifyFlushMetricsForTest()
  }
  internal func ResolvePipelineIdentityForTest(effects []ShaderEffect,
    warmEffect ShaderEffect) VulkanShaderEffectPipelineIdentityTestSnapshot ->
  VulkanTargetForTest()!!.PipelineIdentityForTest(effects, warmEffect)
  internal func ResolveShaderEffectPipelineForTest(effect ShaderEffect) uint64 ->
  VulkanTargetForTest()!!.ResolveShaderEffectPipelineForTest(effect)
  internal func ShaderEffectPipelineEntryCountForTest() int32 ->
  VulkanTargetForTest()!!.ShaderEffectPipelineEntryCountForTest
  internal func VerifyShaderEffectDigestCollisionForTest(
    first ShaderEffectProgram, second ShaderEffectProgram) bool ->
  VulkanTargetForTest()!!.VerifyShaderEffectDigestCollisionForTest(first, second)
  internal func RejectShaderEffectWithoutVulkanArtifactForTest(effect ShaderEffect) bool ->
  VulkanTargetForTest()!!.RejectShaderEffectWithoutVulkanArtifactForTest(effect)
}
