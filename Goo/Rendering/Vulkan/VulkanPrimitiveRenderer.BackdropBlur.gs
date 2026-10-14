package Goo

import System
import System.IO
import System.Numerics

internal unsafe partial class VulkanPrimitiveRenderer {
    private var backdropBlurEffect ShaderEffect?

    private func LoadBackdropBlur() ShaderEffect {
        using let stream = typeof(VulkanPrimitiveRenderer).Assembly.GetManifestResourceStream(
            "Goo.Effects.filtered_backdrop.goo-effect"
        )
        if stream == nil {
            throw FileNotFoundException("Goo backdrop blur effect is missing")
        }
        using let output = MemoryStream()
        stream.CopyTo(output)
        return ShaderEffect(ShaderEffectProgram(output.ToArray()))
    }

    private func BackdropBlurRadius(record LayerRecord, frame SceneFrame) float32 ->
    if record.EffectIndex >= 0 {
        frame.ShaderEffects[record.EffectIndex].BackdropBlur
    } else {
        0.0F
    }

    private func BlurBackdrop(
        commandBuffer VkCommandBuffer,
        record LayerRecord,
        frame SceneFrame,
        captured VulkanOffscreenLayerTarget?
    ) VulkanOffscreenLayerTarget? {
        let radius = BackdropBlurRadius(record, frame)
        if radius <= 0.0F {
            return captured
        }
        let blur = backdropBlurEffect ?? LoadBackdropBlur()
        backdropBlurEffect = blur
        var effect = ShaderEffectRecord{Program: blur}
        let extent = VkExtent2D{
            width: Math.Max(1u, (record.ExtentWidth + 3u) / 4u),
            height: Math.Max(1u, (record.ExtentHeight + 3u) / 4u),
        }
        let sigmaX = radius * textFrameScaleX * float32(extent.width) / float32(record.ExtentWidth)
        let sigmaY = radius * textFrameScaleY * float32(extent.height) / float32(record.ExtentHeight)
        let layer = LayerRecord{
            Bounds: ConservativeBounds{
                X: currentOriginX,
                Y: currentOriginY,
                Width: float32(extent.width),
                Height: float32(extent.height),
            },
            OriginX: currentOriginX,
            OriginY: currentOriginY,
            ExtentWidth: extent.width,
            ExtentHeight: extent.height,
            Opacity: 1.0F,
        }
        let parentExtent = activeExtent
        guard let pool = layerPool else {
            throw InvalidOperationException("Vulkan layer pool is unavailable")
        }
        var first VulkanOffscreenLayerTarget?
        var second VulkanOffscreenLayerTarget?
        if !primitivePrepass {
            first = pool.Acquire(extent.width, extent.height, completedLayerSerial)
            second = pool.Acquire(extent.width, extent.height, completedLayerSerial)
        }
        var source = captured
        try {
            activeExtent = extent
            for pass in 0 ... 3 {
                let destination = pass == 1 ? second: first
                effect.Parameter0 = Vector4(sigmaX, sigmaY, pass == 0 ? 2.0F: float32(pass - 1), 0.0F)
                if primitivePrepass {
                    EmitShaderEffect(commandBuffer, extent, layer, nil, nil, effect)
                    continue
                }
                guard let target = destination else {
                    throw InvalidOperationException("Vulkan blur target is unavailable")
                }
                target.TransitionToColorAttachment(commandBuffer)
                BeginLayerRendering(commandBuffer, extent, target.ImageView, false)
                SetLayerViewport(commandBuffer)
                SetScissor(commandBuffer, FullClip())
                pool.RecordLayerPass(uint64(extent.width), uint64(extent.height))
                let timestamp = BeginLayerTimestamp(
                    VulkanDiagnosticTimestampStage.Effects,
                    VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT
                )
                EmitShaderEffect(commandBuffer, extent, layer, source, nil, effect)
                FlushPendingPrimitiveDraw(commandBuffer)
                EndLayerTimestamp(timestamp, VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT)
                let endRendering = dispatch.vkCmdEndRendering
                endRendering(commandBuffer)
                target.TransitionToShaderRead(commandBuffer)
                source = target
            }
        } catch (error Exception) {
            if let target = first {
                pool.ReleaseForReuse(target)
            }
            throw error
        } finally {
            activeExtent = parentExtent
            if let target = second {
                pool.ReleaseForReuse(target)
            }
        }
        if (record.Flags & uint32(LayerRecordFlags.BorrowsParentBackdrop)) == 0u {
            if let target = captured {
                pool.ReleaseForReuse(target)
            }
        }
        return first
    }
}
