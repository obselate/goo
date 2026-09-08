package GooGallery

import System
import Goo

func ReviewPrintMemoryOwners(state string, phase string, window Window?) {
  guard let activeWindow = window else {
    return
  }
  let owner = WindowReadbackTestFixture.MemoryOwnerCapacities(activeWindow)
  Console.WriteLine("gallery-review-memory-owners,state=" + state + ",phase=" + phase
    +",swapchain_width=" + owner.SwapchainWidth.ToString()
    +",swapchain_height=" + owner.SwapchainHeight.ToString()
    +",swapchain_image_count=" + owner.SwapchainImageCount.ToString()
    +",swapchain_raw_rgba_B=" + owner.SwapchainRawRgbaBytes.ToString()
    +",image_resident_B=" + owner.ImageResidentBytes.ToString()
    +",image_staging_configured_B=" + owner.ImageStagingConfiguredBytes.ToString()
    +",image_staging_allocated_B=" + owner.ImageStagingAllocatedBytes.ToString()
    +",image_staging_placement_B=" + owner.ImageStagingPlacementBytes.ToString()
    +",image_staging_mapped=" + (owner.ImageStagingMapped ? "1" : "0")
    +",primitive_slot_count=" + owner.PrimitiveFrame.SlotCount.ToString()
    +",primitive_device_B=" + owner.PrimitiveFrame.DeviceBytes.ToString()
    +",primitive_staging_B=" + owner.PrimitiveFrame.StagingBytes.ToString()
    +",primitive_history_B=" + owner.PrimitiveFrame.HistoryBytes.ToString()
    +",text_slot_count=" + owner.TextFrame.SlotCount.ToString()
    +",text_device_B=" + owner.TextFrame.DeviceBytes.ToString()
    +",text_staging_B=" + owner.TextFrame.StagingBytes.ToString()
    +",text_history_B=" + owner.TextFrame.HistoryBytes.ToString()
    +",clip_slot_count=" + owner.ClipFrame.SlotCount.ToString()
    +",clip_host_buffer_B=" + owner.ClipFrame.HostBufferBytes.ToString()
    +",text_atlas_count=" + owner.TextAtlasCount.ToString()
    +",text_atlas_per_buffer_B=" + owner.TextAtlasPerBufferBytes.ToString()
    +",path_atlas_per_buffer_B=" + owner.PathAtlasPerBufferBytes.ToString()
    +",path_cpu_shadow_B=" + owner.PathCpuShadowBytes.ToString()
    +",clip_atlas_resident_B=" + owner.ClipAtlasResidentBytes.ToString()
    +",layer_resident_B=" + owner.LayerResidentBytes.ToString()
    +",layer_target_count=" + owner.LayerTargetCount.ToString()
    +",readback_resident_B=" + owner.ReadbackResidentResourceBytes.ToString())
  let blocks = WindowReadbackTestFixture.MemoryBlocks(activeWindow)
  var index int32 = 0
  while index < blocks.Length {
    let block = blocks[index]
    Console.WriteLine("gallery-review-memory-block,state=" + state + ",phase=" + phase
      +",index=" + index.ToString()
      +",memory=" + block.Memory.ToString()
      +",memory_type=" + block.MemoryTypeIndex.ToString()
      +",heap=" + block.HeapIndex.ToString()
      +",property_flags=" + block.PropertyFlags.ToString()
      +",heap_size_B=" + block.HeapSize.ToString()
      +",heap_flags=" + block.HeapFlags.ToString()
      +",resource_class=" + block.ResourceClass.ToString()
      +",resident_B=" + block.ResidentBlockBytes.ToString()
      +",payload_B=" + block.AllocatedPayloadBytes.ToString()
      +",live_B=" + block.LivePayloadBytes.ToString()
      +",retired_B=" + block.RetiredBytes.ToString()
      +",span_B=" + block.AllocatedSpanBytes.ToString()
      +",free_span_B=" + block.FreeSpanBytes.ToString()
      +",allocation_count=" + block.AllocationCount.ToString()
      +",live_allocation_count=" + block.LiveAllocationCount.ToString()
      +",retired_allocation_count=" + block.RetiredAllocationCount.ToString()
      +",dedicated=" + (block.Dedicated ? "1" : "0")
      +",host_visible=" + (block.HostVisible ? "1" : "0")
      +",host_coherent=" + (block.HostCoherent ? "1" : "0")
      +",mapped_address=" + block.MappedAddress.ToString()
      +",mapped_B=" + block.MappedBytes.ToString())
    index++
  }
}
