package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer : IDisposable {
  private const PrimitiveClipDrawOrdinalWord int32 = 7
  private const PrimitiveVertexCount uint32 = 4u

  private var pendingPrimitivePipeline VkPipeline
  private var pendingPrimitiveClipSetIndex uint32
  private var pendingPrimitiveFirstRecord uint32
  private var pendingPrimitiveRecordCount uint32
  private var pendingTextPipeline VkPipeline
  private var pendingTextAtlasId ResourceId
  private var pendingTextFirstInstance uint32
  private var pendingTextInstanceCount uint32
  private var recordDrawCallCount uint64

  private func ResetPrimitiveBatching() {
    pendingPrimitiveRecordCount = 0u
    pendingTextInstanceCount = 0u
    recordDrawCallCount = 0uL
  }

  private func CanAppendPrimitiveDraw(
    pipeline VkPipeline,
    clipSetIndex uint32) bool{
      if pendingPrimitiveRecordCount == 0u {
        return false
      }
      if pendingPrimitivePipeline != pipeline
        || pendingPrimitiveClipSetIndex != clipSetIndex{
          return false
        }
      return uint64(pendingPrimitiveFirstRecord)
      +uint64(pendingPrimitiveRecordCount) == uint64(primitiveRecordOrdinal)
    }

  private func QueuePrimitiveDraw(
    commandBuffer VkCommandBuffer,
    pipeline VkPipeline,
    layout VkPipelineLayout,
    clipSetIndex uint32) {
      if CanAppendPrimitiveDraw(pipeline, clipSetIndex) {
        if pendingPrimitiveRecordCount == uint32.MaxValue {
          throw OverflowException("Vulkan primitive batch record count overflow")
        }
        pendingPrimitiveRecordCount++
      } else {
        FlushPendingPrimitiveDraw(commandBuffer)
        EnsureDescriptorLayout(layout)
        if activePipeline != pipeline {
          let bindPipeline = dispatch.vkCmdBindPipeline
          bindPipeline(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline)
          recordPipelineChangeCount++
          activePipeline = pipeline
        }
        EnsurePrimitiveDescriptor(commandBuffer, layout)
        EnsureClipDescriptorAt(commandBuffer, layout, clipSetIndex)
        pendingPrimitivePipeline = pipeline
        pendingPrimitiveClipSetIndex = clipSetIndex
        pendingPrimitiveFirstRecord = primitiveRecordOrdinal
        pendingPrimitiveRecordCount = 1u
      }
      primitiveRecordOrdinal++
    }

  private func FlushPendingPrimitiveDraw(commandBuffer VkCommandBuffer) {
    FlushPendingPrimitiveBatch(commandBuffer)
    FlushPendingTextDraw(commandBuffer)
  }

  private func FlushPendingPrimitiveBatch(commandBuffer VkCommandBuffer) {
    if pendingPrimitiveRecordCount == 0u {
      return
    }
    let firstVertex = uint64(pendingPrimitiveFirstRecord) * uint64(PrimitiveVertexCount)
    if firstVertex > uint64(uint32.MaxValue) {
      throw OverflowException("Vulkan primitive batch vertex range overflow")
    }
    let draw = dispatch.vkCmdDraw
    let fragmentQuery = if fragmentEnabled {
      BeginFragmentQuery(commandBuffer, FragmentPrimitiveKind(pendingPrimitivePipeline))
    } else { -1 }
    draw(commandBuffer, PrimitiveVertexCount, pendingPrimitiveRecordCount,
      uint32(firstVertex), 0u)
    EndFragmentQuery(commandBuffer, fragmentQuery)
    recordDrawCallCount++
    pendingPrimitiveRecordCount = 0u
  }

  private func CanAppendTextDraw(
    pipeline VkPipeline,
    atlasId ResourceId,
    firstInstance uint32) bool -> pendingTextInstanceCount > 0u
    && pendingTextPipeline == pipeline
    && SameResourceId(pendingTextAtlasId, atlasId)
    && uint64(pendingTextFirstInstance) + uint64(pendingTextInstanceCount)
  == uint64(firstInstance)

  private func BeginTextDraw(
    pipeline VkPipeline,
    atlasId ResourceId,
    firstInstance uint32,
    instanceCount uint32) {
      pendingTextPipeline = pipeline
      pendingTextAtlasId = atlasId
      pendingTextFirstInstance = firstInstance
      pendingTextInstanceCount = instanceCount
    }

  private func AppendTextDraw(instanceCount uint32) {
    if instanceCount > uint32.MaxValue - pendingTextInstanceCount {
      throw OverflowException("Vulkan text batch instance count overflow")
    }
    pendingTextInstanceCount = pendingTextInstanceCount + instanceCount
  }

  private func FlushPendingTextDraw(commandBuffer VkCommandBuffer) {
    if pendingTextInstanceCount == 0u {
      return
    }
    let draw = dispatch.vkCmdDraw
    let fragmentQuery = if fragmentEnabled { BeginFragmentQuery(commandBuffer, 1) } else { -1 }
    draw(commandBuffer, 6u, pendingTextInstanceCount, 0u,
      pendingTextFirstInstance)
    EndFragmentQuery(commandBuffer, fragmentQuery)
    recordDrawCallCount++
    pendingTextInstanceCount = 0u
  }

  private func RecordImmediateDraw() {
    recordDrawCallCount++
  }
}
