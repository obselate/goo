package Goo

import System

internal partial class SceneFrame {
  private const DefaultCapacity int32 = 8
  private const HashOffset uint64 = 1469598103934665603uL
  private const HashPrime uint64 = 1099511628211uL

  private var chunks []SceneChunk
  private var chunkCount int32
  private var drawRefs []DrawRef
  private var drawRefCount int32
  private var resourceRefs []ResourceId
  private var resourceRefCount int32
  private var solidBoxes []SolidBoxRecord
  private var solidBoxCount int32
  private var roundedBoxes []RoundedBoxRecord
  private var roundedBoxCount int32
  private var perEdgeBorders []PerEdgeBorderRecord
  private var perEdgeBorderCount int32
  private var gradientStops []GradientStopRecord
  private var gradientStopCount int32
  private var linearGradients []LinearGradientRecord
  private var linearGradientCount int32
  private var radialGradients []RadialGradientRecord
  private var radialGradientCount int32
  private var cachedImages []CachedImageRefRecord
  private var cachedImageCount int32
  private var cachedTextSegments []CachedTextSegmentRefRecord
  private var cachedTextSegmentCount int32
  private var analyticPathBands []AnalyticPathBandRecord
  private var analyticPathBandCount int32
  private var transforms []TransformRecord
  private var transformCount int32
  private var rectClips []RectClipRecord
  private var rectClipCount int32
  private var clipMasks []ClipMaskRecord
  private var clipMaskCount int32
  private var clipChains []ClipChainRecord
  private var clipChainCount int32
  private var shadows []ShadowRecord
  private var shadowCount int32
  private var underlines []UnderlineRecord
  private var underlineCount int32
  private var lavas []LavaRecord
  private var lavaCount int32
  private var layers []LayerRecord
  private var layerCount int32
  private var shaderEffects []ShaderEffectRecord
  private var shaderEffectCount int32

  private var activeChunk int32
  private var activeClipChainId int32
  private var growthOperations uint64
  private var recordOperations uint64
  private var drawReferenceOperations uint64
  private var resourceReferenceOperations uint64
  private var chunkOperations uint64
  private var resetOperations uint64
  private var reusableChunkCount int32
  private var recordsLogical bool

  internal convenience init() {
    init(DefaultCapacity)
  }

  internal init(capacity int32) {
    if capacity <= 0 || capacity > Int32.MaxValue {
      throw ArgumentOutOfRangeException("capacity")
    }
    chunks = [capacity]SceneChunk
    drawRefs = [capacity]DrawRef
    resourceRefs = [capacity]ResourceId
    solidBoxes = [capacity]SolidBoxRecord
    roundedBoxes = [capacity]RoundedBoxRecord
    perEdgeBorders = [capacity]PerEdgeBorderRecord
    gradientStops = [capacity]GradientStopRecord
    linearGradients = [capacity]LinearGradientRecord
    radialGradients = [capacity]RadialGradientRecord
    cachedImages = [capacity]CachedImageRefRecord
    cachedTextSegments = [capacity]CachedTextSegmentRefRecord
    analyticPathBands = [capacity]AnalyticPathBandRecord
    transforms = [capacity]TransformRecord
    rectClips = [capacity]RectClipRecord
    clipMasks = [capacity]ClipMaskRecord
    clipChains = [capacity]ClipChainRecord
    shadows = [capacity]ShadowRecord
    underlines = [capacity]UnderlineRecord
    lavas = [capacity]LavaRecord
    layers = [capacity]LayerRecord
    shaderEffects = [capacity]ShaderEffectRecord
    InitializeShaderEffectData()
    activeChunk = -1
    activeClipChainId = 0
  }

  internal prop Chunks []SceneChunk{ get -> chunks }
  internal prop ChunkCount int32{ get -> chunkCount }
  internal prop DrawRefs []DrawRef{ get -> drawRefs }
  internal prop DrawRefCount int32{ get -> drawRefCount }
  internal prop ResourceRefs []ResourceId{ get -> resourceRefs }
  internal prop ResourceRefCount int32{ get -> resourceRefCount }
  internal prop SolidBoxes []SolidBoxRecord{ get -> solidBoxes }
  internal prop SolidBoxCount int32{ get -> solidBoxCount }
  internal prop RoundedBoxes []RoundedBoxRecord{ get -> roundedBoxes }
  internal prop RoundedBoxCount int32{ get -> roundedBoxCount }
  internal prop PerEdgeBorders []PerEdgeBorderRecord{ get -> perEdgeBorders }
  internal prop PerEdgeBorderCount int32{ get -> perEdgeBorderCount }
  internal prop GradientStops []GradientStopRecord{ get -> gradientStops }
  internal prop GradientStopCount int32{ get -> gradientStopCount }
  internal prop LinearGradients []LinearGradientRecord{ get -> linearGradients }
  internal prop LinearGradientCount int32{ get -> linearGradientCount }
  internal prop RadialGradients []RadialGradientRecord{ get -> radialGradients }
  internal prop RadialGradientCount int32{ get -> radialGradientCount }
  internal prop CachedImages []CachedImageRefRecord{ get -> cachedImages }
  internal prop CachedImageCount int32{ get -> cachedImageCount }
  internal prop CachedTextSegments []CachedTextSegmentRefRecord{ get -> cachedTextSegments }
  internal prop CachedTextSegmentCount int32{ get -> cachedTextSegmentCount }
  internal prop AnalyticPathBands []AnalyticPathBandRecord{ get -> analyticPathBands }
  internal prop AnalyticPathBandCount int32{ get -> analyticPathBandCount }
  internal prop Transforms []TransformRecord{ get -> transforms }
  internal prop TransformCount int32{ get -> transformCount }
  internal prop RectClips []RectClipRecord{ get -> rectClips }
  internal prop RectClipCount int32{ get -> rectClipCount }
  internal prop ClipMasks []ClipMaskRecord{ get -> clipMasks }
  internal prop ClipMaskCount int32{ get -> clipMaskCount }
  internal prop ClipChains []ClipChainRecord{ get -> clipChains }
  internal prop ClipChainCount int32{ get -> clipChainCount }
  internal prop Shadows []ShadowRecord{ get -> shadows }
  internal prop ShadowCount int32{ get -> shadowCount }
  internal prop Underlines []UnderlineRecord{ get -> underlines }
  internal prop UnderlineCount int32{ get -> underlineCount }
  internal prop Lavas []LavaRecord{ get -> lavas }
  internal prop LavaCount int32{ get -> lavaCount }
  internal prop Layers []LayerRecord{ get -> layers }
  internal prop LayerCount int32{ get -> layerCount }
  internal prop ShaderEffects []ShaderEffectRecord{ get -> shaderEffects }
  internal prop ShaderEffectCount int32{ get -> shaderEffectCount }
  internal prop ActiveChunk int32{ get -> activeChunk }
  internal prop ActiveClipChainId int32{ get -> activeClipChainId }
  internal prop GrowthOperations uint64{ get -> growthOperations }
  internal prop RecordOperations uint64{ get -> recordOperations }
  internal prop Counters ScenePlanCounters{
    get {
      return ScenePlanCounters{
        GrowthOperations: growthOperations,
        RecordOperations: recordOperations,
        DrawReferenceOperations: drawReferenceOperations,
        ResourceReferenceOperations: resourceReferenceOperations,
        ChunkOperations: chunkOperations,
        ResetOperations: resetOperations,
      }
    }
  }

  internal func Reset() {
    RequireClosedChunk()
    reusableChunkCount = recordsLogical ? chunkCount : 0
    recordsLogical = true
    var shaderIndex int32 = 0
    while shaderIndex < shaderEffectCount {
      shaderEffects[shaderIndex] = ShaderEffectRecord{}
      shaderIndex = shaderIndex + 1
    }
    ResetShaderEffectData()
    chunkCount = 0
    drawRefCount = 0
    resourceRefCount = 0
    solidBoxCount = 0
    roundedBoxCount = 0
    perEdgeBorderCount = 0
    gradientStopCount = 0
    linearGradientCount = 0
    radialGradientCount = 0
    cachedImageCount = 0
    cachedTextSegmentCount = 0
    analyticPathBandCount = 0
    transformCount = 0
    rectClipCount = 0
    clipMaskCount = 0
    clipChainCount = 1
    clipChains[0] = ClipChainRecord{
      StableId: 0uL,
      ParentIndex: -1,
      MaskIndex: -1,
      Depth: 0,
      Flags: uint32(SceneClipChainFlags.None),
      ContentKey: 0uL,
    }
    shadowCount = 0
    underlineCount = 0
    lavaCount = 0
    layerCount = 0
    shaderEffectCount = 0
    activeChunk = -1
    activeClipChainId = 0
    resetOperations = resetOperations + 1uL
  }

  internal func ResetForReuse() {
    Reset()
  }

  internal func InvalidateRetainedPrimitiveSpans() {
    recordsLogical = false
  }

  private func TryAppendRetainedPrimitiveSpan(
    ownerId uint64,
    version uint64,
    bounds ConservativeBounds,
    kind SceneDrawKind,
    recordIndex int32) int32{
      if activeChunk >= 0 || activeClipChainId != 0
        || chunkCount >= reusableChunkCount{
          return -1
        }
      let previous = chunks[chunkCount]
      if previous.OwnerId != ownerId
        || previous.FirstDraw != drawRefCount
        || previous.DrawCount != 1
        || previous.FirstResource != resourceRefCount
        || previous.ResourceCount != 0 {
          return -1
        }
      let draw = drawRefs[drawRefCount]
      if draw.Kind != kind || draw.Index != recordIndex
        || draw.Flags != 0u || draw.ClipChainId != 0 {
          return -1
        }
      let chunk = chunkCount
      chunks[chunk] = SceneChunk{
        OwnerId: ownerId,
        Version: version,
        Bounds: bounds,
        FirstDraw: drawRefCount,
        DrawCount: 1,
        FirstResource: resourceRefCount,
        ResourceCount: 0,
        ContentKey: 0uL,
        TopologyKey: 0uL,
        Dirty: true,
        RetentionState: SceneChunkRetentionState.ExactLeafHit,
      }
      chunkCount = NextCount(chunkCount)
      drawRefCount = NextCount(drawRefCount)
      chunkOperations = chunkOperations + 1uL
      return chunk
    }

  internal func BeginChunk(ownerId uint64, version uint64, bounds ConservativeBounds, dirty bool) int32 {
    if activeChunk >= 0 {
      throw InvalidOperationException("SceneFrame has an open chunk")
    }
    if ownerId == 0uL {
      throw ArgumentOutOfRangeException("ownerId")
    }
    if version == 0uL {
      throw ArgumentOutOfRangeException("version")
    }
    Grow[SceneChunk](&chunks, chunkCount, NextCount(chunkCount))
    let index = chunkCount
    chunks[index] = SceneChunk{
      OwnerId: ownerId,
      Version: version,
      Bounds: bounds,
      FirstDraw: drawRefCount,
      DrawCount: 0,
      FirstResource: resourceRefCount,
      ResourceCount: 0,
      Dirty: dirty,
      RetentionState: SceneChunkRetentionState.Generic,
    }
    chunkCount = NextCount(chunkCount)
    activeChunk = index
    chunkOperations = chunkOperations + 1uL
    return index
  }

  internal func EndChunk() {
    if activeChunk < 0 || activeChunk >= chunkCount {
      throw InvalidOperationException("SceneFrame has no open chunk")
    }
    let completedChunk = activeChunk
    let chunk = chunks[completedChunk]
    chunks[completedChunk] = SceneChunk{
      OwnerId: chunk.OwnerId,
      Version: chunk.Version,
      Bounds: chunk.Bounds,
      FirstDraw: chunk.FirstDraw,
      DrawCount: drawRefCount - chunk.FirstDraw,
      FirstResource: chunk.FirstResource,
      ResourceCount: resourceRefCount - chunk.FirstResource,
      ContentKey: 0uL,
      TopologyKey: 0uL,
      Dirty: chunk.Dirty,
      RetentionState: chunk.RetentionState,
    }
    activeChunk = -1
    let finalized = chunks[completedChunk]
    chunks[completedChunk] = SceneChunk{
      OwnerId: finalized.OwnerId,
      Version: finalized.Version,
      Bounds: finalized.Bounds,
      FirstDraw: finalized.FirstDraw,
      DrawCount: finalized.DrawCount,
      FirstResource: finalized.FirstResource,
      ResourceCount: finalized.ResourceCount,
      ContentKey: chunk.RetentionState == SceneChunkRetentionState.ExactLeafHit
      ? 0uL : ChunkContentDigest(completedChunk),
      TopologyKey: chunk.RetentionState == SceneChunkRetentionState.ExactLeafHit
      ? 0uL : ChunkTopologyDigest(completedChunk),
      Dirty: finalized.Dirty,
      RetentionState: finalized.RetentionState,
    }
  }

  internal func AddResourceReference(value ResourceId) int32 {
    RequireOpenChunk()
    if !value.IsValid {
      throw ArgumentOutOfRangeException("value")
    }
    return AppendResourceReference(value)
  }

  internal func AddSolidBox(value SolidBoxRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&solidBoxes, &solidBoxCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.SolidBox, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddRoundedBox(value RoundedBoxRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&roundedBoxes, &roundedBoxCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.RoundedBox, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AppendRetainedSolidLeaf(ownerId uint64, version uint64,
    bounds ConservativeBounds, value SolidBoxRecord, exactHit bool) int32{
      if exactHit {
        let retained = TryAppendRetainedPrimitiveSpan(ownerId, version, bounds,
          SceneDrawKind.SolidBox, solidBoxCount)
        if retained >= 0 {
          solidBoxCount = NextCount(solidBoxCount)
          return retained
        }
      }
      let chunk = BeginChunk(ownerId, version, bounds, true)
      AddSolidBox(value)
      chunks[chunk].RetentionState = exactHit ? SceneChunkRetentionState.ExactLeafHit : SceneChunkRetentionState.ExactLeafRebuild
      EndChunk()
      return chunk
    }

  internal func AppendRetainedRoundedLeaf(ownerId uint64, version uint64,
    bounds ConservativeBounds, value RoundedBoxRecord, exactHit bool) int32{
      if exactHit {
        let retained = TryAppendRetainedPrimitiveSpan(ownerId, version, bounds,
          SceneDrawKind.RoundedBox, roundedBoxCount)
        if retained >= 0 {
          roundedBoxCount = NextCount(roundedBoxCount)
          return retained
        }
      }
      let chunk = BeginChunk(ownerId, version, bounds, true)
      AddRoundedBox(value)
      chunks[chunk].RetentionState = exactHit ? SceneChunkRetentionState.ExactLeafHit : SceneChunkRetentionState.ExactLeafRebuild
      EndChunk()
      return chunk
    }

  internal func AppendRetainedBorderLeaf(ownerId uint64, version uint64,
    bounds ConservativeBounds, value PerEdgeBorderRecord, exactHit bool) int32{
      if exactHit {
        let retained = TryAppendRetainedPrimitiveSpan(ownerId, version, bounds,
          SceneDrawKind.PerEdgeBorder, perEdgeBorderCount)
        if retained >= 0 {
          perEdgeBorderCount = NextCount(perEdgeBorderCount)
          return retained
        }
      }
      let chunk = BeginChunk(ownerId, version, bounds, true)
      AddPerEdgeBorder(value)
      chunks[chunk].RetentionState = exactHit ? SceneChunkRetentionState.ExactLeafHit : SceneChunkRetentionState.ExactLeafRebuild
      EndChunk()
      return chunk
    }

  internal func AddPerEdgeBorder(value PerEdgeBorderRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&perEdgeBorders, &perEdgeBorderCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.PerEdgeBorder, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddGradientStop(value GradientStopRecord) int32 {
    RequireOpenChunk()
    let index = AppendRecord(&gradientStops, &gradientStopCount, value)
    return index
  }

  internal func AddLinearGradient(value LinearGradientRecord) int32 {
    RequireOpenChunk()
    ValidateGradientRange(value.StopStart, value.StopCount)
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&linearGradients, &linearGradientCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.LinearGradient, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddRadialGradient(value RadialGradientRecord) int32 {
    RequireOpenChunk()
    ValidateGradientRange(value.StopStart, value.StopCount)
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&radialGradients, &radialGradientCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.RadialGradient, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddCachedImage(value CachedImageRefRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&cachedImages, &cachedImageCount, value)
    AppendResourceIfValid(value.ImageId)
    AppendResourceIfValid(value.SamplerId)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.CachedImage, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddCachedTextSegment(value CachedTextSegmentRefRecord) int32 {
    RequireOpenChunk()
    guard let segment = value.Segment else {
      throw ArgumentNullException("segment")
    }
    if value.SegmentId == 0uL || value.SegmentId != segment.Id
      || value.SegmentVersion == 0uL || value.SegmentVersion != segment.Version
      || value.GlyphCount <= 0 || value.GlyphCount != segment.GlyphCount
      || value.ClipChainId < 0 || value.ClipChainId != segment.ClipChainId
      || value.FirstInstance != -1
      || segment.AtlasGeneration == 0uL
      || segment.RecordCount != segment.GlyphCount
      || segment.RecordCount <= 0 || segment.RecordCount > segment.Records.Length
      || segment.GlyphResourceCount != segment.GlyphCount
      || segment.GlyphResourceCount > segment.GlyphResources.Length
      || segment.GlyphAtlasTexelOffsets.Length < segment.GlyphCount
      || segment.GlyphAtlasTexelCounts.Length < segment.GlyphCount
      || segment.GlyphEffectAtlasTexelOffsets.Length < segment.GlyphCount
      || segment.GlyphEffectAtlasTexelCounts.Length < segment.GlyphCount
      || segment.RunCount <= 0 || segment.RunCount > segment.Runs.Length{
        throw ArgumentException("cached text segment is invalid")
      }
    ValidateTextBounds(value.Bounds)
    ValidateTextBounds(segment.Bounds)
    if value.Bounds.X != segment.Bounds.X || value.Bounds.Y != segment.Bounds.Y
      || value.Bounds.Width != segment.Bounds.Width
      || value.Bounds.Height != segment.Bounds.Height{
        throw ArgumentException("cached text segment bounds do not match")
      }
    var glyphIndex int32 = 0
    while glyphIndex < segment.GlyphCount {
      let glyphResource = segment.GlyphResources[glyphIndex]
      if !glyphResource.IsValid || glyphResource.Kind != SceneResourceKind.GlyphRun {
        throw ArgumentException("cached text segment glyph resource is invalid")
      }
      ValidateTextInstance(segment.Records[glyphIndex], value.ClipChainId)
      AppendResourceReference(glyphResource)
      glyphIndex = glyphIndex + 1
    }
    var runIndex int32 = 0
    var expectedFirst int32 = 0
    while runIndex < segment.RunCount {
      let run = segment.Runs[runIndex]
      if run.FirstInstance != expectedFirst
        || run.InstanceCount <= 0
        || run.InstanceCount > segment.GlyphCount - expectedFirst
        || !run.AtlasId.IsValid || run.AtlasId.Kind != SceneResourceKind.Atlas
        || run.PipelineKind > 1u {
          throw ArgumentException("cached text segment run is invalid")
        }
      expectedFirst = expectedFirst + run.InstanceCount
      AppendResourceReference(run.AtlasId)
      runIndex = runIndex + 1
    }
    if expectedFirst != segment.GlyphCount {
      throw ArgumentException("cached text segment run count is invalid")
    }
    let index = AppendRecord(&cachedTextSegments, &cachedTextSegmentCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.CachedTextSegment, Index: index,
      Flags: 0u, ClipChainId: value.ClipChainId })
    return index
  }

  internal func AddAnalyticPathBand(value AnalyticPathBandRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    if value.AtlasWordCount == 0u {
      throw ArgumentOutOfRangeException("atlas word count")
    }
    if value.ScaleX == 0.0F || value.ScaleY == 0.0F {
      throw ArgumentOutOfRangeException("path scale")
    }
    let index = AppendRecord(&analyticPathBands, &analyticPathBandCount, value)
    AppendResourceIfValid(value.PathId)
    AppendResourceIfValid(value.AtlasId)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.AnalyticPathBand, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddTransform(value TransformRecord) int32 {
    RequireOpenChunk()
    ValidateTransformParentIndex(value.ParentIndex)
    let index = AppendRecord(&transforms, &transformCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.Transform, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddRectClipBegin(value RectClipRecord) int32 -> AddRectClip(value, true)

  internal func AddRectClipEnd(value RectClipRecord) int32 -> AddRectClip(value, false)

  internal func AddClipMask(value ClipMaskRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    if value.AtlasWordCount == 0u || !value.PathId.IsValid || !value.AtlasId.IsValid {
      throw ArgumentOutOfRangeException("clip mask resources")
    }
    let index = AppendRecord(&clipMasks, &clipMaskCount, value)
    AppendResourceIfValid(value.PathId)
    AppendResourceIfValid(value.AtlasId)
    return index
  }

  internal func AddClipChain(value ClipChainRecord) int32 {
    RequireOpenChunk()
    ValidateClipChainParentIndex(value.ParentIndex)
    if value.Depth <= 0 || value.Depth > 8
      || value.MaskIndex < 0 || value.MaskIndex >= clipMaskCount{
        throw ArgumentOutOfRangeException("clip chain")
      }
    let index = AppendRecord(&clipChains, &clipChainCount, value)
    return index
  }

  internal func AddZeroClipChain(parentIndex int32, stableId uint64, contentKey uint64) int32 {
    RequireOpenChunk()
    ValidateClipChainParentIndex(parentIndex)
    let parentDepth = parentIndex == 0 ? 0 : clipChains[parentIndex].Depth
    if parentDepth >= 8 {
      throw ArgumentOutOfRangeException("clip chain depth")
    }
    Grow[ClipChainRecord](&clipChains, clipChainCount, NextCount(clipChainCount))
    let index = clipChainCount
    clipChains[index] = ClipChainRecord{
      StableId: stableId,
      ParentIndex: parentIndex,
      MaskIndex: -1,
      Depth: parentDepth + 1,
      Flags: uint32(SceneClipChainFlags.Zero),
      ContentKey: contentKey,
    }
    clipChainCount = NextCount(clipChainCount)
    recordOperations = recordOperations + 1uL
    return index
  }

  internal func SetActiveClipChain(value int32) {
    ValidateClipChainIndex(value)
    activeClipChainId = value
  }

  internal func AddShadow(value ShadowRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    if value.MaskIndex < -1 || value.MaskIndex >= clipMaskCount {
      throw ArgumentOutOfRangeException("shadow mask index")
    }
    let index = AppendRecord(&shadows, &shadowCount, value)
    AppendResourceIfValid(value.MaskId)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.Shadow, Index: index, Flags: 0u,
      ClipChainId: activeClipChainId })
    return index
  }

  internal func AddUnderline(value UnderlineRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&underlines, &underlineCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.Underline, Index: index, Flags: 0u, ClipChainId: 0 })
    return index
  }

  internal func AddLava(value LavaRecord) int32 {
    RequireOpenChunk()
    ValidateTransformIndex(value.TransformIndex)
    let index = AppendRecord(&lavas, &lavaCount, value)
    AppendDrawRef(DrawRef{ Kind: SceneDrawKind.Lava, Index: index, Flags: 0u,
      ClipChainId: 0 })
    return index
  }

  internal func AddLayerBegin(value LayerRecord) int32 -> AddLayer(value, true)

  internal func AddLayerEnd(value LayerRecord) int32 -> AddLayer(value, false)

  internal func AddShaderEffect(value ShaderEffectSnapshot) int32 {
    RequireOpenChunk()
    if value.Program == nil || value.ProgramId == 0uL || value.Version == 0uL {
      ReleaseShaderEffectDataCaptures(value)
      throw ArgumentException("shader effect snapshot is invalid")
    }
    try {
      Grow[ShaderEffectRecord](&shaderEffects, shaderEffectCount, NextCount(shaderEffectCount))
    } catch (error Exception) {
      ReleaseShaderEffectDataCaptures(value)
      throw error
    }
    let data = PackShaderEffectData(value)
    let index = shaderEffectCount
    shaderEffects[index] = ShaderEffectRecord{
      Program: value.Program,
      ProgramId: value.ProgramId,
      Version: value.Version,
      SamplesBackdrop: value.SamplesBackdrop,
      ElapsedSeconds: value.ElapsedSeconds,
      Parameter0: value.Parameter0,
      Parameter1: value.Parameter1,
      Parameter2: value.Parameter2,
      Parameter3: value.Parameter3,
      Parameter4: value.Parameter4,
      Parameter5: value.Parameter5,
      Parameter6: value.Parameter6,
      Parameter7: value.Parameter7,
      DataWordOffset: data.WordOffset,
      DataByteCount: data.ByteCount,
    }
    shaderEffectCount = NextCount(shaderEffectCount)
    recordOperations = recordOperations + 1uL
    return index
  }

  private func Grow[T any](ref values []T, count int32, required int32) {
    if required <= values.Length { return }
    let expanded = [GrowthCapacity(values.Length, required)]T
    Array.Copy(values, expanded, count)
    values = expanded
    growthOperations = growthOperations + 1uL
  }

  private func AppendRecord[T any](ref values []T, ref count int32, value T) int32 {
    let next = NextCount(count)
    Grow[T](&values, count, next)
    let index = count
    values[index] = value
    count = next
    recordOperations = recordOperations + 1uL
    return index
  }

  private func ValidateTextBounds(value ConservativeBounds) {
    if Single.IsNaN(value.X) || Single.IsInfinity(value.X)
      || Single.IsNaN(value.Y) || Single.IsInfinity(value.Y)
      || Single.IsNaN(value.Width) || Single.IsInfinity(value.Width)
      || Single.IsNaN(value.Height) || Single.IsInfinity(value.Height)
      || value.Width <= 0.0F || value.Height <= 0.0F {
        throw ArgumentException("cached text segment bounds are invalid")
      }
  }

  private func ValidateTextInstance(
    value HbGpuTextInstanceRecord,
    clipChainId int32) {
      if Single.IsNaN(value.transform_m00) || Single.IsInfinity(value.transform_m00)
        || Single.IsNaN(value.transform_m01) || Single.IsInfinity(value.transform_m01)
        || Single.IsNaN(value.transform_m02) || Single.IsInfinity(value.transform_m02)
        || Single.IsNaN(value.transform_m03) || Single.IsInfinity(value.transform_m03)
        || Single.IsNaN(value.transform_m10) || Single.IsInfinity(value.transform_m10)
        || Single.IsNaN(value.transform_m11) || Single.IsInfinity(value.transform_m11)
        || Single.IsNaN(value.transform_m12) || Single.IsInfinity(value.transform_m12)
        || Single.IsNaN(value.transform_m13) || Single.IsInfinity(value.transform_m13)
        || Single.IsNaN(value.transform_m20) || Single.IsInfinity(value.transform_m20)
        || Single.IsNaN(value.transform_m21) || Single.IsInfinity(value.transform_m21)
        || Single.IsNaN(value.transform_m22) || Single.IsInfinity(value.transform_m22)
        || Single.IsNaN(value.transform_m23) || Single.IsInfinity(value.transform_m23)
        || Single.IsNaN(value.transform_m30) || Single.IsInfinity(value.transform_m30)
        || Single.IsNaN(value.transform_m31) || Single.IsInfinity(value.transform_m31)
        || Single.IsNaN(value.transform_m32) || Single.IsInfinity(value.transform_m32)
        || Single.IsNaN(value.transform_m33) || Single.IsInfinity(value.transform_m33) {
          throw ArgumentException("cached text segment transform is invalid")
        }
      if value.glyphBounds_x >= value.glyphBounds_z
        || value.glyphBounds_y >= value.glyphBounds_w
        || Single.IsNaN(value.glyphBounds_x)
        || Single.IsInfinity(value.glyphBounds_x)
        || Single.IsNaN(value.glyphBounds_y)
        || Single.IsInfinity(value.glyphBounds_y)
        || Single.IsNaN(value.glyphBounds_z)
        || Single.IsInfinity(value.glyphBounds_z)
        || Single.IsNaN(value.glyphBounds_w)
        || Single.IsInfinity(value.glyphBounds_w)
        || value.glyphInput_y > 3u
        || value.glyphInput_z != uint32(clipChainId)
        || Single.IsNaN(value.foreground_x)
        || Single.IsInfinity(value.foreground_x)
        || Single.IsNaN(value.foreground_y)
        || Single.IsInfinity(value.foreground_y)
        || Single.IsNaN(value.foreground_z)
        || Single.IsInfinity(value.foreground_z)
        || Single.IsNaN(value.foreground_w)
        || Single.IsInfinity(value.foreground_w)
        || value.foreground_w < 0.0F || value.foreground_w > 1.0F
        || Single.IsNaN(BitConverter.Int32BitsToSingle(int32(value.glyphInput_w)))
        || Single.IsInfinity(BitConverter.Int32BitsToSingle(int32(value.glyphInput_w)))
        || BitConverter.Int32BitsToSingle(int32(value.glyphInput_w)) < 0.0F {
          throw ArgumentException("cached text segment instance is invalid")
        }
    }

}
