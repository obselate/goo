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
        return ShaderEffect(ShaderEffectProgram(
            BoundedInput.ReadAll(stream, ShaderEffectProgram.MaximumProgramByteCount, "Shader effect program")))
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
        captured VulkanOffscreenLayerTarget?,
        preserveCaptured bool = false
    ) VulkanOffscreenLayerTarget? {
        let radius = BackdropBlurRadius(record, frame)
        if radius <= 0.0F {
            return captured
        }
        let blur = backdropBlurEffect ?? LoadBackdropBlur()
        backdropBlurEffect = blur
        let sigma = Vector2(radius * textFrameScaleX, radius * textFrameScaleY)
        let paddingX = MathF.Ceiling(sigma.X * 3.0F)
        let paddingY = MathF.Ceiling(sigma.Y * 3.0F)
        let paddedWidth = record.ExtentWidth + uint32(paddingX) * 2u
        let paddedHeight = record.ExtentHeight + uint32(paddingY) * 2u
        var extent = VkExtent2D{width: paddedWidth, height: paddedHeight}
        let identity = Vector4(0.0F, 0.0F, 1.0F, 1.0F)
        var mapping = Vector4(-paddingX / float32(record.ExtentWidth), -paddingY / float32(record.ExtentHeight),
            float32(paddedWidth) / float32(record.ExtentWidth), float32(paddedHeight) / float32(record.ExtentHeight))
        let parentExtent = activeExtent
        guard let pool = layerPool else {
            throw InvalidOperationException("Vulkan layer pool is unavailable")
        }
        var source = captured
        let timestamp = BeginLayerTimestamp(
            VulkanDiagnosticTimestampStage.Effects,
            VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT)
        try {
            var scale = Vector2.One
            var variance = Vector2.Zero
            while extent.width > 1u || extent.height > 1u {
                let nextWidth = (extent.width + 1u) / 2u
                let nextHeight = (extent.height + 1u) / 2u
                let nextScale = Vector2(float32(paddedWidth) / float32(nextWidth),
                    float32(paddedHeight) / float32(nextHeight))
                let nextVariance = variance + 1.25F * scale * scale
                let interpolation = (nextScale * nextScale + Vector2(0.5F)) / 6.0F
                let downX = extent.width > 1u && nextVariance.X + interpolation.X <= 0.81F * sigma.X * sigma.X
                let downY = extent.height > 1u && nextVariance.Y + interpolation.Y <= 0.81F * sigma.Y * sigma.Y
                if !downX && !downY { break }
                if downX {
                    extent.width = nextWidth
                    scale.X = nextScale.X
                    variance.X = nextVariance.X
                }
                if downY {
                    extent.height = nextHeight
                    scale.Y = nextScale.Y
                    variance.Y = nextVariance.Y
                }
                let target = RenderBackdropBlurPass(commandBuffer, extent, source, blur,
                    Vector4(downX ? 1.0F: 0.0F, downY ? 1.0F: 0.0F, 2.0F, 0.0F), mapping)
                if let previous = source {
                    if previous != captured { pool.ReleaseForReuse(previous) }
                }
                source = target
                mapping = identity
            }
            for axis in 0 ... 2 {
                let horizontal = axis == 0
                let requested = horizontal ? sigma.X: sigma.Y
                let dimension = horizontal ? extent.width: extent.height
                let axisScale = horizontal ? scale.X: scale.Y
                let axisVariance = horizontal ? variance.X: variance.Y
                let interpolationVariance = if axisScale > 1.0F { (axisScale * axisScale + 0.5F) / 6.0F } else { 0.0F }
                let residual = if dimension == 1u { 0.0F } else {
                    MathF.Sqrt(MathF.Max(0.0F, requested * requested - axisVariance - interpolationVariance)) / axisScale
                }
                let target = RenderBackdropBlurPass(commandBuffer, extent, source, blur,
                    Vector4(residual, residual, float32(axis), 0.0F), mapping)
                if let previous = source {
                    if previous != captured { pool.ReleaseForReuse(previous) }
                }
                source = target
                mapping = identity
            }
            let cropped = RenderBackdropBlurPass(commandBuffer,
                VkExtent2D{width: record.ExtentWidth, height: record.ExtentHeight}, source, blur,
                Vector4(0.0F, 0.0F, 4.0F, 0.0F),
                Vector4(paddingX / float32(paddedWidth), paddingY / float32(paddedHeight),
                    float32(record.ExtentWidth) / float32(paddedWidth), float32(record.ExtentHeight) / float32(paddedHeight)))
            if let previous = source {
                if previous != captured { pool.ReleaseForReuse(previous) }
            }
            source = cropped
            if !preserveCaptured && (record.Flags & uint32(LayerRecordFlags.BorrowsParentBackdrop)) == 0u {
                if let target = captured { pool.ReleaseForReuse(target) }
            }
            let result = source
            source = nil
            return result
        } finally {
            EndLayerTimestamp(timestamp, VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT)
            activeExtent = parentExtent
            if let target = source {
                if target != captured { pool.ReleaseForReuse(target) }
            }
        }
    }

    private func RenderBackdropBlurPass(
        commandBuffer VkCommandBuffer,
        extent VkExtent2D,
        source VulkanOffscreenLayerTarget?,
        blur ShaderEffect,
        parameter Vector4,
        mapping Vector4
    ) VulkanOffscreenLayerTarget? {
        let layer = LayerRecord{
            Bounds: ConservativeBounds{
                X: currentOriginX, Y: currentOriginY,
                Width: float32(extent.width), Height: float32(extent.height),
            },
            OriginX: currentOriginX, OriginY: currentOriginY,
            ExtentWidth: extent.width, ExtentHeight: extent.height,
            Opacity: 1.0F,
        }
        let effect = ShaderEffectRecord{Program: blur, Parameter0: parameter, Parameter1: mapping}
        activeExtent = extent
        if primitivePrepass {
            EmitShaderEffect(commandBuffer, extent, layer, nil, nil, effect)
            return nil
        }
        guard let pool = layerPool else {
            throw InvalidOperationException("Vulkan layer pool is unavailable")
        }
        let target = pool.Acquire(extent.width, extent.height, completedLayerSerial)
        try {
            target.TransitionToColorAttachment(commandBuffer)
            BeginLayerRendering(commandBuffer, extent, target.ImageView, false)
            SetLayerViewport(commandBuffer)
            SetScissor(commandBuffer, FullClip())
            pool.RecordLayerPass(uint64(extent.width), uint64(extent.height))
            EmitShaderEffect(commandBuffer, extent, layer, source, nil, effect)
            FlushPendingPrimitiveDraw(commandBuffer)
            let endRendering = dispatch.vkCmdEndRendering
            endRendering(commandBuffer)
            target.TransitionToShaderRead(commandBuffer)
            return target
        } catch (error Exception) {
            pool.ReleaseForReuse(target)
            throw error
        }
    }
}
