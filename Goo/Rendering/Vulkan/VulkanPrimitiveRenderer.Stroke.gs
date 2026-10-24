package Goo

import System

internal unsafe partial class VulkanPrimitiveRenderer {
    private func PrepareStroke(index int32, mask bool, frame SceneFrame) {
        let data = StrokeFrameData(frame)
        if mask {
            let value = frame.ClipMasks[index]
            data.Add(
                index,
                true,
                value.PathId,
                value.AtlasWordOffset,
                value.CurveCount,
                value.ScaleX,
                value.ScaleY,
                value.Stroke,
                ResolveTransform(frame, value.TransformIndex),
                textFrameScaleX,
                textFrameScaleY
            )
        } else {
            let value = frame.AnalyticPathBands[index]
            data.Add(
                index,
                false,
                value.PathId,
                value.AtlasWordOffset,
                value.CurveCount,
                value.ScaleX,
                value.ScaleY,
                value.Stroke,
                ResolveTransform(frame, value.TransformIndex),
                textFrameScaleX,
                textFrameScaleY
            )
        }
    }

    private func StrokeFrameData(frame SceneFrame) VulkanPathStrokeFrameData {
        if let data = pathStrokeFrameData {
            return data
        }
        let created = VulkanPathStrokeFrameData(
            device,
            dispatch,
            frameAllocator,
            primitiveState,
            primitiveFrameSlotCount,
            maxStorageBufferRange,
            objectAccounting
        )
        created.Begin(frame.AnalyticPathBandCount, frame.ClipMaskCount)
        pathStrokeFrameData = created
        return created
    }

    private func PrepareStrokeMasks(frame SceneFrame) {
        for index in 0 ... frame.ClipMaskCount {
            if frame.ClipMasks[index].Stroke.Width > 0.0F {
                PrepareStroke(index, true, frame)
            }
        }
    }

    private func StrokePixelPadding(style PathStrokeStyle) float32 {
        let extent = resolveShapeStrokeExtent(style.Width, style.Join, style.MiterLimit, style.Cap)
        return extent * MathF.Max(textFrameScaleX, textFrameScaleY) + 1.0F
    }
}
