package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer {
    internal prop ClipMaskFrameStats VulkanScissorTableStats {
        get -> scissorTable.LastStats
    }

    internal prop ClipMaskFrameTotals VulkanScissorTableTotals {
        get -> scissorTable.Totals
    }

    internal func PrepareClipMasks(
        frame SceneFrame,
        extent VkExtent2D,
        slotIndex int32,
        completedSubmissionSerial uint64
    ) VulkanScissorTableStats {
        if disposed {
            throw ObjectDisposedException("VulkanPrimitiveRenderer")
        }
        if frame == nil {
            throw ArgumentNullException("frame")
        }
        if extent.width == 0u || extent.height == 0u {
            throw ArgumentOutOfRangeException("extent")
        }
        if slotIndex < 0 || slotIndex >= primitiveFrameSlotCount {
            throw ArgumentOutOfRangeException("slotIndex")
        }
        if let pool = layerPool {
            pool.PrepareLayerBudget(frame, completedSubmissionSerial)
        }
        preparedClipFrame = frame
        preparedClipExtent = extent
        preparedClipSlot = slotIndex
        scissorTable.BeginBuild(frame, pathAtlas, slotIndex, completedSubmissionSerial)
        return scissorTable.LastStats
    }

    internal func CompleteClipFrameRecording() {
        if disposed || rootCommandBuffer == VkCommandBuffer.Null {
            return
        }
        scissorTable.Record(rootCommandBuffer)
    }

    internal func ValidateClipFrameSubmission(slotIndex int32, submissionSerial uint64) {
        if disposed {
            throw ObjectDisposedException("VulkanPrimitiveRenderer")
        }
        scissorTable.ValidateSubmission(slotIndex, submissionSerial)
    }

    internal func MarkSubmitted(slotIndex int32, submissionSerial uint64) {
        MarkClipFrameSubmitted(slotIndex, submissionSerial)
    }

    internal func MarkClipFrameSubmitted(slotIndex int32, submissionSerial uint64) {
        if disposed {
            throw ObjectDisposedException("VulkanPrimitiveRenderer")
        }
        scissorTable.MarkSubmitted(slotIndex, submissionSerial)
        preparedClipFrame = nil
        preparedClipSlot = -1
    }

    internal func ReconcileClipFrameSubmitted(slotIndex int32, submissionSerial uint64) {
        if disposed {
            throw ObjectDisposedException("VulkanPrimitiveRenderer")
        }
        scissorTable.ReconcileSubmitted(slotIndex, submissionSerial)
        preparedClipFrame = nil
        preparedClipSlot = -1
    }

    internal func Abort(slotIndex int32) {
        if disposed {
            return
        }
        scissorTable.Abort(slotIndex)
        preparedClipFrame = nil
        preparedClipSlot = -1
        AbortPrimitiveFrame()
    }

    internal func Collect(completedSubmissionSerial uint64) {
        if disposed {
            return
        }
        scissorTable.Collect(completedSubmissionSerial)
        CollectPrimitiveFrame(completedSubmissionSerial)
    }

    internal func InvalidateClipFrameRetention() {
        if disposed {
            return
        }
        scissorTable.InvalidateRetention()
    }

    internal func DisposeAfterDeviceLoss() {
        if disposed {
            return
        }
        disposed = true
        scissorTable.DisposeAfterDeviceLoss()
        DisposeFallbackDescriptors()
        primitiveFrameData.DisposeAfterDeviceLoss()
        textFrameData.DisposeAfterDeviceLoss()
        pathStrokeFrameData?.DisposeAfterDeviceLoss()
    }

    private func EnsureClipDescriptor(commandBuffer VkCommandBuffer, layout VkPipelineLayout) {
        EnsureClipDescriptorAt(commandBuffer, layout, 1u)
    }

    private func EnsureClipDescriptorAt(commandBuffer VkCommandBuffer, layout VkPipelineLayout, setIndex uint32) {
        if clipDescriptorBound && clipDescriptorLayout == layout && clipDescriptorSlot == primitiveFrameSlot {
            return
        }
        scissorTable.Bind(commandBuffer, layout, setIndex)
        clipDescriptorBound = true
        clipDescriptorLayout = layout
        clipDescriptorSlot = primitiveFrameSlot
        recordDescriptorChangeCount++
    }
}
