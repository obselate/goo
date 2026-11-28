package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer : IDisposable {
    private const PrimitiveClipDrawOrdinalWord int32 = 7
    private const PrimitiveVertexCount uint32 = 4u

    private var pendingPrimitivePipeline VkPipeline
    private var pendingPrimitiveFirstRecord uint32
    private var pendingPrimitiveRecordCount uint32
    private var pendingBatchHasSampled bool
    private var pendingTextPipeline VkPipeline
    private var pendingTextAtlasId ResourceId
    private var pendingTextFirstInstance uint32
    private var pendingTextInstanceCount uint32
    private var pendingTextScrollPixelX float32
    private var pendingTextScrollPixelY float32
    private var pendingTextScissorChainId uint32
    private var recordDrawCallCount uint64

    private var currentDitherOffsetX float32
    private var currentDitherOffsetY float32

    private func ResetPrimitiveBatching() {
        pendingPrimitivePipeline = VkPipeline.Null
        pendingPrimitiveFirstRecord = 0u
        pendingPrimitiveRecordCount = 0u
        pendingBatchHasSampled = false
        pendingTextInstanceCount = 0u
        pendingTextScissorChainId = 0u
        recordDrawCallCount = 0uL
        currentDitherOffsetX = 0.0F
        currentDitherOffsetY = 0.0F
    }

    private func CanAppendPrimitiveDraw(pipeline VkPipeline) bool ->
        pendingPrimitiveRecordCount > 0u
        && pendingPrimitivePipeline == pipeline
        && uint64(pendingPrimitiveFirstRecord) + uint64(pendingPrimitiveRecordCount) == uint64(primitiveRecordOrdinal)

    private func EnsurePrimitiveBatchPipeline(
        commandBuffer VkCommandBuffer,
        pipeline VkPipeline,
        layout VkPipelineLayout,
        clipSetIndex uint32,
        includeStrokeSet bool
    ) {
        EnsureDescriptorLayout(layout)
        if activePipeline != pipeline {
            let bindPipeline = dispatch.vkCmdBindPipeline
            bindPipeline(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline)
            recordPipelineChangeCount++
            activePipeline = pipeline
        }
        EnsurePrimitiveDescriptor(commandBuffer, layout)
        EnsureClipDescriptorAt(commandBuffer, layout, clipSetIndex)
        if includeStrokeSet {
            EnsureBatchedStrokeDescriptor(commandBuffer, layout)
        }
    }

    private func QueuePrimitiveDraw(
        commandBuffer VkCommandBuffer,
        pipeline VkPipeline,
        layout VkPipelineLayout,
        clipSetIndex uint32,
        includeStrokeSet bool = false
    ) {
        if CanAppendPrimitiveDraw(pipeline) {
            if pendingPrimitiveRecordCount == uint32.MaxValue {
                throw OverflowException("Vulkan primitive batch record count overflow")
            }
            pendingPrimitiveRecordCount++
        } else {
            FlushPendingPrimitiveDraw(commandBuffer)
            EnsurePrimitiveBatchPipeline(commandBuffer, pipeline, layout, clipSetIndex, includeStrokeSet)
            pendingPrimitivePipeline = pipeline
            pendingPrimitiveFirstRecord = primitiveRecordOrdinal
            pendingPrimitiveRecordCount = 1u
            pendingBatchHasSampled = false
        }
        primitiveRecordOrdinal++
    }

    private func QueueSampledImageDraw(
        commandBuffer VkCommandBuffer,
        imageId ResourceId,
        samplerId ResourceId,
        samplerMode VulkanImageSamplerMode
    ) {
        let pipeline = primitivePipelines.BatchedUiPipeline
        let alreadyBound = sampledDescriptorBound
            && sampledTarget == nil
            && SameResourceId(sampledImageId, imageId)
            && SameResourceId(sampledSamplerId, samplerId)
            && sampledSamplerMode == samplerMode
            && sampledGeneration == resourceGeneration
        let compatible = CanAppendPrimitiveDraw(pipeline) && (!pendingBatchHasSampled || alreadyBound)
        if !compatible {
            FlushPendingPrimitiveDraw(commandBuffer)
            EnsurePrimitiveBatchPipeline(commandBuffer, pipeline, pipelineLayout, 1u, true)
            pendingPrimitivePipeline = pipeline
            pendingPrimitiveFirstRecord = primitiveRecordOrdinal
            pendingPrimitiveRecordCount = 0u
            pendingBatchHasSampled = false
        } else {
            EnsureDescriptorLayout(pipelineLayout)
        }
        if !alreadyBound {
            imageResources!!.BindDescriptor(
                commandBuffer,
                pipelineLayout,
                imageId,
                samplerId,
                samplerMode,
                resourceGeneration
            )
            recordDescriptorChangeCount++
            sampledDescriptorBound = true
            sampledTarget = nil
            sampledImageId = imageId
            sampledSamplerId = samplerId
            sampledSamplerMode = samplerMode
            sampledGeneration = resourceGeneration
        }
        pendingBatchHasSampled = true
        if pendingPrimitiveRecordCount == uint32.MaxValue {
            throw OverflowException("Vulkan primitive batch record count overflow")
        }
        pendingPrimitiveRecordCount++
        primitiveRecordOrdinal++
    }

    private func QueueSampledTargetDraw(
        commandBuffer VkCommandBuffer,
        target VulkanOffscreenLayerTarget
    ) {
        let pipeline = primitivePipelines.BatchedUiPipeline
        let alreadyBound = sampledDescriptorBound && Object.ReferenceEquals(sampledTarget, target)
        let compatible = CanAppendPrimitiveDraw(pipeline) && (!pendingBatchHasSampled || alreadyBound)
        if !compatible {
            FlushPendingPrimitiveDraw(commandBuffer)
            EnsurePrimitiveBatchPipeline(commandBuffer, pipeline, pipelineLayout, 1u, true)
            pendingPrimitivePipeline = pipeline
            pendingPrimitiveFirstRecord = primitiveRecordOrdinal
            pendingPrimitiveRecordCount = 0u
            pendingBatchHasSampled = false
        } else {
            EnsureDescriptorLayout(pipelineLayout)
        }
        if !alreadyBound {
            var descriptorSet = target.DescriptorSet
            let bindDescriptors = dispatch.vkCmdBindDescriptorSets
            bindDescriptors(
                commandBuffer,
                VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
                pipelineLayout,
                0u,
                1u,
                &descriptorSet,
                0u,
                nil
            )
            recordDescriptorChangeCount++
            sampledDescriptorBound = true
            sampledTarget = target
            sampledImageId = ResourceId{}
            sampledSamplerId = ResourceId{}
            sampledSamplerMode = VulkanImageSamplerMode.Nearest
            sampledGeneration = 0uL
        }
        pendingBatchHasSampled = true
        if pendingPrimitiveRecordCount == uint32.MaxValue {
            throw OverflowException("Vulkan primitive batch record count overflow")
        }
        pendingPrimitiveRecordCount++
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
        if pendingPrimitivePipeline == primitivePipelines.BatchedUiPipeline && !sampledDescriptorBound {
            EnsureFallbackSampledDescriptor(commandBuffer, pipelineLayout)
        }
        let draw = dispatch.vkCmdDraw
        draw(commandBuffer, PrimitiveVertexCount, pendingPrimitiveRecordCount, uint32(firstVertex), 0u)
        recordDrawCallCount++
        pendingPrimitiveRecordCount = 0u
        pendingBatchHasSampled = false
    }

    private func CanAppendTextDraw(
        pipeline VkPipeline,
        atlasId ResourceId,
        firstInstance uint32,
        scrollPixelX float32,
        scrollPixelY float32,
        scissorChainId uint32
    ) bool ->
        pendingTextInstanceCount > 0u
        && pendingTextPipeline == pipeline
        && SameResourceId(pendingTextAtlasId, atlasId)
        && pendingTextScrollPixelX == scrollPixelX
        && pendingTextScrollPixelY == scrollPixelY
        && pendingTextScissorChainId == scissorChainId
        && uint64(pendingTextFirstInstance) + uint64(pendingTextInstanceCount) == uint64(firstInstance)

    private func BeginTextDraw(
        pipeline VkPipeline,
        atlasId ResourceId,
        firstInstance uint32,
        instanceCount uint32,
        scrollPixelX float32,
        scrollPixelY float32,
        scissorChainId uint32
    ) {
        pendingTextPipeline = pipeline
        pendingTextAtlasId = atlasId
        pendingTextFirstInstance = firstInstance
        pendingTextInstanceCount = instanceCount
        pendingTextScrollPixelX = scrollPixelX
        pendingTextScrollPixelY = scrollPixelY
        pendingTextScissorChainId = scissorChainId
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
        draw(commandBuffer, 6u, pendingTextInstanceCount, 0u, pendingTextFirstInstance)
        recordDrawCallCount++
        pendingTextInstanceCount = 0u
    }

    private func RecordImmediateDraw() {
        recordDrawCallCount++
    }
}
