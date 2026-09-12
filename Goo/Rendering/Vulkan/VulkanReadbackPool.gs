package Goo

import System

internal data struct VulkanReadbackPoolStats {
  var SlotCount int32
  var LeasedCount int32
  var IdleCount int32
  var ResourceByteBudget VkDeviceSize
  var ResidentResourceBytes VkDeviceSize
  var ResourceSlotBytes VkDeviceSize
}

internal unsafe sealed class VulkanReadbackPool : IDisposable {
  private const MaximumSlotCount int32 = 1
  private const DefaultByteBudget VkDeviceSize = 67108864uL
  private let resourceByteBudget VkDeviceSize
  private let resourceSlotBytes VkDeviceSize
  private let factory(() -> VulkanAsyncReadback)?
  private let slots []VulkanAsyncReadback?
  private let leased []bool
  private var slotCount int32
  private var leasedCount int32
  private var residentBytes VkDeviceSize
  private var disposed bool

  internal prop ResourceByteBudget VkDeviceSize{ get -> resourceByteBudget }
  internal prop ResidentResourceBytes VkDeviceSize{ get -> residentBytes }
  internal prop Stats VulkanReadbackPoolStats{
    get {
      return VulkanReadbackPoolStats{
        SlotCount: slotCount,
        LeasedCount: leasedCount,
        IdleCount: slotCount - leasedCount,
        ResourceByteBudget: resourceByteBudget,
        ResidentResourceBytes: residentBytes,
        ResourceSlotBytes: resourceSlotBytes,
      }
    }
  }

  internal init(nativeResourceSlotBytes VkDeviceSize, nativeResourceByteBudget VkDeviceSize,
    nativeFactory(() -> VulkanAsyncReadback)?) {
      if nativeResourceSlotBytes == 0uL {
        throw ArgumentOutOfRangeException("nativeResourceSlotBytes")
      }
      let selectedBudget = if nativeResourceByteBudget == 0uL {
        DefaultByteBudget
      } else {
        nativeResourceByteBudget
      }
      if selectedBudget < nativeResourceSlotBytes {
        throw ArgumentOutOfRangeException("nativeResourceByteBudget")
      }
      resourceByteBudget = selectedBudget
      resourceSlotBytes = nativeResourceSlotBytes
      factory = nativeFactory
      slots = [MaximumSlotCount]VulkanAsyncReadback?
      leased = [MaximumSlotCount]bool
      slotCount = 0
      leasedCount = 0
      residentBytes = 0uL
      disposed = false
    }

  internal func Acquire() VulkanAsyncReadback? {
    EnsureOpen()
    var index int32 = 0
    while index < slotCount {
      if !leased[index] {
        let value = slots[index]
        guard let result = value else {
          throw InvalidOperationException("Vulkan readback pool slot is empty")
        }
        if result.Generation == 0uL {
          throw InvalidOperationException("Vulkan readback pool slot generation is invalid")
        }
        leased[index] = true
        leasedCount = leasedCount + 1
        return result
      }
      index = index + 1
    }
    if slotCount >= slots.Length || residentBytes > resourceByteBudget - resourceSlotBytes {
      return nil
    }
    guard let creator = factory else {
      return nil
    }
    let created = creator()
    if created == nil || created.TargetResourceByteSize != resourceSlotBytes {
      if created != nil {
        try { created.Dispose() } catch (cleanup Exception) { }
      }
      throw InvalidOperationException("Vulkan readback pool factory returned an invalid slot")
    }
    slots[slotCount] = created
    leased[slotCount] = true
    slotCount = slotCount + 1
    leasedCount = leasedCount + 1
    residentBytes = residentBytes + resourceSlotBytes
    return created
  }

  internal func Adopt(value VulkanAsyncReadback) bool {
    EnsureOpen()
    if value == nil {
      throw ArgumentNullException("value")
    }
    if slotCount != 0 || residentBytes > resourceByteBudget - resourceSlotBytes {
      return false
    }
    if value.TargetResourceByteSize != resourceSlotBytes {
      throw InvalidOperationException("Vulkan readback pool slot has an unexpected resource size")
    }
    if value.Generation == 0uL {
      throw InvalidOperationException("Vulkan readback pool slot generation is invalid")
    }
    slots[0] = value
    leased[0] = true
    slotCount = 1
    leasedCount = 1
    residentBytes = resourceSlotBytes
    return true
  }

  internal func Release(value VulkanAsyncReadback) {
    EnsureOpen()
    if value == nil {
      throw ArgumentNullException("value")
    }
    var index int32 = 0
    while index < slotCount {
      if slots[index] == value {
        if !leased[index] {
          throw InvalidOperationException("Vulkan readback pool slot is not leased")
        }
        if value.IsPending {
          throw InvalidOperationException("Vulkan readback pool slot is still pending")
        }
        value.Reset()
        leased[index] = false
        leasedCount = leasedCount - 1
        return
      }
      index = index + 1
    }
    throw ArgumentException("value")
  }

  internal func AbandonAfterDeviceLoss() {
    if disposed {
      return
    }
    var index int32 = 0
    while index < slotCount {
      if let value = slots[index] {
        try { value.AbandonAfterDeviceLoss() } catch (cleanup Exception) { }
      }
      leased[index] = false
      index = index + 1
    }
    leasedCount = 0
  }

  public func Dispose() {
    if disposed {
      return
    }
    var index int32 = 0
    while index < slotCount {
      if let value = slots[index] {
        if value.TargetPending {
          value.DrainAndDispose()
        } else {
          value.Dispose()
        }
        slots[index] = nil
      }
      leased[index] = false
      index = index + 1
    }
    disposed = true
    slotCount = 0
    leasedCount = 0
    residentBytes = 0uL
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanReadbackPool")
    }
  }
}
