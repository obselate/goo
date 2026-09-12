package Goo

import System

internal func VulkanTextSegmentGrowthCapacity(current int32, required int32) int32 {
  var next = current
  if next <= 0 { next = 1 }
  while next < required {
    if next > Int32.MaxValue / 2 {
      return required
    }
    next = next * 2
  }
  return next
}

internal struct VulkanTextSegmentRun {
  internal var FirstInstance int32
  internal var InstanceCount int32
  internal var AtlasId ResourceId
  internal var PipelineKind uint32
  internal var ByteRangeEnd uint64
}

internal open class VulkanTextSegmentStorage {
  internal var Records []HbGpuTextInstanceRecord
  internal var RecordCount int32
  internal var Runs []VulkanTextSegmentRun
  internal var RunCount int32
  internal var GlyphResources []ResourceId
  internal var GlyphResourceCount int32
  internal var GlyphAtlasTexelOffsets []uint32
  internal var GlyphAtlasTexelCounts []uint32
  internal var GlyphEffectAtlasTexelOffsets []uint32
  internal var GlyphEffectAtlasTexelCounts []uint32
  internal var Bounds ConservativeBounds
  internal var GlyphCount int32
  internal var ClipChainId int32
  internal var AtlasGeneration uint64

  internal func Initialize(capacity int32) {
    var resolvedCapacity = capacity
    if resolvedCapacity <= 0 { resolvedCapacity = 1 }
    Records = [resolvedCapacity]HbGpuTextInstanceRecord
    Runs = [resolvedCapacity]VulkanTextSegmentRun
    GlyphResources = [resolvedCapacity]ResourceId
    GlyphAtlasTexelOffsets = [resolvedCapacity]uint32
    GlyphAtlasTexelCounts = [resolvedCapacity]uint32
    GlyphEffectAtlasTexelOffsets = [resolvedCapacity]uint32
    GlyphEffectAtlasTexelCounts = [resolvedCapacity]uint32
  }

  internal func EnsureRecordCapacity(required int32) {
    if required <= Records.Length { return }
    let next = VulkanTextSegmentGrowthCapacity(Records.Length, required)
    let expandedRecords = [next]HbGpuTextInstanceRecord
    let expandedResources = [next]ResourceId
    let expandedOffsets = [next]uint32
    let expandedCounts = [next]uint32
    let expandedEffectOffsets = [next]uint32
    let expandedEffectCounts = [next]uint32
    Array.Copy(Records, expandedRecords, RecordCount)
    Array.Copy(GlyphResources, expandedResources, GlyphResourceCount)
    Array.Copy(GlyphAtlasTexelOffsets, expandedOffsets, GlyphResourceCount)
    Array.Copy(GlyphAtlasTexelCounts, expandedCounts, GlyphResourceCount)
    Array.Copy(GlyphEffectAtlasTexelOffsets, expandedEffectOffsets, GlyphResourceCount)
    Array.Copy(GlyphEffectAtlasTexelCounts, expandedEffectCounts, GlyphResourceCount)
    Records = expandedRecords
    GlyphResources = expandedResources
    GlyphAtlasTexelOffsets = expandedOffsets
    GlyphAtlasTexelCounts = expandedCounts
    GlyphEffectAtlasTexelOffsets = expandedEffectOffsets
    GlyphEffectAtlasTexelCounts = expandedEffectCounts
  }

  internal func EnsureRunCapacity(required int32) {
    if required <= Runs.Length { return }
    let next = VulkanTextSegmentGrowthCapacity(Runs.Length, required)
    let expanded = [next]VulkanTextSegmentRun
    Array.Copy(Runs, expanded, RunCount)
    Runs = expanded
  }
}

internal sealed class VulkanRetainedTextSegment : VulkanTextSegmentStorage {
  internal var Id uint64
  internal var Version uint64
  internal var Shape ShapedText?
  internal var FontSize float32
  internal var LineX float32
  internal var Baseline float32
  internal var Color uint32
  internal var EffectMode uint32
  internal var EffectRadiusPixels float32
  internal var EffectOffsetX float32
  internal var EffectOffsetY float32
  internal var ParentTransform TransformRecord
  internal var RendererValidationVersion uint64
  internal var RendererValidationAtlasGeneration uint64
  internal var RendererValidationValid bool
  internal var RendererValidationCacheEligible bool

  internal init(capacity int32) {
    Initialize(capacity)
  }

  internal func CreateReference() CachedTextSegmentRefRecord -> CachedTextSegmentRefRecord {
    Bounds: Bounds,
    SegmentId: Id,
    SegmentVersion: Version,
    GlyphCount: GlyphCount,
    ClipChainId: ClipChainId,
    Segment: this,
    FirstInstance: -1,
  }
}

internal sealed class VulkanTextSegmentBuildWorkspace : VulkanTextSegmentStorage {
  internal init(capacity int32) {
    Initialize(capacity)
  }

  internal func BeginBuild(atlasGeneration uint64, clipChainId int32) {
    Bounds = ConservativeBounds{}
    GlyphCount = 0
    ClipChainId = clipChainId
    RecordCount = 0
    RunCount = 0
    GlyphResourceCount = 0
    AtlasGeneration = atlasGeneration
  }
}

internal enum SceneResourceKind {
  None;
  Image;
  Sampler;
  GlyphRun;
  Atlas;
  PathBand;
  Brush = 7;
  Mask;
  Pipeline;
  OffscreenTarget;
}

internal struct ResourceId {
  internal var Kind SceneResourceKind
  internal var LogicalId uint64
  internal var Version uint64

  internal prop IsValid bool{
    get -> Kind != SceneResourceKind.None && LogicalId != 0uL && Version != 0uL
  }
}

internal struct ConservativeBounds {
  internal var X float32
  internal var Y float32
  internal var Width float32
  internal var Height float32

  internal prop Right float32{
    get -> X + Width
  }

  internal prop Bottom float32{
    get -> Y + Height
  }

  internal prop IsEmpty bool{
    get -> Width <= 0.0F || Height <= 0.0F
  }

  internal func Inflate(amount float32) ConservativeBounds -> ConservativeBounds {
    X: X - amount,
    Y: Y - amount,
    Width: Width + amount + amount,
    Height: Height + amount + amount,
  }
}

internal enum SceneDrawKind {
  SolidBox;
  RoundedBox;
  PerEdgeBorder;
  LinearGradient;
  RadialGradient;
  CachedImage;
  CachedTextSegment;
  AnalyticPathBand;
  Transform;
  RectClipBegin;
  RectClipEnd;
  Shadow;
  Underline;
  Lava;
  LayerBegin = 15;
  LayerEnd;
}

internal struct DrawRef {
  internal var Kind SceneDrawKind
  internal var Index int32
  internal var Flags uint32
  internal var ClipChainId int32
}

internal enum SceneChunkRetentionState {
  Generic;
  ExactLeafHit;
  ExactLeafRebuild;
}

internal struct SceneChunk {
  internal var OwnerId uint64
  internal var Version uint64
  internal var Bounds ConservativeBounds
  internal var FirstDraw int32
  internal var DrawCount int32
  internal var FirstResource int32
  internal var ResourceCount int32
  internal var ContentKey uint64
  internal var TopologyKey uint64
  internal var Dirty bool
  internal var RetentionState SceneChunkRetentionState
}

internal struct VulkanDamageRegion {
  internal var X int32
  internal var Y int32
  internal var Width int32
  internal var Height int32

  internal prop IsEmpty bool{
    get -> Width <= 0 || Height <= 0
  }

  internal prop Right int32{
    get -> X + Width
  }

  internal prop Bottom int32{
    get -> Y + Height
  }
}

internal struct VulkanSceneChunkIdentity {
  internal var OwnerId uint64
  internal var Version uint64
  internal var Bounds ConservativeBounds
  internal var ContentKey uint64
  internal var TopologyKey uint64
  internal var RetentionState SceneChunkRetentionState
  internal var ExactLeafKind SceneDrawKind
  internal var ProofDrawStart int32
  internal var ProofDrawCount int32
  internal var ProofResourceStart int32
  internal var ProofResourceCount int32
  internal var ProofValid bool
}

internal struct VulkanSceneDrawIdentity {
  internal var Kind SceneDrawKind
  internal var Flags uint32
  internal var ClipChainId int32
  internal var Solid SolidBoxRecord
  internal var Rounded RoundedBoxRecord
  internal var Border PerEdgeBorderRecord
}

internal struct VulkanSceneDamageEntry {
  internal var Version uint64
  internal var Bounds ConservativeBounds
  internal var HasDamage bool
  internal var FullRedraw bool
}

internal struct SolidBoxRecord {
  internal var Bounds ConservativeBounds
  internal var Color uint32
  internal var Opacity float32
  internal var TransformIndex int32
}

internal struct RoundedBoxRecord {
  internal var Bounds ConservativeBounds
  internal var RadiusTopLeft float32
  internal var RadiusTopRight float32
  internal var RadiusBottomRight float32
  internal var RadiusBottomLeft float32
  internal var OpaqueBorderWidth float32
  internal var OpaqueBorderHeight float32
  internal var Color uint32
  internal var Opacity float32
  internal var TransformIndex int32
}

internal struct PerEdgeBorderRecord {
  internal var Bounds ConservativeBounds
  internal var TopWidth float32
  internal var RightWidth float32
  internal var BottomWidth float32
  internal var LeftWidth float32
  internal var RadiusTopLeft float32
  internal var RadiusTopRight float32
  internal var RadiusBottomRight float32
  internal var RadiusBottomLeft float32
  internal var TopColor uint32
  internal var RightColor uint32
  internal var BottomColor uint32
  internal var LeftColor uint32
  internal var Style uint32
  internal var TransformIndex int32
}

internal struct GradientStopRecord {
  internal var Offset float32
  internal var Color uint32
}

internal struct LinearGradientRecord {
  internal var Bounds ConservativeBounds
  internal var RadiusTopLeft float32
  internal var RadiusTopRight float32
  internal var RadiusBottomRight float32
  internal var RadiusBottomLeft float32
  internal var StartX float32
  internal var StartY float32
  internal var EndX float32
  internal var EndY float32
  internal var StopStart int32
  internal var StopCount int32
  internal var Opacity float32
  internal var TransformIndex int32
}

internal struct RadialGradientRecord {
  internal var Bounds ConservativeBounds
  internal var RadiusTopLeft float32
  internal var RadiusTopRight float32
  internal var RadiusBottomRight float32
  internal var RadiusBottomLeft float32
  internal var CenterX float32
  internal var CenterY float32
  internal var RadiusX float32
  internal var RadiusY float32
  internal var StopStart int32
  internal var StopCount int32
  internal var Opacity float32
  internal var TransformIndex int32
}

internal struct CachedImageRefRecord {
  internal var Bounds ConservativeBounds
  internal var ImageId ResourceId
  internal var SamplerId ResourceId
  internal var SourceX float32
  internal var SourceY float32
  internal var SourceWidth float32
  internal var SourceHeight float32
  internal var Opacity float32
  internal var Sampling uint32
  internal var TransformIndex int32
}

internal struct CachedTextSegmentRefRecord {
  internal var Bounds ConservativeBounds
  internal var SegmentId uint64
  internal var SegmentVersion uint64
  internal var GlyphCount int32
  internal var ClipChainId int32
  internal var Segment VulkanRetainedTextSegment?
  internal var FirstInstance int32
}

internal struct AnalyticPathBandRecord {
  internal var Bounds ConservativeBounds
  internal var PathId ResourceId
  internal var AtlasId ResourceId
  internal var AtlasWordOffset uint32
  internal var AtlasWordCount uint32
  internal var FillColor uint32
  internal var FillRule uint32
  internal var Opacity float32
  internal var ScaleX float32
  internal var ScaleY float32
  internal var TranslateX float32
  internal var TranslateY float32
  internal var TransformIndex int32
}

internal struct TransformRecord {
  internal var A float32
  internal var B float32
  internal var C float32
  internal var D float32
  internal var TX float32
  internal var TY float32
  internal var ParentIndex int32
}

internal struct RectClipRecord {
  internal var Bounds ConservativeBounds
  internal var TransformIndex int32
  internal var ParentIndex int32
}

internal enum SceneClipChainFlags {
  None = 0;
  Zero = 1;
}

internal struct ClipMaskRecord {
  internal var StableId uint64
  internal var PathId ResourceId
  internal var AtlasId ResourceId
  internal var AtlasWordOffset uint32
  internal var AtlasWordCount uint32
  internal var Bounds ConservativeBounds
  internal var PathBounds ConservativeBounds
  internal var Fit ShapeFit
  internal var FillRule uint32
  internal var ScaleX float32
  internal var ScaleY float32
  internal var TranslateX float32
  internal var TranslateY float32
  internal var TransformIndex int32
  internal var ContentKey uint64
}

internal struct ClipChainRecord {
  internal var StableId uint64
  internal var ParentIndex int32
  internal var MaskIndex int32
  internal var Depth int32
  internal var Flags uint32
  internal var ContentKey uint64
}

internal struct ShadowRecord {
  internal var Bounds ConservativeBounds
  internal var RadiusTopLeft float32
  internal var RadiusTopRight float32
  internal var RadiusBottomRight float32
  internal var RadiusBottomLeft float32
  internal var OffsetX float32
  internal var OffsetY float32
  internal var Spread float32
  internal var Blur float32
  internal var Color uint32
  internal var MaskId ResourceId
  internal var MaskIndex int32
  internal var Inset bool
  internal var TransformIndex int32
}

internal struct UnderlineRecord {
  internal var Bounds ConservativeBounds
  internal var Thickness float32
  internal var Color uint32
  internal var Mode uint32
  internal var TransformIndex int32
}

internal struct LavaRecord {
  internal var Bounds ConservativeBounds
  internal var Flow float32
  internal var Form float32
  internal var Blend float32
  internal var Light float32
  internal var Hue float32
  internal var Rainbow uint32
  internal var Rotation Point
  internal var Seed uint32
  internal var TransformIndex int32
}

internal enum LayerRecordFlags {
  None = 0;
  SamplesBackdrop = 1;
  BorrowsParentBackdrop = 2;
}

internal struct LayerRecord {
  internal var Bounds ConservativeBounds
  internal var OriginX float32
  internal var OriginY float32
  internal var ExtentWidth uint32
  internal var ExtentHeight uint32
  internal var Opacity float32
  internal var BlendMode uint32
  internal var OffscreenTargetId ResourceId
  internal var EffectProgramId uint64
  internal var EffectVersion uint64
  internal var EffectIndex int32
  internal var Flags uint32
  internal var TransformIndex int32
}

internal struct ShaderEffectRecord {
  internal var Program ShaderEffect?
  internal var ProgramId uint64
  internal var Version uint64
  internal var SamplesBackdrop bool
  internal var ElapsedSeconds float32
  internal var Parameter0 System.Numerics.Vector4
  internal var Parameter1 System.Numerics.Vector4
  internal var Parameter2 System.Numerics.Vector4
  internal var Parameter3 System.Numerics.Vector4
  internal var Parameter4 System.Numerics.Vector4
  internal var Parameter5 System.Numerics.Vector4
  internal var Parameter6 System.Numerics.Vector4
  internal var Parameter7 System.Numerics.Vector4
  internal var DataWordOffset uint32
  internal var DataByteCount int32
}

internal struct ScenePlanCounters {
  internal var GrowthOperations uint64
  internal var RecordOperations uint64
  internal var DrawReferenceOperations uint64
  internal var ResourceReferenceOperations uint64
  internal var ChunkOperations uint64
  internal var ResetOperations uint64
}

internal data struct VulkanScenePathClipResult {
  internal var Emitted bool
  internal var ChainIndex int32
}
