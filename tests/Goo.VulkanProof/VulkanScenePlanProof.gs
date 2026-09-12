package Goo.VulkanProof

import System
import Goo

internal func RequireScenePlanProof(value bool, message string) {
  if !value {
    throw InvalidOperationException(message)
  }
}

internal func ProofResource(kind SceneResourceKind, logicalId uint64) ResourceId -> ResourceId { Kind: kind, LogicalId: logicalId, Version: 1uL }

internal func BuildScenePlanProof(
  frame SceneFrame,
  version uint64,
  textSegment VulkanRetainedTextSegment) {
    frame.ResetForReuse()
    let bounds = ConservativeBounds{ X: 2.0F, Y: 3.0F, Width: 48.0F, Height: 36.0F }
    frame.BeginChunk(7001uL, version, bounds, true)

    let transformIndex = frame.AddTransform(TransformRecord{
      A: 1.0F,
      B: 0.125F,
      C: -0.25F,
      D: 1.0F,
      TX: 4.0F,
      TY: 6.0F,
      ParentIndex: -1,
    })

    let outerClip = frame.AddRectClipBegin(RectClipRecord{
      Bounds: ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 64.0F, Height: 64.0F },
      TransformIndex: transformIndex,
      ParentIndex: -1,
    })
    let innerClip = frame.AddRectClipBegin(RectClipRecord{
      Bounds: ConservativeBounds{ X: 4.0F, Y: 5.0F, Width: 40.0F, Height: 30.0F },
      TransformIndex: transformIndex,
      ParentIndex: outerClip,
    })
    let layer = LayerRecord{
      Bounds: bounds,
      OriginX: 2.0F,
      OriginY: 3.0F,
      ExtentWidth: 48u,
      ExtentHeight: 36u,
      Opacity: 0.92F,
      BlendMode: 2u,
      OffscreenTargetId: ProofResource(SceneResourceKind.OffscreenTarget, 9001uL),
      EffectIndex: -1,
      Flags: 1u,
      TransformIndex: transformIndex,
    }
    frame.AddLayerBegin(layer)

    frame.AddSolidBox(SolidBoxRecord{
      Bounds: bounds,
      Color: 0xD9E8FFFFu,
      Opacity: 0.95F,
      TransformIndex: transformIndex,
    })
    frame.AddRoundedBox(RoundedBoxRecord{
      Bounds: ConservativeBounds{ X: 6.0F, Y: 7.0F, Width: 36.0F, Height: 26.0F },
      RadiusTopLeft: 3.0F,
      RadiusTopRight: 4.0F,
      RadiusBottomRight: 5.0F,
      RadiusBottomLeft: 6.0F,
      Color: 0x223344EEu,
      Opacity: 0.88F,
      TransformIndex: transformIndex,
    })
    frame.AddPerEdgeBorder(PerEdgeBorderRecord{
      Bounds: bounds,
      TopWidth: 1.0F,
      RightWidth: 2.0F,
      BottomWidth: 3.0F,
      LeftWidth: 4.0F,
      TopColor: 0xFF0000FFu,
      RightColor: 0x00FF00FFu,
      BottomColor: 0x0000FFFFu,
      LeftColor: 0xFFFFFFFFu,
      Style: 1u,
      TransformIndex: transformIndex,
    })

    frame.AddGradientStop(GradientStopRecord{ Offset: 0.0F, Color: 0x101820FFu })
    frame.AddGradientStop(GradientStopRecord{ Offset: 0.5F, Color: 0x406080FFu })
    frame.AddGradientStop(GradientStopRecord{ Offset: 0.75F, Color: 0x80A0C0FFu })
    frame.AddGradientStop(GradientStopRecord{ Offset: 1.0F, Color: 0xC0E0FFFFu })
    frame.AddLinearGradient(LinearGradientRecord{
      Bounds: bounds,
      RadiusTopLeft: 2.0F,
      RadiusTopRight: 3.0F,
      RadiusBottomRight: 4.0F,
      RadiusBottomLeft: 5.0F,
      StartX: 0.0F,
      StartY: 0.0F,
      EndX: 48.0F,
      EndY: 36.0F,
      StopStart: 0,
      StopCount: 4,
      Opacity: 0.81F,
      TransformIndex: transformIndex,
    })
    frame.AddGradientStop(GradientStopRecord{ Offset: 0.0F, Color: 0xFFCC00FFu })
    frame.AddGradientStop(GradientStopRecord{ Offset: 1.0F, Color: 0x4400FFFFu })
    frame.AddRadialGradient(RadialGradientRecord{
      Bounds: ConservativeBounds{ X: 8.0F, Y: 9.0F, Width: 28.0F, Height: 20.0F },
      RadiusTopLeft: 1.0F,
      RadiusTopRight: 2.0F,
      RadiusBottomRight: 3.0F,
      RadiusBottomLeft: 4.0F,
      CenterX: 22.0F,
      CenterY: 19.0F,
      RadiusX: 18.0F,
      RadiusY: 12.0F,
      StopStart: 4,
      StopCount: 2,
      Opacity: 0.77F,
      TransformIndex: transformIndex,
    })

    frame.AddCachedImage(CachedImageRefRecord{
      Bounds: ConservativeBounds{ X: 10.0F, Y: 11.0F, Width: 12.0F, Height: 10.0F },
      ImageId: ProofResource(SceneResourceKind.Image, 9101uL),
      SamplerId: ProofResource(SceneResourceKind.Sampler, 9102uL),
      SourceX: 1.0F,
      SourceY: 2.0F,
      SourceWidth: 12.0F,
      SourceHeight: 10.0F,
      Opacity: 0.73F,
      Sampling: 1u,
      TransformIndex: transformIndex,
    })
    frame.AddCachedTextSegment(CachedTextSegmentRefRecord{
      Bounds: textSegment.Bounds,
      SegmentId: textSegment.Id,
      SegmentVersion: textSegment.Version,
      GlyphCount: textSegment.GlyphCount,
      ClipChainId: textSegment.ClipChainId,
      Segment: textSegment,
      FirstInstance: -1,
    })
    frame.AddAnalyticPathBand(AnalyticPathBandRecord{
      Bounds: ConservativeBounds{ X: 16.0F, Y: 14.0F, Width: 18.0F, Height: 13.0F },
      PathId: ProofResource(SceneResourceKind.PathBand, 9301uL),
      AtlasId: ProofResource(SceneResourceKind.Atlas, 9302uL),
      AtlasWordOffset: 3u,
      AtlasWordCount: 12u,
      FillColor: 0x8899AAFFu,
      FillRule: 1u,
      Opacity: 0.86F,
      ScaleX: 1.0F,
      ScaleY: 1.0F,
      TranslateX: 2.0F,
      TranslateY: 3.0F,
      TransformIndex: transformIndex,
    })
    frame.AddShadow(ShadowRecord{
      Bounds: ConservativeBounds{ X: 0.0F, Y: 1.0F, Width: 52.0F, Height: 40.0F },
      RadiusTopLeft: 4.0F,
      RadiusTopRight: 4.0F,
      RadiusBottomRight: 4.0F,
      RadiusBottomLeft: 4.0F,
      OffsetX: 1.0F,
      OffsetY: 2.0F,
      Spread: 1.0F,
      Blur: 6.0F,
      Color: 0x00000080u,
      MaskId: ProofResource(SceneResourceKind.Mask, 9401uL),
      MaskIndex: -1,
      Inset: false,
      TransformIndex: transformIndex,
    })
    frame.AddUnderline(UnderlineRecord{
      Bounds: ConservativeBounds{ X: 12.0F, Y: 31.0F, Width: 18.0F, Height: 2.0F },
      Thickness: 1.0F,
      Color: 0xFFFFFFFFu,
      Mode: 1u,
      TransformIndex: transformIndex,
    })
    frame.AddLayerEnd(layer)
    frame.AddRectClipEnd(RectClipRecord{
      Bounds: ConservativeBounds{ X: 4.0F, Y: 5.0F, Width: 40.0F, Height: 30.0F },
      TransformIndex: transformIndex,
      ParentIndex: outerClip,
    })
    frame.AddRectClipEnd(RectClipRecord{
      Bounds: ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 64.0F, Height: 64.0F },
      TransformIndex: transformIndex,
      ParentIndex: -1,
    })
    frame.EndChunk()
  }

internal func CreateScenePlanTextSegment() VulkanRetainedTextSegment {
  let bounds = ConservativeBounds{ X: 12.0F, Y: 23.0F, Width: 20.0F, Height: 8.0F }
  let segment = VulkanRetainedTextSegment(1)
  segment.Id = 9200uL
  segment.Version = 1uL
  segment.Bounds = bounds
  segment.GlyphCount = 1
  segment.ClipChainId = 0
  segment.Records[0] = HbGpuTextInstanceRecord{
    transform_m00: 1.0F,
    transform_m11: 1.0F,
    transform_m22: 1.0F,
    transform_m33: 1.0F,
    glyphBounds_x: 0.0F,
    glyphBounds_y: 0.0F,
    glyphBounds_z: 20.0F,
    glyphBounds_w: 8.0F,
    glyphInput_x: 0u,
    glyphInput_y: 2u,
    glyphInput_z: 0u,
    glyphInput_w: 0u,
    foreground_x: 1.0F,
    foreground_y: 1.0F,
    foreground_z: 1.0F,
    foreground_w: 1.0F,
  }
  segment.RecordCount = 1
  segment.Runs[0] = VulkanTextSegmentRun{
    FirstInstance: 0,
    InstanceCount: 1,
    AtlasId: ProofResource(SceneResourceKind.Atlas, 9202uL),
    PipelineKind: 0u,
    ByteRangeEnd: 8uL,
  }
  segment.RunCount = 1
  segment.GlyphResources[0] = ProofResource(SceneResourceKind.GlyphRun, 9201uL)
  segment.GlyphResourceCount = 1
  segment.GlyphAtlasTexelCounts[0] = 1u
  segment.GlyphEffectAtlasTexelCounts[0] = 1u
  segment.AtlasGeneration = 1uL
  return segment
}

internal func RunScenePlanProof() bool {
  let frame = SceneFrame(1)
  let textSegment = CreateScenePlanTextSegment()
  let version uint64 = 1uL
  BuildScenePlanProof(frame, version, textSegment)
  let expectedDigest uint64 = 13765616272414566835uL
  let expectedGrowth = frame.GrowthOperations
  RequireScenePlanProof(frame.ChunkCount == 1, "S09 scene plan chunk count")
  RequireScenePlanProof(frame.DrawRefCount == 17, "S09 scene plan draw count")
  RequireScenePlanProof(frame.ResourceRefCount == 9, "S09 scene plan resource count")
  RequireScenePlanProof(frame.SolidBoxCount == 1, "S09 scene plan solid count")
  RequireScenePlanProof(frame.RoundedBoxCount == 1, "S09 scene plan rounded count")
  RequireScenePlanProof(frame.PerEdgeBorderCount == 1, "S09 scene plan border count")
  RequireScenePlanProof(frame.GradientStopCount == 6, "S09 scene plan stop count")
  RequireScenePlanProof(frame.LinearGradientCount == 1, "S09 scene plan linear gradient count")
  RequireScenePlanProof(frame.RadialGradientCount == 1, "S09 scene plan radial gradient count")
  RequireScenePlanProof(frame.CachedImageCount == 1, "S09 scene plan image count")
  RequireScenePlanProof(frame.CachedTextSegmentCount == 1, "S09 scene plan text segment count")
  RequireScenePlanProof(frame.AnalyticPathBandCount == 1, "S09 scene plan path band count")
  RequireScenePlanProof(frame.TransformCount == 1, "S09 scene plan transform count")
  RequireScenePlanProof(frame.RectClipCount == 4, "S09 scene plan clip count")
  RequireScenePlanProof(frame.ShadowCount == 1, "S09 scene plan shadow count")
  RequireScenePlanProof(frame.UnderlineCount == 1, "S09 scene plan underline count")
  RequireScenePlanProof(frame.LayerCount == 2, "S09 scene plan layer count")
  RequireScenePlanProof(frame.ActiveChunk == -1, "S09 scene plan open chunk")
  RequireScenePlanProof(frame.Chunks[0].OwnerId == 7001uL, "S09 scene plan owner")
  RequireScenePlanProof(frame.Chunks[0].Version == version, "S09 scene plan version")
  RequireScenePlanProof(frame.Chunks[0].DrawCount == 17, "S09 scene plan chunk draw count")
  RequireScenePlanProof(frame.Chunks[0].ResourceCount == 9, "S09 scene plan chunk resource count")

  BuildScenePlanProof(frame, version, textSegment)
  let unchangedDigest = frame.SemanticDigest()
  RequireScenePlanProof(unchangedDigest == expectedDigest,
    "S09 scene plan unchanged-version digest expected=${expectedDigest} actual=${unchangedDigest}")
  RequireScenePlanProof(frame.GrowthOperations == expectedGrowth, "S09 scene plan unchanged-version growth")

  let changedVersion uint64 = 2uL
  let before = GC.GetAllocatedBytesForCurrentThread()
  BuildScenePlanProof(frame, changedVersion, textSegment)
  let digest = frame.SemanticDigest()
  let allocated = GC.GetAllocatedBytesForCurrentThread() - before
  RequireScenePlanProof(digest == expectedDigest,
    "S09 scene plan steady digest expected=${expectedDigest} actual=${digest}")
  RequireScenePlanProof(allocated == 0, "S09 scene plan steady allocation")
  RequireScenePlanProof(frame.GrowthOperations == expectedGrowth, "S09 scene plan steady growth")
  RequireScenePlanProof(frame.Chunks[0].Version == changedVersion, "S09 scene plan steady version")
  Console.WriteLine("S09 typed scene plan: digest=${digest} allocated=${allocated}")
  return true
}
