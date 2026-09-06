package Goo

import System
import System.Threading

internal enum VulkanOffscreenState {
  Idle;
  Prepared;
  Recorded;
  Pending;
  Complete;
}

internal unsafe sealed class VulkanOffscreenTarget : IDisposable {
  private const MaxClipDepth int32 = 64
  private const ClipFrameSlot int32 = 0
  private const TimestampQueryCount int32 = 4
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let queue VkQueue
  private let sharedLease VulkanSharedLease
  private let validateGraphicsSubmission Action[uint64]
  private let queueMailbox VulkanQueueMailbox
  private let graphicsFamilyIndex uint32
  private let allocator VulkanMemoryAllocator
  private let readbackDispatch VulkanReadbackDispatch
  private let extent VkExtent2D
  private let imageByteSize VkDeviceSize
  private let stagingByteSize VkDeviceSize
  private let resourceByteSize VkDeviceSize
  private let targetFormat VkFormat
  private let imageResources VulkanImageResources
  private let primitiveState VulkanSharedPrimitiveState
  private let pathAtlas VulkanPathAtlas
  private let pathResources VulkanPathResources
  private let clipMaskAtlas VulkanClipMaskAtlas
  private let textAtlases VulkanTextAtlasSet?
  private let resourceGeneration uint64
  private let maxStorageBufferRange VkDeviceSize
  private let resourcePolicy VulkanResourcePolicy
  private let objectAccounting VulkanObjectAccounting?
  private let diagnostics VulkanDiagnostics?
  private var timestampEnabled bool
  private let timestampValidBits uint32
  private let timestampMask uint64
  private let timestampPeriod float32
  private var image VkImage
  private var imageView VkImageView
  private var imageAllocation VulkanMemoryAllocation? = nil
  private var stagingBuffer VkBuffer
  private var stagingAllocation VulkanMemoryAllocation? = nil
  private var commandBuffer VkCommandBuffer
  private var commandPool VkCommandPool
  private var timestampQueryPool VkQueryPool
  private var imageLayout VkImageLayout
  private var state VulkanOffscreenState
  private var imageReferencesReserved bool
  private var reservedImageIds []ResourceId
  private var reservedTextAtlasIds []ResourceId
  private var reservedPathIds []ResourceId
  private var reservedImageIdCount int32
  private var reservedTextAtlasIdCount int32
  private var reservedPathIdCount int32
  private var imageAccounted bool
  private var imageViewAccounted bool
  private var stagingBufferAccounted bool
  private var commandPoolAccounted bool
  private var timestampQueryPoolAccounted bool
  private var clipMaskSubmissionSerial uint64
  private var clipFrameSubmissionReconcilePending bool
  private var primitiveFrameSubmissionReconcilePending bool
  private var layerSubmissionReconcilePending bool
  private var readbackRegion VulkanReadbackRegion
  private var readbackByteSize VkDeviceSize
  private var lastResult VkResult = VkConstants.VK_SUCCESS
  private var gpuTimingAvailable bool
  private var gpuSceneReplayNanoseconds uint64
  private var gpuCopyNanoseconds uint64
  private var unsafeTeardown bool
  private var disposed bool
  private var queuePending bool
  private var pendingSubmissionSerial uint64
  private var primitiveRenderer VulkanPrimitiveRenderer? = nil
  private var layerPool VulkanOffscreenLayerPool? = nil

  internal prop Image VkImage{ get -> image }
  internal prop ImageView VkImageView{ get -> imageView }
  internal prop StagingBuffer VkBuffer{ get -> stagingBuffer }
  internal prop CommandBuffer VkCommandBuffer{ get -> commandBuffer }
  internal prop PendingSubmissionSerial uint64{ get -> pendingSubmissionSerial }
  internal prop Extent VkExtent2D{ get -> extent }
  internal prop ImageByteSize VkDeviceSize{ get -> imageByteSize }
  internal prop StagingByteSize VkDeviceSize{ get -> stagingByteSize }
  internal prop ResourceByteSize VkDeviceSize{ get -> resourceByteSize }
  internal prop ReadbackByteSize VkDeviceSize{ get -> readbackByteSize }
  internal prop TargetFormat VkFormat{ get -> targetFormat }
  internal prop ResourceGeneration uint64{ get -> resourceGeneration }
  internal prop State VulkanOffscreenState{ get -> state }
  internal prop SubmissionPendingReconcile bool{ get -> queuePending }
  internal prop SubmissionReadyForReconcile bool{
    get -> queuePending
      && queueMailbox.Phase == VulkanQueueMailboxPhase.SubmitComplete
  }
  internal prop LastResult VkResult{ get -> lastResult }
  internal prop DeviceLossDetected bool{
    get {
      return lastResult == VkConstants.VK_ERROR_DEVICE_LOST
        || allocator.LastResult == VkConstants.VK_ERROR_DEVICE_LOST
    }
  }
  internal prop ReadbackReady bool{ get -> state == VulkanOffscreenState.Complete }
  internal prop GpuTimingAvailable bool{ get -> gpuTimingAvailable }
  internal prop GpuSceneReplayNanoseconds uint64{ get -> gpuSceneReplayNanoseconds }
  internal prop GpuCopyNanoseconds uint64{ get -> gpuCopyNanoseconds }

  internal prop LiveObjectCount uint32{
    get {
      var count uint32 = 0u
      if image != 0uL { count = count + 1u }
      if imageView != 0uL { count = count + 1u }
      if stagingBuffer != 0uL { count = count + 1u }
      if commandBuffer != nint(0) { count = count + 1u }
      if commandPool != 0uL { count = count + 1u }
      if timestampQueryPool != 0uL { count = count + 1u }
      if let renderer = primitiveRenderer {
        count = count + renderer.LiveObjectCount
      }
      return count
    }
  }
  internal prop ReadbackPointer * void{
    get {
      if disposed {
        throw ObjectDisposedException("VulkanOffscreenTarget")
      }
      if state != VulkanOffscreenState.Complete {
        throw InvalidOperationException("Vulkan offscreen readback is not complete")
      }
      guard let allocation = stagingAllocation else {
        throw InvalidOperationException("Vulkan offscreen staging allocation is unavailable")
      }
      if allocation.mapped == nil {
        throw InvalidOperationException("Vulkan offscreen staging allocation is not mapped")
      }
      return allocation.mapped
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeQueue VkQueue,
    nativeAllocator VulkanMemoryAllocator,
    nativeReadbackDispatch VulkanReadbackDispatch,
    targetExtent VkExtent2D,
    nativeStagingByteSize VkDeviceSize,
    nativeGraphicsFamilyIndex uint32,
    colorFormat VkFormat,
    nativeImageResources VulkanImageResources?,
    expectedGeneration uint64,
    nativeMaxStorageBufferRange VkDeviceSize,
    nativeResourcePolicy VulkanResourcePolicy,
    nativePrimitiveState VulkanSharedPrimitiveState?,
    nativePathAtlas VulkanPathAtlas,
    nativePathResources VulkanPathResources,
    nativeClipMaskAtlas VulkanClipMaskAtlas,
    nativeTextAtlases VulkanTextAtlasSet?,
    nativeObjectAccounting VulkanObjectAccounting?,
    nativeDiagnostics VulkanDiagnostics?,
    nativeTimestampState VulkanDiagnosticTimestampState?,
    nativeQueueMailbox VulkanQueueMailbox,
    nativeSharedLease VulkanSharedLease) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeQueue == nint(0) {
        throw ArgumentException("Vulkan queue is null", "nativeQueue")
      }
      if targetExtent.width == 0u || targetExtent.height == 0u {
        throw ArgumentOutOfRangeException("targetExtent")
      }
      if colorFormat != VkConstants.VK_FORMAT_R8G8B8A8_SRGB {
        throw ArgumentException("Vulkan readback target requires VK_FORMAT_R8G8B8A8_SRGB", "colorFormat")
      }
      if nativeMaxStorageBufferRange == 0uL {
        throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
      }
      let fullReadbackPlan = VulkanReadbackPlan.Full(targetExtent)
      let selectedStagingByteSize = if nativeStagingByteSize == 0uL {
        fullReadbackPlan.ByteSize
      } else {
        nativeStagingByteSize
      }
      if selectedStagingByteSize == 0uL
        || selectedStagingByteSize > fullReadbackPlan.ByteSize
        || selectedStagingByteSize > uint64(Int32.MaxValue) {
          throw ArgumentOutOfRangeException("nativeStagingByteSize")
        }
      let selectedImageByteSize = fullReadbackPlan.ImageByteSize
      if selectedImageByteSize > uint64.MaxValue - selectedStagingByteSize {
        throw OverflowException("Offscreen resource byte size overflow")
      }
      guard let sharedImages = nativeImageResources else {
        throw ArgumentNullException("nativeImageResources")
      }
      guard let sharedState = nativePrimitiveState else {
        throw ArgumentNullException("nativePrimitiveState")
      }
      if nativePathResources == nil {
        throw ArgumentNullException("nativePathResources")
      }
      if nativeReadbackDispatch == nil {
        throw ArgumentNullException("nativeReadbackDispatch")
      }
      if nativeQueueMailbox == nil {
        throw ArgumentNullException("nativeQueueMailbox")
      }
      if nativeSharedLease == nil {
        throw ArgumentNullException("nativeSharedLease")
      }
      if nativePathAtlas == nil {
        throw ArgumentNullException("nativePathAtlas")
      }
      if nativePathResources.Atlas != nativePathAtlas {
        throw ArgumentException("nativePathResources atlas does not match nativePathAtlas", "nativePathResources")
      }
      if nativeClipMaskAtlas == nil {
        throw ArgumentNullException("nativeClipMaskAtlas")
      }
      if expectedGeneration == 0uL
        || sharedImages.Generation != expectedGeneration
        || sharedState.Generation != expectedGeneration
        || nativeSharedLease.Generation != expectedGeneration
        || nativeSharedLease.Device != nativeDevice{
          throw ArgumentOutOfRangeException("expectedGeneration")
        }
      device = nativeDevice
      dispatch = nativeDispatch
      queue = nativeQueue
      sharedLease = nativeSharedLease
      validateGraphicsSubmission = (serial uint64) -> { ValidateGraphicsSubmission(serial) }
      queueMailbox = nativeQueueMailbox
      graphicsFamilyIndex = nativeGraphicsFamilyIndex
      allocator = nativeAllocator
      readbackDispatch = nativeReadbackDispatch
      extent = targetExtent
      imageByteSize = VkDeviceSize(selectedImageByteSize)
      stagingByteSize = VkDeviceSize(selectedStagingByteSize)
      resourceByteSize = VkDeviceSize(selectedImageByteSize + selectedStagingByteSize)
      targetFormat = colorFormat
      imageResources = sharedImages
      primitiveState = sharedState
      pathAtlas = nativePathAtlas
      pathResources = nativePathResources
      clipMaskAtlas = nativeClipMaskAtlas
      textAtlases = nativeTextAtlases
      resourceGeneration = expectedGeneration
      maxStorageBufferRange = nativeMaxStorageBufferRange
      resourcePolicy = nativeResourcePolicy
      objectAccounting = nativeObjectAccounting
      diagnostics = nativeDiagnostics
      var selectedTimestampEnabled = false
      var selectedTimestampValidBits uint32 = 0u
      var selectedTimestampMask uint64 = 0uL
      var selectedTimestampPeriod float32 = 0.0F
      if let currentTimestampState = nativeTimestampState {
        if currentTimestampState.TimestampQueriesSupported
          && currentTimestampState.TimestampValidBits > 0u
          && currentTimestampState.TimestampValidBits <= 64u
          && currentTimestampState.TimestampPeriod > 0.0F
          && nativeDispatch.vkCreateQueryPool != nil
          && nativeDispatch.vkDestroyQueryPool != nil
          && nativeDispatch.vkGetQueryPoolResults != nil
          && nativeDispatch.vkCmdResetQueryPool != nil
          && nativeDispatch.vkCmdWriteTimestamp2 != nil {
            selectedTimestampEnabled = true
            selectedTimestampValidBits = currentTimestampState.TimestampValidBits
            selectedTimestampMask = BuildTimestampMask(selectedTimestampValidBits)
            selectedTimestampPeriod = currentTimestampState.TimestampPeriod
          }
      }
      timestampEnabled = selectedTimestampEnabled
      timestampValidBits = selectedTimestampValidBits
      timestampMask = selectedTimestampMask
      timestampPeriod = selectedTimestampPeriod
      imageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
      state = VulkanOffscreenState.Idle
      imageReferencesReserved = false
      reservedImageIds = Array.Empty[ResourceId]()
      reservedTextAtlasIds = Array.Empty[ResourceId]()
      reservedPathIds = Array.Empty[ResourceId]()
      reservedImageIdCount = 0
      reservedTextAtlasIdCount = 0
      reservedPathIdCount = 0
      commandPool = 0uL
      commandPoolAccounted = false
      timestampQueryPool = 0uL
      timestampQueryPoolAccounted = false
      readbackRegion = fullReadbackPlan.Region
      readbackByteSize = stagingByteSize
      clipMaskSubmissionSerial = 0uL
      clipFrameSubmissionReconcilePending = false
      primitiveFrameSubmissionReconcilePending = false
      layerSubmissionReconcilePending = false
      gpuTimingAvailable = false
      gpuSceneReplayNanoseconds = 0uL
      gpuCopyNanoseconds = 0uL
      unsafeTeardown = false
      disposed = false
      Create()
    }

  internal func ReserveImageReferences(frame SceneFrame) {
    EnsureOpen()
    if state != VulkanOffscreenState.Prepared {
      throw InvalidOperationException("Vulkan offscreen image references require prepared work")
    }
    if frame == nil {
      throw ArgumentNullException("frame")
    }
    if imageReferencesReserved {
      return
    }
    if frame.CachedImageCount < 0 || frame.CachedImageCount > frame.CachedImages.Length {
      throw ArgumentOutOfRangeException("CachedImageCount")
    }
    if frame.AnalyticPathBandCount < 0
      || frame.AnalyticPathBandCount > frame.AnalyticPathBands.Length{
        throw ArgumentOutOfRangeException("AnalyticPathBandCount")
      }
    if frame.ClipMaskCount < 0 || frame.ClipMaskCount > frame.ClipMasks.Length {
      throw ArgumentOutOfRangeException("ClipMaskCount")
    }
    if frame.AnalyticPathBandCount > Int32.MaxValue - frame.ClipMaskCount {
      throw OverflowException("pathCount overflow")
    }
    if reservedImageIds.Length < frame.CachedImageCount {
      reservedImageIds = [frame.CachedImageCount]ResourceId
    }
    let imageIds = reservedImageIds
    var imageIndex int32 = 0
    while imageIndex < frame.CachedImageCount {
      imageIds[imageIndex] = frame.CachedImages[imageIndex].ImageId
      imageIndex = imageIndex + 1
    }
    if frame.CachedTextSegmentCount < 0 || frame.CachedTextSegmentCount > frame.CachedTextSegments.Length {
      throw ArgumentOutOfRangeException("CachedTextSegmentCount")
    }
    var textAtlasCount int32 = 0
    var segmentScanIndex int32 = 0
    while segmentScanIndex < frame.CachedTextSegmentCount {
      let reference = frame.CachedTextSegments[segmentScanIndex]
      guard let segment = reference.Segment else {
        throw InvalidOperationException("cached text segment is unavailable")
      }
      if reference.SegmentId == 0uL || reference.SegmentVersion == 0uL
        || reference.SegmentId != segment.Id || reference.SegmentVersion != segment.Version
        || reference.GlyphCount != segment.GlyphCount || reference.ClipChainId != segment.ClipChainId
        || segment.RunCount <= 0 || segment.RunCount > segment.Runs.Length{
          throw InvalidOperationException("cached text segment reference is invalid")
        }
      if textAtlasCount > Int32.MaxValue - segment.RunCount {
        throw OverflowException("textAtlasCount overflow")
      }
      textAtlasCount = textAtlasCount + segment.RunCount
      segmentScanIndex = segmentScanIndex + 1
    }
    if reservedTextAtlasIds.Length < textAtlasCount {
      reservedTextAtlasIds = [textAtlasCount]ResourceId
    }
    let textAtlasIds = reservedTextAtlasIds
    var textAtlasIndex int32 = 0
    var segmentIndex int32 = 0
    while segmentIndex < frame.CachedTextSegmentCount {
      let reference = frame.CachedTextSegments[segmentIndex]
      guard let segment = reference.Segment else {
        throw InvalidOperationException("cached text segment is unavailable")
      }
      if reference.SegmentId == 0uL || reference.SegmentVersion == 0uL
        || reference.SegmentId != segment.Id || reference.SegmentVersion != segment.Version
        || reference.GlyphCount != segment.GlyphCount || reference.ClipChainId != segment.ClipChainId
        || segment.RunCount <= 0 || segment.RunCount > segment.Runs.Length{
          throw InvalidOperationException("cached text segment reference is invalid")
        }
      var runIndex int32 = 0
      while runIndex < segment.RunCount {
        let atlasId = segment.Runs[runIndex].AtlasId
        if !atlasId.IsValid || atlasId.Kind != SceneResourceKind.Atlas {
          throw InvalidOperationException("cached text segment atlas id is invalid")
        }
        textAtlasIds[textAtlasIndex] = atlasId
        textAtlasIndex = textAtlasIndex + 1
        runIndex = runIndex + 1
      }
      segmentIndex = segmentIndex + 1
    }
    if textAtlasIndex != textAtlasCount {
      throw InvalidOperationException("text atlas count mismatch")
    }
    let pathCount = frame.AnalyticPathBandCount + frame.ClipMaskCount
    if reservedPathIds.Length < pathCount {
      reservedPathIds = [pathCount]ResourceId
    }
    let pathIds = reservedPathIds
    var pathIndex int32 = 0
    while pathIndex < frame.AnalyticPathBandCount {
      pathIds[pathIndex] = frame.AnalyticPathBands[pathIndex].PathId
      pathIndex = pathIndex + 1
    }
    var maskIndex int32 = 0
    while maskIndex < frame.ClipMaskCount {
      pathIds[pathIndex] = frame.ClipMasks[maskIndex].PathId
      pathIndex = pathIndex + 1
      maskIndex = maskIndex + 1
    }
    var reservedCount int32 = 0
    try {
      while reservedCount < frame.CachedImageCount {
        let imageId = imageIds[reservedCount]
        if imageId.IsValid {
          imageResources.ReserveRecording(imageId, resourceGeneration)
        }
        reservedCount = reservedCount + 1
      }
    } catch (error Exception) {
      var rollbackIndex int32 = 0
      while rollbackIndex < reservedCount {
        let imageId = imageIds[rollbackIndex]
        if imageId.IsValid {
          try { imageResources.ReleaseRecording(imageId, resourceGeneration) } catch (cleanup Exception) { }
        }
        rollbackIndex = rollbackIndex + 1
      }
      throw error
    }
    reservedImageIdCount = frame.CachedImageCount
    reservedTextAtlasIdCount = textAtlasCount
    reservedPathIdCount = pathCount
    imageReferencesReserved = true
  }

  internal func PrepareSubmit() VkResult -> PrepareSubmit(VulkanReadbackPlan.Full(extent).Region)

  internal func PrepareSubmit(requestedRegion VulkanReadbackRegion) VkResult {
    EnsureOpen()
    let plan = VulkanReadbackPlan.Create(requestedRegion, extent)
    if plan.ByteSize > stagingByteSize {
      throw ArgumentOutOfRangeException("requestedRegion")
    }
    EnsureResidentResources()
    if state == VulkanOffscreenState.Pending {
      lastResult = VkConstants.VK_NOT_READY
      return VkConstants.VK_NOT_READY
    }
    if state != VulkanOffscreenState.Idle && state != VulkanOffscreenState.Complete {
      throw InvalidOperationException("Vulkan offscreen target has prepared work")
    }
    let resetCommandBuffer = dispatch.vkResetCommandBuffer
    let commandResult = resetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
    NoteResult(commandResult)
    if commandResult != VkConstants.VK_SUCCESS {
      return commandResult
    }
    var completed uint64
    let completionResult = sharedLease.GetCompletedGraphicsSubmissionSerial(out completed)
    NoteResult(completionResult)
    if completionResult != VkConstants.VK_SUCCESS { return completionResult }
    readbackRegion = requestedRegion
    readbackByteSize = plan.ByteSize
    gpuTimingAvailable = false
    gpuSceneReplayNanoseconds = 0uL
    gpuCopyNanoseconds = 0uL
    primitiveRenderer?.Collect(completed)
    layerPool?.Collect(completed)
    clipFrameSubmissionReconcilePending = false
    primitiveFrameSubmissionReconcilePending = false
    layerSubmissionReconcilePending = false
    state = VulkanOffscreenState.Prepared
    return VkConstants.VK_SUCCESS
  }

  internal func RecordScene(frame SceneFrame, clearColor VkClearColorValue,
    textScaleX float32, textScaleY float32) {
      EnsureOpen()
      if state != VulkanOffscreenState.Prepared {
        throw InvalidOperationException("PrepareSubmit must precede RecordScene")
      }
      if frame == nil {
        throw ArgumentNullException("frame")
      }
      if frame.ActiveChunk >= 0 {
        throw InvalidOperationException("Vulkan offscreen recording requires a closed scene frame")
      }
      let previousLayout = imageLayout
      var renderingActive = false
      try {
        ReserveImageReferences(frame)
        guard let renderer = primitiveRenderer else {
          throw InvalidOperationException("Vulkan offscreen primitive renderer is unavailable")
        }
        renderer.SetPathAtlas(pathResources.Atlas)
        renderer.PrepareClipMasks(frame, extent, ClipFrameSlot, clipMaskSubmissionSerial)
        renderer.SetPrimitiveFrameSlot(0)
        renderer.PreparePrimitiveFrame(frame, extent, textScaleX, textScaleY,
          clipMaskSubmissionSerial)
        BeginRecord()
        renderer.RecordPrimitiveFrameUpload(commandBuffer)
        renderer.RecordClipMasks(commandBuffer, extent)
        BeginRendering(clearColor)
        renderingActive = true
        renderer.ConfigureLayerFrame(commandBuffer, image, imageView, extent, clipMaskSubmissionSerial)
        renderer.ClearTimestampRecording()
        renderer.RecordInsideRendering(commandBuffer, frame, extent)
        renderer.ClearTimestampRecording()
        EndRendering()
        renderingActive = false
        WriteTimestamp(VkConstants.VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT, 1u)
        FinishRecord()
        let endCommandBuffer = dispatch.vkEndCommandBuffer
        let endResult = endCommandBuffer(commandBuffer)
        NoteResult(endResult)
        if endResult != VkConstants.VK_SUCCESS {
          throw InvalidOperationException("vkEndCommandBuffer failed: " + endResult.ToString())
        }
        renderer.CompleteClipFrameRecording()
        state = VulkanOffscreenState.Recorded
      } catch (error Exception) {
        if renderingActive {
          try { EndRendering() } catch (cleanup Exception) { }
        }
        let resetCommandBuffer = dispatch.vkResetCommandBuffer
        let resetResult = resetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
        NoteResult(resetResult)
        if resetResult != VkConstants.VK_SUCCESS {
          throw InvalidOperationException("vkResetCommandBuffer failed while aborting offscreen record: "
            +resetResult.ToString())
        }
        imageLayout = previousLayout
        try { clipMaskAtlas.InvalidateRecordedLayouts() } catch (cleanup Exception) { }
        if let renderer = primitiveRenderer {
          try { renderer.Abort(ClipFrameSlot) } catch (cleanup Exception) { }
        }
        layerPool?.Abort()
        ReleaseReservedImageReferences()
        state = VulkanOffscreenState.Idle
        throw error
      }
    }

  internal func Submit() VkResult {
    EnsureOpen()
    if state != VulkanOffscreenState.Recorded {
      throw InvalidOperationException("Vulkan offscreen commands are not recorded")
    }
    guard let renderer = primitiveRenderer else {
      throw InvalidOperationException("Vulkan offscreen primitive renderer is unavailable")
    }
    let primitiveFlushResult = renderer.FlushPrimitiveFrameBeforeSubmit()
    if primitiveFlushResult != VkConstants.VK_SUCCESS {
      NoteResult(primitiveFlushResult)
      if primitiveFlushResult == VkConstants.VK_ERROR_DEVICE_LOST {
        sharedLease.MarkDeviceLost()
      }
      return primitiveFlushResult
    }
    queueMailbox.PrepareSubmit(commandBuffer, 0uL, 0uL)
    if !queueMailbox.BeginSubmit() { return VkConstants.VK_NOT_READY }
    if !sharedLease.EnqueueGraphicsSubmission(queueMailbox, validateGraphicsSubmission) {
      queueMailbox.CancelSubmit()
      try { AbortPrepared() } catch (cleanup Exception) { }
      return VkConstants.VK_NOT_READY
    }
    queuePending = true
    return VkConstants.VK_SUCCESS
  }

  private func ValidateGraphicsSubmission(serial uint64) {
    if serial == 0uL || serial <= clipMaskSubmissionSerial {
      throw ArgumentOutOfRangeException("serial")
    }
    guard let renderer = primitiveRenderer else {
      throw InvalidOperationException("Vulkan offscreen primitive renderer is unavailable")
    }
    imageResources.ValidateUploadSubmission(commandBuffer, serial, resourceGeneration)
    renderer.ValidateClipFrameSubmission(ClipFrameSlot, serial)
    pendingSubmissionSerial = serial
  }

  internal func MarkSubmitted(result VkResult, submissionSerial uint64) VkResult {
    EnsureOpen()
    if state != VulkanOffscreenState.Recorded {
      throw InvalidOperationException("Vulkan offscreen commands are not ready for submission")
    }
    if submissionSerial == 0uL || submissionSerial <= clipMaskSubmissionSerial {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    NoteResult(result)
    if result == VkConstants.VK_SUCCESS {
      imageLayout = VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL
      clipMaskSubmissionSerial = submissionSerial
      state = VulkanOffscreenState.Pending
      clipFrameSubmissionReconcilePending = primitiveRenderer != nil
      primitiveFrameSubmissionReconcilePending = primitiveRenderer != nil
      layerSubmissionReconcilePending = layerPool != nil
      try {
        MarkSubmittedResourceUses(submissionSerial)
      } catch (error Exception) { throw error }
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Vulkan offscreen primitive renderer is unavailable")
      }
      try {
        renderer.MarkSubmitted(ClipFrameSlot, submissionSerial)
        renderer.MarkPrimitiveFrameSubmitted(submissionSerial)
      } catch (cleanup Exception) {
        return result
      }
      clipFrameSubmissionReconcilePending = false
      primitiveFrameSubmissionReconcilePending = false
      try {
        layerPool?.MarkSubmitted(submissionSerial)
        layerSubmissionReconcilePending = false
      } catch (cleanup Exception) {
      }
      return result
    }
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      sharedLease.MarkDeviceLost()
      try { AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
      return result
    }
    let resetCommandBuffer = dispatch.vkResetCommandBuffer
    let resetResult = resetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
    NoteResult(resetResult)
    ReleaseReservedImageReferences()
    if resetResult != VkConstants.VK_SUCCESS {
      if resetResult == VkConstants.VK_ERROR_DEVICE_LOST || DeviceLossDetected {
        try { AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
      } else {
        try { clipMaskAtlas.InvalidateRecordedLayouts() } catch (cleanup Exception) { }
        if let renderer = primitiveRenderer {
          renderer.Abort(ClipFrameSlot)
        }
        layerPool?.Abort()
        clipFrameSubmissionReconcilePending = false
        primitiveFrameSubmissionReconcilePending = false
        layerSubmissionReconcilePending = false
        state = VulkanOffscreenState.Idle
      }
      throw InvalidOperationException("vkResetCommandBuffer failed after offscreen submit failure: "
        +resetResult.ToString())
    }
    try { clipMaskAtlas.InvalidateRecordedLayouts() } catch (cleanup Exception) { }
    if let renderer = primitiveRenderer {
      try { renderer.Abort(ClipFrameSlot) } catch (cleanup Exception) { }
    }
    layerPool?.Abort()
    clipFrameSubmissionReconcilePending = false
    primitiveFrameSubmissionReconcilePending = false
    layerSubmissionReconcilePending = false
    state = VulkanOffscreenState.Idle
    return result
  }

  internal func AbortPrepared() {
    EnsureOpen()
    if queuePending {
      if !queueMailbox.CancelSubmit() {
        throw InvalidOperationException("Vulkan offscreen submit is already running")
      }
      queuePending = false
    }
    if state == VulkanOffscreenState.Pending {
      throw InvalidOperationException("Submitted Vulkan offscreen work cannot be aborted")
    }
    if state == VulkanOffscreenState.Idle || state == VulkanOffscreenState.Complete {
      return
    }
    let resetCommandBuffer = dispatch.vkResetCommandBuffer
    let result = resetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
    NoteResult(result)
    if result != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkResetCommandBuffer failed while aborting offscreen work: "
        +result.ToString())
    }
    try { clipMaskAtlas.InvalidateRecordedLayouts() } catch (cleanup Exception) { }
    if let renderer = primitiveRenderer {
      renderer.Abort(ClipFrameSlot)
    }
    layerPool?.Abort()
    ReleaseReservedImageReferences()
    clipFrameSubmissionReconcilePending = false
    primitiveFrameSubmissionReconcilePending = false
    layerSubmissionReconcilePending = false
    state = VulkanOffscreenState.Idle
  }

  internal func PollCompletion() VkResult {
    EnsureOpen()
    if queuePending {
      var submitResult VkResult = VkConstants.VK_NOT_READY
      if !queueMailbox.TakeSubmitCompletion(out submitResult) {
        return VkConstants.VK_NOT_READY
      }
      queuePending = false
      if submitResult != VkConstants.VK_SUCCESS {
        sharedLease.MarkDeviceLost()
      }
      var marked VkResult = VkConstants.VK_NOT_READY
      try {
        marked = MarkSubmitted(submitResult, pendingSubmissionSerial)
      } finally {
        queueMailbox.ResetSubmitCompletion()
      }
      if marked != VkConstants.VK_SUCCESS {
        return marked
      }
    }
    if state == VulkanOffscreenState.Complete {
      lastResult = VkConstants.VK_SUCCESS
      return VkConstants.VK_SUCCESS
    }
    if state != VulkanOffscreenState.Pending {
      lastResult = VkConstants.VK_NOT_READY
      return VkConstants.VK_NOT_READY
    }
    var completed uint64
    let queryResult = sharedLease.GetCompletedGraphicsSubmissionSerial(out completed)
    let status = if queryResult != VkConstants.VK_SUCCESS { queryResult }
    else if completed < clipMaskSubmissionSerial { VkConstants.VK_NOT_READY }
    else { VkConstants.VK_SUCCESS }
    NoteResult(status)
    if status != VkConstants.VK_SUCCESS {
      if status != VkConstants.VK_NOT_READY {
        unsafeTeardown = true
      }
      return status
    }
    guard let allocation = stagingAllocation else {
      throw InvalidOperationException("Vulkan offscreen staging allocation is unavailable")
    }
    let invalidateResult = allocator.InvalidateAfterFence(allocation, 0uL, readbackByteSize)
    NoteResult(invalidateResult)
    if invalidateResult != VkConstants.VK_SUCCESS {
      return invalidateResult
    }
    ResolveGpuTiming()
    ReconcileSubmittedBookkeeping()
    if let renderer = primitiveRenderer {
      renderer.Collect(completed)
    }
    layerPool?.Collect(completed)
    imageResources.Collect(completed)
    if let atlases = textAtlases {
      atlases.Collect(completed)
    }
    pathResources.Collect(completed)
    state = VulkanOffscreenState.Complete
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.AddReadback(1uL)
    }
    return VkConstants.VK_SUCCESS
  }

  private func ReconcileSubmittedBookkeeping() {
    if clipFrameSubmissionReconcilePending {
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Vulkan offscreen clip renderer is unavailable during submission reconciliation")
      }
      renderer.ReconcileClipFrameSubmitted(ClipFrameSlot, clipMaskSubmissionSerial)
      clipFrameSubmissionReconcilePending = false
    }
    if primitiveFrameSubmissionReconcilePending {
      guard let renderer = primitiveRenderer else {
        throw InvalidOperationException("Vulkan offscreen primitive renderer is unavailable during submission reconciliation")
      }
      renderer.ReconcilePrimitiveFrameSubmitted(clipMaskSubmissionSerial)
      primitiveFrameSubmissionReconcilePending = false
    }
    ReleaseReservedImageReferences()
    if layerSubmissionReconcilePending {
      guard let pool = layerPool else {
        throw InvalidOperationException("Vulkan offscreen layer pool is unavailable during submission reconciliation")
      }
      pool.MarkSubmitted(clipMaskSubmissionSerial)
      layerSubmissionReconcilePending = false
    }
  }

  internal func AbandonAfterDeviceLoss() {
    if disposed {
      return
    }
    ReleaseReservedImageReferences()
    if timestampQueryPool != 0uL {
      let staleQueryPool = timestampQueryPool
      timestampQueryPool = 0uL
      let destroyQueryPool = dispatch.vkDestroyQueryPool
      try { destroyQueryPool(device, staleQueryPool, nil) } catch (cleanup Exception) { }
    }
    if timestampQueryPoolAccounted {
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
      timestampQueryPoolAccounted = false
    }
    timestampEnabled = false
    gpuTimingAvailable = false
    gpuSceneReplayNanoseconds = 0uL
    gpuCopyNanoseconds = 0uL
    if let renderer = primitiveRenderer {
      try { renderer.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
      primitiveRenderer = nil
    }
    let staleLayerPool = layerPool
    layerPool = nil
    if let pool = staleLayerPool {
      try { pool.AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
    }
    if stagingBuffer != 0uL {
      let staleStagingBuffer = stagingBuffer
      stagingBuffer = 0uL
      let destroyBuffer = dispatch.vkDestroyBuffer
      try { destroyBuffer(device, staleStagingBuffer, nil) } catch (cleanup Exception) { }
      if stagingBufferAccounted {
        if let accounting = objectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
        stagingBufferAccounted = false
      }
    }
    if let staleStagingAllocation = stagingAllocation {
      try { allocator.Release(staleStagingAllocation) } catch (cleanup Exception) { }
      stagingAllocation = nil
    }
    if imageView != 0uL {
      let staleImageView = imageView
      imageView = 0uL
      let destroyImageView = dispatch.vkDestroyImageView
      try { destroyImageView(device, staleImageView, nil) } catch (cleanup Exception) { }
      if imageViewAccounted {
        if let accounting = objectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
        imageViewAccounted = false
      }
    }
    if image != 0uL {
      let staleImage = image
      image = 0uL
      let destroyImage = dispatch.vkDestroyImage
      try { destroyImage(device, staleImage, nil) } catch (cleanup Exception) { }
      if imageAccounted {
        if let accounting = objectAccounting {
          try { accounting.Release() } catch (cleanup Exception) { }
        }
        imageAccounted = false
      }
    }
    if let staleImageAllocation = imageAllocation {
      try { allocator.Release(staleImageAllocation) } catch (cleanup Exception) { }
      imageAllocation = nil
    }
    if commandBuffer != nint(0) {
      var staleCommandBuffer = commandBuffer
      commandBuffer = nint(0)
      if commandPool != 0uL {
        let freeCommandBuffers = dispatch.vkFreeCommandBuffers
        try { freeCommandBuffers(device, commandPool, 1u, &staleCommandBuffer) }
        catch (cleanup Exception) { }
      }
    }
    if commandPool != 0uL {
      let staleCommandPool = commandPool
      commandPool = 0uL
      let destroyCommandPool = dispatch.vkDestroyCommandPool
      try { destroyCommandPool(device, staleCommandPool, nil) } catch (cleanup Exception) { }
    }
    if commandPoolAccounted {
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
      commandPoolAccounted = false
    }
    state = VulkanOffscreenState.Complete
    clipFrameSubmissionReconcilePending = false
    primitiveFrameSubmissionReconcilePending = false
    layerSubmissionReconcilePending = false
    unsafeTeardown = false
    reservedImageIds = Array.Empty[ResourceId]()
    reservedTextAtlasIds = Array.Empty[ResourceId]()
    reservedPathIds = Array.Empty[ResourceId]()
    disposed = true
  }

  internal func ConfirmDeviceIdleForTeardown() {
    if disposed {
      return
    }
    if state == VulkanOffscreenState.Pending {
      ReconcileSubmittedBookkeeping()
      state = VulkanOffscreenState.Complete
    }
    unsafeTeardown = false
  }

  public func Dispose() {
    if disposed {
      return
    }
    if unsafeTeardown {
      throw InvalidOperationException("Vulkan offscreen target cannot safely tear down after a failed completion operation: "
        +lastResult.ToString())
    }
    while queuePending {
      let completion = PollCompletion()
      if completion == VkConstants.VK_NOT_READY {
        Thread.Yield()
      } else if completion != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan offscreen queue completion failed: " + completion.ToString())
      }
    }
    if state == VulkanOffscreenState.Pending {
      let waitResult = sharedLease.WaitGraphicsSubmission(
        clipMaskSubmissionSerial, VkConstants.VK_WHOLE_SIZE)
      NoteResult(waitResult)
      if waitResult != VkConstants.VK_SUCCESS {
        unsafeTeardown = true
        throw InvalidOperationException("Vulkan timeline wait failed for offscreen submission: "
          +waitResult.ToString())
      }
      let completion = PollCompletion()
      if completion != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan offscreen readback completion failed: "
          +completion.ToString())
      }
    }
    if state == VulkanOffscreenState.Prepared || state == VulkanOffscreenState.Recorded {
      AbortPrepared()
    }
    if unsafeTeardown {
      throw InvalidOperationException("Vulkan offscreen target cannot safely tear down after a failed completion operation: "
        +lastResult.ToString())
    }
    ReleaseReservedImageReferences()
    DestroyTimestampQueryPool()
    if let renderer = primitiveRenderer {
      renderer.Collect(clipMaskSubmissionSerial)
      renderer.Dispose()
      primitiveRenderer = nil
    }
    if let pool = layerPool {
      pool.Dispose()
      layerPool = nil
    }
    if stagingBuffer != 0uL {
      let destroyBuffer = dispatch.vkDestroyBuffer
      destroyBuffer(device, stagingBuffer, nil)
      stagingBuffer = 0uL
      if stagingBufferAccounted {
        if let accounting = objectAccounting { accounting.Release() }
        stagingBufferAccounted = false
      }
    }
    if stagingAllocation != nil {
      allocator.Release(stagingAllocation!!)
      stagingAllocation = nil
    }
    if imageView != 0uL {
      let destroyImageView = dispatch.vkDestroyImageView
      destroyImageView(device, imageView, nil)
      imageView = 0uL
      if imageViewAccounted {
        if let accounting = objectAccounting { accounting.Release() }
        imageViewAccounted = false
      }
    }
    if image != 0uL {
      let destroyImage = dispatch.vkDestroyImage
      destroyImage(device, image, nil)
      image = 0uL
      if imageAccounted {
        if let accounting = objectAccounting { accounting.Release() }
        imageAccounted = false
      }
    }
    if imageAllocation != nil {
      allocator.Release(imageAllocation!!)
      imageAllocation = nil
    }
    if commandBuffer != nint(0) {
      let freeCommandBuffers = dispatch.vkFreeCommandBuffers
      freeCommandBuffers(device, commandPool, 1u, &commandBuffer)
      commandBuffer = nint(0)
    }
    if commandPool != 0uL {
      let destroyCommandPool = dispatch.vkDestroyCommandPool
      destroyCommandPool(device, commandPool, nil)
      commandPool = 0uL
      if commandPoolAccounted {
        if let accounting = objectAccounting { accounting.Release() }
        commandPoolAccounted = false
      }
    }
    reservedImageIds = Array.Empty[ResourceId]()
    reservedTextAtlasIds = Array.Empty[ResourceId]()
    reservedPathIds = Array.Empty[ResourceId]()
    disposed = true
  }

  private func BeginRecord() {
    if state != VulkanOffscreenState.Prepared {
      throw InvalidOperationException("Vulkan offscreen recording is not prepared")
    }
    var beginInfo = VkCommandBufferBeginInfo{}
    beginInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO
    beginInfo.flags = uint32(VkConstants.VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT)
    let beginCommandBuffer = dispatch.vkBeginCommandBuffer
    let beginResult = beginCommandBuffer(commandBuffer, &beginInfo)
    NoteResult(beginResult)
    if beginResult != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("vkBeginCommandBuffer failed: " + beginResult.ToString())
    }
    if timestampEnabled {
      let resetQueryPool = dispatch.vkCmdResetQueryPool
      resetQueryPool(commandBuffer, timestampQueryPool, 0u, uint32(TimestampQueryCount))
      WriteTimestamp(VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT, 0u)
    }
    var srcStageMask VkPipelineStageFlags2
    var srcAccessMask VkAccessFlags2
    if imageLayout == VkConstants.VK_IMAGE_LAYOUT_UNDEFINED {
      srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT
      srcAccessMask = VkConstants.VK_ACCESS_2_NONE
    } else if imageLayout == VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL {
      srcStageMask = VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT
      srcAccessMask = VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT
    } else {
      throw InvalidOperationException("Vulkan offscreen image has an unsupported layout")
    }
    VulkanTransitions.RecordImage(
      commandBuffer,
      dispatch.vkCmdPipelineBarrier2,
      image,
      VulkanTransitions.ColorSubresourceRange(),
      imageLayout,
      VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
      srcStageMask,
      srcAccessMask,
      VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
      VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT)
  }

  private func FinishRecord() {
    VulkanTransitions.RecordImage(
      commandBuffer,
      dispatch.vkCmdPipelineBarrier2,
      image,
      VulkanTransitions.ColorSubresourceRange(),
      VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
      VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
      VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
      VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
      VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT,
      VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT)
    WriteTimestamp(VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT, 2u)
    var copyRegion = VkBufferImageCopy{}
    copyRegion.bufferOffset = 0uL
    copyRegion.bufferRowLength = 0u
    copyRegion.bufferImageHeight = 0u
    copyRegion.imageSubresource = VkImageSubresourceLayers{}
    copyRegion.imageSubresource.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
    copyRegion.imageSubresource.mipLevel = 0u
    copyRegion.imageSubresource.baseArrayLayer = 0u
    copyRegion.imageSubresource.layerCount = 1u
    copyRegion.imageOffset = VkOffset3D{}
    copyRegion.imageExtent = VkExtent3D{}
    copyRegion.imageExtent.width = extent.width
    copyRegion.imageExtent.height = extent.height
    copyRegion.imageExtent.depth = 1u
    copyRegion.imageOffset.x = int32(readbackRegion.X)
    copyRegion.imageOffset.y = int32(readbackRegion.Y)
    copyRegion.imageExtent.width = readbackRegion.Width
    copyRegion.imageExtent.height = readbackRegion.Height
    readbackDispatch.CopyImageToBuffer(commandBuffer, image,
      VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, stagingBuffer, copyRegion)
    WriteTimestamp(VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT, 3u)
  }

  private func ResolveGpuTiming() {
    gpuTimingAvailable = false
    gpuSceneReplayNanoseconds = 0uL
    gpuCopyNanoseconds = 0uL
    if !timestampEnabled || timestampQueryPool == 0uL {
      return
    }
    let values * uint64 = stackalloc[TimestampQueryCount]uint64
    let getQueryPoolResults = dispatch.vkGetQueryPoolResults
    let result = getQueryPoolResults(
      device,
      timestampQueryPool,
      0u,
      uint32(TimestampQueryCount),
      nuint(TimestampQueryCount * 8),
      *void(values),
      VkDeviceSize(8),
      VkQueryResultFlags(uint32(VkConstants.VK_QUERY_RESULT_64_BIT)))
    if result != VkConstants.VK_SUCCESS {
      return
    }
    gpuSceneReplayNanoseconds = ElapsedTimestampNanoseconds(
      ElapsedTimestampTicks(values[0], values[1]))
    gpuCopyNanoseconds = ElapsedTimestampNanoseconds(
      ElapsedTimestampTicks(values[2], values[3]))
    gpuTimingAvailable = true
  }

  private func ElapsedTimestampTicks(begin uint64, end uint64) uint64 {
    let maskedBegin = begin & timestampMask
    let maskedEnd = end & timestampMask
    if maskedEnd >= maskedBegin {
      return maskedEnd - maskedBegin
    }
    return (timestampMask - maskedBegin + 1uL) + maskedEnd
  }

  private func ElapsedTimestampNanoseconds(ticks uint64) uint64 {
    if timestampPeriod <= 0.0F {
      return 0uL
    }
    return uint64(float64(ticks) * float64(timestampPeriod))
  }

  private func BuildTimestampMask(validBits uint32) uint64 {
    if validBits >= 64u {
      return uint64.MaxValue
    }
    if validBits == 0u {
      return 0uL
    }
    return (1uL << int32(validBits)) - 1uL
  }

  private func DestroyTimestampQueryPool() {
    if timestampQueryPool == 0uL {
      timestampEnabled = false
      timestampQueryPoolAccounted = false
      return
    }
    let destroyQueryPool = dispatch.vkDestroyQueryPool
    destroyQueryPool(device, timestampQueryPool, nil)
    timestampQueryPool = 0uL
    if timestampQueryPoolAccounted {
      if let accounting = objectAccounting { accounting.Release() }
      timestampQueryPoolAccounted = false
    }
    timestampEnabled = false
  }

  private func AbandonTimestampQueryPool() {
    timestampQueryPool = 0uL
    if timestampQueryPoolAccounted {
      if let accounting = objectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
      timestampQueryPoolAccounted = false
    }
    timestampEnabled = false
    gpuTimingAvailable = false
    gpuSceneReplayNanoseconds = 0uL
    gpuCopyNanoseconds = 0uL
  }

  private func WriteTimestamp(stage VkPipelineStageFlags2, query uint32) {
    if !timestampEnabled || timestampQueryPool == 0uL {
      return
    }
    let writeTimestamp = dispatch.vkCmdWriteTimestamp2
    writeTimestamp(commandBuffer, stage, timestampQueryPool, query)
  }

  private func BeginRendering(clearColor VkClearColorValue) {
    var clearValue = VkClearValue{}
    clearValue.color = clearColor
    var attachment = VkRenderingAttachmentInfo{}
    attachment.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO
    attachment.imageView = imageView
    attachment.imageLayout = VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
    attachment.resolveMode = VkConstants.VK_RESOLVE_MODE_NONE
    attachment.resolveImageView = 0uL
    attachment.resolveImageLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
    attachment.loadOp = VkConstants.VK_ATTACHMENT_LOAD_OP_CLEAR
    attachment.storeOp = VkConstants.VK_ATTACHMENT_STORE_OP_STORE
    attachment.clearValue = clearValue
    var rendering = VkRenderingInfo{}
    rendering.sType = VkConstants.VK_STRUCTURE_TYPE_RENDERING_INFO
    rendering.renderArea = VkRect2D{}
    rendering.renderArea.offset = VkOffset2D{}
    rendering.renderArea.extent = extent
    rendering.layerCount = 1u
    rendering.viewMask = 0u
    rendering.colorAttachmentCount = 1u
    rendering.pColorAttachments = &attachment
    rendering.pDepthAttachment = nil
    rendering.pStencilAttachment = nil
    let beginRendering = dispatch.vkCmdBeginRendering
    beginRendering(commandBuffer, &rendering)
  }

  private func EndRendering() {
    let endRendering = dispatch.vkCmdEndRendering
    endRendering(commandBuffer)
  }

  private func ReleaseReservedImageReferences() {
    if !imageReferencesReserved {
      return
    }
    let imageCount = reservedImageIdCount
    reservedImageIdCount = 0
    reservedTextAtlasIdCount = 0
    reservedPathIdCount = 0
    imageReferencesReserved = false
    var index int32 = 0
    while index < imageCount {
      let imageId = reservedImageIds[index]
      if imageId.IsValid {
        try { imageResources.ReleaseRecording(imageId, resourceGeneration) } catch (cleanup Exception) { }
      }
      index = index + 1
    }
  }

  private func MarkSubmittedResourceUses(submissionSerial uint64) {
    if !imageReferencesReserved {
      return
    }
    let imageIds = reservedImageIds
    let textAtlasIds = reservedTextAtlasIds
    let pathIds = reservedPathIds
    let imageMark = imageResources.MarkSubmitted(commandBuffer, submissionSerial, resourceGeneration)
    if imageMark < 0 {
      throw InvalidOperationException("Vulkan offscreen image upload submission is invalid")
    }
    var imageIndex int32 = 0
    while imageIndex < reservedImageIdCount {
      let imageId = imageIds[imageIndex]
      if imageId.IsValid {
        imageResources.MarkUsed(imageId, resourceGeneration, submissionSerial)
      }
      imageIndex = imageIndex + 1
    }
    if let atlases = textAtlases {
      atlases.MarkSubmitted(commandBuffer, submissionSerial)
      var textAtlasIndex int32 = 0
      while textAtlasIndex < reservedTextAtlasIdCount {
        let atlasId = textAtlasIds[textAtlasIndex]
        if atlasId.IsValid {
          atlases.MarkUsed(atlasId, submissionSerial)
        }
        textAtlasIndex = textAtlasIndex + 1
      }
    }
    pathResources.MarkSubmitted(commandBuffer, submissionSerial)
    pathResources.MarkPathUsage(pathIds, reservedPathIdCount, submissionSerial)
    reservedImageIdCount = 0
    reservedTextAtlasIdCount = 0
    reservedPathIdCount = 0
    imageReferencesReserved = false
  }

  private func EnsureResidentResources() {
    let imageStats = imageResources.Stats
    if imageStats.Upload.ActiveRanges != imageStats.Upload.SubmittedRanges {
      throw InvalidOperationException("Vulkan readback requires resident image uploads")
    }
    if let atlases = textAtlases {
      let stats = atlases.Stats
      if (stats.UploadPending && !stats.UploadSubmitted)
        || (stats.UploadRecorded && !stats.UploadSubmitted) {
          throw InvalidOperationException("Vulkan readback requires resident glyph uploads")
        }
    }
    let pathStats = pathResources.Stats
    if (pathStats.UploadPending && !pathStats.UploadSubmitted)
      || (pathStats.UploadRecorded && !pathStats.UploadSubmitted) {
        throw InvalidOperationException("Vulkan readback requires resident path uploads")
      }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanOffscreenTarget")
    }
  }

  private func NoteResult(result VkResult) {
    lastResult = result
    if result != VkConstants.VK_SUCCESS
      && result != VkConstants.VK_NOT_READY
      && result != VkConstants.VK_TIMEOUT{
        try {
          if let current = diagnostics {
            current.RecordResult(VulkanDiagnosticEventIds.VulkanResult,
              int32(result))
          }
        } catch (cleanup Exception) { }
      }
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      unsafeTeardown = true
    }
  }

  private func Create() {
    try {
      var commandPoolCreateInfo = VkCommandPoolCreateInfo{}
      commandPoolCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO
      commandPoolCreateInfo.flags = uint32(VkConstants.VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT)
      commandPoolCreateInfo.queueFamilyIndex = graphicsFamilyIndex
      let createCommandPool = dispatch.vkCreateCommandPool
      let poolResult = createCommandPool(device, &commandPoolCreateInfo, nil, &commandPool)
      NoteResult(poolResult)
      if poolResult != VkConstants.VK_SUCCESS || commandPool == 0uL {
        throw InvalidOperationException("vkCreateCommandPool failed: " + poolResult.ToString())
      }
      try {
        if let accounting = objectAccounting {
          accounting.Allocate()
          commandPoolAccounted = true
        }
      } catch (error Exception) {
        let destroyCommandPool = dispatch.vkDestroyCommandPool
        destroyCommandPool(device, commandPool, nil)
        commandPool = 0uL
        throw error
      }
      var imageCreateInfo = VkImageCreateInfo{}
      imageCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO
      imageCreateInfo.imageType = VkConstants.VK_IMAGE_TYPE_2D
      imageCreateInfo.format = targetFormat
      imageCreateInfo.extent = VkExtent3D{}
      imageCreateInfo.extent.width = extent.width
      imageCreateInfo.extent.height = extent.height
      imageCreateInfo.extent.depth = 1u
      imageCreateInfo.mipLevels = 1u
      imageCreateInfo.arrayLayers = 1u
      imageCreateInfo.samples = VkConstants.VK_SAMPLE_COUNT_1_BIT
      imageCreateInfo.tiling = VkConstants.VK_IMAGE_TILING_OPTIMAL
      imageCreateInfo.usage = uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)
      | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT)
      imageCreateInfo.sharingMode = VkConstants.VK_SHARING_MODE_EXCLUSIVE
      imageCreateInfo.initialLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
      let createImage = dispatch.vkCreateImage
      let imageResult = createImage(device, &imageCreateInfo, nil, &image)
      NoteResult(imageResult)
      if imageResult != VkConstants.VK_SUCCESS || image == 0uL {
        throw InvalidOperationException("vkCreateImage failed: " + imageResult.ToString())
      }
      try {
        if let accounting = objectAccounting {
          accounting.Allocate()
          imageAccounted = true
        }
      } catch (error Exception) {
        let destroyImage = dispatch.vkDestroyImage
        destroyImage(device, image, nil)
        image = 0uL
        throw error
      }
      imageAllocation = allocator.AllocateImage(
        image,
        VulkanMemoryPolicy.DeviceLocalRequiredPreferred)

      var viewCreateInfo = VkImageViewCreateInfo{}
      viewCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO
      viewCreateInfo.image = image
      viewCreateInfo.viewType = VkConstants.VK_IMAGE_VIEW_TYPE_2D
      viewCreateInfo.format = targetFormat
      viewCreateInfo.components = VkComponentMapping{}
      viewCreateInfo.components.r = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
      viewCreateInfo.components.g = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
      viewCreateInfo.components.b = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
      viewCreateInfo.components.a = VkConstants.VK_COMPONENT_SWIZZLE_IDENTITY
      viewCreateInfo.subresourceRange = VkImageSubresourceRange{}
      viewCreateInfo.subresourceRange.aspectMask = uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT)
      viewCreateInfo.subresourceRange.baseMipLevel = 0u
      viewCreateInfo.subresourceRange.levelCount = 1u
      viewCreateInfo.subresourceRange.baseArrayLayer = 0u
      viewCreateInfo.subresourceRange.layerCount = 1u
      let createImageView = dispatch.vkCreateImageView
      let viewResult = createImageView(device, &viewCreateInfo, nil, &imageView)
      NoteResult(viewResult)
      if viewResult != VkConstants.VK_SUCCESS || imageView == 0uL {
        throw InvalidOperationException("vkCreateImageView failed: " + viewResult.ToString())
      }
      try {
        if let accounting = objectAccounting {
          accounting.Allocate()
          imageViewAccounted = true
        }
      } catch (error Exception) {
        let destroyImageView = dispatch.vkDestroyImageView
        destroyImageView(device, imageView, nil)
        imageView = 0uL
        throw error
      }

      var bufferCreateInfo = VkBufferCreateInfo{}
      bufferCreateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO
      bufferCreateInfo.size = stagingByteSize
      bufferCreateInfo.usage = uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_DST_BIT)
      bufferCreateInfo.sharingMode = VkConstants.VK_SHARING_MODE_EXCLUSIVE
      let createBuffer = dispatch.vkCreateBuffer
      let bufferResult = createBuffer(device, &bufferCreateInfo, nil, &stagingBuffer)
      NoteResult(bufferResult)
      if bufferResult != VkConstants.VK_SUCCESS || stagingBuffer == 0uL {
        throw InvalidOperationException("vkCreateBuffer failed: " + bufferResult.ToString())
      }
      try {
        if let accounting = objectAccounting {
          accounting.Allocate()
          stagingBufferAccounted = true
        }
      } catch (error Exception) {
        let destroyBuffer = dispatch.vkDestroyBuffer
        destroyBuffer(device, stagingBuffer, nil)
        stagingBuffer = 0uL
        throw error
      }
      stagingAllocation = allocator.AllocateBuffer(
        stagingBuffer,
        VulkanMemoryPolicy.HostVisibleCoherentCached)
      let mapResult = allocator.Map(stagingAllocation!!)
      NoteResult(mapResult)
      if mapResult != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("vkMapMemory failed: " + mapResult.ToString())
      }

      let commandBuffers * VkCommandBuffer = stackalloc[1]VkCommandBuffer
      var allocateInfo = VkCommandBufferAllocateInfo{}
      allocateInfo.sType = VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO
      allocateInfo.commandPool = commandPool
      allocateInfo.level = VkConstants.VK_COMMAND_BUFFER_LEVEL_PRIMARY
      allocateInfo.commandBufferCount = 1u
      let allocateCommandBuffers = dispatch.vkAllocateCommandBuffers
      let commandResult = allocateCommandBuffers(device, &allocateInfo, commandBuffers)
      NoteResult(commandResult)
      if commandResult != VkConstants.VK_SUCCESS || commandBuffers[0] == nint(0) {
        throw InvalidOperationException("vkAllocateCommandBuffers failed: " + commandResult.ToString())
      }
      commandBuffer = commandBuffers[0]
      primitiveRenderer = VulkanPrimitiveRenderer(
        device,
        dispatch,
        targetFormat,
        MaxClipDepth,
        imageResources,
        resourceGeneration,
        maxStorageBufferRange,
        primitiveState,
        1,
        pathAtlas,
        textAtlases,
        objectAccounting,
        allocator,
        clipMaskAtlas)
      layerPool = VulkanOffscreenLayerPool(
        device,
        dispatch,
        allocator,
        imageResources.DescriptorSetLayout,
        targetFormat,
        objectAccounting,
        resourcePolicy.OffscreenLayerInitialCapacity,
        resourcePolicy.OffscreenLayerHardBytes,
        nil)
      primitiveRenderer!!.SetLayerPool(layerPool)
      CreateTimestampQueryPool()
    } catch (error Exception) {
      if unsafeTeardown || DeviceLossDetected {
        try { AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
      } else {
        try { Dispose() } catch (cleanup Exception) { }
      }
      throw error
    }
  }

  private func CreateTimestampQueryPool() {
    if !timestampEnabled {
      return
    }
    var createInfo = VkQueryPoolCreateInfo{}
    createInfo.sType = VkConstants.VK_STRUCTURE_TYPE_QUERY_POOL_CREATE_INFO
    createInfo.queryType = VkConstants.VK_QUERY_TYPE_TIMESTAMP
    createInfo.queryCount = uint32(TimestampQueryCount)
    let createQueryPool = dispatch.vkCreateQueryPool
    let result = createQueryPool(device, &createInfo, nil, &timestampQueryPool)
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      NoteResult(result)
      throw InvalidOperationException("vkCreateQueryPool failed: " + result.ToString())
    }
    if result != VkConstants.VK_SUCCESS || timestampQueryPool == 0uL {
      timestampQueryPool = 0uL
      timestampEnabled = false
      return
    }
    try {
      if let accounting = objectAccounting {
        accounting.Allocate()
        timestampQueryPoolAccounted = true
      }
    } catch (error Exception) {
      let destroyQueryPool = dispatch.vkDestroyQueryPool
      destroyQueryPool(device, timestampQueryPool, nil)
      timestampQueryPool = 0uL
      timestampEnabled = false
    }
  }
}
