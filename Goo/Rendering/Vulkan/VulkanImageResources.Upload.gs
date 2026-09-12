package Goo

import System

internal unsafe partial class VulkanImageResources : IDisposable {
  internal func RegisterImage(
    id ResourceId,
    width uint32,
    height uint32,
    source VulkanResourceSource,
    cacheable bool,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode) VulkanImageResourceLookup{
      EnsureOpen()
      ValidateImageId(id)
      ValidateSamplerId(samplerId)
      let bytes = ImageBytes(width, height)
      if bytes > VkDeviceSize(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("width")
      }
      if source.Bytes != bytes || source.Version != id.Version {
        throw ArgumentException("Vulkan image source does not match image extent", "source")
      }
      if HasNewerSourceVersion(source) {
        return VulkanImageResourceLookup{ Found: false }
      }
      DiscardUnpublishedOlderSourceVersions(source)
      let existingIndex = FindExactIndex(id)
      if existingIndex >= 0 {
        var existing = entries[existingIndex]
        if existing.State == VulkanImageResourceState.Resident
          || existing.State == VulkanImageResourceState.UploadPending{
            if existing.PendingRetire {
              throw InvalidOperationException("Vulkan image is pending retirement")
            }
            if existing.Id.Version == id.Version {
              EnsureExactMetadata(existing, id, width, height, source, cacheable, samplerId, samplerMode)
              existing.SamplerMode = samplerMode
              existing.LastTouch = TouchValue()
              entries[existingIndex] = existing
              return Lookup(existingIndex, samplerId, samplerMode)
            }
          }
        if existing.State == VulkanImageResourceState.Retiring {
          throw InvalidOperationException("Vulkan image version is retiring")
        }
      }
      if source.Bytes > logicalStats.LogicalSourceBudget {
        throw InvalidOperationException("Vulkan image logical source hard limit exceeded")
      }
      if logicalStats.LogicalSourceBytes > logicalStats.LogicalSourceBudget - source.Bytes {
        return VulkanImageResourceLookup{ Found: false }
      }
      if bytes > residentByteBudget {
        throw InvalidOperationException("Vulkan image resident hard limit exceeded")
      }
      if !TryEnsureResidentCapacity(bytes) {
        return VulkanImageResourceLookup{ Found: false }
      }
      let index = if existingIndex >= 0 { existingIndex } else { FindEmptyIndex() }
      CreateImage(index, id, width, height, bytes, source, cacheable, samplerId, samplerMode)
      return Lookup(index, samplerId, samplerMode)
    }

  internal func QueueUpload(id ResourceId, premultipliedSourceBytes * uint8,
    byteCount VkDeviceSize, expectedGeneration uint64) bool{
      EnsureOpen()
      ValidateGeneration(expectedGeneration)
      ValidateImageId(id)
      if premultipliedSourceBytes == nil {
        throw ArgumentNullException("premultipliedSourceBytes")
      }
      let index = FindExactIndex(id)
      if index < 0 {
        throw InvalidOperationException("Vulkan image is not registered")
      }
      var entry = entries[index]
      if entry.PendingRetire {
        throw InvalidOperationException("Vulkan image is pending retirement")
      }
      if entry.State == VulkanImageResourceState.Retiring {
        throw InvalidOperationException("Vulkan image is retiring")
      }
      if entry.State == VulkanImageResourceState.Empty || entry.Image == 0uL {
        throw InvalidOperationException("Vulkan image is not resident")
      }
      if byteCount != entry.Bytes || byteCount > VkDeviceSize(Int32.MaxValue) {
        throw ArgumentOutOfRangeException("byteCount")
      }
      if (byteCount % 4uL) != 0uL {
        throw ArgumentOutOfRangeException("byteCount")
      }
      if entry.UploadedVersion == id.Version || entry.Upload.Succeeded {
        return false
      }
      if entry.UploadCompletedRows > entry.Height {
        throw InvalidOperationException("Vulkan image upload progress is invalid")
      }
      if entry.UploadCompletedRows == entry.Height {
        return false
      }
      let rowBytes = VkDeviceSize(entry.Width) * 4uL
      if rowBytes == 0uL || rowBytes > stagingMaximumByteCapacity
        || rowBytes > VkDeviceSize(Int32.MaxValue) {
          throw InvalidOperationException("Vulkan image row exceeds staging capacity")
        }
      let remainingBytes = VkDeviceSize(entry.Height - entry.UploadCompletedRows) * rowBytes
      EnsureStagingBuffer(remainingBytes)
      if rowBytes > stagingByteCapacity {
        if let currentDiagnostics = diagnostics {
          currentDiagnostics.AddImageUploadDeferred(1uL)
        }
        return false
      }
      let remainingRows = entry.Height - entry.UploadCompletedRows
      let freeBytes = uploadRing.Stats.FreeBytes
      var rowCount = uint32(freeBytes / rowBytes)
      if rowCount > remainingRows {
        rowCount = remainingRows
      }
      if rowCount == 0u {
        if let currentDiagnostics = diagnostics {
          currentDiagnostics.AddImageUploadDeferred(1uL)
        }
        return false
      }
      var reservation = VulkanUploadReservation{}
      while rowCount != 0u {
        let chunkBytes = VkDeviceSize(rowCount) * rowBytes
        reservation = uploadRing.Reserve(id, id.Version, chunkBytes, 4uL)
        if reservation.Succeeded {
          break
        }
        rowCount = rowCount / 2u
      }
      if !reservation.Succeeded || rowCount == 0u {
        if let currentDiagnostics = diagnostics {
          currentDiagnostics.AddImageUploadDeferred(1uL)
        }
        return false
      }
      let sourceByteOffset = VkDeviceSize(entry.UploadCompletedRows) * rowBytes
      let chunkByteCount = VkDeviceSize(rowCount) * rowBytes
      let source = *uint8(nint(premultipliedSourceBytes) + nint(sourceByteOffset))
      let destination = *uint8(nint(stagingAllocation!!.mapped) + nint(reservation.Offset))
      try {
        var byteIndex int32 = 0
        while byteIndex < int32(chunkByteCount) {
          let alpha = source[byteIndex + 3]
          if alpha == uint8(255) {
            destination[byteIndex] = source[byteIndex]
            destination[byteIndex + 1] = source[byteIndex + 1]
            destination[byteIndex + 2] = source[byteIndex + 2]
          } else if alpha == uint8(0) {
            destination[byteIndex] = uint8(0)
            destination[byteIndex + 1] = uint8(0)
            destination[byteIndex + 2] = uint8(0)
          } else {
            destination[byteIndex] = Unpremultiply(source[byteIndex], alpha)
            destination[byteIndex + 1] = Unpremultiply(source[byteIndex + 1], alpha)
            destination[byteIndex + 2] = Unpremultiply(source[byteIndex + 2], alpha)
          }
          destination[byteIndex + 3] = alpha
          byteIndex += 4
        }
      } catch (error Exception) {
        if !uploadRing.Cancel(reservation) {
          throw InvalidOperationException("Vulkan image upload reservation rollback failed")
        }
        uploadRing.Collect(highestCompletedFence)
        throw error
      }
      entry.State = VulkanImageResourceState.UploadPending
      entry.UploadRowOffset = entry.UploadCompletedRows
      entry.UploadRowCount = rowCount
      entry.Upload = reservation
      entry.UploadRecorded = false
      entry.UploadSubmitted = false
      entry.UploadCommandBuffer = 0uL
      entry.UploadFence = 0uL
      entry.PendingRetire = false
      flushPrepared = false
      entries[index] = entry
      if let currentDiagnostics = diagnostics {
        currentDiagnostics.AddImageUploadChunk(1uL)
      }
      return true
    }

  internal func RecordUploads(commandBuffer VkCommandBuffer, expectedGeneration uint64,
    out recordedBytes VkDeviceSize, out recordedBarriers int32) int32{
      EnsureOpen()
      ValidateGeneration(expectedGeneration)
      if commandBuffer == nint(0) {
        throw ArgumentException("Command buffer is null", "commandBuffer")
      }
      recordedBytes = 0uL
      recordedBarriers = 0
      if uploadRing.Stats.ActiveRanges == 0 {
        return 0
      }
      var recorded int32 = 0
      var index int32 = 0
      while index < entries.Length {
        var entry = entries[index]
        if entry.State == VulkanImageResourceState.UploadPending
          && entry.Upload.Succeeded && !entry.UploadSubmitted{
            if entry.UploadRecorded {
              if entry.UploadCommandBuffer != commandBuffer {
                index++
                continue
              }
              index++
              continue
            }
            if entry.UploadCommandBuffer != 0uL {
              throw InvalidOperationException("Vulkan image upload must be aborted before recording again")
            }
            var barrierCount int32 = 0
            try {
              barrierCount = RecordUpload(commandBuffer, entry)
            } catch (error Exception) {
              if !uploadRing.Cancel(entry.Upload) {
                throw InvalidOperationException("Vulkan image upload reservation rollback failed")
              }
              entry.State = VulkanImageResourceState.Resident
              ResetUploadAttempt(ref entry)
              entry.PendingRetire = false
              entries[index] = entry
              uploadRing.Collect(highestCompletedFence)
              flushPrepared = false
              throw error
            }
            entry.UploadCommandBuffer = commandBuffer
            entry.UploadRecorded = true
            entries[index] = entry
            recorded++
            recordedBytes = recordedBytes + entry.Upload.Size
            recordedBarriers = recordedBarriers + barrierCount
          }
        index++
      }
      return recorded
    }

  internal func FlushBeforeSubmit() VkResult {
    EnsureOpen()
    if stagingAllocation == nil {
      return VkConstants.VK_SUCCESS
    }
    if uploadRing.Stats.ActiveRanges == 0 {
      flushPrepared = false
      return VkConstants.VK_SUCCESS
    }
    var flushed bool = false
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanImageResourceState.UploadPending
        && entry.Upload.Succeeded && !entry.UploadSubmitted{
          let result = allocator.FlushBeforeSubmit(stagingAllocation!!,
            entry.Upload.Offset, entry.Upload.Size)
          if result != VkConstants.VK_SUCCESS {
            flushPrepared = false
            return result
          }
          flushed = true
        }
      index = index + 1
    }
    flushPrepared = flushed
    return VkConstants.VK_SUCCESS
  }

  internal func AbortUploads(commandBuffer VkCommandBuffer, expectedGeneration uint64) int32 {
    EnsureOpen()
    ValidateGeneration(expectedGeneration)
    if commandBuffer == nint(0) {
      throw ArgumentException("Command buffer is null", "commandBuffer")
    }
    if uploadRing.Stats.ActiveRanges == 0 {
      flushPrepared = false
      return 0
    }
    var aborted int32 = 0
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanImageResourceState.UploadPending
        && entry.Upload.Succeeded && !entry.UploadSubmitted
        && entry.UploadCommandBuffer != 0uL
        && entry.UploadCommandBuffer != commandBuffer{
          throw InvalidOperationException("Vulkan image upload belongs to another command buffer")
        }
      index++
    }
    index = 0
    while index < entries.Length {
      var entry = entries[index]
      if entry.State == VulkanImageResourceState.UploadPending
        && entry.Upload.Succeeded && !entry.UploadSubmitted
        && entry.UploadCommandBuffer == commandBuffer{
          AbortUpload(index, ref entry)
          aborted++
        }
      index++
    }
    uploadRing.Collect(highestCompletedFence)
    flushPrepared = false
    return aborted
  }

  internal func AbortUnrecordedUploads(expectedGeneration uint64) int32 {
    EnsureOpen()
    ValidateGeneration(expectedGeneration)
    if uploadRing.Stats.ActiveRanges == 0 {
      flushPrepared = false
      return 0
    }
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanImageResourceState.UploadPending
        && entry.Upload.Succeeded && !entry.UploadSubmitted
        && (entry.UploadRecorded || entry.UploadCommandBuffer != 0uL) {
          throw InvalidOperationException("Vulkan image upload commands are recorded")
        }
      index++
    }
    var aborted int32 = 0
    index = 0
    while index < entries.Length {
      var entry = entries[index]
      if entry.State == VulkanImageResourceState.UploadPending
        && entry.Upload.Succeeded && !entry.UploadSubmitted
        && !entry.UploadRecorded && entry.UploadCommandBuffer == 0uL {
          AbortUpload(index, ref entry)
          aborted++
        }
      index++
    }
    uploadRing.Collect(highestCompletedFence)
    flushPrepared = false
    return aborted
  }

  private func AbortUpload(index int32, ref entry VulkanImageResourceEntry) {
    if !uploadRing.Cancel(entry.Upload) {
      throw InvalidOperationException("Vulkan image upload reservation is stale")
    }
    entry.State = VulkanImageResourceState.Resident
    ResetUploadAttempt(ref entry)
    entry.PendingRetire = false
    let dropLogicalOnRetire = entry.DropLogicalOnRetire
    entries[index] = entry
    if dropLogicalOnRetire {
      if !Retire(entry.Id, generation, highestCompletedFence) {
        throw InvalidOperationException("Vulkan image retirement failed")
      }
    }
  }

  private func ResetUploadAttempt(ref entry VulkanImageResourceEntry) {
    entry.Upload = VulkanUploadReservation{}
    entry.UploadRowOffset = 0u
    entry.UploadRowCount = 0u
    entry.UploadRecorded = false
    entry.UploadSubmitted = false
    entry.UploadCommandBuffer = 0uL
    entry.UploadFence = 0uL
  }

  internal func ValidateUploadSubmission(
    commandBuffer VkCommandBuffer,
    fence uint64,
    expectedGeneration uint64) int32{
      EnsureOpen()
      ValidateGeneration(expectedGeneration)
      if commandBuffer == nint(0) {
        throw ArgumentException("Command buffer is null", "commandBuffer")
      }
      if fence == 0uL {
        throw ArgumentOutOfRangeException("fence")
      }
      if uploadRing.Stats.ActiveRanges == 0 {
        return 0
      }
      var index int32 = 0
      var tracked int32 = 0
      while index < entries.Length {
        let entry = entries[index]
        if entry.State == VulkanImageResourceState.UploadPending
          && entry.Upload.Succeeded{
            if entry.UploadSubmitted {
              if entry.UploadCommandBuffer != commandBuffer {
                index++
                continue
              }
              if !entry.UploadRecorded
                || entry.UploadFence != fence
                || !uploadRing.IsSubmitted(entry.Upload, fence) {
                  throw InvalidOperationException("Vulkan image upload submission identity is invalid")
                }
            } else {
              if !entry.UploadRecorded || entry.UploadCommandBuffer == 0uL {
                throw InvalidOperationException("Vulkan image upload is not recorded")
              }
              if entry.UploadCommandBuffer != commandBuffer {
                index++
                continue
              }
              if entry.UploadFence != 0uL {
                throw InvalidOperationException("Vulkan image upload fence is assigned before submit")
              }
              if !uploadRing.CanMarkSubmitted(entry.Upload, fence) {
                throw InvalidOperationException("Vulkan image upload range is not submit-ready")
              }
            }
            tracked++
          }
        index++
      }
      return tracked
    }

  internal func MarkSubmitted(
    commandBuffer VkCommandBuffer,
    fence uint64,
    expectedGeneration uint64) int32{
      let tracked = ValidateUploadSubmission(commandBuffer, fence, expectedGeneration)
      if tracked == 0 {
        return 0
      }
      var pending int32 = 0
      var index int32 = 0
      while index < entries.Length {
        let entry = entries[index]
        if entry.State == VulkanImageResourceState.UploadPending
          && entry.Upload.Succeeded{
            if entry.UploadSubmitted {
              if entry.UploadCommandBuffer != commandBuffer {
                index++
                continue
              }
              if !uploadRing.IsSubmitted(entry.Upload, fence) {
                throw InvalidOperationException("Vulkan image upload submission identity is invalid")
              }
            } else {
              if !uploadRing.CanMarkSubmitted(entry.Upload, fence) {
                throw InvalidOperationException("Vulkan image upload range is not submit-ready")
              }
              pending++
            }
          }
        index++
      }
      if pending != 0 && !flushPrepared {
        throw InvalidOperationException("Vulkan image uploads must be flushed before submit")
      }
      index = 0
      while index < entries.Length {
        var entry = entries[index]
        if entry.State == VulkanImageResourceState.UploadPending
          && entry.Upload.Succeeded && !entry.UploadSubmitted
          && entry.UploadRecorded && entry.UploadCommandBuffer == commandBuffer{
            if !uploadRing.MarkSubmitted(entry.Upload, fence) {
              throw InvalidOperationException("Vulkan upload reservation is stale")
            }
            entry.UploadSubmitted = true
            entry.UploadFence = fence
            if entry.PendingRetire {
              let safeFence = RetireFence(entry, fence)
              entry.RetireFence = safeFence
              if safeFence > generationLastUseFence {
                generationLastUseFence = safeFence
              }
            }
            entry.ImageLayout = if entry.UploadRowOffset + entry.UploadRowCount == entry.Height {
              VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL
            } else {
              VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL
            }
            entries[index] = entry
          }
        index++
      }
      if pending != 0 {
        flushPrepared = false
      }
      return tracked
    }

  internal func ReserveRecording(id ResourceId, expectedGeneration uint64) {
    EnsureOpen()
    ValidateGeneration(expectedGeneration)
    let index = FindExactIndex(id)
    if index < 0 {
      throw InvalidOperationException("Vulkan image is not registered")
    }
    var entry = entries[index]
    if entry.State != VulkanImageResourceState.Resident
      || !entry.GpuPublished || entry.PendingRetire{
        throw InvalidOperationException("Vulkan image is not available for recording")
      }
    if entry.RecordingUseCount == Int32.MaxValue {
      throw InvalidOperationException("Vulkan image recording reservation capacity reached")
    }
    entry.RecordingUseCount++
    entry.LastTouch = TouchValue()
    entries[index] = entry
  }

  internal func ReleaseRecording(id ResourceId, expectedGeneration uint64) bool {
    EnsureOpen()
    ValidateGeneration(expectedGeneration)
    let index = FindExactIndex(id)
    if index < 0 {
      return false
    }
    var entry = entries[index]
    if entry.RecordingUseCount == 0 {
      return false
    }
    entry.RecordingUseCount--
    let retire = entry.PendingRetire && entry.RecordingUseCount == 0
      && currentReferenceCounts[index] == 0
    if retire {
      entry.PendingRetire = false
    }
    entry.LastTouch = TouchValue()
    entries[index] = entry
    if retire && !Retire(id, generation, highestCompletedFence) {
      throw InvalidOperationException("Vulkan image retirement failed")
    }
    return true
  }

  internal func MarkUsed(id ResourceId, expectedGeneration uint64, fence uint64) {
    EnsureOpen()
    ValidateGeneration(expectedGeneration)
    if fence == 0uL {
      throw ArgumentOutOfRangeException("fence")
    }
    let index = FindExactIndex(id)
    if index < 0 {
      return
    }
    if entries[index].RecordingUseCount == 0 {
      return
    }
    if entries[index].State != VulkanImageResourceState.Resident
      || !entries[index].GpuPublished{
        throw InvalidOperationException("Vulkan image upload is not complete")
      }
    var entry = entries[index]
    if fence > entry.LastUseFence {
      entry.LastUseFence = fence
    }
    if fence > generationLastUseFence {
      generationLastUseFence = fence
    }
    if entry.RecordingUseCount > 0 {
      entry.RecordingUseCount--
    }
    let retire = entry.PendingRetire && entry.RecordingUseCount == 0
      && currentReferenceCounts[index] == 0
    if retire {
      entry.PendingRetire = false
    }
    entry.LastTouch = TouchValue()
    entries[index] = entry
    if retire && !Retire(id, generation, fence) {
      throw InvalidOperationException("Vulkan image retirement failed")
    }
  }

  internal func Retire(id ResourceId, expectedGeneration uint64, fence uint64) bool {
    EnsureOpen()
    ValidateGeneration(expectedGeneration)
    let index = FindExactIndex(id)
    if index < 0 {
      return false
    }
    var entry = entries[index]
    if entry.RecordingUseCount != 0 || currentReferenceCounts[index] != 0 {
      let safeFence = RetireFence(entry, fence)
      entry.PendingRetire = true
      if safeFence > entry.RetireFence {
        entry.RetireFence = safeFence
      }
      entries[index] = entry
      if entry.RetireFence > generationLastUseFence {
        generationLastUseFence = entry.RetireFence
      }
      return true
    }
    if entry.PendingRetire {
      if entry.State == VulkanImageResourceState.UploadPending
        && entry.UploadSubmitted{
          let safeFence = RetireFence(entry, fence)
          if safeFence > entry.RetireFence {
            entry.RetireFence = safeFence
            entries[index] = entry
            if safeFence > generationLastUseFence {
              generationLastUseFence = safeFence
            }
          }
          return true
        }
      throw InvalidOperationException("Vulkan image is pending retirement")
    }
    if entry.State == VulkanImageResourceState.UploadPending
      && entry.UploadSubmitted{
        let safeFence = RetireFence(entry, fence)
        entry.PendingRetire = true
        entry.RetireFence = safeFence
        entries[index] = entry
        if safeFence > generationLastUseFence {
          generationLastUseFence = safeFence
        }
        return true
      }
    if entry.State == VulkanImageResourceState.Retiring {
      let safeFence = RetireFence(entry, fence)
      if safeFence > entry.RetireFence {
        if entry.GpuPublished {
          let retiredEntry = RetireDescriptors(entry, safeFence)
          entry = retiredEntry
        }
        entry.RetireFence = safeFence
        entries[index] = entry
        if safeFence > generationLastUseFence {
          generationLastUseFence = safeFence
        }
      }
      return true
    }
    if entry.Upload.Succeeded && entry.UploadRecorded && !entry.UploadSubmitted {
      throw InvalidOperationException("Vulkan image upload commands are recorded")
    }
    let cancelUpload = entry.Upload.Succeeded && !entry.UploadSubmitted
    let safeFence = RetireFence(entry, fence)
    if !entry.GpuPublished {
      if cancelUpload {
        if !uploadRing.Cancel(entry.Upload) {
          throw InvalidOperationException("Vulkan image upload reservation is stale")
        }
        ResetUploadAttempt(ref entry)
      }
      entry.RetireFence = safeFence
      entry.State = VulkanImageResourceState.Retiring
      entries[index] = entry
      if entry.RetireFence > generationLastUseFence {
        generationLastUseFence = entry.RetireFence
      }
      return true
    }
    let logicalIndex = LogicalIndexForPhysical(index, entry)
    let retiredEntry = RetireDescriptors(entry, safeFence)
    if cancelUpload {
      if !uploadRing.Cancel(entry.Upload) {
        throw InvalidOperationException("Vulkan image upload reservation is stale")
      }
    }
    entry = retiredEntry
    if cancelUpload {
      ResetUploadAttempt(ref entry)
    }
    entry.RetireFence = safeFence
    entry.State = VulkanImageResourceState.Retiring
    entries[index] = entry
    RetireLogical(logicalIndex)
    if entry.RetireFence > generationLastUseFence {
      generationLastUseFence = entry.RetireFence
    }
    return true
  }

  internal func PromoteSourceVersion(source VulkanResourceSource) {
    var superseded bool = false
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State != VulkanImageResourceState.Empty
        && entry.ProviderId == source.ProviderId
        && entry.SourceId == source.SourceId
        && entry.Id.Version < source.Version{
          var marked = entry
          marked.DropLogicalOnRetire = true
          if marked.PendingRetire {
            entries[index] = marked
            superseded = true
            index++
            continue
          }
          if entry.State == VulkanImageResourceState.UploadPending
            && entry.Upload.Succeeded && entry.UploadRecorded
            && !entry.UploadSubmitted{
              marked.PendingRetire = true
              entries[index] = marked
            } else {
              entries[index] = marked
              if !Retire(entry.Id, generation, highestCompletedFence) {
                throw InvalidOperationException("Vulkan image retirement failed")
              }
            }
          superseded = true
        }
      index++
    }
    if superseded {
      Collect(highestCompletedFence)
    }
  }

  private func DiscardUnpublishedOlderSourceVersions(source VulkanResourceSource) {
    var discarded bool
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State != VulkanImageResourceState.Empty
        && !entry.GpuPublished
        && entry.ProviderId == source.ProviderId
        && entry.SourceId == source.SourceId
        && entry.Id.Version < source.Version{
          var marked = entry
          marked.DropLogicalOnRetire = true
          entries[index] = marked
          if !marked.PendingRetire {
            if !Retire(marked.Id, generation, highestCompletedFence) {
              throw InvalidOperationException("Vulkan image retirement failed")
            }
          }
          discarded = true
        }
      index++
    }
    if discarded { Collect(highestCompletedFence) }
  }

  private func HasNewerSourceVersion(source VulkanResourceSource) bool {
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State != VulkanImageResourceState.Empty
        && entry.ProviderId == source.ProviderId
        && entry.SourceId == source.SourceId
        && entry.Id.Version > source.Version{
          return true
        }
      index++
    }
    return false
  }

}
