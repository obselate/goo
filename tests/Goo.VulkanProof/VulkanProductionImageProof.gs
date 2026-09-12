package Goo.VulkanProof

import System
import System.Threading
import Goo

internal class VulkanProductionImageProvider : ImageSourceProvider, IDisposable {
  private var version uint64 = 1uL
  private var disposed bool

  public prop ContentVersion uint64{ get -> version }
  public event ContentChanged Action

  public func Acquire() ImageSourceLease {
    if disposed {
      throw ObjectDisposedException("VulkanProductionImageProvider")
    }
    return ImageSourceLease()
  }

  internal func Advance() {
    if disposed {
      throw ObjectDisposedException("VulkanProductionImageProvider")
    }
    version++
    ContentChanged?.Invoke()
  }

  public func Dispose() {
    disposed = true
  }
}

internal data struct VulkanProductionImageProofResult {
  var Logical VulkanLogicalResource
  var Generation uint64
  var NearestDigest uint64
  var LinearDigest uint64
  var PlateauHandles uint64
  var PlateauResidentAllocations uint64
  var PlateauResidentBytes VkDeviceSize
  var RetainedHandles uint64
  var ReleasedHandles uint64
  var RetainedLiveAllocations uint64
  var ReleasedLiveAllocations uint64
  var PreflightHandles uint64
  var PreflightReleasedHandles uint64
  var PreflightLiveAllocations uint64
  var PreflightReleasedLiveAllocations uint64
  var PreflightLiveBytes VkDeviceSize
  var PreflightReleasedLiveBytes VkDeviceSize
}

private func VulkanProductionImagePixels() []uint8 -> []uint8 {
  uint8(0), uint8(0), uint8(255), uint8(255),
  uint8(128), uint8(64), uint8(0), uint8(128),
  uint8(0), uint8(255), uint8(0), uint8(255),
  uint8(0), uint8(0), uint8(0), uint8(0),
}

private func VulkanProductionImageSource() VulkanResourceSource -> VulkanResourceSource {
  ProviderId: 9911uL,
  SourceId: VulkanImageE2EContract.ImageLogicalId,
  Version: 2uL,
  Bytes: 16uL,
}

private func VulkanProductionImageUploadStatsEqual(
  first VulkanUploadRingStats,
  second VulkanUploadRingStats) bool -> first.Capacity == second.Capacity
  && first.UsedBytes == second.UsedBytes
  && first.FreeBytes == second.FreeBytes
  && first.ActiveRanges == second.ActiveRanges
  && first.SubmittedRanges == second.SubmittedRanges

private func VulkanProductionImageAwaitAcceptedSubmit(
  window Window,
  baseline VulkanFrameSubmissionTestSnapshot) {
    let deadline = Environment.TickCount64 + 5000L
    var current = WindowReadbackTestFixture.FrameSubmissions(window)
    while current.Slot0Serial == baseline.Slot0Serial
      && current.Slot1Serial == baseline.Slot1Serial
      && Environment.TickCount64 < deadline{
        VulkanProductionReadbackFixture.PollQueueCompletion(window)
        Thread.Yield()
        current = WindowReadbackTestFixture.FrameSubmissions(window)
      }
    if current.Slot0Serial == baseline.Slot0Serial
      && current.Slot1Serial == baseline.Slot1Serial{
        throw InvalidOperationException("Vulkan production image upload submission was not accepted")
      }
  }

private func VulkanProductionImageSubmitWithoutCollection(window Window) uint64 {
  let baseline = WindowReadbackTestFixture.FrameSubmissions(window)
  let acceptedBefore = VulkanProductionReadbackFixture.AcceptedSubmissionSerial(window)
  WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(window)
  var released bool
  try {
    WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0)
    if !WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 2000) {
      throw InvalidOperationException("Vulkan production image upload did not reach the held submit")
    }
    WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    released = true
    VulkanProductionImageAwaitAcceptedSubmit(window, baseline)
    let accepted = VulkanProductionReadbackFixture.AcceptedSubmissionSerial(window)
    if accepted <= acceptedBefore {
      throw InvalidOperationException("Vulkan production image global submission serial did not advance")
    }
    return accepted
  } finally {
    if !released {
      WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
    }
  }
}

private unsafe func VulkanProductionImageQueueUpload(
  resources VulkanImageResources,
  id ResourceId,
  pixels []uint8,
  generation uint64) {
    fixed source * uint8 = pixels{
      if !resources.QueueUpload(id, source, uint64(pixels.Length), generation) {
        throw InvalidOperationException("Vulkan production image upload did not queue")
      }
    }
  }

private func VulkanProductionImageCompleteUpload(
  window Window,
  resources VulkanImageResources,
  generation uint64,
  descriptorRetry bool = false) {
    let acceptedBefore = VulkanProductionReadbackFixture.AcceptedSubmissionSerial(window)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 2000)
    let accepted = VulkanProductionReadbackFixture.AcceptedSubmissionSerial(window)
    if accepted <= acceptedBefore {
      throw InvalidOperationException("Vulkan production image upload submission serial did not advance")
    }
    let completed = AwaitVulkanProductionSubmission(window, accepted)
    if completed == 0uL {
      throw InvalidOperationException("Vulkan production image upload did not complete")
    }
    let collected = if descriptorRetry {
      resources.CollectAfterDescriptorRetryForProof(VulkanImageResourceId(), completed)
    } else {
      resources.Collect(completed)
    }
    if collected <= 0 {
      throw InvalidOperationException("Vulkan production image upload did not complete")
    }
    let lookup = resources.Lookup(VulkanImageResourceId(), generation)
    if !lookup.Found || !lookup.Renderable {
      throw InvalidOperationException("Vulkan production image is not renderable")
    }
  }

private unsafe func VulkanProductionImageVerify(
  result VulkanReadbackResult,
  linear bool) uint64{
    fixed readback * uint8 = result.Pixels{
      let valid = if linear {
        VerifyVulkanImageLinearReadback(readback, result.Width, result.Height)
      } else {
        VerifyVulkanImageReadback(readback, result.Width, result.Height)
      }
      if !valid {
        throw InvalidOperationException("Vulkan production sampled image pixels are invalid")
      }
      return VulkanImageReadbackDigest(readback, result.Width, result.Height)
    }
  }

private unsafe func VulkanProductionImageVerifyEmpty(result VulkanReadbackResult) {
  fixed readback * uint8 = result.Pixels{
    let byteCount = uint64(result.RowBytes) * uint64(result.Height)
    var index uint64
    while index < byteCount {
      if readback[index] != uint8(0) {
        throw InvalidOperationException("Vulkan production empty image frame is not transparent")
      }
      index++
    }
  }
}

private func VulkanProductionImageRequest(
  capture VulkanProductionReadbackCapture,
  frame SceneFrame,
  clearColor VkClearColorValue) VulkanReadbackResult{
    let submit = capture.Request(frame, clearColor)
    if submit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production image readback submission failed: "
        +submit.ToString())
    }
    if capture.LastRequestAllocatedBytes != 0uL {
      throw InvalidOperationException("Vulkan production image request path allocated managed bytes: "
        +capture.LastRequestAllocatedBytes.ToString())
    }
    return AwaitVulkanProductionReadback(capture)
  }

private func VulkanProductionImageWarmRequest(
  capture VulkanProductionReadbackCapture,
  frame SceneFrame,
  clearColor VkClearColorValue) VulkanReadbackResult{
    let submit = capture.Request(frame, clearColor)
    if submit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production image warm submission failed: "
        +submit.ToString())
    }
    return AwaitVulkanProductionReadback(capture)
  }

private func VulkanProductionImageLogicalResource(
  resources VulkanImageResources) VulkanLogicalResource{
    let count = resources.Stats.Registry.LogicalCount
    if count <= 0 {
      throw InvalidOperationException("Vulkan production logical image source is unavailable")
    }
    let logical = [count]VulkanLogicalResource
    let copied = resources.CopyLogicalResources(logical)
    var index int32 = 0
    while index < copied {
      let candidate = logical[index]
      if candidate.Id.Kind == SceneResourceKind.Image
        && candidate.Id.LogicalId == VulkanImageE2EContract.ImageLogicalId
        && candidate.Id.Version == 2uL {
          return candidate
        }
      index++
    }
    throw InvalidOperationException("Vulkan production logical image source copy failed")
  }

private func VulkanProductionImageRegister(
  resources VulkanImageResources,
  logical VulkanLogicalResource,
  samplerMode VulkanImageSamplerMode) {
    let registration = resources.RegisterImage(
      logical.Id,
      2u,
      2u,
      logical.Source,
      logical.Cacheable,
      VulkanImageSamplerId(),
      samplerMode)
    if !registration.Found {
      throw InvalidOperationException("Vulkan production image registration failed")
    }
  }

private func VulkanProductionTinyLogical(
  logicalId uint64,
  cacheable bool) VulkanLogicalResource{
    let id = ResourceId{
      Kind: SceneResourceKind.Image,
      LogicalId: logicalId,
      Version: 1uL,
    }
    return VulkanLogicalResource{
      Id: id,
      Source: VulkanResourceSource{
        ProviderId: 9921uL,
        SourceId: logicalId,
        Version: 1uL,
        Bytes: 16uL,
      },
      Bytes: 16uL,
      Cacheable: cacheable,
    }
  }

private func VulkanProductionImageGrowthAndFailure(
  resources VulkanImageResources,
  allocator VulkanMemoryAllocator) {
    let allocatorBefore = allocator.Counters
    let tiny = resources.CreateTinyForProof()
    try {
      let initialStats = tiny.Stats
      let initialAllocator = allocator.Counters
      let invalid = VulkanProductionTinyLogical(9920uL, false)
      var invalidRejected bool
      try {
        var source = invalid.Source
        source.ProviderId = 0uL
        tiny.RegisterImage(invalid.Id, 2u, 2u, source, false,
          VulkanImageSamplerId(), VulkanImageSamplerMode.Nearest)
      } catch (error ArgumentException) {
        invalidRejected = true
      }
      if !invalidRejected || !initialStats.Equals(tiny.Stats)
        || !initialAllocator.Equals(allocator.Counters) {
          throw InvalidOperationException("Vulkan production invalid image registration changed state")
        }

      let first = VulkanProductionTinyLogical(9922uL, false)
      let second = VulkanProductionTinyLogical(9923uL, true)
      let replacement = VulkanProductionTinyLogical(9924uL, true)
      VulkanProductionImageRegister(tiny, first, VulkanImageSamplerMode.Nearest)
      VulkanProductionImageRegister(tiny, second, VulkanImageSamplerMode.Nearest)
      if tiny.Stats.Capacity != 2 || tiny.LogicalCapacityForProof != 2 {
        throw InvalidOperationException("Vulkan production image capacity did not grow")
      }
      if !tiny.Retire(first.Id, tiny.Generation, 0uL) || tiny.Collect(0uL) <= 0 {
        throw InvalidOperationException("Vulkan production image hole did not retire")
      }
      VulkanProductionImageRegister(tiny, replacement, VulkanImageSamplerMode.Nearest)
      let stats = tiny.Stats
      let logical = [2]VulkanLogicalResource
      if tiny.CopyLogicalResources(logical) != 2
        || stats.Capacity != 2 || tiny.LogicalCapacityForProof != 2
        || logical[0].Id.LogicalId != replacement.Id.LogicalId
        || logical[1].Id.LogicalId != second.Id.LogicalId
        || stats.LiveCount != 2 || stats.ResidentBytes != 32uL
        || stats.Registry.EntryCount != 2 || stats.Registry.LogicalCount != 2
        || stats.Registry.ResidentCount != 0 || stats.Registry.RetiringCount != 0
        || stats.Registry.LogicalBytes != 32uL
        || stats.Registry.LogicalSourceBytes != 32uL {
          throw InvalidOperationException("Vulkan production image holes were not reused")
        }
    } finally {
      tiny.Dispose()
    }
    let allocatorAfter = allocator.Counters
    if tiny.Stats.LiveObjectCount != 0uL
      || allocatorAfter.liveAllocations != allocatorBefore.liveAllocations
      || allocatorAfter.liveBytes != allocatorBefore.liveBytes
      || allocatorAfter.retiredAllocations != allocatorBefore.retiredAllocations
      || allocatorAfter.retiredBytes != allocatorBefore.retiredBytes{
        throw InvalidOperationException("Vulkan production image growth leaked memory")
      }
  }

private unsafe func VulkanProductionImageFirstPass(
  pixels []uint8) VulkanProductionImageProofResult{
    let window = OpenVulkanProductionProofWindow()
    var capture VulkanProductionReadbackCapture? = nil
    try {
      guard let resources = VulkanProductionReadbackFixture.ImageResources(window),
      let allocator = VulkanProductionReadbackFixture.MemoryAllocator(window) else {
        throw InvalidOperationException("Vulkan production image resources are unavailable")
      }
      let generation = VulkanProductionReadbackFixture.ResourceGeneration(window)
      if generation == 0uL {
        throw InvalidOperationException("Vulkan production image generation is unavailable")
      }
      VulkanProductionImageGrowthAndFailure(resources, allocator)
      let logical = VulkanLogicalResource{
        Id: VulkanImageResourceId(),
        Source: VulkanProductionImageSource(),
        Bytes: 16uL,
        Cacheable: true,
      }
      VulkanProductionImageRegister(resources, logical, VulkanImageSamplerMode.Nearest)
      VulkanProductionImageQueueUpload(resources, logical.Id, pixels, generation)
      let completedBeforePreflight = VulkanProductionReadbackFixture.CompletedSubmissionSerial(window)
      let preflightSerial = VulkanProductionImageSubmitWithoutCollection(window)
      let preflightStats = resources.Stats
      let preflightAllocator = allocator.Counters
      if !resources.Retire(logical.Id, generation, preflightSerial) {
        throw InvalidOperationException("Vulkan production pending image retirement was not accepted")
      }
      if resources.Collect(completedBeforePreflight) != 0 {
        throw InvalidOperationException("Vulkan production pending image retired before its upload fence")
      }
      let pendingStats = resources.Stats
      let pendingAllocator = allocator.Counters
      if pendingStats.LiveObjectCount != preflightStats.LiveObjectCount
        || pendingAllocator.liveAllocations != preflightAllocator.liveAllocations
        || pendingAllocator.liveBytes != preflightAllocator.liveBytes
        || pendingAllocator.residentAllocations != preflightAllocator.residentAllocations
        || pendingAllocator.residentBytes != preflightAllocator.residentBytes{
          throw InvalidOperationException("Vulkan production pending image released resources early")
        }
      WindowReadbackTestFixture.DrainWindowQueue(window, 2000)
      let preflightCompleted = AwaitVulkanProductionSubmission(window, preflightSerial)
      if preflightCompleted < preflightSerial || resources.Collect(preflightCompleted) <= 0 {
        throw InvalidOperationException("Vulkan production pending image retirement did not collect")
      }
      let preflightReleasedStats = resources.Stats
      let preflightReleasedAllocator = allocator.Counters
      if preflightReleasedStats.LiveObjectCount >= pendingStats.LiveObjectCount
        || preflightReleasedAllocator.liveAllocations >= pendingAllocator.liveAllocations
        || preflightReleasedAllocator.liveBytes >= pendingAllocator.liveBytes{
          throw InvalidOperationException("Vulkan production pending image resources were not released")
        }

      VulkanProductionImageRegister(resources, logical, VulkanImageSamplerMode.Nearest)
      VulkanProductionImageQueueUpload(resources, logical.Id, pixels, generation)
      VulkanProductionImageCompleteUpload(window, resources, generation, true)
      capture = VulkanProductionReadbackFixture.Open(window,
        VulkanImageE2EContract.Width, VulkanImageE2EContract.Height)
      let frame = SceneFrame(4)
      let clearColor = VkClearColorValue{}
      BuildVulkanImageScene(frame, 0u)
      let warmNearest = VulkanProductionImageWarmRequest(capture, frame, clearColor)
      VulkanProductionImageVerify(warmNearest, false)
      frame.ResetForReuse()
      let empty = VulkanProductionImageRequest(capture, frame, clearColor)
      VulkanProductionImageVerifyEmpty(empty)
      BuildVulkanImageScene(frame, 0u)
      let nearest = VulkanProductionImageRequest(capture, frame, clearColor)
      let nearestDigest = VulkanProductionImageVerify(nearest, false)
      let plateauStats = resources.Stats
      let plateauAllocator = allocator.Counters
      fixed unchangedSource * uint8 = pixels{
        if resources.QueueUpload(logical.Id, unchangedSource, 16uL, generation) {
          throw InvalidOperationException("Vulkan production unchanged image upload was queued")
        }
      }
      VulkanProductionImageRegister(resources, logical, VulkanImageSamplerMode.Linear)
      BuildVulkanImageScene(frame, 1u)
      let linear = VulkanProductionImageRequest(capture, frame, clearColor)
      let linearDigest = VulkanProductionImageVerify(linear, true)
      if linearDigest == nearestDigest {
        throw InvalidOperationException("Vulkan production nearest and linear image readbacks are identical")
      }
      let plateauAfterStats = resources.Stats
      let plateauAfterAllocator = allocator.Counters
      if !VulkanProductionImageUploadStatsEqual(plateauStats.Upload, plateauAfterStats.Upload)
        || plateauStats.LiveObjectCount != plateauAfterStats.LiveObjectCount
        || plateauAllocator.liveAllocations != plateauAfterAllocator.liveAllocations
        || plateauAllocator.liveBytes != plateauAfterAllocator.liveBytes
        || plateauAllocator.residentAllocations != plateauAfterAllocator.residentAllocations
        || plateauAllocator.residentBytes != plateauAfterAllocator.residentBytes{
          throw InvalidOperationException("Vulkan production unchanged image render changed resource plateau")
        }

      let completedBeforeRetire = VulkanProductionReadbackFixture.CompletedSubmissionSerial(window)
      let retireSubmit = capture.Request(frame, clearColor)
      if retireSubmit != VkConstants.VK_SUCCESS || capture.LastRequestAllocatedBytes != 0uL {
        throw InvalidOperationException("Vulkan production retirement request path failed or allocated managed bytes")
      }
      let retireSerial = capture.SubmissionSerial
      if !resources.Retire(logical.Id, generation, retireSerial) {
        throw InvalidOperationException("Vulkan production image retirement was not accepted")
      }
      let retainedStats = resources.Stats
      let retainedAllocator = allocator.Counters
      if resources.Collect(completedBeforeRetire) != 0 {
        throw InvalidOperationException("Vulkan production image retired before its render fence")
      }
      let retainedAfterCollect = resources.Stats
      let retainedAllocatorAfterCollect = allocator.Counters
      if retainedAfterCollect.LiveObjectCount != retainedStats.LiveObjectCount
        || retainedAllocatorAfterCollect.liveAllocations != retainedAllocator.liveAllocations
        || retainedAllocatorAfterCollect.liveBytes != retainedAllocator.liveBytes
        || retainedAllocatorAfterCollect.residentAllocations != retainedAllocator.residentAllocations
        || retainedAllocatorAfterCollect.residentBytes != retainedAllocator.residentBytes{
          throw InvalidOperationException("Vulkan production retired image released before its render fence")
        }
      let retiredFrame = AwaitVulkanProductionReadback(capture)
      if VulkanProductionImageVerify(retiredFrame, true) != linearDigest {
        throw InvalidOperationException("Vulkan production retirement frame digest changed")
      }
      frame.ResetForReuse()
      let emptyAfterRetirement = VulkanProductionImageRequest(capture, frame, clearColor)
      VulkanProductionImageVerifyEmpty(emptyAfterRetirement)
      let releasedStats = resources.Stats
      let releasedAllocator = allocator.Counters
      if releasedStats.LiveObjectCount >= retainedAfterCollect.LiveObjectCount
        || releasedAllocator.liveAllocations >= retainedAllocatorAfterCollect.liveAllocations
        || releasedAllocator.liveBytes >= retainedAllocatorAfterCollect.liveBytes{
          throw InvalidOperationException("Vulkan production image retirement did not release resources")
        }
      let copiedLogical = VulkanProductionImageLogicalResource(resources)
      return VulkanProductionImageProofResult{
        Logical: copiedLogical,
        Generation: generation,
        NearestDigest: nearestDigest,
        LinearDigest: linearDigest,
        PlateauHandles: plateauStats.LiveObjectCount,
        PlateauResidentAllocations: plateauAllocator.residentAllocations,
        PlateauResidentBytes: plateauAllocator.residentBytes,
        RetainedHandles: retainedAfterCollect.LiveObjectCount,
        ReleasedHandles: releasedStats.LiveObjectCount,
        RetainedLiveAllocations: retainedAllocatorAfterCollect.liveAllocations,
        ReleasedLiveAllocations: releasedAllocator.liveAllocations,
        PreflightHandles: pendingStats.LiveObjectCount,
        PreflightReleasedHandles: preflightReleasedStats.LiveObjectCount,
        PreflightLiveAllocations: pendingAllocator.liveAllocations,
        PreflightReleasedLiveAllocations: preflightReleasedAllocator.liveAllocations,
        PreflightLiveBytes: pendingAllocator.liveBytes,
        PreflightReleasedLiveBytes: preflightReleasedAllocator.liveBytes,
      }
    } finally {
      if let active = capture {
        active.Dispose()
      }
      CloseVulkanProductionProofWindow(window)
    }
  }

private func VulkanProductionImageRehydrate(
  proof VulkanProductionImageProofResult,
  pixels []uint8) {
    let window = OpenVulkanProductionProofWindow()
    var capture VulkanProductionReadbackCapture? = nil
    try {
      guard let resources = VulkanProductionReadbackFixture.ImageResources(window) else {
        throw InvalidOperationException("Vulkan rehydrated image resources are unavailable")
      }
      let generation = VulkanProductionReadbackFixture.ResourceGeneration(window)
      if generation <= proof.Generation {
        throw InvalidOperationException("Vulkan production image runtime generation did not advance")
      }
      var recordedBytes VkDeviceSize
      var recordedBarriers int32
      var staleRejected bool
      try {
        resources.RecordUploads(nint(0), proof.Generation,
          out recordedBytes, out recordedBarriers)
      } catch (error InvalidOperationException) {
        if error.Message != "Vulkan image generation is stale" {
          throw error
        }
        staleRejected = true
      }
      if !staleRejected {
        throw InvalidOperationException("Vulkan stale image generation was accepted")
      }
      VulkanProductionImageRegister(resources, proof.Logical, VulkanImageSamplerMode.Linear)
      VulkanProductionImageQueueUpload(resources, proof.Logical.Id, pixels, generation)
      VulkanProductionImageCompleteUpload(window, resources, generation)
      capture = VulkanProductionReadbackFixture.Open(window,
        VulkanImageE2EContract.Width, VulkanImageE2EContract.Height)
      let frame = SceneFrame(4)
      let clearColor = VkClearColorValue{}
      BuildVulkanImageScene(frame, 1u)
      let warmLinear = VulkanProductionImageWarmRequest(capture, frame, clearColor)
      if VulkanProductionImageVerify(warmLinear, true) != proof.LinearDigest {
        throw InvalidOperationException("Vulkan warm rehydrated image readback digest changed")
      }
      let completedBeforeRetire = VulkanProductionReadbackFixture.CompletedSubmissionSerial(window)
      let retainedStats = resources.Stats
      let submit = capture.Request(frame, clearColor)
      if submit != VkConstants.VK_SUCCESS || capture.LastRequestAllocatedBytes != 0uL {
        throw InvalidOperationException("Vulkan rehydrated image request path failed or allocated managed bytes")
      }
      let serial = capture.SubmissionSerial
      if !resources.Retire(proof.Logical.Id, generation, serial) {
        throw InvalidOperationException("Vulkan rehydrated image retirement was not accepted")
      }
      if resources.Collect(completedBeforeRetire) != 0 {
        throw InvalidOperationException("Vulkan rehydrated image retired before its render fence")
      }
      let result = AwaitVulkanProductionReadback(capture)
      if VulkanProductionImageVerify(result, true) != proof.LinearDigest {
        throw InvalidOperationException("Vulkan rehydrated image readback digest changed")
      }
      if resources.Stats.LiveObjectCount >= retainedStats.LiveObjectCount {
        throw InvalidOperationException("Vulkan rehydrated image retirement did not collect")
      }
    } finally {
      if let active = capture {
        active.Dispose()
      }
      CloseVulkanProductionProofWindow(window)
    }
  }

internal func RunProductionImageReadback() {
  let provider = VulkanProductionImageProvider()
  let pixels = VulkanProductionImagePixels()
  let source = ImageSource(2, 2, pixels)
  var stale ImageSourceLease? = nil
  var replacement ImageSourceLease? = nil
  try {
    stale = provider.Acquire()
    if !stale.BindContentVersion(1uL, provider)
      || stale.IsComplete || stale.IsFailed || stale.IsDisposed{
        throw InvalidOperationException("Vulkan pending production image source state is invalid")
      }
    provider.Advance()
    if stale.Complete(source) || stale.IsComplete {
      throw InvalidOperationException("Vulkan stale production image source completion was accepted")
    }
    replacement = provider.Acquire()
    if !replacement.BindContentVersion(2uL, provider)
      || !replacement.Complete(source) {
        throw InvalidOperationException("Vulkan replacement production image source completion failed")
      }
    source.Dispose()
    provider.Dispose()
    guard let decoded = replacement.Result(),
    let retainedPixels = decoded.Pixels() else {
      throw InvalidOperationException("Vulkan production image source lease did not retain pixels")
    }
    if !replacement.IsComplete || replacement.IsFailed || replacement.IsDisposed
      || retainedPixels.Length != pixels.Length{
        throw InvalidOperationException("Vulkan retained production image source state is invalid")
      }
    var pixelIndex int32 = 0
    while pixelIndex < pixels.Length {
      if retainedPixels[pixelIndex] != pixels[pixelIndex] {
        throw InvalidOperationException("Vulkan retained production image source pixels changed")
      }
      pixelIndex++
    }
    let proof = VulkanProductionImageFirstPass(retainedPixels)
    VulkanProductionImageRehydrate(proof, retainedPixels)
    Console.WriteLine("Image E2E: nearestDigest=${proof.NearestDigest} linearDigest=${proof.LinearDigest} plateau=true handles=${proof.PlateauHandles} residentAllocations=${proof.PlateauResidentAllocations} residentBytes=${proof.PlateauResidentBytes} retirement=true handles=${proof.RetainedHandles}->${proof.ReleasedHandles} liveAllocations=${proof.RetainedLiveAllocations}->${proof.ReleasedLiveAllocations} preflight=true handles=${proof.PreflightHandles}->${proof.PreflightReleasedHandles} liveAllocations=${proof.PreflightLiveAllocations}->${proof.PreflightReleasedLiveAllocations} liveBytes=${proof.PreflightLiveBytes}->${proof.PreflightReleasedLiveBytes} rehydration=true logicalGrowth=true holeReuse=true registrationFailure=true descriptorRetry=true allocated=0")
  } finally {
    stale?.Dispose()
    replacement?.Dispose()
    source.Dispose()
    provider.Dispose()
  }
}
