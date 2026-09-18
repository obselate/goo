package Goo

internal unsafe sealed class VulkanMemoryBudgetState {
  private const MaximumHeapCount int32 = 16
  private let physicalDevice VkPhysicalDevice
  private let instanceDispatch VkInstanceDispatch
  private let heapCount uint32
  private let extensionAvailable bool
  private let heapBudgets []VkDeviceSize
  private let heapUsages []VkDeviceSize
  private var available bool

  internal prop Available bool{ get -> available }

  internal init(nativePhysicalDevice VkPhysicalDevice, nativeInstanceDispatch VkInstanceDispatch,
    nativeHeapCount uint32, nativeExtensionAvailable bool) {
      if nativePhysicalDevice == nint(0) {
        throw ArgumentException("nativePhysicalDevice")
      }
      if nativeHeapCount == 0u || nativeHeapCount > uint32(MaximumHeapCount) {
        throw ArgumentOutOfRangeException("nativeHeapCount")
      }
      physicalDevice = nativePhysicalDevice
      instanceDispatch = nativeInstanceDispatch
      heapCount = nativeHeapCount
      extensionAvailable = nativeExtensionAvailable
      heapBudgets = [MaximumHeapCount]VkDeviceSize
      heapUsages = [MaximumHeapCount]VkDeviceSize
    }

  internal func Refresh() {
    var index int32 = 0
    while index < MaximumHeapCount {
      heapBudgets[index] = 0uL
      heapUsages[index] = 0uL
      index = index + 1
    }
    if !extensionAvailable {
      available = false
      return
    }
    var budgetProperties = VkPhysicalDeviceMemoryBudgetPropertiesEXT{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_MEMORY_BUDGET_PROPERTIES_EXT,
      pNext: nil,
    }
    var properties = VkPhysicalDeviceMemoryProperties2{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_MEMORY_PROPERTIES_2,
      pNext: *void(&budgetProperties),
      memoryProperties: VkPhysicalDeviceMemoryProperties{},
    }
    let getProperties = instanceDispatch.vkGetPhysicalDeviceMemoryProperties2
    getProperties(physicalDevice, &properties)
    let budgetPointer * VkDeviceSize = budgetProperties.heapBudget
    let usagePointer * VkDeviceSize = budgetProperties.heapUsage
    index = 0
    while index < int32(heapCount) {
      heapBudgets[index] = budgetPointer[index]
      heapUsages[index] = usagePointer[index]
      index = index + 1
    }
    available = true
  }

  internal func CanAllocate(heapIndex uint32, blockSize VkDeviceSize) bool {
    if !available {
      return true
    }
    if heapIndex >= heapCount {
      return false
    }
    let usage = heapUsages[int32(heapIndex)]
    let budget = heapBudgets[int32(heapIndex)]
    return if usage > budget { false } else { blockSize <= budget - usage }
  }

  internal func TotalBudget() VkDeviceSize {
    if !available {
      return 0uL
    }
    var total VkDeviceSize = 0uL
    var index int32 = 0
    while index < int32(heapCount) {
      let value = heapBudgets[index]
      if value > uint64.MaxValue - total {
        return uint64.MaxValue
      }
      total = total + value
      index = index + 1
    }
    return total
  }

  internal func TotalUsage() VkDeviceSize {
    if !available {
      return 0uL
    }
    var total VkDeviceSize = 0uL
    var index int32 = 0
    while index < int32(heapCount) {
      let value = heapUsages[index]
      if value > uint64.MaxValue - total {
        return uint64.MaxValue
      }
      total = total + value
      index = index + 1
    }
    return total
  }
}
