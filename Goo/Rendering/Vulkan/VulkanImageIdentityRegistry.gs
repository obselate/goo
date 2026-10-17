package Goo

import System
import System.Runtime.CompilerServices

internal sealed class VulkanImageProviderIdentity {
  internal let ProviderId uint64
  internal let SourceId uint64
  internal var LatestContentVersion uint64

  internal init(providerId uint64, sourceId uint64) {
    ProviderId = providerId
    SourceId = sourceId
  }
}

internal data struct VulkanImageProviderRecord {
  internal var Reference WeakReference?
  internal var Identity VulkanImageProviderIdentity?
}

internal data struct VulkanImageResourceIdentity {
  internal var ProviderId uint64
  internal var SourceId uint64
  internal var ContentVersion uint64
  internal var Generation uint64
  internal var Format VkFormat
  internal var ImageId ResourceId

  internal prop IsValid bool{
    get {
      return ProviderId != 0uL && SourceId != 0uL && ContentVersion != 0uL
        && Generation != 0uL && ImageId.IsValid && ImageId.Kind == SceneResourceKind.Image
    }
  }
}

internal data struct VulkanImageIdentityRegistryStats {
  internal var Capacity int32
  internal var LiveCount int32
  internal var ProviderRecordCapacity int32
  internal var ProviderRecordCount int32
  internal var NextProviderId uint64
  internal var NextSourceId uint64
  internal var NextLogicalId uint64
  internal var Disposed bool
}

internal unsafe sealed class VulkanImageIdentityRegistry : IDisposable {
  private const MaxCapacity int32 = 1048576

  private let providerIdentities ConditionalWeakTable[ImageSourceProvider, VulkanImageProviderIdentity]
  private let providerRecords []VulkanImageProviderRecord
  private let imageIdentities []VulkanImageResourceIdentity
  private let linearSamplerId ResourceId
  private var nextProviderId uint64
  private var nextSourceId uint64
  private var nextLogicalId uint64
  private var liveCount int32
  private var providerRecordCount int32
  private var releasedEpoch int64
  private var releaseDeferred bool
  private var disposed bool
  private var profileTraceId string?
  private var profileBaseline int64 = -1L

  internal func ProfileResources(recorder FrameRecorder) {
    if profileTraceId == recorder.TraceId && profileBaseline == recorder.BaselineVersion { return }
    profileTraceId = recorder.TraceId
    profileBaseline = recorder.BaselineVersion
    for record in providerRecords {
      if let source = record.Reference?.Target as ImageSource? { source.ProfileIdentity(recorder) }
    }
  }

  internal prop LinearSamplerId ResourceId{ get -> linearSamplerId }
  internal prop Stats VulkanImageIdentityRegistryStats{
    get {
      return VulkanImageIdentityRegistryStats{
        Capacity: imageIdentities.Length,
        LiveCount: liveCount,
        ProviderRecordCapacity: providerRecords.Length,
        ProviderRecordCount: providerRecordCount,
        NextProviderId: nextProviderId,
        NextSourceId: nextSourceId,
        NextLogicalId: nextLogicalId,
        Disposed: disposed,
      }
    }
  }

  internal init(maximumImageIdentities int32) {
    if maximumImageIdentities <= 0 || maximumImageIdentities > MaxCapacity {
      throw ArgumentOutOfRangeException("maximumImageIdentities")
    }
    providerIdentities = ConditionalWeakTable[ImageSourceProvider, VulkanImageProviderIdentity]()
    providerRecords = [maximumImageIdentities]VulkanImageProviderRecord
    imageIdentities = [maximumImageIdentities]VulkanImageResourceIdentity
    linearSamplerId = ResourceId{
      Kind: SceneResourceKind.Sampler,
      LogicalId: 1uL,
      Version: 1uL,
    }
    nextProviderId = 1uL
    nextSourceId = 1uL
    nextLogicalId = 2uL
  }

  internal func ResolveImage(
    provider ImageSourceProvider,
    contentVersion uint64,
    generation uint64,
    format VkFormat) VulkanImageResourceIdentity{
      EnsureOpen()
      if provider == nil {
        throw ArgumentNullException("provider")
      }
      if contentVersion == 0uL {
        throw ArgumentOutOfRangeException("contentVersion")
      }
      if generation == 0uL {
        throw ArgumentOutOfRangeException("generation")
      }
      let providerIdentity = ProviderIdentity(provider)
      if providerIdentity.LatestContentVersion != 0uL
        && contentVersion < providerIdentity.LatestContentVersion{
          throw InvalidOperationException("Vulkan image content version rolled back")
        }
      if contentVersion > providerIdentity.LatestContentVersion {
        ReclaimOlder(providerIdentity.ProviderId, providerIdentity.SourceId, contentVersion)
        providerIdentity.LatestContentVersion = contentVersion
      }
      var index int32 = 0
      while index < imageIdentities.Length {
        var existing = imageIdentities[index]
        if existing.IsValid && existing.ProviderId == providerIdentity.ProviderId
          && existing.SourceId == providerIdentity.SourceId
          && existing.ContentVersion == contentVersion && existing.Format == format{
            if existing.Generation != generation {
              existing.Generation = generation
              imageIdentities[index] = existing
            }
            return existing
          }
        index++
      }
      if liveCount >= imageIdentities.Length {
        throw InvalidOperationException("Vulkan image identity capacity reached")
      }
      var freeIndex int32 = 0
      while freeIndex < imageIdentities.Length && imageIdentities[freeIndex].IsValid {
        freeIndex++
      }
      if freeIndex >= imageIdentities.Length {
        throw InvalidOperationException("Vulkan image identity capacity reached")
      }
      let logicalId = NextLogicalId()
      let created = VulkanImageResourceIdentity{
        ProviderId: providerIdentity.ProviderId,
        SourceId: providerIdentity.SourceId,
        ContentVersion: contentVersion,
        Generation: generation,
        Format: format,
        ImageId: ResourceId{
          Kind: SceneResourceKind.Image,
          LogicalId: logicalId,
          Version: contentVersion,
        },
      }
      imageIdentities[freeIndex] = created
      liveCount++
      return created
    }

  internal func FindImage(provider ImageSourceProvider, contentVersion uint64,
    format VkFormat) ResourceId{
      if disposed || !providerIdentities.TryGetValue(provider, out var identity) {
        return ResourceId{}
      }
      var index int32 = 0
      while index < imageIdentities.Length {
        let existing = imageIdentities[index]
        if existing.IsValid && existing.ProviderId == identity.ProviderId
          && existing.SourceId == identity.SourceId
          && existing.ContentVersion == contentVersion && existing.Format == format{
            return existing.ImageId
          }
        index++
      }
      return ResourceId{}
    }

  internal func ReleaseDisposedProviders(resources VulkanImageResources) bool {
    let epoch = ImageSource.DisposeEpoch
    if disposed || (epoch == releasedEpoch && !releaseDeferred) {
      return false
    }
    releasedEpoch = epoch
    releaseDeferred = false
    var awaitsFence = false
    var index int32 = 0
    while index < providerRecords.Length {
      let record = providerRecords[index]
      if let reference = record.Reference, let identity = record.Identity {
        let target = reference.Target
        let source = target as ImageSource?
        if target == nil || (source?.IsDisposed ?? false) {
          let release = resources.ReleaseSource(identity.ProviderId, identity.SourceId)
          if release.Remaining {
            releaseDeferred = true
            awaitsFence = awaitsFence || release.AwaitsFence
          } else {
            ReclaimProvider(identity.ProviderId, identity.SourceId)
            if let provider = source {
              providerIdentities.Remove(provider)
            }
            providerRecords[index] = VulkanImageProviderRecord{}
            providerRecordCount--
          }
        }
      }
      index++
    }
    return awaitsFence
  }

  private func ReclaimOlder(providerId uint64, sourceId uint64, contentVersion uint64) {
    var index int32 = 0
    while index < imageIdentities.Length {
      let existing = imageIdentities[index]
      if existing.IsValid && existing.ProviderId == providerId
        && existing.SourceId == sourceId && existing.ContentVersion < contentVersion{
          imageIdentities[index] = VulkanImageResourceIdentity{}
          liveCount--
        }
      index++
    }
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    var index int32 = 0
    while index < imageIdentities.Length {
      imageIdentities[index] = VulkanImageResourceIdentity{}
      index++
    }
    liveCount = 0
    var providerIndex int32 = 0
    while providerIndex < providerRecords.Length {
      providerRecords[providerIndex] = VulkanImageProviderRecord{}
      providerIndex++
    }
    providerRecordCount = 0
  }

  private func ProviderIdentity(provider ImageSourceProvider) VulkanImageProviderIdentity {
    if providerIdentities.TryGetValue(provider, out var existing) {
      return existing
    }
    SweepDeadProviderRecords()
    if providerRecordCount >= providerRecords.Length {
      throw InvalidOperationException("Vulkan image provider identity capacity reached")
    }
    let providerId = NextProviderId()
    let sourceId = NextSourceId()
    let created = VulkanImageProviderIdentity(providerId, sourceId)
    var freeIndex int32 = 0
    while freeIndex < providerRecords.Length && providerRecords[freeIndex].Reference != nil {
      freeIndex++
    }
    if freeIndex >= providerRecords.Length {
      throw InvalidOperationException("Vulkan image provider identity capacity reached")
    }
    providerIdentities.Add(provider, created)
    if let source = provider as ImageSource? {
      if !source.BindRenderer() { releaseDeferred = true }
    }
    providerRecords[freeIndex] = VulkanImageProviderRecord{
      Reference: WeakReference(provider),
      Identity: created,
    }
    providerRecordCount++
    return created
  }

  private func SweepDeadProviderRecords() {
    var index int32 = 0
    while index < providerRecords.Length {
      let record = providerRecords[index]
      if let reference = record.Reference {
        if !reference.IsAlive || reference.Target == nil {
          if let identity = record.Identity {
            ReclaimProvider(identity.ProviderId, identity.SourceId)
          }
          providerRecords[index] = VulkanImageProviderRecord{}
          providerRecordCount--
        }
      }
      index++
    }
  }

  private func ReclaimProvider(providerId uint64, sourceId uint64) {
    var index int32 = 0
    while index < imageIdentities.Length {
      let existing = imageIdentities[index]
      if existing.IsValid && existing.ProviderId == providerId && existing.SourceId == sourceId {
        imageIdentities[index] = VulkanImageResourceIdentity{}
        liveCount--
      }
      index++
    }
  }

  private func NextProviderId() uint64 {
    if nextProviderId == 0uL || nextProviderId == uint64.MaxValue {
      throw OverflowException("Vulkan provider identity overflow")
    }
    let value = nextProviderId
    nextProviderId++
    return value
  }

  private func NextSourceId() uint64 {
    if nextSourceId == 0uL || nextSourceId == uint64.MaxValue {
      throw OverflowException("Vulkan provider source identity overflow")
    }
    let value = nextSourceId
    nextSourceId++
    return value
  }

  private func NextLogicalId() uint64 {
    if nextLogicalId == 0uL || nextLogicalId == uint64.MaxValue {
      throw OverflowException("Vulkan image logical identity overflow")
    }
    let value = nextLogicalId
    nextLogicalId++
    return value
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanImageIdentityRegistry")
    }
  }
}
