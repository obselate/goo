package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal unsafe sealed partial class VulkanTextScene {
  internal const MaximumStrokeWidth float32 = 4.0F
  private const TextEffectFill uint32 = 0u
  private const TextEffectShadow uint32 = 1u
  private const TextEffectStroke uint32 = 2u
  private const TextEffectBlurShadow uint32 = 3u

  private let atlasSet VulkanTextAtlasSet
  private let states []VulkanTextSceneAtlasState?
  private let glyphs Dictionary[VulkanTextAtlasGlyphKey, VulkanTextAtlasGlyph]
  private let glyphWorkspace VulkanTextProviderWorkspace
  private let buildWorkspace VulkanTextSegmentBuildWorkspace
  private let effectGlyphWorkspace VulkanTextProviderWorkspace
  private let entryMetrics TextMetrics
  private let srgbToLinear []float32
  private let activeAtlasUse []bool
  private let nodeSegments ConditionalWeakTable[Node, VulkanTextNodeSegmentCache]
  private var activeNodeSegments VulkanTextNodeSegmentCache?
  private var activeSegmentReuse bool
  private var nextSegmentId uint64
  private var stateCount int32
  private var capacityExhausted bool
  private var redrawRequired bool
  private var colorEffectSkipped bool
  private var colorGlyphFallback bool
  private var publicationPending bool
  private var emissionFailed bool
  private var completedGlobalSubmissionSerial uint64
  private var textLayoutRequestCount int32

  internal prop ResourceGeneration uint64{ get -> atlasSet.Generation }
  internal prop RedrawRequired bool{ get -> redrawRequired }
  internal prop TextLayoutRequestCount int32{ get -> textLayoutRequestCount }

  internal func ConsumeColorEffectSkipped() bool {
    let result = colorEffectSkipped
    colorEffectSkipped = false
    return result
  }

  internal func ConsumeColorGlyphFallback() bool {
    let result = colorGlyphFallback
    colorGlyphFallback = false
    return result
  }

  internal func ConsumePublicationPending() bool {
    let result = publicationPending && !emissionFailed
    publicationPending = false
    emissionFailed = false
    return result
  }

  internal init(nativeAtlases VulkanTextAtlasSet) {
    if nativeAtlases == nil {
      throw ArgumentNullException("nativeAtlases")
    }
    atlasSet = nativeAtlases
    states = [nativeAtlases.AtlasSlotCapacity]VulkanTextSceneAtlasState?
    glyphs = Dictionary[VulkanTextAtlasGlyphKey, VulkanTextAtlasGlyph]()
    activeAtlasUse = [nativeAtlases.AtlasSlotCapacity]bool
    nodeSegments = ConditionalWeakTable[Node, VulkanTextNodeSegmentCache]()
    nextSegmentId = 1uL
    let atlasBytes = nativeAtlases.AtlasAt(0).ByteSize
    if atlasBytes > uint64(Int32.MaxValue) {
      throw ArgumentOutOfRangeException("nativeAtlases")
    }
    glyphWorkspace = VulkanTextProviderWorkspace([int32(atlasBytes)]uint8)
    effectGlyphWorkspace = VulkanTextProviderWorkspace([int32(atlasBytes)]uint8)
    buildWorkspace = VulkanTextSegmentBuildWorkspace(4)
    entryMetrics = TextMetrics()
    srgbToLinear = [256]float32
    var srgbIndex int32 = 0
    while srgbIndex < srgbToLinear.Length {
      let value = float32(srgbIndex) / 255.0F
      srgbToLinear[srgbIndex] = if value <= 0.04045F {
        value / 12.92F
      } else {
        MathF.Pow((value + 0.055F) / 1.055F, 2.4F)
      }
      srgbIndex = srgbIndex + 1
    }
    EnsureAtlasStates()
  }

  internal func BeginCompile(completedSerial uint64) {
    redrawRequired = false
    capacityExhausted = false
    colorEffectSkipped = false
    colorGlyphFallback = false
    emissionFailed = false
    publicationPending = false
    completedGlobalSubmissionSerial = completedSerial
    textLayoutRequestCount = 0
    Array.Clear(activeAtlasUse, 0, activeAtlasUse.Length)
  }

  internal func ResetCompileCounters() {
    textLayoutRequestCount = 0
  }

  internal func PublishCompletedUploads() {
    EnsureAtlasStates()
    var stateIndex int32 = 0
    while stateIndex < states.Length {
      if atlasSet.IsActive(stateIndex) {
        guard let state = states[stateIndex] else {
          throw InvalidOperationException("Vulkan text atlas state is not resident")
        }
        if state.UploadQueued && state.Atlas.CompletedUploadSequence
        >= state.QueuedUploadSequence{
          state.PublishedBytePrefix = state.QueuedBytePrefix
          state.QueuedBytePrefix = state.PublishedBytePrefix
          state.QueuedUploadSequence = 0uL
          state.UploadQueued = false
        }
      }
      stateIndex = stateIndex + 1
    }
  }

  internal func PrepareUpload() {
    EnsureAtlasStates()
    var stateIndex int32 = 0
    while stateIndex < states.Length {
      if atlasSet.IsActive(stateIndex) {
        guard let state = states[stateIndex] else {
          throw InvalidOperationException("Vulkan text atlas state is not resident")
        }
        if !state.Atlas.UploadPending {
          if state.NextByteOffset < state.PublishedBytePrefix {
            throw InvalidOperationException("Vulkan text atlas published prefix is invalid")
          }
          if state.NextByteOffset != state.PublishedBytePrefix {
            let uploadByteOffset = state.PublishedBytePrefix
            let uploadByteCount = state.NextByteOffset - uploadByteOffset
            fixed source * uint8 = state.Bytes{
              if !state.Atlas.QueueUpload(source, uint64(uploadByteOffset),
                uint64(uploadByteCount)) {
                  throw InvalidOperationException("Vulkan text atlas upload was not queued")
                }
            }
            state.QueuedBytePrefix = state.NextByteOffset
            state.QueuedUploadSequence = state.Atlas.UploadSequence
            state.UploadQueued = true
          }
        }
      }
      stateIndex = stateIndex + 1
    }
  }

  internal func RestoreUpload() {
    var stateIndex int32 = 0
    while stateIndex < states.Length {
      if atlasSet.IsActive(stateIndex) {
        guard let state = states[stateIndex] else {
          throw InvalidOperationException("Vulkan text atlas state is not resident")
        }
        let stats = state.Atlas.Stats
        if state.UploadQueued && !stats.UploadSubmitted {
          state.QueuedBytePrefix = state.PublishedBytePrefix
          state.QueuedUploadSequence = 0uL
          state.UploadQueued = false
        }
      }
      stateIndex = stateIndex + 1
    }
  }

  internal func Emit(
    frame SceneFrame,
    node Node,
    opacity float32,
    parentTransformIndex int32) bool{
      var complete bool
      return Emit(frame, node, opacity, parentTransformIndex, out complete)
    }

  internal func Emit(
    frame SceneFrame,
    node Node,
    opacity float32,
    parentTransformIndex int32,
    out complete bool) bool{
      complete = true
      if node.Kind == NodeKind.Text || node.Kind == NodeKind.Entry
        || node.Kind == NodeKind.Editor{
          let cache = GetNodeSegmentCache(node)
          cache.BeginBuild()
          activeNodeSegments = cache
          activeSegmentReuse = true
        }
      switch node.Kind {
        case NodeKind.Text {
          return EmitText(frame, node, opacity, parentTransformIndex, ref complete)
        }
        case NodeKind.Entry {
          return EmitEntry(frame, node, opacity, parentTransformIndex)
        }
        case NodeKind.Editor {
          return EmitEditorContent(frame, node, opacity, parentTransformIndex)
        }
        case _ { return true }
      }
    }

  internal func IsAtlasRangeResident(atlasId ResourceId, byteRangeEnd uint64) bool {
    let index = atlasSet.FindIndex(atlasId)
    if index < 0 || index >= states.Length {
      return false
    }
    guard let state = states[index] else {
      return false
    }
    return SameIdentity(state.Identity, atlasId)
      && byteRangeEnd <= uint64(state.PublishedBytePrefix)
  }

  internal func TryMarkAtlasActive(atlasId ResourceId) bool {
    let index = atlasSet.FindIndex(atlasId)
    if index < 0 || index >= activeAtlasUse.Length {
      return false
    }
    activeAtlasUse[index] = true
    return true
  }

  internal func TryGetCachedTextPaintBounds(
    node Node,
    owner VulkanSceneOwnerId,
    nodeBounds ConservativeBounds,
    out bounds ConservativeBounds) bool{
      if owner.CachedTextPaintLayout != nil
        && owner.CachedTextPaintLayout!!.FontRegistryGeneration == FontRegistry.Generation
        && Object.ReferenceEquals(owner.CachedTextPaintContent, node.Content)
        && owner.CachedTextPaintVersion == node.ScenePaintVersion
        && owner.CachedTextPaintNodeBounds.X == nodeBounds.X
        && owner.CachedTextPaintNodeBounds.Y == nodeBounds.Y
        && owner.CachedTextPaintNodeBounds.Width == nodeBounds.Width
        && owner.CachedTextPaintNodeBounds.Height == nodeBounds.Height{
          bounds = owner.CachedTextPaintBounds
          return true
        }
      bounds = ConservativeBounds{}
      let contentX = BoxGeometry.ContentLeft(node)
      let contentY = BoxGeometry.ContentTop(node)
      let contentWidth = BoxGeometry.ContentWidth(node)
      let lineHeight = TextLayouts.resolvedLineHeight(node)
      let layout = RequestTextLayout(node, contentWidth)
      if layout.Rich != nil { return false }
      if Object.ReferenceEquals(owner.CachedTextPaintLayout, layout)
        && owner.CachedTextPaintContentX == contentX
        && owner.CachedTextPaintContentY == contentY
        && owner.CachedTextPaintContentWidth == contentWidth
        && owner.CachedTextPaintLineHeight == lineHeight
        && owner.CachedTextPaintAlign == node.TextAlign{
          bounds = owner.CachedTextPaintBounds
          StoreCachedTextPaintFingerprint(owner, node, nodeBounds)
          return true
        }
      let natural = layout.Descent - layout.Ascent
      let leading = (lineHeight - natural) * 0.5F
      var hasBounds = false
      var lineIndex int32 = 0
      while lineIndex < layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        guard let shape = line.Shape else {
          lineIndex = lineIndex + 1
          continue
        }
        let baseline = contentY + float32(lineIndex) * lineHeight + leading - layout.Ascent
        let lineX = contentX + TextLayouts.lineOffset(node, line, contentWidth)
        let runs = shape.Runs
        var runIndex int32 = 0
        while runIndex < runs.Count {
          let run = runs[runIndex]
          var glyphIndex int32 = 0
          while glyphIndex < run.Glyphs.Length {
            let glyphId = run.Glyphs[glyphIndex]
            if glyphId != 0u {
              guard let glyph = CachedGlyph(run, glyphId) else { return false }
              if !CanRender(glyph) { return false }
              if glyph.ByteLength != 0u {
                let extents = glyph.Extents
                let minX = float32(extents.XBearing)
                let minY = float32(extents.YBearing + extents.Height)
                let maxX = float32(extents.XBearing + extents.Width)
                let maxY = float32(extents.YBearing)
                if maxX <= minX || maxY <= minY { return false }
                if glyph.Scale <= 0 { return false }
                let scale = layout.FontSize / float32(glyph.Scale)
                if scale <= 0.0F || !FiniteValue(scale) { return false }
                let point = run.Points[glyphIndex]
                let glyphMinX = lineX + point.X + minX * scale
                let glyphMinY = baseline - point.Y - maxY * scale
                let glyphMaxX = lineX + point.X + maxX * scale
                let glyphMaxY = baseline - point.Y - minY * scale
                if !FiniteValue(glyphMinX) || !FiniteValue(glyphMinY)
                  || !FiniteValue(glyphMaxX) || !FiniteValue(glyphMaxY) {
                    return false
                  }
                let value = ConservativeBounds{
                  X: glyphMinX,
                  Y: glyphMinY,
                  Width: glyphMaxX - glyphMinX,
                  Height: glyphMaxY - glyphMinY,
                }
                if value.IsEmpty { return false }
                if !hasBounds {
                  bounds = value
                  hasBounds = true
                } else {
                  let left = bounds.X < value.X ? bounds.X : value.X
                  let top = bounds.Y < value.Y ? bounds.Y : value.Y
                  let right = bounds.Right > value.Right ? bounds.Right : value.Right
                  let bottom = bounds.Bottom > value.Bottom ? bounds.Bottom : value.Bottom
                  bounds = ConservativeBounds{
                    X: left,
                    Y: top,
                    Width: right - left,
                    Height: bottom - top,
                  }
                }
              }
            }
            glyphIndex = glyphIndex + 1
          }
          runIndex = runIndex + 1
        }
        lineIndex = lineIndex + 1
      }
      owner.CachedTextPaintLayout = layout
      owner.CachedTextPaintBounds = bounds
      owner.CachedTextPaintContentX = contentX
      owner.CachedTextPaintContentY = contentY
      owner.CachedTextPaintContentWidth = contentWidth
      owner.CachedTextPaintLineHeight = lineHeight
      owner.CachedTextPaintAlign = node.TextAlign
      StoreCachedTextPaintFingerprint(owner, node, nodeBounds)
      return true
    }
  private func RequestTextLayout(node Node, width float32) TextLayout {
    textLayoutRequestCount = textLayoutRequestCount + 1
    return TextLayouts.For(node, width)
  }

  private func StoreCachedTextPaintFingerprint(
    owner VulkanSceneOwnerId,
    node Node,
    nodeBounds ConservativeBounds) {
      owner.CachedTextPaintContent = node.Content
      owner.CachedTextPaintVersion = node.ScenePaintVersion
      owner.CachedTextPaintNodeBounds = nodeBounds
    }

}
