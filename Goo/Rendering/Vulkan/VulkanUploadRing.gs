package Goo

import System

internal enum VulkanUploadRangeState {
  Free;
  Reserved;
  Submitted;
  Completed;
}

internal data struct VulkanUploadSegment {
  var State VulkanUploadRangeState
  var Resource ResourceId
  var Version uint64
  var Generation uint64
  var StartOffset VkDeviceSize
  var DataOffset VkDeviceSize
  var Size VkDeviceSize
  var SpanSize VkDeviceSize
  var Fence uint64
  var Sequence uint64
}

internal data struct VulkanUploadReservation {
  var Succeeded bool
  var Slot int32
  var Resource ResourceId
  var Version uint64
  var Generation uint64
  var Offset VkDeviceSize
  var Size VkDeviceSize
  var SpanSize VkDeviceSize
  var Sequence uint64
}

internal data struct VulkanUploadRingStats {
  var Capacity VkDeviceSize
  var UsedBytes VkDeviceSize
  var FreeBytes VkDeviceSize
  var ActiveRanges int32
  var SubmittedRanges int32
}

internal unsafe class VulkanUploadRing {
  private var capacity VkDeviceSize
  private var segments []VulkanUploadSegment
  private var generation uint64
  private var head VkDeviceSize
  private var tail VkDeviceSize
  private var usedBytes VkDeviceSize
  private var activeRanges int32
  private var submittedRanges int32
  private var nextSequence uint64
  private var disposed bool

  internal prop Generation uint64{ get -> generation }
  internal prop Stats VulkanUploadRingStats{
    get {
      return VulkanUploadRingStats{
        Capacity: capacity,
        UsedBytes: usedBytes,
        FreeBytes: capacity - usedBytes,
        ActiveRanges: activeRanges,
        SubmittedRanges: submittedRanges,
      }
    }
  }

  internal init(byteCapacity VkDeviceSize, rangeCapacity int32, initialGeneration uint64) {
    if byteCapacity == 0uL {
      throw ArgumentOutOfRangeException("byteCapacity")
    }
    if rangeCapacity <= 0 {
      throw ArgumentOutOfRangeException("rangeCapacity")
    }
    if initialGeneration == 0uL {
      throw ArgumentOutOfRangeException("initialGeneration")
    }
    capacity = byteCapacity
    segments = [rangeCapacity]VulkanUploadSegment
    generation = initialGeneration
    nextSequence = 1uL
  }

  internal func Reserve(resource ResourceId, version uint64, size VkDeviceSize,
    alignment VkDeviceSize) VulkanUploadReservation{
      EnsureOpen()
      if !resource.IsValid || version == 0uL || version != resource.Version
        || size == 0uL || size > capacity || alignment == 0uL {
          throw ArgumentException("Upload reservation arguments are invalid")
        }
      if activeRanges == segments.Length {
        EnsureRangeCapacity(activeRanges + 1)
      }
      if size > capacity - usedBytes {
        return VulkanUploadReservation{ Succeeded: false, Slot: -1 }
      }
      var start VkDeviceSize = 0uL
      var dataOffset VkDeviceSize = 0uL
      var span VkDeviceSize = 0uL
      if !FindOffset(size, alignment, ref start, ref dataOffset, ref span) {
        return VulkanUploadReservation{ Succeeded: false, Slot: -1 }
      }
      if span == 0uL || span > capacity - usedBytes {
        return VulkanUploadReservation{ Succeeded: false, Slot: -1 }
      }
      var slotIndex int32 = 0
      while slotIndex < segments.Length {
        if segments[slotIndex].State == VulkanUploadRangeState.Free {
          break
        }
        slotIndex++
      }
      if slotIndex >= segments.Length {
        return VulkanUploadReservation{ Succeeded: false, Slot: -1 }
      }
      let serial = nextSequence
      if nextSequence == uint64.MaxValue {
        nextSequence = 1uL
      } else {
        nextSequence++
      }
      segments[slotIndex] = VulkanUploadSegment{
        State: VulkanUploadRangeState.Reserved,
        Resource: resource,
        Version: version,
        Generation: generation,
        StartOffset: start,
        DataOffset: dataOffset,
        Size: size,
        SpanSize: span,
        Fence: 0uL,
        Sequence: serial,
      }
      activeRanges++
      usedBytes += span
      head = (start + span) % capacity
      return VulkanUploadReservation{
        Succeeded: true,
        Slot: slotIndex,
        Resource: resource,
        Version: version,
        Generation: generation,
        Offset: dataOffset,
        Size: size,
        SpanSize: span,
        Sequence: serial,
      }
    }

  internal func GrowCapacity(nextCapacity VkDeviceSize) {
    EnsureOpen()
    if nextCapacity <= capacity {
      return
    }
    if activeRanges != 0 || submittedRanges != 0 || usedBytes != 0uL {
      throw InvalidOperationException("Vulkan upload ring cannot grow with active ranges")
    }
    capacity = nextCapacity
    head = 0uL
    tail = 0uL
  }

  internal func CanMarkSubmitted(reservation VulkanUploadReservation, fence uint64) bool {
    EnsureOpen()
    if fence == 0uL || !MatchesReservation(reservation) {
      return false
    }
    let segment = segments[reservation.Slot]
    return segment.State == VulkanUploadRangeState.Reserved
      || (segment.State == VulkanUploadRangeState.Submitted && segment.Fence == fence)
  }

  internal func IsSubmitted(reservation VulkanUploadReservation, fence uint64) bool {
    EnsureOpen()
    if fence == 0uL || !MatchesReservation(reservation) {
      return false
    }
    let segment = segments[reservation.Slot]
    return segment.State == VulkanUploadRangeState.Submitted && segment.Fence == fence
  }

  internal func MarkSubmitted(reservation VulkanUploadReservation, fence uint64) bool {
    EnsureOpen()
    if fence == 0uL || !MatchesReservation(reservation) {
      return false
    }
    let segment = segments[reservation.Slot]
    if segment.State == VulkanUploadRangeState.Submitted && segment.Fence == fence {
      return true
    }
    if segment.State != VulkanUploadRangeState.Reserved {
      return false
    }
    segments[reservation.Slot] = VulkanUploadSegment{
      State: VulkanUploadRangeState.Submitted,
      Resource: segment.Resource,
      Version: segment.Version,
      Generation: segment.Generation,
      StartOffset: segment.StartOffset,
      DataOffset: segment.DataOffset,
      Size: segment.Size,
      SpanSize: segment.SpanSize,
      Fence: fence,
      Sequence: segment.Sequence,
    }
    submittedRanges++
    return true
  }

  internal func Cancel(reservation VulkanUploadReservation) bool {
    EnsureOpen()
    if !reservation.Succeeded || reservation.Slot < 0 || reservation.Slot >= segments.Length {
      return false
    }
    let segment = segments[reservation.Slot]
    if segment.State != VulkanUploadRangeState.Reserved
      || reservation.Generation != generation
      || segment.Generation != generation
      || segment.Resource.Kind != reservation.Resource.Kind
      || segment.Resource.LogicalId != reservation.Resource.LogicalId
      || segment.Resource.Version != reservation.Resource.Version
      || segment.Version != reservation.Version
      || segment.DataOffset != reservation.Offset
      || segment.Size != reservation.Size
      || segment.SpanSize != reservation.SpanSize
      || segment.Sequence != reservation.Sequence{
        return false
      }
    segments[reservation.Slot] = VulkanUploadSegment{
      State: VulkanUploadRangeState.Completed,
      Resource: segment.Resource,
      Version: segment.Version,
      Generation: segment.Generation,
      StartOffset: segment.StartOffset,
      DataOffset: segment.DataOffset,
      Size: segment.Size,
      SpanSize: segment.SpanSize,
      Fence: 0uL,
      Sequence: segment.Sequence,
    }
    return true
  }

  internal func Collect(completedFence uint64) int32 {
    EnsureOpen()
    var index int32 = 0
    while index < segments.Length {
      let segment = segments[index]
      if segment.State == VulkanUploadRangeState.Submitted && segment.Fence <= completedFence {
        segments[index] = VulkanUploadSegment{
          State: VulkanUploadRangeState.Completed,
          Resource: segment.Resource,
          Version: segment.Version,
          Generation: segment.Generation,
          StartOffset: segment.StartOffset,
          DataOffset: segment.DataOffset,
          Size: segment.Size,
          SpanSize: segment.SpanSize,
          Fence: segment.Fence,
          Sequence: segment.Sequence,
        }
        submittedRanges--
      }
      index++
    }
    var collected int32 = 0
    while true {
      var oldestIndex int32 = -1
      var oldestSequence uint64 = uint64.MaxValue
      index = 0
      while index < segments.Length {
        let segment = segments[index]
        if segment.State != VulkanUploadRangeState.Free && segment.Sequence < oldestSequence {
          oldestIndex = index
          oldestSequence = segment.Sequence
        }
        index++
      }
      if oldestIndex < 0 || segments[oldestIndex].State != VulkanUploadRangeState.Completed {
        break
      }
      let completedSegment = segments[oldestIndex]
      tail = (completedSegment.StartOffset + completedSegment.SpanSize) % capacity
      usedBytes -= completedSegment.SpanSize
      activeRanges--
      segments[oldestIndex] = VulkanUploadSegment{}
      collected++
    }
    if activeRanges == 0 {
      head = 0uL
      tail = 0uL
      usedBytes = 0uL
    }
    return collected
  }

  internal func SetGeneration(nextGeneration uint64) int32 {
    EnsureOpen()
    if nextGeneration == 0uL {
      throw ArgumentOutOfRangeException("nextGeneration")
    }
    if nextGeneration == generation {
      return 0
    }
    if nextGeneration < generation {
      throw InvalidOperationException("Vulkan upload generation must increase")
    }
    var invalidated int32 = 0
    var index int32 = 0
    while index < segments.Length {
      if segments[index].State != VulkanUploadRangeState.Free {
        invalidated++
        segments[index] = VulkanUploadSegment{}
      }
      index++
    }
    generation = nextGeneration
    head = 0uL
    tail = 0uL
    usedBytes = 0uL
    activeRanges = 0
    submittedRanges = 0
    return invalidated
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    var index int32 = 0
    while index < segments.Length {
      segments[index] = VulkanUploadSegment{}
      index++
    }
    head = 0uL
    tail = 0uL
    usedBytes = 0uL
    activeRanges = 0
    submittedRanges = 0
  }

  deinit{
    Dispose()
  }

  private func MatchesReservation(reservation VulkanUploadReservation) bool {
    if !reservation.Succeeded || reservation.Slot < 0 || reservation.Slot >= segments.Length {
      return false
    }
    let segment = segments[reservation.Slot]
    return reservation.Generation == generation
      && segment.Generation == generation
      && segment.Resource.Kind == reservation.Resource.Kind
      && segment.Resource.LogicalId == reservation.Resource.LogicalId
      && segment.Resource.Version == reservation.Resource.Version
      && segment.Version == reservation.Version
      && segment.DataOffset == reservation.Offset
      && segment.Size == reservation.Size
      && segment.SpanSize == reservation.SpanSize
      && segment.Sequence == reservation.Sequence
  }

  private func FindOffset(size VkDeviceSize, alignment VkDeviceSize,
    ref start VkDeviceSize, ref dataOffset VkDeviceSize, ref span VkDeviceSize) bool{
      if activeRanges == 0 {
        let aligned = Align(0uL, alignment)
        if aligned > capacity || size > capacity - aligned {
          return false
        }
        start = 0uL
        dataOffset = aligned
        span = aligned + size
        return true
      }
      if head == tail {
        return false
      }
      if head >= tail {
        let aligned = Align(head, alignment)
        if aligned <= capacity && size <= capacity - aligned {
          start = head
          dataOffset = aligned
          span = (aligned - head) + size
          return true
        }
        if size <= tail {
          let wrapSize = capacity - head
          if wrapSize > uint64.MaxValue - size {
            return false
          }
          start = head
          dataOffset = 0uL
          span = wrapSize + size
          return true
        }
        return false
      }
      let aligned = Align(head, alignment)
      if aligned >= tail || size > tail - aligned {
        return false
      }
      start = head
      dataOffset = aligned
      span = (aligned - head) + size
      return true
    }

  private func EnsureRangeCapacity(required int32) {
    if required <= segments.Length {
      return
    }
    var nextCapacity = segments.Length
    while nextCapacity < required {
      if nextCapacity > Int32.MaxValue / 2 {
        nextCapacity = required
      } else {
        nextCapacity = nextCapacity * 2
      }
    }
    let next = [nextCapacity]VulkanUploadSegment
    Array.Copy(segments, next, segments.Length)
    segments = next
  }

  private func Align(value VkDeviceSize, alignment VkDeviceSize) VkDeviceSize {
    let remainder = value % alignment
    if remainder == 0uL {
      return value
    }
    let padding = alignment - remainder
    if value > uint64.MaxValue - padding {
      return uint64.MaxValue
    }
    return value + padding
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanUploadRing")
    }
  }
}
