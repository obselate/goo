package Goo

import System

internal partial class VulkanWindowTarget {
  private func ScaleFrame(frame SceneFrame, scaleX float32, scaleY float32) {
    if scaleX == 1.0F && scaleY == 1.0F {
      return
    }
    frame.InvalidateRetainedPrimitiveSpans()
    var index int32 = 0
    while index < frame.ChunkCount {
      let value = frame.Chunks[index]
      frame.Chunks[index] = SceneChunk{
        OwnerId: value.OwnerId,
        Version: value.Version,
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        FirstDraw: value.FirstDraw,
        DrawCount: value.DrawCount,
        FirstResource: value.FirstResource,
        ResourceCount: value.ResourceCount,
        ContentKey: value.ContentKey,
        TopologyKey: value.TopologyKey,
        Dirty: value.Dirty,
        RetentionState: value.RetentionState,
      }
      index = index + 1
    }
    index = 0
    while index < frame.SolidBoxCount {
      let value = frame.SolidBoxes[index]
      frame.SolidBoxes[index] = SolidBoxRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        Color: value.Color,
        Opacity: value.Opacity,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.RoundedBoxCount {
      let value = frame.RoundedBoxes[index]
      frame.RoundedBoxes[index] = RoundedBoxRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        RadiusTopLeft: ScaleRadius(value.RadiusTopLeft, scaleX, scaleY),
        RadiusTopRight: ScaleRadius(value.RadiusTopRight, scaleX, scaleY),
        RadiusBottomRight: ScaleRadius(value.RadiusBottomRight, scaleX, scaleY),
        RadiusBottomLeft: ScaleRadius(value.RadiusBottomLeft, scaleX, scaleY),
        OpaqueBorderWidth: value.OpaqueBorderWidth * scaleX,
        OpaqueBorderHeight: value.OpaqueBorderHeight * scaleY,
        Color: value.Color,
        Opacity: value.Opacity,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.PerEdgeBorderCount {
      let value = frame.PerEdgeBorders[index]
      frame.PerEdgeBorders[index] = PerEdgeBorderRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        TopWidth: value.TopWidth * scaleY,
        RightWidth: value.RightWidth * scaleX,
        BottomWidth: value.BottomWidth * scaleY,
        LeftWidth: value.LeftWidth * scaleX,
        RadiusTopLeft: ScaleRadius(value.RadiusTopLeft, scaleX, scaleY),
        RadiusTopRight: ScaleRadius(value.RadiusTopRight, scaleX, scaleY),
        RadiusBottomRight: ScaleRadius(value.RadiusBottomRight, scaleX, scaleY),
        RadiusBottomLeft: ScaleRadius(value.RadiusBottomLeft, scaleX, scaleY),
        TopColor: value.TopColor,
        RightColor: value.RightColor,
        BottomColor: value.BottomColor,
        LeftColor: value.LeftColor,
        Style: value.Style,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.LinearGradientCount {
      let value = frame.LinearGradients[index]
      frame.LinearGradients[index] = LinearGradientRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        RadiusTopLeft: ScaleRadius(value.RadiusTopLeft, scaleX, scaleY),
        RadiusTopRight: ScaleRadius(value.RadiusTopRight, scaleX, scaleY),
        RadiusBottomRight: ScaleRadius(value.RadiusBottomRight, scaleX, scaleY),
        RadiusBottomLeft: ScaleRadius(value.RadiusBottomLeft, scaleX, scaleY),
        StartX: value.StartX * scaleX,
        StartY: value.StartY * scaleY,
        EndX: value.EndX * scaleX,
        EndY: value.EndY * scaleY,
        StopStart: value.StopStart,
        StopCount: value.StopCount,
        Opacity: value.Opacity,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.RadialGradientCount {
      let value = frame.RadialGradients[index]
      frame.RadialGradients[index] = RadialGradientRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        RadiusTopLeft: ScaleRadius(value.RadiusTopLeft, scaleX, scaleY),
        RadiusTopRight: ScaleRadius(value.RadiusTopRight, scaleX, scaleY),
        RadiusBottomRight: ScaleRadius(value.RadiusBottomRight, scaleX, scaleY),
        RadiusBottomLeft: ScaleRadius(value.RadiusBottomLeft, scaleX, scaleY),
        CenterX: value.CenterX * scaleX,
        CenterY: value.CenterY * scaleY,
        RadiusX: value.RadiusX * scaleX,
        RadiusY: value.RadiusY * scaleY,
        StopStart: value.StopStart,
        StopCount: value.StopCount,
        Opacity: value.Opacity,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.CachedImageCount {
      let value = frame.CachedImages[index]
      frame.CachedImages[index] = CachedImageRefRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        ImageId: value.ImageId,
        SamplerId: value.SamplerId,
        SourceX: value.SourceX,
        SourceY: value.SourceY,
        SourceWidth: value.SourceWidth,
        SourceHeight: value.SourceHeight,
        Opacity: value.Opacity,
        Sampling: value.Sampling,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.AnalyticPathBandCount {
      let value = frame.AnalyticPathBands[index]
      frame.AnalyticPathBands[index] = AnalyticPathBandRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        PathId: value.PathId,
        AtlasId: value.AtlasId,
        AtlasWordOffset: value.AtlasWordOffset,
        AtlasWordCount: value.AtlasWordCount,
        FillColor: value.FillColor,
        FillRule: value.FillRule,
        Opacity: value.Opacity,
        ScaleX: value.ScaleX * scaleX,
        ScaleY: value.ScaleY * scaleY,
        TranslateX: value.TranslateX * scaleX,
        TranslateY: value.TranslateY * scaleY,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.TransformCount {
      let value = frame.Transforms[index]
      frame.Transforms[index] = TransformRecord{
        A: value.A,
        B: value.B,
        C: value.C,
        D: value.D,
        TX: value.TX * scaleX,
        TY: value.TY * scaleY,
        ParentIndex: value.ParentIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.RectClipCount {
      let value = frame.RectClips[index]
      frame.RectClips[index] = RectClipRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        TransformIndex: value.TransformIndex,
        ParentIndex: value.ParentIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.ClipMaskCount {
      let value = frame.ClipMasks[index]
      frame.ClipMasks[index] = ClipMaskRecord{
        StableId: value.StableId,
        PathId: value.PathId,
        AtlasId: value.AtlasId,
        AtlasWordOffset: value.AtlasWordOffset,
        AtlasWordCount: value.AtlasWordCount,
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        PathBounds: ScaleBounds(value.PathBounds, scaleX, scaleY),
        Fit: value.Fit,
        FillRule: value.FillRule,
        ScaleX: value.ScaleX * scaleX,
        ScaleY: value.ScaleY * scaleY,
        TranslateX: value.TranslateX * scaleX,
        TranslateY: value.TranslateY * scaleY,
        TransformIndex: value.TransformIndex,
        ContentKey: ScaleClipContentKey(value.ContentKey, scaleX, scaleY),
      }
      index = index + 1
    }
    index = 0
    while index < frame.ShadowCount {
      let value = frame.Shadows[index]
      frame.Shadows[index] = ShadowRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        RadiusTopLeft: ScaleRadius(value.RadiusTopLeft, scaleX, scaleY),
        RadiusTopRight: ScaleRadius(value.RadiusTopRight, scaleX, scaleY),
        RadiusBottomRight: ScaleRadius(value.RadiusBottomRight, scaleX, scaleY),
        RadiusBottomLeft: ScaleRadius(value.RadiusBottomLeft, scaleX, scaleY),
        OffsetX: value.OffsetX * scaleX,
        OffsetY: value.OffsetY * scaleY,
        Spread: ScaleRadius(value.Spread, scaleX, scaleY),
        Blur: ScaleRadius(value.Blur, scaleX, scaleY),
        Color: value.Color,
        MaskId: value.MaskId,
        MaskIndex: value.MaskIndex,
        Inset: value.Inset,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.UnderlineCount {
      let value = frame.Underlines[index]
      frame.Underlines[index] = UnderlineRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        Thickness: ScaleRadius(value.Thickness, scaleX, scaleY),
        Color: value.Color,
        Mode: value.Mode,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.LavaCount {
      let value = frame.Lavas[index]
      frame.Lavas[index] = LavaRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        Flow: value.Flow,
        Form: value.Form,
        Blend: value.Blend,
        Light: value.Light,
        Hue: value.Hue,
        Rainbow: value.Rainbow,
        Rotation: value.Rotation,
        Seed: value.Seed,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.CustomMeshCount {
      let value = frame.CustomMeshes[index]
      frame.CustomMeshes[index] = CustomMeshRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        MeshId: value.MeshId,
        PipelineId: value.PipelineId,
        VertexCount: value.VertexCount,
        IndexCount: value.IndexCount,
        Topology: value.Topology,
        Opacity: value.Opacity,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
    index = 0
    while index < frame.LayerCount {
      let value = frame.Layers[index]
      frame.Layers[index] = LayerRecord{
        Bounds: ScaleBounds(value.Bounds, scaleX, scaleY),
        OriginX: value.OriginX * scaleX,
        OriginY: value.OriginY * scaleY,
        ExtentWidth: uint32(MathF.Ceiling(float32(value.ExtentWidth) * scaleX)),
        ExtentHeight: uint32(MathF.Ceiling(float32(value.ExtentHeight) * scaleY)),
        Opacity: value.Opacity,
        BlendMode: value.BlendMode,
        OffscreenTargetId: value.OffscreenTargetId,
        EffectProgramId: value.EffectProgramId,
        EffectVersion: value.EffectVersion,
        EffectIndex: value.EffectIndex,
        Flags: value.Flags,
        TransformIndex: value.TransformIndex,
      }
      index = index + 1
    }
  }

  private func ScaleBounds(value ConservativeBounds, scaleX float32, scaleY float32) ConservativeBounds -> ConservativeBounds {
    X: value.X * scaleX,
    Y: value.Y * scaleY,
    Width: value.Width * scaleX,
    Height: value.Height * scaleY,
  }

  private func ScaleRadius(value float32, scaleX float32, scaleY float32) float32 -> value * (scaleX < scaleY ? scaleX : scaleY)

  private func ScaleClipContentKey(value uint64, scaleX float32, scaleY float32) uint64 {
    var hash = (value ^ uint64(uint32(BitConverter.SingleToInt32Bits(scaleX)))) *
    uint64(1099511628211)
    hash = (hash ^ uint64(uint32(BitConverter.SingleToInt32Bits(scaleY)))) *
    uint64(1099511628211)
    return hash
  }
}
