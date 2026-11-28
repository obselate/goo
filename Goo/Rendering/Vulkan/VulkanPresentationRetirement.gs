package Goo

import System

internal data struct VulkanPresentationRecord {
  var generation uint64
  var presentId uint64
  var imageIndex uint32
  var completionSlot uint32
  var completionSerial uint64
  var hasCompletion bool
  var completed bool
}

internal data struct VulkanCompletedPresentationRecord {
  var generation uint64
  var presentId uint64
}

internal data struct VulkanRetiredGenerationRecord {
  var generation uint64
  var anchorPresentId uint64
  var hasAnchor bool
  var anchorCompleted bool
}

internal partial class VulkanPresentationRetirement {
  private let presentations [] ? VulkanPresentationRecord
  private let completedPresentations [] ? VulkanCompletedPresentationRecord
  private let retiredGenerations [] ? VulkanRetiredGenerationRecord
  private var presentationCount int32
  private var completedPresentationCount int32
  private var retiredGenerationCount int32
  private var nextPresentId uint64
  private var newestGeneration uint64

  internal init(presentationCapacity uint32, retiredGenerationCapacity uint32) {
    if presentationCapacity == 0u || presentationCapacity > uint32(Int32.MaxValue) {
      throw ArgumentOutOfRangeException("presentationCapacity")
    }
    if retiredGenerationCapacity == 0u || retiredGenerationCapacity > uint32(Int32.MaxValue) {
      throw ArgumentOutOfRangeException("retiredGenerationCapacity")
    }
    presentations = [int32(presentationCapacity)]VulkanPresentationRecord
    completedPresentations = [int32(presentationCapacity)]VulkanCompletedPresentationRecord
    retiredGenerations = [int32(retiredGenerationCapacity)]VulkanRetiredGenerationRecord
    nextPresentId = 1uL
  }

  internal func RecordPresent(generation uint64, imageIndex uint32) uint64 {
    if generation == 0uL {
      throw InvalidOperationException("Vulkan presentation generation must be nonzero")
    }
    if generation < newestGeneration {
      throw InvalidOperationException("Vulkan presentation generation moved backwards")
    }
    if nextPresentId == uint64.MaxValue {
      throw OverflowException("Vulkan presentation id overflow")
    }
    if let storage = presentations {
      if presentationCount >= storage.Length {
        throw OverflowException("Vulkan presentation history capacity exceeded")
      }
      if generation > newestGeneration {
        newestGeneration = generation
        DropCompletedOlderThan(generation)
      }
      let presentId = nextPresentId
      nextPresentId = nextPresentId + 1uL
      storage[presentationCount] = VulkanPresentationRecord{
        generation: generation,
        presentId: presentId,
        imageIndex: imageIndex,
        completionSlot: 0u,
        completionSerial: 0uL,
        hasCompletion: false,
        completed: false,
      }
      presentationCount = presentationCount + 1
      return presentId
    }
    throw InvalidOperationException("Vulkan presentation history is uninitialized")
  }

  internal func TryBindPriorSameImageToCompletion(generation uint64, imageIndex uint32,
    completionSlot uint32, completionSerial uint64) bool{
      if generation == 0uL {
        throw InvalidOperationException("Vulkan presentation generation must be nonzero")
      }
      if completionSerial == 0uL {
        throw InvalidOperationException("Vulkan completion serial must be nonzero")
      }
      if let storage = presentations {
        var index int32 = 0
        while index < presentationCount {
          let record = storage[index]
          if record.generation == generation && record.imageIndex == imageIndex
            && !record.hasCompletion && !record.completed{
              storage[index] = VulkanPresentationRecord{
                generation: record.generation,
                presentId: record.presentId,
                imageIndex: record.imageIndex,
                completionSlot: completionSlot,
                completionSerial: completionSerial,
                hasCompletion: true,
                completed: false,
              }
              return true
            }
          index = index + 1
        }
      }
      return false
    }

  internal func CompletePresent(presentId uint64) {
    if presentId == 0uL {
      throw InvalidOperationException("Vulkan presentation id must be nonzero")
    }
    if let storage = presentations {
      var index int32 = 0
      while index < presentationCount {
        let record = storage[index]
        if record.presentId == presentId {
          RememberCompleted(record)
          MarkRetiredAnchorsComplete(record.presentId)
          var readIndex = index + 1
          while readIndex < presentationCount {
            storage[readIndex - 1] = storage[readIndex]
            readIndex = readIndex + 1
          }
          presentationCount = presentationCount - 1
          return
        }
        index = index + 1
      }
      throw InvalidOperationException("Unknown Vulkan presentation id")
    }
    throw InvalidOperationException("Vulkan presentation history is uninitialized")
  }

  internal func CollectCompleted(completionSlot uint32, lastCompletedSerial uint64) int32 {
    if let storage = presentations {
      var readIndex int32 = 0
      var writeIndex int32 = 0
      var collected int32 = 0
      while readIndex < presentationCount {
        let record = storage[readIndex]
        if record.hasCompletion && record.completionSlot == completionSlot
          && record.completionSerial <= lastCompletedSerial {
            RememberCompleted(record)
            MarkRetiredAnchorsComplete(record.presentId)
            collected = collected + 1
          } else {
            if writeIndex != readIndex {
              storage[writeIndex] = record
            }
            writeIndex = writeIndex + 1
          }
        readIndex = readIndex + 1
      }
      presentationCount = writeIndex
      return collected
    }
    throw InvalidOperationException("Vulkan presentation history is uninitialized")
  }

  private func RememberCompleted(record VulkanPresentationRecord) {
    if !IsFirstPresentOfGeneration(record.generation, record.presentId) {
      return
    }
    if let completed = completedPresentations {
      var index int32 = 0
      while index < completedPresentationCount {
        if completed[index].presentId == record.presentId {
          return
        }
        index = index + 1
      }
      if completedPresentationCount >= completed.Length {
        throw OverflowException("Vulkan completed presentation capacity exceeded")
      }
      completed[completedPresentationCount] = VulkanCompletedPresentationRecord{
        generation: record.generation,
        presentId: record.presentId,
      }
      completedPresentationCount = completedPresentationCount + 1
      return
    }
    throw InvalidOperationException("Vulkan completed presentation history is uninitialized")
  }

  private func IsFirstPresentOfGeneration(generation uint64, presentId uint64) bool {
    if let storage = presentations {
      var index int32 = 0
      while index < presentationCount {
        let record = storage[index]
        if record.generation == generation && record.presentId < presentId {
          return false
        }
        index = index + 1
      }
    }
    if let completed = completedPresentations {
      var index int32 = 0
      while index < completedPresentationCount {
        let record = completed[index]
        if record.generation == generation && record.presentId < presentId {
          return false
        }
        index = index + 1
      }
    }
    return true
  }

  private func DropCompletedOlderThan(generation uint64) {
    if let completed = completedPresentations {
      var readIndex int32 = 0
      var writeIndex int32 = 0
      while readIndex < completedPresentationCount {
        let record = completed[readIndex]
        if record.generation >= generation {
          if writeIndex != readIndex {
            completed[writeIndex] = record
          }
          writeIndex = writeIndex + 1
        }
        readIndex = readIndex + 1
      }
      completedPresentationCount = writeIndex
    }
  }

  internal func QueueRetiredGeneration(generation uint64) {
    if generation == 0uL {
      throw InvalidOperationException("Vulkan retired generation must be nonzero")
    }
    if let retired = retiredGenerations {
      var index int32 = 0
      while index < retiredGenerationCount {
        if retired[index].generation == generation {
          throw InvalidOperationException("Vulkan generation is already retired")
        }
        index = index + 1
      }
      if retiredGenerationCount >= retired.Length {
        throw OverflowException("Vulkan retired generation capacity exceeded")
      }
      retired[retiredGenerationCount] = VulkanRetiredGenerationRecord{
        generation: generation,
        anchorPresentId: 0uL,
        hasAnchor: false,
        anchorCompleted: false,
      }
      retiredGenerationCount = retiredGenerationCount + 1
      return
    }
    throw InvalidOperationException("Vulkan retired generation queue is uninitialized")
  }

  internal func AnchorRetiredGenerations(newestGeneration uint64) {
    if newestGeneration == 0uL {
      throw InvalidOperationException("Vulkan newest generation must be nonzero")
    }
    let firstPresentId = FirstPresentId(newestGeneration)
    if firstPresentId == 0uL {
      throw InvalidOperationException("Vulkan newest generation has no successful presentation")
    }
    if let retired = retiredGenerations {
      var index int32 = 0
      while index < retiredGenerationCount {
        let entry = retired[index]
        if !entry.hasAnchor {
          if entry.generation >= newestGeneration {
            throw InvalidOperationException("Vulkan retired generation is not older than its anchor generation")
          }
          retired[index] = VulkanRetiredGenerationRecord{
            generation: entry.generation,
            anchorPresentId: firstPresentId,
            hasAnchor: true,
            anchorCompleted: IsPresentCompleted(firstPresentId),
          }
        }
        index = index + 1
      }
      return
    }
    throw InvalidOperationException("Vulkan retired generation queue is uninitialized")
  }

  private func FirstPresentId(generation uint64) uint64 {
    var firstPresentId uint64 = 0uL
    if let storage = presentations {
      var index int32 = 0
      while index < presentationCount {
        let record = storage[index]
        if record.generation == generation
          && (firstPresentId == 0uL || record.presentId < firstPresentId) {
            firstPresentId = record.presentId
          }
        index = index + 1
      }
    }
    if let completed = completedPresentations {
      var index int32 = 0
      while index < completedPresentationCount {
        let record = completed[index]
        if record.generation == generation
          && (firstPresentId == 0uL || record.presentId < firstPresentId) {
            firstPresentId = record.presentId
          }
        index = index + 1
      }
    }
    return firstPresentId
  }

  private func IsPresentCompleted(presentId uint64) bool {
    if let completed = completedPresentations {
      var index int32 = 0
      while index < completedPresentationCount {
        if completed[index].presentId == presentId {
          return true
        }
        index = index + 1
      }
    }
    if let storage = presentations {
      var index int32 = 0
      while index < presentationCount {
        let record = storage[index]
        if record.presentId == presentId {
          return record.completed
        }
        index = index + 1
      }
    }
    return false
  }

  private func MarkRetiredAnchorsComplete(presentId uint64) {
    if let retired = retiredGenerations {
      var index int32 = 0
      while index < retiredGenerationCount {
        let entry = retired[index]
        if entry.hasAnchor && entry.anchorPresentId == presentId {
          retired[index] = VulkanRetiredGenerationRecord{
            generation: entry.generation,
            anchorPresentId: entry.anchorPresentId,
            hasAnchor: true,
            anchorCompleted: true,
          }
        }
        index = index + 1
      }
    }
  }
  private func DropPresentationRecordsForGeneration(generation uint64) {
    if let storage = presentations {
      var readIndex int32 = 0
      var writeIndex int32 = 0
      while readIndex < presentationCount {
        let record = storage[readIndex]
        if record.generation != generation {
          if writeIndex != readIndex {
            storage[writeIndex] = record
          }
          writeIndex = writeIndex + 1
        }
        readIndex = readIndex + 1
      }
      presentationCount = writeIndex
    }
    if let completed = completedPresentations {
      var readIndex int32 = 0
      var writeIndex int32 = 0
      while readIndex < completedPresentationCount {
        let record = completed[readIndex]
        if record.generation != generation {
          if writeIndex != readIndex {
            completed[writeIndex] = record
          }
          writeIndex = writeIndex + 1
        }
        readIndex = readIndex + 1
      }
      completedPresentationCount = writeIndex
    }
  }

  internal func RetireGenerationNow(generation uint64) {
    if let retired = retiredGenerations {
      var index int32 = 0
      while index < retiredGenerationCount {
        if retired[index].generation == generation {
          var readIndex = index + 1
          while readIndex < retiredGenerationCount {
            retired[readIndex - 1] = retired[readIndex]
            readIndex = readIndex + 1
          }
          retiredGenerationCount = retiredGenerationCount - 1
          DropPresentationRecordsForGeneration(generation)
          return
        }
        index = index + 1
      }
      throw InvalidOperationException("Vulkan retired generation is missing")
    }
    throw InvalidOperationException("Vulkan retired generation queue is uninitialized")
  }

  internal func TryPopRetiredGeneration(out generation uint64) bool {
    generation = 0uL
    if let retired = retiredGenerations {
      var index int32 = 0
      while index < retiredGenerationCount {
        let entry = retired[index]
        if entry.hasAnchor && entry.anchorCompleted {
          generation = entry.generation
          DropPresentationRecordsForGeneration(generation)
          var readIndex = index + 1
          while readIndex < retiredGenerationCount {
            retired[readIndex - 1] = retired[readIndex]
            readIndex = readIndex + 1
          }
          retiredGenerationCount = retiredGenerationCount - 1
          return true
        }
        index = index + 1
      }
      return false
    }
    throw InvalidOperationException("Vulkan retired generation queue is uninitialized")
  }

  internal func ResetAfterDeviceLoss() {
    presentationCount = 0
    completedPresentationCount = 0
    retiredGenerationCount = 0
    nextPresentId = 1uL
    newestGeneration = 0uL
  }
}
