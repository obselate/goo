package Goo

import System
import System.Collections.Generic

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

  internal init(data VectorPathData, identity VulkanPathResourceIdentity, hash uint64) {
    Reference = WeakReference(data)
    Identity = identity
    Hash = hash
  }
}

internal sealed class VulkanPathIdentityRegistry {
  private let identities Dictionary[uint64, List[VulkanPathIdentityRecord]]
  private let records List[VulkanPathIdentityRecord]
  private var nextLogicalId uint64
  private var nextSourceId uint64
  private var count int32
  private var disposed bool

  internal prop Count int32{ get -> count }

  internal init() {
    identities = Dictionary[uint64, List[VulkanPathIdentityRecord]]()
    records = List[VulkanPathIdentityRecord]()
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
    SweepDeadRecords()
    if let owner = data.NormalizedOwner {
      var ownerIndex int32 = 0
      while ownerIndex < records.Count {
        let ownerRecord = records[ownerIndex]
        if let ownerData = ownerRecord.Reference.Target as VectorPathData {
          if Object.ReferenceEquals(ownerData.NormalizedOwner, owner) {
            if ownerRecord.Identity.GeometryRevision != data.GeometryRevision {
              ownerRecord.Identity = VulkanPathResourceIdentity{
                PathId: ResourceId{
                  Kind: ownerRecord.Identity.PathId.Kind,
                  LogicalId: ownerRecord.Identity.PathId.LogicalId,
                  Version: data.GeometryRevision,
                },
                SourceId: ownerRecord.Identity.SourceId,
                GeometryRevision: data.GeometryRevision,
              }
            }
            return ownerRecord.Identity
          }
        }
        ownerIndex++
      }
    }
    if identities.TryGetValue(data.Hash, out var bucket) {
      var index int32 = 0
      while index < bucket.Count {
        let existing = bucket[index]
        if let existingData = existing.Reference.Target as VectorPathData {
          if Object.ReferenceEquals(existingData, data) || existingData.Equals(data) {
            if existing.Identity.GeometryRevision != data.GeometryRevision {
              existing.Identity = VulkanPathResourceIdentity{
                PathId: ResourceId{
                  Kind: existing.Identity.PathId.Kind,
                  LogicalId: existing.Identity.PathId.LogicalId,
                  Version: data.GeometryRevision,
                },
                SourceId: existing.Identity.SourceId,
                GeometryRevision: data.GeometryRevision,
              }
            }
            return existing.Identity
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
    createdBucket.Add(createdRecord)
    records.Add(createdRecord)
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
    count = 0
  }

  private func Find(logicalId uint64) VulkanPathIdentityRecord? {
    var index int32 = 0
    while index < records.Count {
      let record = records[index]
      if record.Identity.PathId.LogicalId == logicalId {
        return record
      }
      index++
    }
    return nil
  }

  private func SweepDeadRecords() {
    var index int32 = 0
    while index < records.Count {
      let record = records[index]
      if record.ResidencyCount == 0
        && (!record.Reference.IsAlive || record.Reference.Target == nil) {
          RemoveRecord(record)
          count = count - 1
        } else {
          index++
        }
    }
  }

  private func RemoveRecord(record VulkanPathIdentityRecord) {
    Remove(record)
    var index int32 = 0
    while index < records.Count {
      if Object.ReferenceEquals(records[index], record) {
        records.RemoveAt(index)
        return
      }
      index++
    }
  }

  private func Remove(record VulkanPathIdentityRecord) {
    if identities.TryGetValue(record.Hash, out var bucket) {
      var index int32 = 0
      while index < bucket.Count {
        if Object.ReferenceEquals(bucket[index], record) {
          bucket.RemoveAt(index)
          break
        }
        index++
      }
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
