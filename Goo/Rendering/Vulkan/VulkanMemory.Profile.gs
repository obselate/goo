package Goo

import System
import System.Diagnostics

internal enum VulkanMemoryOwnerKind {
  Unknown; LayerTarget; GlyphAtlas; PathAtlas; ClipAtlas; Staging; Image; Buffer
}

internal enum FrameResourceKind {
  MemoryBlock; Buffer; Image; Font; FontFace; ImageSource; Shader; Pipeline; PipelineCache; Swapchain
}

internal data struct VulkanProfileAccount {
  var liveRequirement uint64
  var retiredRequirement uint64
  var livePlacement uint64
  var retiredPlacement uint64
  var liveCount uint64
  var retiredCount uint64
}

internal unsafe partial class VulkanMemoryAllocator {
  internal var ProfileGeneration uint64
  private var profileTraceId string?
  private var profileBaseline int64 = -1L
  private var nextProfileSample int64

  internal func ProfileSnapshot(recorder FrameRecorder, force bool = false) {
    let now = Stopwatch.GetTimestamp()
    let baseline = profileTraceId != recorder.TraceId || profileBaseline != recorder.BaselineVersion
    if !force && !baseline && now < nextProfileSample { return }
    profileTraceId = recorder.TraceId
    profileBaseline = recorder.BaselineVersion
    nextProfileSample = now + Stopwatch.Frequency / 2L
    if baseline {
      for i in 0 ... blockCount {
        if let block = blocks[i] { ProfileBlock(recorder, block, FrameTraceKind.ResourceBaseline, VulkanDiagnosticEventIds.ResourceCreate) }
      }
      for i in 0 ... activeCount {
        if let allocation = activeAllocations[i] {
          if !allocation.pendingBind {
            ProfileAllocation(recorder, allocation, FrameTraceKind.ResourceBaseline, VulkanDiagnosticEventIds.ResourceCreate)
          }
        }
      }
    }
    ProfileAccounts(recorder, now)
    ProfileHeaps(recorder, now)
  }

  private func ProfileContext() FrameTraceContext -> FrameTraceContext{
    DeviceId: uint64(device), DeviceGeneration: ProfileGeneration,
  }

  private func ProfileAccounts(recorder FrameRecorder, now int64) {
    let accounts * VulkanProfileAccount = stackalloc[8]VulkanProfileAccount
    for i in 0 ... 8 { accounts[i] = VulkanProfileAccount{} }
    for i in 0 ... activeCount {
      if let allocation = activeAllocations[i] {
        if allocation.pendingBind { continue }
        let owner = int32(allocation.ownerKind)
        var account = accounts[owner]
        if allocation.state == VulkanMemoryAllocationState.Live {
          account.liveRequirement += allocation.size
          account.livePlacement += allocation.placementSpan
          account.liveCount++
        } else if allocation.state == VulkanMemoryAllocationState.Retired {
          account.retiredRequirement += allocation.size
          account.retiredPlacement += allocation.placementSpan
          account.retiredCount++
        }
        accounts[owner] = account
      }
    }
    for owner in 0 ... 8 {
      let account = accounts[owner]
      ProfileCounter(recorder, now, "vulkan.live.requirements", account.liveRequirement, account.liveCount, owner)
      ProfileCounter(recorder, now, "vulkan.retired.requirements", account.retiredRequirement, account.retiredCount, owner)
      ProfileCounter(recorder, now, "vulkan.live.placement", account.livePlacement, nil, owner)
      ProfileCounter(recorder, now, "vulkan.retired.placement", account.retiredPlacement, nil, owner)
    }
    ProfileCounter(recorder, now, "vulkan.blocks", residentBytes, residentAllocations)
  }

  private func ProfileCounter(recorder FrameRecorder, now int64, name string, value uint64?, count uint64? = nil,
    owner int32? = nil, heap int32? = nil, flags uint64? = nil, validity string = "available") {
    recorder.Publish(FrameTraceRecord{
      Kind: FrameTraceKind.Counter, Ticks: now - recorder.Origin, SampleTicks: now - recorder.Origin,
      ThreadId: Environment.CurrentManagedThreadId, Context: ProfileContext(),
      EventId: VulkanDiagnosticEventIds.LiveMemory, Category: VulkanDiagnosticCategories.Allocator,
      Name: name, Source: if heap != nil { "VK_EXT_memory_budget" } else { "vulkan.allocator" },
      Value0: value, Value1: count, OwnerKind: owner, HeapIndex: heap, HeapFlags: flags,
      Validity: validity, Unit: "bytes",
    })
  }

  private func ProfileHeaps(recorder FrameRecorder, now int64) {
    budget.Refresh()
    let validity = if budget.Available { "available" } else { "unavailable" }
    for heap in 0 ... int32(memoryProperties.memoryHeapCount) {
      let flags = uint64(MemoryHeap(memoryProperties, uint32(heap)).flags)
      ProfileCounter(recorder, now, "driver.heap.usage.estimate", budget.HeapUsage(uint32(heap)),
        heap: heap, flags: flags, validity: validity)
      ProfileCounter(recorder, now, "driver.heap.budget", budget.HeapBudget(uint32(heap)),
        heap: heap, flags: flags, validity: validity)
    }
  }

  internal func ProfileBlock(recorder FrameRecorder, block VulkanMemoryBlock,
    kind FrameTraceKind, eventId uint64) {
    if block.profileTraceId != recorder.TraceId {
      block.profileTraceId = recorder.TraceId
      block.profileId = recorder.ResourceIdentity()
    }
    recorder.Publish(FrameTraceRecord{
      Kind: kind, Ticks: Stopwatch.GetTimestamp() - recorder.Origin,
      ThreadId: Environment.CurrentManagedThreadId, Context: ProfileContext(),
      EventId: eventId, Category: VulkanDiagnosticCategories.Allocator,
      ResourceId: block.profileId, ResourceGeneration: 1uL,
      ResourceKind: int32(FrameResourceKind.MemoryBlock), BlockBytes: block.size,
      MemoryType: int32(block.memoryTypeIndex), HeapIndex: int32(block.heapIndex),
      HeapFlags: uint64(MemoryHeap(memoryProperties, block.heapIndex).flags), Dedicated: block.dedicated,
      Source: "vulkan.block", Validity: if kind == FrameTraceKind.ResourceBaseline { "already-live" } else { "available" },
    })
  }

  internal func ProfileAllocation(recorder FrameRecorder, allocation VulkanMemoryAllocation,
    kind FrameTraceKind, eventId uint64) {
    guard let block = allocation.block else { return }
    if block.profileTraceId != recorder.TraceId {
      ProfileBlock(recorder, block, FrameTraceKind.ResourceBaseline, VulkanDiagnosticEventIds.ResourceCreate)
    }
    if allocation.profileTraceId != recorder.TraceId {
      allocation.profileTraceId = recorder.TraceId
      allocation.profileId = recorder.ResourceIdentity()
      if eventId != VulkanDiagnosticEventIds.ResourceCreate {
        ProfileAllocation(recorder, allocation, FrameTraceKind.ResourceBaseline, VulkanDiagnosticEventIds.ResourceCreate)
      }
    }
    let resourceKind = if block.resourceClass == VulkanMemoryResourceClass.Image { FrameResourceKind.Image } else { FrameResourceKind.Buffer }
    let payload = if resourceKind == FrameResourceKind.Image { ImagePayload(allocation) } else { allocation.payloadBytes }
    recorder.Publish(FrameTraceRecord{
      Kind: kind, Ticks: Stopwatch.GetTimestamp() - recorder.Origin,
      ThreadId: Environment.CurrentManagedThreadId, Context: ProfileContext(),
      EventId: eventId, Category: VulkanDiagnosticCategories.Allocator,
      ResourceId: allocation.profileId, ParentId: block.profileId, ResourceGeneration: 1uL,
      ResourceKind: int32(resourceKind), OwnerKind: int32(allocation.ownerKind),
      PayloadBytes: payload, RequirementBytes: allocation.size, PlacementBytes: allocation.placementSpan,
      MemoryType: int32(allocation.memoryTypeIndex), HeapIndex: int32(allocation.heapIndex),
      HeapFlags: uint64(MemoryHeap(memoryProperties, allocation.heapIndex).flags), Dedicated: allocation.dedicated,
      Width: allocation.width, Height: allocation.height,
      Source: if allocation.state == VulkanMemoryAllocationState.Retired { "vulkan.retired" } else { "vulkan.allocation" },
      Validity: if kind == FrameTraceKind.ResourceBaseline {
        if allocation.state == VulkanMemoryAllocationState.Retired { "already-retired" } else { "already-live" }
      } else { "available" },
    })
  }

  private func ImagePayload(allocation VulkanMemoryAllocation) uint64? {
    guard let width = allocation.width else { return nil }
    guard let height = allocation.height else { return nil }
    let bytes uint64 = switch allocation.format {
      case VkConstants.VK_FORMAT_R8_UNORM: 1uL
      case VkConstants.VK_FORMAT_R8G8B8A8_UNORM: 4uL
      case VkConstants.VK_FORMAT_R8G8B8A8_SRGB: 4uL
      case VkConstants.VK_FORMAT_B8G8R8A8_UNORM: 4uL
      case VkConstants.VK_FORMAT_B8G8R8A8_SRGB: 4uL
      case VkConstants.VK_FORMAT_R16G16B16A16_SFLOAT: 8uL
      default: 0uL
    }
    if width <= 0 || height <= 0 || bytes == 0uL || allocation.layers == 0u { return nil }
    let pixels = uint64(width) * uint64(height)
    if pixels > uint64.MaxValue / bytes / uint64(allocation.layers) { return nil }
    return pixels * bytes * uint64(allocation.layers)
  }
}
