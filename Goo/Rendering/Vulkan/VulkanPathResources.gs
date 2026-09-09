package Goo

import System
import System.Collections.Generic
import System.Linq

internal data struct VulkanPathRenderable {
  internal let PathId ResourceId
  internal let GeometryRevision uint64
  internal let AtlasId ResourceId
  internal let BaseWord uint32
  internal let WordCount uint32
  internal let Bounds ConservativeBounds
  internal let FillRule uint32
  internal let Renderable bool
  internal let Published bool
  internal let RedrawRequired bool
  internal let UploadPending bool
  internal let UploadRecorded bool
  internal let UploadSubmitted bool

  internal prop AtlasWordOffset uint32{ get -> BaseWord }
  internal prop AtlasWordCount uint32{ get -> WordCount }
  internal prop IsReady bool{ get -> Renderable }
}

internal data struct VulkanPathResourcesStats {
  internal let PathCount int32
  internal let WordCapacity VkDeviceSize
  internal let WordCount uint32
  internal let PublishedWordPrefix uint32
  internal let QueuedWordPrefix uint32
  internal let UploadSequence uint64
  internal let CompletedUploadSequence uint64
  internal let UploadPending bool
  internal let UploadRecorded bool
  internal let UploadSubmitted bool
  internal let Uploaded bool
  internal let RedrawRequired bool
  internal let CapacityExhausted bool
  internal let LiveWordCount uint32
  internal let FreeWordCount uint32
  internal let FreeRangeCount int32
  internal let EvictionCount uint64
  internal let CompactionCount uint64
  internal let PressureEventCount uint64
  internal let PressureFailureCount uint64
  internal let GrowthCount uint64
  internal let DeferredRequestCount uint64
  internal let RetiredAtlasCount int32
  internal let RetiredWordCount uint64
  internal let ReuseCount uint64
  internal let FullUploadRequired bool
  internal let CompletedSubmissionFence uint64
  internal let ActiveReferenceCount int32
}

private data struct VulkanPathFreeRange {
  var Start uint32
  var Count uint32
}

private data struct VulkanRetiredPathAtlas {
  var Atlas VulkanPathAtlas
  var Fence uint64
}

private sealed class VulkanPathResourceRecord {
  internal var Identity VulkanPathResourceIdentity
  internal var BaseWord uint32
  internal var WordCount uint32
  internal var Bounds ConservativeBounds
  internal var FillRuleMask uint32
  internal var GeometryRevision uint64
  internal var LastUseFence uint64

  internal init(identity VulkanPathResourceIdentity, baseWord uint32,
    wordCount uint32, bounds ConservativeBounds, fillRuleMask uint32) {
      Reset(identity, baseWord, wordCount, bounds, fillRuleMask)
    }

  internal func Reset(identity VulkanPathResourceIdentity, baseWord uint32,
    wordCount uint32, bounds ConservativeBounds, fillRuleMask uint32) {
      Identity = identity
      BaseWord = baseWord
      WordCount = wordCount
      Bounds = bounds
      FillRuleMask = fillRuleMask
      GeometryRevision = identity.GeometryRevision
      LastUseFence = 0uL
    }
}

internal unsafe sealed class VulkanPathResources : IDisposable {
  private const InitialWordCapacity int32 = 4096
  private const DefaultAtlasLogicalId uint64 = 2147483649uL
  private const FillRuleNonZero uint32 = 0u
  private const FillRuleEvenOdd uint32 = 1u

  private var atlas VulkanPathAtlas
  private let identities VulkanPathIdentityRegistry
  private var atlasId ResourceId
  private let records Dictionary[uint64, VulkanPathResourceRecord]
  private let retiredRecords List[VulkanPathResourceRecord]
  private let recordPool List[VulkanPathResourceRecord]
  private let freeRanges List[VulkanPathFreeRange]
  private let retiredAtlases List[VulkanRetiredPathAtlas]
  private let sceneActivePathIds Dictionary[uint64, Dictionary[uint64, Dictionary[uint64, bool]]]
  private let activePathOwners Dictionary[uint64, int32]
  private let activePathRevisionOwners Dictionary[uint64, Dictionary[uint64, int32]]
  private let sceneRevisionSetPool List[Dictionary[uint64, bool]]
  private let revisionOwnerMapPool List[Dictionary[uint64, int32]]
  private var cpuWords []uint32
  private var nextWordOffset uint32
  private var liveWordCount uint32
  private var freeWordCount uint32
  private var activeReferenceCount int32
  private var nextSceneId uint64
  private var publishedWordPrefix uint32
  private var queuedWordPrefix uint32
  private var queuedUploadSequence uint64
  private var uploadQueued bool
  private var queuedUploadStart uint32
  private var queuedUploadEnd uint32
  private var dirtyReuseRevision uint64
  private var queuedReuseRevision uint64
  private var dirtyWordStart uint32
  private var dirtyWordEnd uint32
  private var dirtyWordsPending bool
  private var tailReusePending bool
  private var redrawRequired bool
  private var redrawSequence uint64
  private var capacityExhausted bool
  private var evictionCount uint64
  private var compactionCount uint64
  private var reuseCount uint64
  private var pressureEventCount uint64
  private var pressureFailureCount uint64
  private var growthCount uint64
  private var deferredRequestCount uint64
  private var atlasLastUseFence uint64
  private var retiredWordCount uint64
  private var completedSubmissionFence uint64
  private var disposed bool

  internal prop Atlas VulkanPathAtlas{ get -> atlas }
  internal prop IdentityRegistry VulkanPathIdentityRegistry{ get -> identities }
  internal prop AtlasId ResourceId{ get -> atlasId }
  internal prop CpuWords []uint32{ get -> cpuWords }
  internal prop WordCapacity VkDeviceSize{ get -> atlas.WordCapacity }
  internal prop WordCount uint32{ get -> nextWordOffset }
  internal prop LiveWordCount uint32{ get -> liveWordCount }
  internal prop FreeWordCount uint32{ get -> freeWordCount }
  internal prop PublishedWordPrefix uint32{ get -> publishedWordPrefix }
  internal prop QueuedWordPrefix uint32{ get -> queuedWordPrefix }
  internal prop UploadPending bool{
    get -> uploadQueued || dirtyWordsPending || nextWordOffset > publishedWordPrefix
  }
  internal prop UploadRecorded bool{ get -> atlas.UploadRecorded }
  internal prop UploadSubmitted bool{ get -> atlas.UploadSubmitted }
  internal prop CanRenderAfterPlannedUpload bool{ get -> !uploadQueued && !atlas.UploadPending }
  internal prop RedrawRequired bool{ get -> redrawRequired || dirtyWordsPending || uploadQueued }
  internal prop Stats VulkanPathResourcesStats{
    get {
      return VulkanPathResourcesStats{
        PathCount: records.Count,
        WordCapacity: atlas.WordCapacity,
        WordCount: nextWordOffset,
        PublishedWordPrefix: publishedWordPrefix,
        QueuedWordPrefix: queuedWordPrefix,
        UploadSequence: atlas.UploadSequence,
        CompletedUploadSequence: atlas.CompletedUploadSequence,
        UploadPending: UploadPending,
        UploadRecorded: atlas.UploadRecorded,
        UploadSubmitted: atlas.UploadSubmitted,
        Uploaded: atlas.IsUploaded,
        RedrawRequired: redrawRequired || dirtyWordsPending || uploadQueued,
        CapacityExhausted: capacityExhausted,
        LiveWordCount: liveWordCount,
        FreeWordCount: freeWordCount,
        FreeRangeCount: freeRanges.Count,
        EvictionCount: evictionCount,
        CompactionCount: compactionCount,
        PressureEventCount: pressureEventCount,
        PressureFailureCount: pressureFailureCount,
        RetiredWordCount: retiredWordCount,
        ReuseCount: reuseCount,
        FullUploadRequired: growthCount > 0uL && nextWordOffset > publishedWordPrefix,
        GrowthCount: growthCount,
        DeferredRequestCount: deferredRequestCount,
        RetiredAtlasCount: retiredAtlases.Count,
        CompletedSubmissionFence: completedSubmissionFence,
        ActiveReferenceCount: activeReferenceCount,
      }
    }
  }

  internal convenience init(nativeAtlas VulkanPathAtlas,
    nativeIdentities VulkanPathIdentityRegistry) {
      init(nativeAtlas, nativeIdentities, ResourceId{
        Kind: SceneResourceKind.Atlas,
        LogicalId: DefaultAtlasLogicalId,
        Version: 1uL,
      })
    }

  internal init(nativeAtlas VulkanPathAtlas, nativeIdentities VulkanPathIdentityRegistry,
    nativeAtlasId ResourceId) {
      if nativeAtlas == nil {
        throw ArgumentNullException("nativeAtlas")
      }
      if nativeIdentities == nil {
        throw ArgumentNullException("nativeIdentities")
      }
      if !nativeAtlasId.IsValid || nativeAtlasId.Kind != SceneResourceKind.Atlas {
        throw ArgumentException("nativeAtlasId is not an atlas resource", "nativeAtlasId")
      }
      if nativeAtlas.WordCapacity > uint64(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("nativeAtlas")
      }
      atlas = nativeAtlas
      identities = nativeIdentities
      atlasId = nativeAtlasId
      records = Dictionary[uint64, VulkanPathResourceRecord]()
      retiredRecords = List[VulkanPathResourceRecord]()
      recordPool = List[VulkanPathResourceRecord]()
      freeRanges = List[VulkanPathFreeRange]()
      sceneActivePathIds = Dictionary[uint64, Dictionary[uint64, Dictionary[uint64, bool]]]()
      activePathOwners = Dictionary[uint64, int32]()
      activePathRevisionOwners = Dictionary[uint64, Dictionary[uint64, int32]]()
      sceneRevisionSetPool = List[Dictionary[uint64, bool]]()
      revisionOwnerMapPool = List[Dictionary[uint64, int32]]()
      nextSceneId = 1uL
      var capacity = InitialWordCapacity
      retiredAtlases = List[VulkanRetiredPathAtlas]()
      if nativeAtlas.WordCapacity < uint64(capacity) {
        capacity = int32(nativeAtlas.WordCapacity)
      }
      cpuWords = [capacity]uint32
    }

  internal prop RedrawSequence uint64{ get -> redrawSequence }

  internal func RegisterScene() uint64 {
    EnsureOpen()
    if nextSceneId == 0uL || nextSceneId == uint64.MaxValue {
      throw OverflowException("Vulkan path scene identity overflow")
    }
    let id = nextSceneId
    nextSceneId = nextSceneId + 1uL
    sceneActivePathIds.Add(id, Dictionary[uint64, Dictionary[uint64, bool]]())
    return id
  }

  internal func UnregisterScene(sceneId uint64) {
    if disposed || sceneId == 0uL {
      return
    }
    if sceneActivePathIds.TryGetValue(sceneId, out var active) {
      for pathId in active.Keys {
        let revisions = active[pathId]
        for revision in revisions.Keys {
          RemoveActiveRevisionOwner(pathId, revision)
        }
        revisions.Clear()
        sceneRevisionSetPool.Add(revisions)
        RemoveActiveOwner(pathId)
      }
      sceneActivePathIds.Remove(sceneId)
    }
  }

  internal func BeginCompile(sceneId uint64) {
    EnsureOpen()
    if !sceneActivePathIds.TryGetValue(sceneId, out var active) {
      throw ArgumentException("Vulkan path scene identity is not registered", "sceneId")
    }
    for pathId in active.Keys {
      let revisions = active[pathId]
      for revision in revisions.Keys {
        RemoveActiveRevisionOwner(pathId, revision)
      }
      revisions.Clear()
      sceneRevisionSetPool.Add(revisions)
      RemoveActiveOwner(pathId)
    }
    active.Clear()
  }

  internal func MarkActive(sceneId uint64, pathId ResourceId) {
    EnsureOpen()
    if !pathId.IsValid || pathId.Kind != SceneResourceKind.PathBand {
      return
    }
    if !sceneActivePathIds.TryGetValue(sceneId, out var active) {
      throw ArgumentException("Vulkan path scene identity is not registered", "sceneId")
    }
    if active.TryGetValue(pathId.LogicalId, out var revisions) {
      if revisions.ContainsKey(pathId.Version) {
        return
      }
      revisions.Add(pathId.Version, true)
      AddActiveRevisionOwner(pathId.LogicalId, pathId.Version)
    } else {
      let created = AcquireSceneRevisionSet()
      created.Add(pathId.Version, true)
      active.Add(pathId.LogicalId, created)
      AddActiveOwner(pathId.LogicalId)
      AddActiveRevisionOwner(pathId.LogicalId, pathId.Version)
    }
  }

  internal func RedrawRequiredSince(observedSequence uint64) bool -> redrawSequence > observedSequence

  internal func MarkPathUsage(ids []ResourceId, count int32, submissionFence uint64) {
    EnsureOpen()
    if submissionFence == 0uL || count < 0 || count > ids.Length {
      throw ArgumentException("Vulkan path usage arguments are invalid")
    }
    if count > 0 && submissionFence > atlasLastUseFence {
      atlasLastUseFence = submissionFence
    }
    var index int32 = 0
    while index < count {
      let id = ids[index]
      if !id.IsValid || id.Kind != SceneResourceKind.PathBand {
        index++
        continue
      }
      if records.TryGetValue(id.LogicalId, out var record)
        && id.Version == record.Identity.PathId.Version{
          if submissionFence > record.LastUseFence {
            record.LastUseFence = submissionFence
          }
        } else {
          for retiredRecord in retiredRecords {
            if retiredRecord.Identity.PathId.LogicalId == id.LogicalId
              && retiredRecord.Identity.PathId.Version == id.Version{
                if submissionFence > retiredRecord.LastUseFence {
                  retiredRecord.LastUseFence = submissionFence
                }
                break
              }
          }
        }
      index++
    }
  }

  internal func Register(path VectorPath, fillRule FillRule, renderAfterPlannedUpload bool) VulkanPathRenderable {
    EnsureOpen()
    guard let data = path.payload else {
      return EmptyRenderable(fillRule)
    }
    if data.CommandCount == 0 && data.NormalizedQuadraticCount == 0 {
      return EmptyRenderable(fillRule)
    }
    let identity = identities.Resolve(data)
    if records.TryGetValue(identity.PathId.LogicalId, out var existing)
      && existing.GeometryRevision == identity.GeometryRevision{
        return BuildRenderable(existing, fillRule, renderAfterPlannedUpload)
      }

    let encoding = PathBandEncoder.Encode(path)
    let words = encoding.Words
    if encoding.WordCount == 0 {
      return EmptyRenderable(fillRule)
    }
    let wordCount = uint64(encoding.WordCount)
    if wordCount > uint64(uint32.MaxValue) {
      throw OverflowException("Vulkan path word count overflow")
    }

    let baseWord = AllocateWordRange(uint32(wordCount))
    if baseWord == uint32.MaxValue {
      RequestRedraw()
      if records.TryGetValue(identity.PathId.LogicalId, out var prior) {
        return BuildRenderable(prior, fillRule)
      }
      return EmptyRenderable(fillRule)
    }

    let bounds = EncodingBounds(encoding)
    if words.Length > 0 {
      EnsureWordCapacity(uint32(uint64(baseWord) + wordCount))
      Array.Copy(words, 0, cpuWords, int32(baseWord), encoding.WordCount)
      liveWordCount = liveWordCount + uint32(wordCount)
    }
    let record = AcquireRecord(identity, baseWord, uint32(wordCount),
      bounds, encoding.FillRuleMask)
    let hadRecord = if records.TryGetValue(identity.PathId.LogicalId, out var replaced) {
      retiredRecords.Add(replaced)
      if retiredWordCount > uint64.MaxValue - uint64(replaced.WordCount) {
        throw OverflowException("Vulkan path retired word count overflow")
      }
      retiredWordCount = retiredWordCount + uint64(replaced.WordCount)
      true
    } else {
      false
    }
    if hadRecord {
      records[identity.PathId.LogicalId] = record
    } else {
      records.Add(identity.PathId.LogicalId, record)
      identities.Retain(identity)
    }
    RequestRedraw()
    return BuildRenderable(record, fillRule, renderAfterPlannedUpload)
  }

  internal func Resolve(path VectorPath, fillRule FillRule) VulkanPathRenderable ->
  Register(path, fillRule, false)

  internal func PublishCompletedUploads() bool {
    EnsureOpen()
    if !uploadQueued || atlas.CompletedUploadSequence < queuedUploadSequence {
      return false
    }
    if queuedUploadEnd > publishedWordPrefix
      && queuedUploadStart <= publishedWordPrefix{
        publishedWordPrefix = Math.Min(queuedUploadEnd, nextWordOffset)
      }
    if publishedWordPrefix > nextWordOffset {
      publishedWordPrefix = nextWordOffset
    }
    queuedWordPrefix = publishedWordPrefix
    queuedUploadSequence = 0uL
    uploadQueued = false
    if queuedReuseRevision == dirtyReuseRevision {
      dirtyWordsPending = false
      dirtyWordStart = 0u
      dirtyWordEnd = 0u
    }
    queuedUploadStart = 0u
    queuedUploadEnd = 0u
    RequestRedraw()
    return true
  }

  internal func PrepareUpload() {
    EnsureOpen()
    PublishCompletedUploads()
    if uploadQueued || atlas.UploadPending {
      return
    }
    if publishedWordPrefix > nextWordOffset {
      publishedWordPrefix = nextWordOffset
    }
    if nextWordOffset < publishedWordPrefix {
      throw InvalidOperationException("Vulkan path published word prefix is invalid")
    }
    let hasSuffix = nextWordOffset > publishedWordPrefix
    if !hasSuffix && !dirtyWordsPending {
      return
    }
    var sourceWordOffset = if hasSuffix { publishedWordPrefix } else { dirtyWordStart }
    var sourceWordEnd = if hasSuffix { nextWordOffset } else { dirtyWordEnd }
    if dirtyWordsPending {
      if dirtyWordStart < sourceWordOffset {
        sourceWordOffset = dirtyWordStart
      }
      if dirtyWordEnd > sourceWordEnd {
        sourceWordEnd = Math.Min(dirtyWordEnd, nextWordOffset)
      }
    }
    sourceWordOffset = Math.Min(sourceWordOffset, nextWordOffset)
    sourceWordEnd = Math.Min(sourceWordEnd, nextWordOffset)
    if sourceWordEnd <= sourceWordOffset {
      throw InvalidOperationException("Vulkan path upload range is empty")
    }
    let sourceWordCount = sourceWordEnd - sourceWordOffset
    fixed source * uint32 = cpuWords{
      let suffix = *uint32(nint(source) + nint(uint64(sourceWordOffset) * 4uL))
      if !atlas.QueueUpload(suffix, uint64(sourceWordOffset), uint64(sourceWordCount)) {
        throw InvalidOperationException("Vulkan path upload was not queued")
      }
    }
    queuedWordPrefix = nextWordOffset
    queuedUploadSequence = atlas.UploadSequence
    uploadQueued = true
    queuedUploadStart = sourceWordOffset
    queuedUploadEnd = sourceWordEnd
    queuedReuseRevision = dirtyReuseRevision
    RequestRedraw()
  }

  internal func RecordUpload(commandBuffer VkCommandBuffer) {
    EnsureOpen()
    let stats = atlas.Stats
    if !stats.UploadPending || stats.UploadSubmitted {
      return
    }
    if stats.UploadRecorded && stats.UploadCommandBuffer != commandBuffer {
      return
    }
    atlas.RecordUpload(commandBuffer)
  }

  internal func FlushBeforeSubmit() VkResult {
    EnsureOpen()
    return atlas.FlushBeforeSubmit()
  }

  internal func MarkSubmitted(commandBuffer VkCommandBuffer, fence uint64) {
    EnsureOpen()
    let stats = atlas.Stats
    if !stats.UploadPending || stats.UploadSubmitted
      || !stats.UploadRecorded || stats.UploadCommandBuffer != commandBuffer{
        return
      }
    atlas.MarkSubmitted(commandBuffer, fence)
  }

  internal func Collect(completedFence uint64) bool {
    EnsureOpen()
    if completedFence > completedSubmissionFence {
      completedSubmissionFence = completedFence
    }
    let collected = atlas.Collect(completedFence)
    let published = PublishCompletedUploads()
    let reclaimed = ReclaimRetiredRecordsIfSafe()
    let retiredCollected = CollectRetiredAtlases(completedFence)
    return collected || published || reclaimed || retiredCollected
  }

  internal func RestoreUpload() {
    EnsureOpen()
    let stats = atlas.Stats
    if !stats.UploadPending || stats.UploadSubmitted {
      return
    }
    atlas.AbortUpload(stats.UploadCommandBuffer)
    queuedWordPrefix = publishedWordPrefix
    queuedUploadSequence = 0uL
    uploadQueued = false
    queuedUploadStart = 0u
    queuedUploadEnd = 0u
  }

  internal func AbortUpload() bool {
    EnsureOpen()
    let stats = atlas.Stats
    if !stats.UploadPending {
      return false
    }
    let result = atlas.AbortUpload(stats.UploadCommandBuffer)
    if result {
      queuedWordPrefix = publishedWordPrefix
      queuedUploadSequence = 0uL
      uploadQueued = false
      queuedUploadStart = 0u
      queuedUploadEnd = 0u
    }
    return result
  }

  internal func ConsumeRedrawRequired() bool {
    EnsureOpen()
    let result = redrawRequired
    redrawRequired = false
    return result
  }

  public func Dispose() {
    if disposed {
      return
    }
    ReleaseAllRecords()
    retiredRecords.Clear()
    sceneActivePathIds.Clear()
    activePathOwners.Clear()
    activePathRevisionOwners.Clear()
    sceneRevisionSetPool.Clear()
    revisionOwnerMapPool.Clear()
    activeReferenceCount = 0
    disposed = true
    atlas.Dispose()
    for retired in retiredAtlases {
      retired.Atlas.Dispose()
    }
    retiredAtlases.Clear()
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    ReleaseAllRecords()
    retiredRecords.Clear()
    sceneActivePathIds.Clear()
    activePathOwners.Clear()
    activePathRevisionOwners.Clear()
    sceneRevisionSetPool.Clear()
    revisionOwnerMapPool.Clear()
    activeReferenceCount = 0
    disposed = true
    atlas.DisposeAfterDeviceLoss()
    for retired in retiredAtlases {
      retired.Atlas.DisposeAfterDeviceLoss()
    }
    retiredAtlases.Clear()
  }

  private func CollectRetiredAtlases(completedFence uint64) bool {
    var collected = false
    var index = retiredAtlases.Count - 1
    while index >= 0 {
      let retired = retiredAtlases[index]
      if retired.Fence <= completedFence {
        retired.Atlas.Dispose()
        retiredAtlases.RemoveAt(index)
        collected = true
      }
      index--
    }
    return collected
  }

  deinit{
    try {
      Dispose()
    } catch (error Exception) {
    }
  }

  private func AcquireRecord(identity VulkanPathResourceIdentity, baseWord uint32,
    wordCount uint32, bounds ConservativeBounds, fillRuleMask uint32)
  VulkanPathResourceRecord{
    if recordPool.Count > 0 {
      let index = recordPool.Count - 1
      let record = recordPool[index]
      recordPool.RemoveAt(index)
      record.Reset(identity, baseWord, wordCount, bounds, fillRuleMask)
      return record
    }
    return VulkanPathResourceRecord(identity, baseWord, wordCount, bounds, fillRuleMask)
  }

  private func BuildRenderable(record VulkanPathResourceRecord,
    fillRule FillRule) VulkanPathRenderable -> BuildRenderable(record, fillRule, false)

  private func BuildRenderable(record VulkanPathResourceRecord,
    fillRule FillRule, renderAfterPlannedUpload bool) VulkanPathRenderable{
      let fillRuleCode = if fillRule == FillRule.EvenOdd {
        FillRuleEvenOdd
      } else {
        FillRuleNonZero
      }
      let endWord = uint64(record.BaseWord) + uint64(record.WordCount)
      let published = record.WordCount > 0u
        && endWord <= uint64(publishedWordPrefix) && atlas.IsUploaded
        && !DirtyRangeOverlaps(record.BaseWord, record.WordCount)
      let supportsFill = (record.FillRuleMask
        &(if fillRule == FillRule.EvenOdd {
          PathBandEncoding.FillRuleEvenOddMask
        } else {
          PathBandEncoding.FillRuleNonZeroMask
        })) != 0u
      let needsUpload = record.WordCount > 0u && !published
      let uploadPending = needsUpload
      let uploadRecorded = needsUpload && atlas.UploadRecorded
      let uploadSubmitted = needsUpload && atlas.UploadSubmitted
      let submittedUploadCovers = SubmittedUploadCovers(record)
      return VulkanPathRenderable{
        PathId: record.Identity.PathId,
        GeometryRevision: record.GeometryRevision,
        AtlasId: atlasId,
        BaseWord: record.BaseWord,
        WordCount: record.WordCount,
        Bounds: record.Bounds,
        FillRule: fillRuleCode,
        Renderable: (published || submittedUploadCovers || renderAfterPlannedUpload)
          && supportsFill && !record.Bounds.IsEmpty,
        Published: published,
        RedrawRequired: needsUpload,
        UploadPending: uploadPending,
        UploadRecorded: uploadRecorded,
        UploadSubmitted: uploadSubmitted,
      }
    }

  private func SubmittedUploadCovers(record VulkanPathResourceRecord) bool {
    if !uploadQueued || !atlas.UploadSubmitted || record.WordCount == 0u
      || queuedReuseRevision != dirtyReuseRevision{
        return false
      }
    let recordStart = uint64(record.BaseWord)
    let recordEnd = recordStart + uint64(record.WordCount)
    return uint64(queuedUploadStart) <= recordStart
      && recordEnd <= uint64(queuedUploadEnd)
  }

  private func EmptyRenderable(fillRule FillRule) VulkanPathRenderable -> VulkanPathRenderable {
    PathId: ResourceId{},
    GeometryRevision: 1uL,
    AtlasId: atlasId,
    BaseWord: 0u,
    WordCount: 0u,
    Bounds: ConservativeBounds{},
    FillRule: if fillRule == FillRule.EvenOdd { FillRuleEvenOdd } else { FillRuleNonZero },
    Renderable: false,
    Published: false,
    RedrawRequired: false,
    UploadPending: false,
    UploadRecorded: false,
    UploadSubmitted: false,
  }

  private func EncodingBounds(encoding PathBandEncoding) ConservativeBounds {
    let width = encoding.MaximumX - encoding.MinimumX
    let height = encoding.MaximumY - encoding.MinimumY
    if !Finite(encoding.MinimumX) || !Finite(encoding.MinimumY)
      || !Finite(encoding.MaximumX) || !Finite(encoding.MaximumY)
      || !Finite(width) || !Finite(height) || width <= 0.0F || height <= 0.0F {
        return ConservativeBounds{}
      }
    return ConservativeBounds{
      X: encoding.MinimumX,
      Y: encoding.MinimumY,
      Width: width,
      Height: height,
    }
  }

  private func EnsureWordCapacity(required uint32) {
    if required <= uint32(cpuWords.Length) {
      return
    }
    if uint64(required) > atlas.WordCapacity || required > uint32(Int32.MaxValue) {
      capacityExhausted = true
      throw InvalidOperationException("Vulkan path managed word capacity exhausted")
    }
    var capacity = cpuWords.Length
    if capacity == 0 {
      capacity = InitialWordCapacity
    }
    while uint64(capacity) < uint64(required) {
      if capacity > Int32.MaxValue / 2 {
        capacity = int32(required)
      } else {
        capacity = capacity * 2
      }
    }
    if uint64(capacity) > atlas.WordCapacity {
      capacity = int32(atlas.WordCapacity)
    }
    let next = [capacity]uint32
    let copyCount = if nextWordOffset < uint32(cpuWords.Length) {
      nextWordOffset
    } else {
      uint32(cpuWords.Length)
    }
    Array.Copy(cpuWords, next, int32(copyCount))
    cpuWords = next
  }

  private func AllocateWordRange(required uint32) uint32 {
    if required == 0u {
      throw ArgumentOutOfRangeException("required")
    }
    if let freeRange = TakeFreeRange(required) {
      return freeRange
    }
    if uint64(nextWordOffset) + uint64(required) <= atlas.WordCapacity {
      let start = nextWordOffset
      nextWordOffset = nextWordOffset + required
      ConsumeTailReuse(start, required)
      return start
    }
    if pressureEventCount == uint64.MaxValue {
      throw OverflowException("Vulkan path pressure event count overflow")
    }
    pressureEventCount = pressureEventCount + 1uL
    ReclaimInactiveRecords(required)
    if let reclaimedRange = TakeFreeRange(required) {
      return reclaimedRange
    }
    if uint64(nextWordOffset) + uint64(required) <= atlas.WordCapacity {
      let start = nextWordOffset
      nextWordOffset = nextWordOffset + required
      ConsumeTailReuse(start, required)
      return start
    }
    if !TryGrowAtlas(required) {
      return uint32.MaxValue
    }
    let start = nextWordOffset
    nextWordOffset = nextWordOffset + required
    ConsumeTailReuse(start, required)
    return start
  }

  private func TryGrowAtlas(required uint32) bool {
    let requiredCapacity = uint64(nextWordOffset) + uint64(required)
    if requiredCapacity > atlas.MaximumWordCapacity
      || requiredCapacity > uint64(Int32.MaxValue) {
        capacityExhausted = true
        if pressureFailureCount == uint64.MaxValue {
          throw OverflowException("Vulkan path pressure failure count overflow")
        }
        pressureFailureCount++
        throw InvalidOperationException(
          "Vulkan path atlas hard limit exceeded: requestWords=" + required.ToString()
          +" currentWords=" + nextWordOffset.ToString()
          +" hardWords=" + atlas.MaximumWordCapacity.ToString())
      }
    if atlas.UploadPending || uploadQueued {
      if deferredRequestCount == uint64.MaxValue {
        throw OverflowException("Vulkan path deferred request count overflow")
      }
      deferredRequestCount++
      return false
    }
    var replacementCapacity = atlas.WordCapacity
    while replacementCapacity < requiredCapacity {
      if replacementCapacity > atlas.MaximumWordCapacity / 2uL {
        replacementCapacity = atlas.MaximumWordCapacity
      } else {
        replacementCapacity = replacementCapacity * 2uL
      }
    }
    if atlasId.Version == uint64.MaxValue || growthCount == uint64.MaxValue {
      throw OverflowException("Vulkan path atlas generation overflow")
    }
    let replacement = atlas.CreateReplacement(replacementCapacity)
    let previous = atlas
    if atlasLastUseFence <= completedSubmissionFence {
      previous.Dispose()
    } else {
      retiredAtlases.Add(VulkanRetiredPathAtlas{
        Atlas: previous,
        Fence: atlasLastUseFence,
      })
    }
    atlas = replacement
    atlasId = ResourceId{
      Kind: SceneResourceKind.Atlas,
      LogicalId: atlasId.LogicalId,
      Version: atlasId.Version + 1uL,
    }
    atlasLastUseFence = 0uL
    publishedWordPrefix = 0u
    queuedWordPrefix = 0u
    queuedUploadSequence = 0uL
    queuedUploadStart = 0u
    queuedUploadEnd = 0u
    dirtyWordsPending = nextWordOffset > 0u
    dirtyWordStart = 0u
    dirtyWordEnd = nextWordOffset
    tailReusePending = false
    capacityExhausted = false
    growthCount++
    RequestRedraw()
    return true
  }

  private func TakeFreeRange(required uint32)(uint32)? {
    var index int32 = 0
    while index < freeRanges.Count {
      let freeRange = freeRanges[index]
      if freeRange.Count >= required {
        let start = freeRange.Start
        if freeRange.Count == required {
          freeRanges.RemoveAt(index)
        } else {
          freeRanges[index] = VulkanPathFreeRange{
            Start: freeRange.Start + required,
            Count: freeRange.Count - required,
          }
        }
        freeWordCount = freeWordCount - required
        if reuseCount == uint64.MaxValue || dirtyReuseRevision == uint64.MaxValue {
          throw OverflowException("Vulkan path reuse count overflow")
        }
        reuseCount = reuseCount + 1uL
        dirtyReuseRevision = dirtyReuseRevision + 1uL
        MarkDirtyRange(start, required)
        RequestRedraw()
        return start
      }
      index++
    }
    return nil
  }
  private func ConsumeTailReuse(start uint32, count uint32) {
    if !tailReusePending {
      return
    }
    if reuseCount == uint64.MaxValue || dirtyReuseRevision == uint64.MaxValue {
      throw OverflowException("Vulkan path reuse count overflow")
    }
    reuseCount = reuseCount + 1uL
    dirtyReuseRevision = dirtyReuseRevision + 1uL
    MarkDirtyRange(start, count)
    tailReusePending = false
  }

  private func ReclaimInactiveRecords(required uint32) bool {
    if !HasInactiveRecords() {
      return false
    }
    let atlasStats = atlas.Stats
    if atlasStats.UploadPending {
      if atlasStats.UploadSubmitted {
        return false
      } else {
        atlas.AbortUpload(atlasStats.UploadCommandBuffer)
        queuedWordPrefix = publishedWordPrefix
        queuedUploadSequence = 0uL
        uploadQueued = false
        queuedUploadStart = 0u
        queuedUploadEnd = 0u
      }
    }
    var reclaimed = ReclaimRetiredRecords()
    let snapshot = records.Values.ToArray()
    for record in snapshot {
      let pathId = record.Identity.PathId.LogicalId
      if activePathOwners.ContainsKey(pathId)
        || record.LastUseFence > completedSubmissionFence{
          continue
        }
      if !records.Remove(pathId) {
        continue
      }
      let recordWordCount = record.WordCount
      AddFreeRange(record.BaseWord, recordWordCount)
      ClearWords(record.BaseWord, recordWordCount)
      liveWordCount = liveWordCount - recordWordCount
      identities.Release(record.Identity)
      if evictionCount == uint64.MaxValue {
        throw OverflowException("Vulkan path eviction count overflow")
      }
      evictionCount = evictionCount + 1uL
      RecycleRecord(record)
      reclaimed = true
    }
    if !reclaimed {
      return false
    }
    MergeFreeRanges()
    if compactionCount == uint64.MaxValue {
      throw OverflowException("Vulkan path compaction count overflow")
    }
    compactionCount = compactionCount + 1uL
    RequestRedraw()
    return HasFreeRange(required)
  }

  private func ReclaimRetiredRecordsIfSafe() bool {
    if !HasReclaimableRetiredRecords() {
      return false
    }
    let atlasStats = atlas.Stats
    if atlasStats.UploadPending {
      if RetiredRangeOverlapsUpload(atlasStats.UploadWordOffset, atlasStats.UploadWordCount) {
        if atlasStats.UploadSubmitted {
          return false
        }
        if !atlas.AbortUpload(atlasStats.UploadCommandBuffer) {
          return false
        }
        queuedWordPrefix = publishedWordPrefix
        queuedUploadSequence = 0uL
        uploadQueued = false
        queuedUploadStart = 0u
        queuedUploadEnd = 0u
        RequestRedraw()
      }
    }
    let reclaimed = ReclaimRetiredRecords()
    if !reclaimed {
      return false
    }
    MergeFreeRanges()
    if compactionCount == uint64.MaxValue {
      throw OverflowException("Vulkan path compaction count overflow")
    }
    compactionCount = compactionCount + 1uL
    RequestRedraw()
    return true
  }

  private func ReclaimRetiredRecords() bool {
    var reclaimed = false
    var index = retiredRecords.Count - 1
    while index >= 0 {
      let record = retiredRecords[index]
      if !IsPathRevisionActive(record.Identity.PathId)
        && record.LastUseFence <= completedSubmissionFence{
          AddFreeRange(record.BaseWord, record.WordCount)
          ClearWords(record.BaseWord, record.WordCount)
          liveWordCount = liveWordCount - record.WordCount
          if retiredWordCount >= uint64(record.WordCount) {
            retiredWordCount = retiredWordCount - uint64(record.WordCount)
          }
          retiredRecords.RemoveAt(index)
          RecycleRecord(record)
          reclaimed = true
        }
      index--
    }
    return reclaimed
  }

  private func HasReclaimableRetiredRecords() bool {
    for record in retiredRecords {
      if !IsPathRevisionActive(record.Identity.PathId)
        && record.LastUseFence <= completedSubmissionFence{
          return true
        }
    }
    return false
  }

  private func RetiredRangeOverlapsUpload(uploadStart uint64, uploadCount uint64) bool {
    if uploadCount == 0uL {
      return false
    }
    let uploadEnd = uploadStart + uploadCount
    for record in retiredRecords {
      if IsPathRevisionActive(record.Identity.PathId)
        || record.LastUseFence > completedSubmissionFence{
          continue
        }
      let recordStart = uint64(record.BaseWord)
      let recordEnd = recordStart + uint64(record.WordCount)
      if recordStart < uploadEnd && uploadStart < recordEnd {
        return true
      }
    }
    return false
  }

  private func RecycleRecord(record VulkanPathResourceRecord) {
    record.Reset(VulkanPathResourceIdentity{}, 0u, 0u, ConservativeBounds{}, 0u)
    recordPool.Add(record)
  }

  private func HasInactiveRecords() bool {
    for record in retiredRecords {
      if !IsPathRevisionActive(record.Identity.PathId)
        && record.LastUseFence <= completedSubmissionFence{
          return true
        }
    }
    for record in records.Values {
      if !activePathOwners.ContainsKey(record.Identity.PathId.LogicalId)
        && record.LastUseFence <= completedSubmissionFence{
          return true
        }
    }
    return false
  }

  private func HasFreeRange(required uint32) bool {
    if uint64(nextWordOffset) + uint64(required) <= atlas.WordCapacity {
      return true
    }
    for freeRange in freeRanges {
      if freeRange.Count >= required {
        return true
      }
    }
    return false
  }

  private func MarkDirtyRange(start uint32, count uint32) {
    if count == 0u {
      return
    }
    let end = uint64(start) + uint64(count)
    if end > uint64(uint32.MaxValue) {
      throw OverflowException("Vulkan path dirty range overflow")
    }
    let endWord = uint32(end)
    if !dirtyWordsPending {
      dirtyWordStart = start
      dirtyWordEnd = endWord
      dirtyWordsPending = true
      return
    }
    if start < dirtyWordStart {
      dirtyWordStart = start
    }
    if endWord > dirtyWordEnd {
      dirtyWordEnd = endWord
    }
  }

  private func DirtyRangeOverlaps(start uint32, count uint32) bool {
    if !dirtyWordsPending || count == 0u {
      return false
    }
    let end = uint64(start) + uint64(count)
    return uint64(dirtyWordStart) < end && uint64(start) < uint64(dirtyWordEnd)
  }

  private func AddFreeRange(start uint32, count uint32) {
    if count == 0u { return }
    freeRanges.Add(VulkanPathFreeRange{ Start: start, Count: count })
    freeWordCount = freeWordCount + count
  }

  private func MergeFreeRanges() {
    var changed = true
    while changed {
      changed = false
      var leftIndex int32 = 0
      while leftIndex < freeRanges.Count && !changed {
        let left = freeRanges[leftIndex]
        var rightIndex = leftIndex + 1
        while rightIndex < freeRanges.Count {
          let right = freeRanges[rightIndex]
          if left.Start + left.Count == right.Start {
            freeRanges[leftIndex] = VulkanPathFreeRange{
              Start: left.Start,
              Count: left.Count + right.Count,
            }
            freeRanges.RemoveAt(rightIndex)
            changed = true
            break
          }
          if right.Start + right.Count == left.Start {
            freeRanges[leftIndex] = VulkanPathFreeRange{
              Start: right.Start,
              Count: right.Count + left.Count,
            }
            freeRanges.RemoveAt(rightIndex)
            changed = true
            break
          }
          rightIndex++
        }
        leftIndex++
      }
    }
    var tailChanged = true
    while tailChanged {
      tailChanged = false
      var rangeIndex int32 = 0
      while rangeIndex < freeRanges.Count {
        let freeRange = freeRanges[rangeIndex]
        if !uploadQueued && !atlas.Stats.UploadPending
          && uint64(freeRange.Start) + uint64(freeRange.Count) == uint64(nextWordOffset) {
            if freeWordCount < freeRange.Count {
              throw InvalidOperationException("Vulkan path free word accounting underflow")
            }
            nextWordOffset = freeRange.Start
            if publishedWordPrefix > nextWordOffset {
              publishedWordPrefix = nextWordOffset
            }
            if queuedWordPrefix > nextWordOffset {
              queuedWordPrefix = nextWordOffset
            }
            if dirtyWordsPending && dirtyWordEnd > nextWordOffset {
              dirtyWordEnd = nextWordOffset
              if dirtyWordStart >= nextWordOffset {
                dirtyWordsPending = false
                dirtyWordStart = 0u
                dirtyWordEnd = 0u
              }
            }
            tailReusePending = true
            freeWordCount = freeWordCount - freeRange.Count
            freeRanges.RemoveAt(rangeIndex)
            tailChanged = true
            break
          }
        rangeIndex = rangeIndex + 1
      }
    }
  }

  private func ClearWords(start uint32, count uint32) {
    var index uint32 = 0u
    while index < count {
      cpuWords[int32(start + index)] = 0u
      index++
    }
  }

  private func AddActiveOwner(pathId uint64) {
    if activeReferenceCount == Int32.MaxValue {
      throw OverflowException("Vulkan path active reference count overflow")
    }
    if activePathOwners.TryGetValue(pathId, out var owners) {
      if owners == Int32.MaxValue {
        throw OverflowException("Vulkan path active owner count overflow")
      }
      activePathOwners[pathId] = owners + 1
    } else {
      activePathOwners[pathId] = 1
    }
    activeReferenceCount = activeReferenceCount + 1
  }

  private func RemoveActiveOwner(pathId uint64) {
    if !activePathOwners.TryGetValue(pathId, out var owners) {
      return
    }
    if owners <= 1 {
      activePathOwners.Remove(pathId)
    } else {
      activePathOwners[pathId] = owners - 1
    }
    if activeReferenceCount > 0 {
      activeReferenceCount = activeReferenceCount - 1
    }
  }

  private func AcquireSceneRevisionSet() Dictionary[uint64, bool] {
    if sceneRevisionSetPool.Count > 0 {
      let index = sceneRevisionSetPool.Count - 1
      let result = sceneRevisionSetPool[index]
      sceneRevisionSetPool.RemoveAt(index)
      return result
    }
    return Dictionary[uint64, bool]()
  }

  private func AcquireRevisionOwnerMap() Dictionary[uint64, int32] {
    if revisionOwnerMapPool.Count > 0 {
      let index = revisionOwnerMapPool.Count - 1
      let result = revisionOwnerMapPool[index]
      revisionOwnerMapPool.RemoveAt(index)
      return result
    }
    return Dictionary[uint64, int32]()
  }

  private func AddActiveRevisionOwner(pathId uint64, version uint64) {
    if activePathRevisionOwners.TryGetValue(pathId, out var revisions) {
      if revisions.TryGetValue(version, out var owners) {
        if owners == Int32.MaxValue {
          throw OverflowException("Vulkan path active revision owner count overflow")
        }
        revisions[version] = owners + 1
      } else {
        revisions.Add(version, 1)
      }
    } else {
      let created = AcquireRevisionOwnerMap()
      created.Add(version, 1)
      activePathRevisionOwners.Add(pathId, created)
    }
  }

  private func RemoveActiveRevisionOwner(pathId uint64, version uint64) {
    if !activePathRevisionOwners.TryGetValue(pathId, out var revisions) {
      return
    }
    if !revisions.TryGetValue(version, out var owners) {
      return
    }
    if owners <= 1 {
      revisions.Remove(version)
    } else {
      revisions[version] = owners - 1
    }
    if revisions.Count == 0 {
      activePathRevisionOwners.Remove(pathId)
      revisions.Clear()
      revisionOwnerMapPool.Add(revisions)
    }
  }

  private func IsPathRevisionActive(pathId ResourceId) bool {
    if !activePathRevisionOwners.TryGetValue(pathId.LogicalId, out var revisions) {
      return false
    }
    return revisions.ContainsKey(pathId.Version)
  }

  private func ReleaseAllRecords() {
    for record in records.Values {
      try { identities.Release(record.Identity) } catch (cleanup Exception) { }
    }
    records.Clear()
    retiredRecords.Clear()
    recordPool.Clear()
    freeRanges.Clear()
    liveWordCount = 0u
    freeWordCount = 0u
    tailReusePending = false
  }

  private func RequestRedraw() {
    if redrawSequence == uint64.MaxValue {
      throw OverflowException("Vulkan path redraw sequence overflow")
    }
    redrawSequence = redrawSequence + 1uL
    redrawRequired = true
  }

  private func Finite(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanPathResources")
    }
  }
}
