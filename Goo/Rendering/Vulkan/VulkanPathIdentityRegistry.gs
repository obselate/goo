package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal data struct VulkanPathResourceIdentity {
  internal let PathId ResourceId
  internal let SourceId uint64
  internal let GeometryRevision uint64

  internal prop IsValid bool{
    get {
      return PathId.IsValid && PathId.Kind == SceneResourceKind.PathBand
        && PathId.Version == GeometryRevision && SourceId != 0uL
        && GeometryRevision != 0uL
    }
  }
}

private sealed class VulkanPathIdentityRecord {
  internal let Reference WeakReference
  // Equal authored paths share this representative while the GPU resource is resident.
  internal var ResidentData VectorPathData?
  internal var Identity VulkanPathResourceIdentity
  internal var Hash uint64
  internal var ResidencyCount int32
  internal var BucketIndex int32

  internal init(data VectorPathData, identity VulkanPathResourceIdentity, hash uint64) {
    Reference = WeakReference(data)
    Identity = identity
    Hash = hash
  }
}

internal sealed class VulkanPathIdentityRegistry {
  private let identities Dictionary[uint64, List[VulkanPathIdentityRecord]]
  private let records Dictionary[uint64, VulkanPathIdentityRecord]
  private let matches ConditionalWeakTable[object, VulkanPathIdentityRecord]
  private let deadRecords List[VulkanPathIdentityRecord]
  private var nextLogicalId uint64
  private var nextSourceId uint64
  private var count int32
  private var disposed bool

  internal prop Count int32{ get -> count }

  internal init() {
    identities = Dictionary[uint64, List[VulkanPathIdentityRecord]]()
    records = Dictionary[uint64, VulkanPathIdentityRecord]()
    matches = ConditionalWeakTable[object, VulkanPathIdentityRecord]()
    deadRecords = List[VulkanPathIdentityRecord]()
    nextLogicalId = 1uL
    nextSourceId = 1uL
  }

  internal func Resolve(path VectorPath) VulkanPathResourceIdentity {
    guard let data = path.payload else {
      throw ArgumentException("Path is empty", "path")
    }
    return Resolve(data)
  }

  internal func Resolve(data VectorPathData) VulkanPathResourceIdentity {
    EnsureOpen()
    if data == nil || (data.CommandCount == 0 && data.NormalizedQuadraticCount == 0) {
      throw ArgumentException("Path is empty", "data")
    }
    if data.GeometryRevision == 0uL {
      throw InvalidOperationException("Vulkan path geometry revision is invalid")
    }
    let key object = if let owner = data.NormalizedOwner { owner } else { data }
    if matches.TryGetValue(key, out var cached) {
      if records.ContainsKey(cached.Identity.PathId.LogicalId) {
        return Refresh(cached, data.GeometryRevision)
      }
      matches.Remove(key)
    }
    if identities.TryGetValue(data.Hash, out var bucket) {
      var index int32 = 0
      while index < bucket.Count {
        let existing = bucket[index]
        if let existingData = existing.Reference.Target as VectorPathData {
          if Object.ReferenceEquals(existingData, data) || existingData.Equals(data) {
            matches.Add(key, existing)
            return Refresh(existing, data.GeometryRevision)
          }
        }
        index++
      }
    }
    let logicalId = NextLogicalId()
    let sourceId = NextSourceId()
    let identity = VulkanPathResourceIdentity{
      PathId: ResourceId{
        Kind: SceneResourceKind.PathBand,
        LogicalId: logicalId,
        Version: data.GeometryRevision,
      },
      SourceId: sourceId,
      GeometryRevision: data.GeometryRevision,
    }
    let createdBucket = if identities.TryGetValue(data.Hash, out var existingBucket) {
      existingBucket
    } else {
      let created = List[VulkanPathIdentityRecord]()
      identities.Add(data.Hash, created)
      created
    }
    let createdRecord = VulkanPathIdentityRecord(data, identity, data.Hash)
    createdRecord.BucketIndex = createdBucket.Count
    createdBucket.Add(createdRecord)
    records.Add(logicalId, createdRecord)
    matches.Add(key, createdRecord)
    if count == int32.MaxValue {
      throw OverflowException("Vulkan path identity count overflow")
    }
    count++
    return identity
  }

  internal func Retain(identity VulkanPathResourceIdentity) {
    EnsureOpen()
    if !identity.IsValid {
      throw ArgumentException("Vulkan path identity is invalid", "identity")
    }
    guard let record = Find(identity.PathId.LogicalId) else { return }
    if record.ResidencyCount == Int32.MaxValue {
      throw OverflowException("Vulkan path identity residency overflow")
    }
    if record.ResidencyCount == 0 {
      record.ResidentData = record.Reference.Target as VectorPathData?
    }
    record.ResidencyCount = record.ResidencyCount + 1
  }

  internal func Release(identity VulkanPathResourceIdentity) {
    if disposed || !identity.IsValid {
      return
    }
    guard let record = Find(identity.PathId.LogicalId) else { return }
    if record.ResidencyCount <= 0 { return }
    record.ResidencyCount = record.ResidencyCount - 1
    if record.ResidencyCount == 0 {
      record.ResidentData = nil
    }
    if record.ResidencyCount == 0
      && (!record.Reference.IsAlive || record.Reference.Target == nil) {
        RemoveRecord(record)
        count = count - 1
      }
  }

  // Releases the registry and any resident geometry representatives.
  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    identities.Clear()
    records.Clear()
    matches.Clear()
    deadRecords.Clear()
    count = 0
  }

  private func Find(logicalId uint64) VulkanPathIdentityRecord? ->
  if records.TryGetValue(logicalId, out var record) { record } else { nil }

  private func Refresh(record VulkanPathIdentityRecord, revision uint64) VulkanPathResourceIdentity {
    if record.Identity.GeometryRevision != revision {
      record.Identity = VulkanPathResourceIdentity{
        PathId: ResourceId{
          Kind: record.Identity.PathId.Kind,
          LogicalId: record.Identity.PathId.LogicalId,
          Version: revision,
        },
        SourceId: record.Identity.SourceId,
        GeometryRevision: revision,
      }
    }
    return record.Identity
  }

  internal func SweepDeadRecords() {
    EnsureOpen()
    deadRecords.Clear()
    for record in records.Values {
      if record.ResidencyCount == 0 && record.Reference.Target == nil {
        deadRecords.Add(record)
      }
    }
    for record in deadRecords {
      RemoveRecord(record)
      count--
    }
    deadRecords.Clear()
  }

  private func RemoveRecord(record VulkanPathIdentityRecord) {
    Remove(record)
    records.Remove(record.Identity.PathId.LogicalId)
  }

  private func Remove(record VulkanPathIdentityRecord) {
    if identities.TryGetValue(record.Hash, out var bucket) {
      let last = bucket[bucket.Count - 1]
      bucket[record.BucketIndex] = last
      last.BucketIndex = record.BucketIndex
      bucket.RemoveAt(bucket.Count - 1)
      if bucket.Count == 0 {
        identities.Remove(record.Hash)
      }
    }
  }

  private func NextLogicalId() uint64 {
    if nextLogicalId == 0uL || nextLogicalId == uint64.MaxValue {
      throw OverflowException("Vulkan path logical identity overflow")
    }
    let value = nextLogicalId
    nextLogicalId++
    return value
  }

  private func NextSourceId() uint64 {
    if nextSourceId == 0uL || nextSourceId == uint64.MaxValue {
      throw OverflowException("Vulkan path source identity overflow")
    }
    let value = nextSourceId
    nextSourceId++
    return value
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanPathIdentityRegistry")
    }
  }
}
