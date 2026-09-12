package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices

internal struct VulkanTextAtlasGlyphKey : IEquatable[VulkanTextAtlasGlyphKey] {
  internal prop Family string{ get; init; }
  internal prop Provider VulkanTextProvider{ get; init; }
  internal prop GlyphId uint32{ get; init; }

  internal init(family string, provider VulkanTextProvider, glyphId uint32) {
    Family = family
    Provider = provider
    GlyphId = glyphId
  }

  public func Equals(other VulkanTextAtlasGlyphKey) bool -> String.Equals(Family, other.Family, StringComparison.Ordinal)
    && Object.ReferenceEquals(Provider, other.Provider)
    && GlyphId == other.GlyphId

  public override func Equals(value object?) bool -> switch value {
    case other is VulkanTextAtlasGlyphKey: Equals(other)
    case _: false
  }

  public override func GetHashCode() int32 {
    let familyHash = Family == nil ? 0 : StringComparer.Ordinal.GetHashCode(Family)
    return HashCode.Combine(familyHash,
      RuntimeHelpers.GetHashCode(Provider), int32(GlyphId))
  }
}

internal sealed class VulkanTextSceneAtlasState {
  private const InitialByteCapacity int32 = 4096
  private const InitialKeyCapacity int32 = 64
  internal var Atlas VulkanTextAtlas
  internal var Identity ResourceId
  internal var Bytes []uint8
  internal var Keys []VulkanTextAtlasGlyphKey
  internal var NextByteOffset uint32
  internal var PublishedBytePrefix uint32
  internal var QueuedBytePrefix uint32
  internal var QueuedUploadSequence uint64
  internal var UploadQueued bool
  internal var KeyCount int32

  internal init(nativeAtlas VulkanTextAtlas, identity ResourceId) {
    Atlas = nativeAtlas
    Identity = identity
    if nativeAtlas.ByteSize > uint64(Int32.MaxValue) {
      throw ArgumentOutOfRangeException("nativeAtlas")
    }
    var byteCapacity = InitialByteCapacity
    if nativeAtlas.ByteSize < uint64(byteCapacity) {
      byteCapacity = int32(nativeAtlas.ByteSize)
    }
    Bytes = [byteCapacity]uint8
    var keyCapacity = InitialKeyCapacity
    let maxKeyCapacity = int32(nativeAtlas.ByteSize / 8uL)
    if maxKeyCapacity < keyCapacity {
      keyCapacity = maxKeyCapacity
    }
    Keys = [keyCapacity]VulkanTextAtlasGlyphKey
  }

  internal func Reset(nativeAtlas VulkanTextAtlas, identity ResourceId) {
    Atlas = nativeAtlas
    Identity = identity
    NextByteOffset = 0u
    PublishedBytePrefix = 0u
    QueuedBytePrefix = 0u
    QueuedUploadSequence = 0uL
    UploadQueued = false
    KeyCount = 0
  }

  internal func EnsureByteCapacity(required uint32) {
    if required <= uint32(Bytes.Length) {
      return
    }
    if uint64(required) > Atlas.ByteSize || required > uint32(Int32.MaxValue) {
      throw InvalidOperationException("Vulkan text atlas byte range exceeds managed array limits")
    }
    var capacity = Bytes.Length
    if capacity == 0 {
      capacity = InitialByteCapacity
    }
    while uint64(capacity) < uint64(required) {
      if capacity > Int32.MaxValue / 2 {
        capacity = int32(required)
      } else {
        capacity = capacity * 2
      }
    }
    if uint64(capacity) > Atlas.ByteSize {
      capacity = int32(Atlas.ByteSize)
    }
    let next = [capacity]uint8
    Array.Copy(Bytes, next, int32(NextByteOffset))
    Bytes = next
  }

  internal func EnsureKeyCapacity(required int32) {
    if required <= Keys.Length {
      return
    }
    let maxCapacity = int32(Atlas.ByteSize / 8uL)
    if required > maxCapacity {
      throw InvalidOperationException("Vulkan text atlas glyph key capacity is exhausted")
    }
    var capacity = Keys.Length
    if capacity == 0 {
      capacity = InitialKeyCapacity
    }
    while capacity < required {
      if capacity > Int32.MaxValue / 2 {
        capacity = required
      } else {
        capacity = capacity * 2
      }
    }
    if capacity > maxCapacity {
      capacity = maxCapacity
    }
    let next = [capacity]VulkanTextAtlasGlyphKey
    Array.Copy(Keys, next, KeyCount)
    Keys = next
  }

  internal func AddKey(key VulkanTextAtlasGlyphKey) {
    EnsureKeyCapacity(KeyCount + 1)
    Keys[KeyCount] = key
    KeyCount = KeyCount + 1
  }
}

internal sealed class VulkanTextAtlasGlyph {
  internal prop AtlasId ResourceId{ get; init; }
  internal prop ByteOffset uint32{ get; init; }
  internal prop ByteLength uint32{ get; init; }
  internal prop EffectByteOffset uint32{ get; init; }
  internal prop EffectByteLength uint32{ get; init; }
  internal prop Scale int32{ get; init; }
  internal prop Extents VulkanTextGlyphExtents{ get; init; }
  internal prop EffectExtents VulkanTextGlyphExtents{ get; init; }
  internal prop RenderMode uint32{ get; init; }

  internal init() {
  }
}

internal sealed class VulkanTextNodeSegmentCache {
  internal var Segments []VulkanRetainedTextSegment?
  internal var Cursor int32

  internal init() {
    Segments = [4]VulkanRetainedTextSegment?
  }

  internal func BeginBuild() {
    Cursor = 0
  }

  internal func EnsureCapacity(required int32) {
    if required <= Segments.Length { return }
    var next = Segments.Length
    while next < required {
      if next > Int32.MaxValue / 2 {
        next = required
        break
      }
      next = next * 2
    }
    let expanded = [next]VulkanRetainedTextSegment?
    Array.Copy(Segments, expanded, Segments.Length)
    Segments = expanded
  }
}

internal unsafe sealed class VulkanTextScene {
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
      let contentX = TextLayouts.ContentLeft(node)
      let contentY = TextLayouts.ContentTop(node)
      let contentWidth = TextLayouts.ContentWidth(node)
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

  private func EmitText(
    frame SceneFrame,
    node Node,
    opacity float32,
    parentTransformIndex int32,
    ref complete bool) bool{
      if opacity <= 0.0F { return true }
      let layout = RequestTextLayout(node, TextLayouts.ContentWidth(node))

      let contentX = TextLayouts.ContentLeft(node)
      let contentY = TextLayouts.ContentTop(node)
      let contentWidth = TextLayouts.ContentWidth(node)
      if let rich = layout.Rich {
        var result = true
        var lineY = contentY
        var lineIndex int32 = 0
        while lineIndex < rich.Lines.Count {
          let line = rich.Lines[lineIndex]
          let rtl = if let shape = layout.Lines[lineIndex].Shape {
            shape.RightToLeft
          } else { false }
          let lineX = contentX + TextLayouts.lineOffset(node, line.Width, rtl, contentWidth)
          let natural = line.Descent - line.Ascent
          let baseline = lineY + (line.Height - natural) * 0.5F - line.Ascent
          for run in line.Runs {
            guard let shape = run.Shape else { continue }
            if !EmitShapeWithStyle(frame, shape,
              run.Style.FontSize, lineX + run.X, baseline,
              run.Style.Color, opacity, parentTransformIndex,
              run.Style.StrokeWidth, run.Style.StrokeColor, run.Style.Shadows,
              ref complete) {
                result = false
                break
              }
            if run.Style.Color.A > 0.0F {
              AddRichDecorations(frame, run, lineX + run.X, baseline,
                PackedColor(run.Style.Color, opacity), parentTransformIndex)
            }
          }
          if !result { break }
          lineY = lineY + line.Height
          lineIndex = lineIndex + 1
        }
        return result
      }
      let lineHeight = TextLayouts.resolvedLineHeight(node)
      let natural = layout.Descent - layout.Ascent
      let leading = (lineHeight - natural) * 0.5F
      let color = PackedColor(node.Color, opacity)
      var result = true
      var lineIndex int32 = 0
      while lineIndex < layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        guard let shape = line.Shape else {
          lineIndex = lineIndex + 1
          continue
        }
        let baseline = contentY + float32(lineIndex) * lineHeight + leading - layout.Ascent
        let lineX = contentX + TextLayouts.lineOffset(node, line, contentWidth)
        if !EmitShapeWithStyle(frame, shape, layout.FontSize, lineX, baseline,
          node.Color, opacity, parentTransformIndex, node.TextStrokeWidth.Px,
          node.TextStrokeColor, node.TextShadows, ref complete) {
            result = false
            break
          }
        if node.Color.A > 0.0F {
          AddPlainDecorations(frame, shape, lineX, baseline, node.TextDecoration,
            color, parentTransformIndex)
        }
        lineIndex = lineIndex + 1
      }
      return result
    }

  private func AddPlainDecorations(
    frame SceneFrame,
    shape ShapedText,
    lineX float32,
    baseline float32,
    decoration TextDecoration,
    color uint32,
    transformIndex int32) {
      if decoration == TextDecoration.None { return }
      for run in shape.Runs {
        if !HasVisibleGlyph(run) { continue }
        let left = lineX + MathF.Min(run.VisualStart, run.VisualEnd)
        let right = lineX + MathF.Max(run.VisualStart, run.VisualEnd)
        AddDecorationRecords(frame, decoration, left, right, baseline,
          shape.Ascent, shape.Descent, color, transformIndex)
      }
    }

  private func AddRichDecorations(
    frame SceneFrame,
    run TextPaintRun,
    originX float32,
    baseline float32,
    color uint32,
    transformIndex int32) {
      let decoration = run.Style.Decoration
      if decoration == TextDecoration.None { return }
      guard let shape = run.Shape else { return }
      if !HasVisibleGlyphs(shape) { return }
      guard let segments = run.DecorationSegments else { return }
      var index int32 = 0
      while index + 1 < segments.Length {
        let left = originX + segments[index]
        let right = originX + segments[index + 1]
        AddDecorationRecords(frame, decoration, left, right, baseline,
          shape.Ascent, shape.Descent, color, transformIndex)
        index = index + 2
      }
    }

  private func AddDecorationRecords(
    frame SceneFrame,
    decoration TextDecoration,
    left float32,
    right float32,
    baseline float32,
    ascent float32,
    descent float32,
    color uint32,
    transformIndex int32) {
      if decoration == TextDecoration.None || !FiniteValue(left) || !FiniteValue(right)
        || !FiniteValue(baseline) || !FiniteValue(ascent) || !FiniteValue(descent) {
          return
        }
      let minX = MathF.Min(left, right)
      let maxX = MathF.Max(left, right)
      let width = maxX - minX
      if !FiniteValue(width) || width <= 0.0F { return }
      let metricsHeight = descent - ascent
      if !FiniteValue(metricsHeight) || metricsHeight <= 0.0F { return }
      var thickness = metricsHeight * 0.06F
      if !FiniteValue(thickness) { return }
      if thickness < 1.0F { thickness = 1.0F }
      if !FiniteValue(thickness) || thickness <= 0.0F { return }
      let bits = int32(decoration)
      if (bits & int32(TextDecoration.Underline)) != 0 {
        var offset = descent * 0.45F
        if !FiniteValue(offset) { return }
        if offset < thickness { offset = thickness }
        AddUnderlineRecord(frame, minX, baseline + offset, width, thickness,
          color, 0u, transformIndex)
      }
      if (bits & int32(TextDecoration.LineThrough)) != 0 {
        let center = baseline + (ascent + descent) * 0.5F
        AddUnderlineRecord(frame, minX, center - thickness * 0.5F, width, thickness,
          color, 1u, transformIndex)
      }
    }

  private func AddUnderlineRecord(
    frame SceneFrame,
    x float32,
    y float32,
    width float32,
    thickness float32,
    color uint32,
    mode uint32,
    transformIndex int32) {
      if !FiniteValue(x) || !FiniteValue(y) || !FiniteValue(width)
        || !FiniteValue(thickness) || width <= 0.0F || thickness <= 0.0F {
          return
        }
      frame.AddUnderline(UnderlineRecord{
        Bounds: ConservativeBounds{ X: x, Y: y, Width: width, Height: thickness },
        Thickness: thickness,
        Color: color,
        Mode: mode,
        TransformIndex: transformIndex,
      })
    }

  private func HasVisibleGlyph(run ShapedRun) bool {
    var index int32 = 0
    while index < run.Glyphs.Length {
      if run.Glyphs[index] != 0u { return true }
      index = index + 1
    }
    return false
  }

  private func HasVisibleGlyphs(shape ShapedText) bool {
    for run in shape.Runs {
      if HasVisibleGlyph(run) { return true }
    }
    return false
  }

  private func FiniteValue(value float32) bool -> !Single.IsNaN(value) && !Single.IsInfinity(value)

  private func EmitEntry(
    frame SceneFrame,
    node Node,
    opacity float32,
    parentTransformIndex int32) bool{
      if opacity <= 0.0F { return true }
      let bufferShape = entryMetrics.BufferShape(node)
      let shape = if node.Buffer == "" {
        entryMetrics.PlaceholderShape(node)
      } else {
        bufferShape
      }
      let contentX = TextLayouts.ContentLeft(node)
      let contentY = TextLayouts.ContentTop(node)
      let contentHeight = TextLayouts.ContentHeight(node)
      let paintShape = shape ?? bufferShape
      let lineHeight = bufferShape.Descent - bufferShape.Ascent
      let lineTop = contentY + (contentHeight - lineHeight) * 0.5F
      let caretOriginX = entryMetrics.EntryOriginX(node, bufferShape)
      let originX = if node.Buffer == "" {
        contentX + entryMetrics.EntryOffset(node, paintShape)
      } else {
        caretOriginX
      }
      let baseline = lineTop - bufferShape.Ascent
      let clipped = BeginContentClip(frame, node, parentTransformIndex)
      if node.Focused && node.Buffer != "" && node.Caret != node.Anchor
        && node.SelectionColor.A > 0.0F {
          let selection = entryMetrics.SelectionRects(node)
          AddSelectionBoxes(frame, selection, originX, lineTop, lineHeight,
            node.SelectionColor, opacity, parentTransformIndex)
        }
      var result = true
      let textOpacity = if node.Buffer == "" { opacity * 0.45F } else { opacity }
      let color = PackedColor(node.Color, textOpacity)
      result = EmitShapeWithStyle(frame, paintShape, TextLayouts.fontSize(node),
        originX, baseline, node.Color, textOpacity, parentTransformIndex,
        node.TextStrokeWidth.Px, node.TextStrokeColor, node.TextShadows)
      if result && node.Color.A > 0.0F {
        AddPlainDecorations(frame, paintShape, originX, baseline,
          node.TextDecoration, color, parentTransformIndex)
      }
      if result && node.Focused && BlinkVisible(node.BlinkT) {
        let caretX = caretOriginX + entryMetrics.CaretX(node, node.Caret)
        AddSolid(frame, ConservativeBounds{
          X: caretX,
          Y: lineTop,
          Width: 1.5F,
          Height: lineHeight,
        }, node.Color, opacity, parentTransformIndex)
      }
      if clipped { EndContentClip(frame, node, parentTransformIndex) }
      return result
    }

  private func EmitEditorContent(
    frame SceneFrame,
    node Node,
    opacity float32,
    transformIndex int32) bool{
      guard let state = node.EditorState else { return false }
      if opacity <= 0.0F { return true }
      let width = TextLayouts.ContentWidth(node)
      let height = TextLayouts.ContentHeight(node)
      let layout = TextEditorLayouts.For(node, width, height)
      let controller = state.Controller.State()
      let contentX = TextLayouts.ContentLeft(node)
      let contentY = TextLayouts.ContentTop(node)
      let scrollX = float32(controller.ScrollTargetX)
      let scrollY = float32(controller.ScrollTargetY)
      let activeLine = TextEditorLayouts.LineForPosition(layout, controller.Selection.Active)
      let placeholder = if state.Document.Length == 0 && controller.Composition == nil {
        state.Placeholder(node)
      } else { nil }
      let selectionStart = controller.Selection.Anchor.Offset < controller.Selection.Active.Offset
      ? controller.Selection.Anchor.Offset : controller.Selection.Active.Offset
      let selectionEnd = controller.Selection.Anchor.Offset > controller.Selection.Active.Offset
      ? controller.Selection.Anchor.Offset : controller.Selection.Active.Offset
      var result = true
      for lineIndex in 0 ... layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        let lineY = contentY + line.Top - scrollY
        let lineX = contentX + TextEditorLayouts.editorLineOffset(node, line, width) - scrollX
        if let current = activeLine {
          if controller.Focused && current == line && node.EditorCurrentLineColor.A > 0.0F {
            AddSolid(frame, ConservativeBounds{
              X: contentX,
              Y: lineY,
              Width: width,
              Height: line.Height,
            }, node.EditorCurrentLineColor, opacity, transformIndex)
          }
        }
        if controller.Focused && selectionStart != selectionEnd
          && line.SourceEnd >= selectionStart
          && line.SourceStart <= selectionEnd{
            let displayStart = TextEditorLayouts.DisplayOffsetForSource(line.Paragraph,
              selectionStart, TextAffinity.Downstream)
            let displayEnd = TextEditorLayouts.DisplayOffsetForSource(line.Paragraph,
              selectionEnd, TextAffinity.Upstream)
            var localStart = displayStart - line.DisplayStart
            var localEnd = displayEnd - line.DisplayStart
            if localStart < 0 { localStart = 0 }
            if localEnd > line.DisplayLength { localEnd = line.DisplayLength }
            if localEnd > localStart {
              let selection = TextEditorLayouts.SelectionRects(line, localStart, localEnd)
              AddSelectionBoxes(frame, selection, lineX, lineY, line.Height,
                node.SelectionColor, opacity, transformIndex)
            }
          }
        if controller.Focused {
          if let composition = controller.Composition {
            var compositionStart int32 = 0
            var compositionEnd int32 = 0
            if TextEditorLayouts.CompositionDisplayRange(line, composition,
              out compositionStart, out compositionEnd)
              && compositionEnd > compositionStart{
                let selection = TextEditorLayouts.SelectionRects(line,
                  compositionStart, compositionEnd)
                AddSelectionBoxes(frame, selection, lineX, lineY, line.Height,
                  node.SelectionColor, opacity, transformIndex)
              }
          }
        }
        guard let shape = line.Shape, let baseStyle = line.Paragraph.BaseStyle else {
          continue
        }
        let baseline = lineY + (line.Height - (line.Descent - line.Ascent)) * 0.5F
        -line.Ascent
        if line.Runs.Count != 0 {
          for runIndex in 0 ... line.Runs.Count {
            let run = line.Runs[runIndex]
            guard let runShape = run.Shape else { continue }
            let color = PackedColor(run.Style.Color, opacity)
            if !EmitShapeWithStyle(frame, runShape, run.Style.FontSize,
              lineX + run.X, baseline, run.Style.Color, opacity,
              transformIndex, run.Style.StrokeWidth,
              run.Style.StrokeColor, run.Style.Shadows) {
                result = false
                break
              }
            if run.Style.Color.A > 0.0F {
              AddRichDecorations(frame, run, lineX + run.X, baseline,
                color, transformIndex)
            }
          }
          if !result { break }
        } else {
          let color = PackedColor(baseStyle.Color, opacity)
          if !EmitShapeWithStyle(frame, shape, baseStyle.FontSize, lineX, baseline,
            baseStyle.Color, opacity, transformIndex, baseStyle.StrokeWidth,
            baseStyle.StrokeColor, baseStyle.Shadows) {
              result = false
              break
            }
          if baseStyle.Color.A > 0.0F {
            AddPlainDecorations(frame, shape, lineX, baseline,
              baseStyle.Decoration, color, transformIndex)
          }
        }
      }
      if result {
        if let value = placeholder {
          let line = layout.Lines[0]
          let lineX = contentX + TextLayouts.lineOffset(node, value.Width,
            value.RightToLeft, width) - scrollX
          let natural = value.Descent - value.Ascent
          let baseline = contentY + line.Top - scrollY
          +(line.Height - natural) * 0.5F - value.Ascent
          let color = PackedColor(node.Color, opacity * 0.45F)
          if !EmitShapeWithStyle(frame, value, TextLayouts.fontSize(node), lineX,
            baseline, node.Color, opacity * 0.45F, transformIndex,
            node.TextStrokeWidth.Px, node.TextStrokeColor, node.TextShadows) {
              result = false
            } else if node.Color.A > 0.0F {
              AddPlainDecorations(frame, value, lineX, baseline,
                node.TextDecoration, color, transformIndex)
            }
        }
      }
      if result && controller.Focused && BlinkVisible(node.BlinkT) {
        let caret = if let composition = controller.Composition {
          TextEditorLayouts.CompositionCaretRect(node, composition)
        } else {
          TextEditorLayouts.CaretRect(node, controller.Selection.Active)
        }
        AddSolid(frame, ConservativeBounds{
          X: node.Rect.X + caret.X,
          Y: node.Rect.Y + caret.Y,
          Width: caret.W,
          Height: caret.H,
        }, node.EditorCaretColor, opacity, transformIndex)
      }
      return result
    }

  private func EmitShapeWithStyle(
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    fillColor Color,
    opacity float32,
    parentTransformIndex int32,
    strokeWidth float32,
    strokeColor Color,
    shadows BoxShadowStack?) bool{
      var complete bool = true
      return EmitShapeWithStyle(frame, shape, fontSize, lineX, baseline, fillColor,
        opacity, parentTransformIndex, strokeWidth, strokeColor, shadows, ref complete)
    }

  private func EmitShapeWithStyle(
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    fillColor Color,
    opacity float32,
    parentTransformIndex int32,
    strokeWidth float32,
    strokeColor Color,
    shadows BoxShadowStack?,
    ref complete bool) bool{
      let shadowCount = textShadowCount(shadows)
      var shadowIndex = shadowCount - 1
      while shadowIndex >= 0 {
        let shadow = textShadowAt(shadows, shadowIndex)
        if shadow.Color.A > 0.0F {
          let effectMode = if shadow.Blur.Px > 0.0F {
            TextEffectBlurShadow
          } else {
            TextEffectShadow
          }
          if !EmitGlyphPass(frame, shape, fontSize, lineX, baseline,
            PackedColor(shadow.Color, opacity), effectMode, shadow.Blur.Px,
            shadow.OffsetX.Px, shadow.OffsetY.Px, parentTransformIndex,
            ref complete) {
              return false
            }
        }
        shadowIndex = shadowIndex - 1
      }
      if strokeWidth > 0.0F && strokeWidth <= MaximumStrokeWidth
        && strokeColor.A > 0.0F {
          if !EmitGlyphPass(frame, shape, fontSize, lineX, baseline,
            PackedColor(strokeColor, opacity), TextEffectStroke, strokeWidth * 0.5F,
            0.0F, 0.0F, parentTransformIndex, ref complete) {
              return false
            }
        }
      if fillColor.A <= 0.0F {
        return true
      }
      return EmitGlyphPass(frame, shape, fontSize, lineX, baseline,
        PackedColor(fillColor, opacity), TextEffectFill, 0.0F, 0.0F, 0.0F,
        parentTransformIndex, ref complete)
    }

  private func EmitGlyphPass(
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    color uint32,
    effectMode uint32,
    effectRadiusPixels float32,
    effectOffsetX float32,
    effectOffsetY float32,
    parentTransformIndex int32,
    ref complete bool) bool{
      let segment = BeginSegment(frame)
      var parentTransform TransformRecord
      let identity = TransformRecord{
        A: 1.0F,
        B: 0.0F,
        C: 0.0F,
        D: 1.0F,
        TX: 0.0F,
        TY: 0.0F,
        ParentIndex: -1,
      }
      let parentTransformValid = ComposeLogicalTransform(frame, parentTransformIndex,
        identity, out parentTransform)
      if activeSegmentReuse && parentTransformValid
        && IsExactSegmentHit(segment, frame, shape,
          fontSize, lineX, baseline, color, effectMode, effectRadiusPixels,
          effectOffsetX, effectOffsetY, parentTransform)
        && ProtectSegmentAtlases(segment) {
          frame.AddCachedTextSegment(CachedTextSegmentRefRecord{
            Bounds: segment.Bounds,
            SegmentId: segment.Id,
            SegmentVersion: segment.Version,
            GlyphCount: segment.GlyphCount,
            ClipChainId: segment.ClipChainId,
            Segment: segment,
            FirstInstance: -1,
          })
          return true
        }
      buildWorkspace.BeginBuild(ResourceGeneration, frame.ActiveClipChainId)
      let workspace = buildWorkspace
      let parentScale = ParentTransformMinimumScale(frame, parentTransformIndex)
      var hasBounds bool = false
      var result bool = true
      var runIndex int32 = 0
      while runIndex < shape.Runs.Count {
        let run = shape.Runs[runIndex]
        var glyphIndex int32 = 0
        while glyphIndex < run.Glyphs.Length {
          let glyphId = run.Glyphs[glyphIndex]
          if glyphId != 0u {
            guard let glyph = GetGlyph(run, glyphId) else {
              redrawRequired = true
              publicationPending = true
              complete = false
              result = false
              glyphIndex = glyphIndex + 1
              continue
            }
            MarkActiveAtlas(glyph)
            if !CanRender(glyph) {
              redrawRequired = true
              publicationPending = true
              complete = false
              result = false
              glyphIndex = glyphIndex + 1
              continue
            }
            if effectMode != TextEffectFill && glyph.RenderMode == 3u
              && glyph.EffectByteLength == 0u {
                colorEffectSkipped = true
                emissionFailed = true
                complete = false
                result = false
                glyphIndex = glyphIndex + 1
                continue
              }
            let extents = if effectMode == TextEffectFill {
              glyph.Extents
            } else {
              glyph.EffectExtents
            }
            let minX = float32(extents.XBearing)
            let minY = float32(extents.YBearing + extents.Height)
            let maxX = float32(extents.XBearing + extents.Width)
            let maxY = float32(extents.YBearing)
            if glyph.ByteLength != 0u && maxX > minX && maxY > minY {
              if glyph.Scale <= 0 {
                emissionFailed = true
                complete = false
                result = false
                return false
              }
              let scale = fontSize / float32(glyph.Scale)
              if scale <= 0.0F || !FiniteValue(scale) {
                emissionFailed = true
                complete = false
                result = false
                return false
              }
              let point = run.Points[glyphIndex]
              let originX = lineX + point.X
              let originY = baseline - point.Y
              let effectRadius = if effectMode == TextEffectStroke
                || effectMode == TextEffectBlurShadow{
                  effectRadiusPixels / (scale * parentScale)
                } else { 0.0F }
              let shaderEffectRadius = if effectMode == TextEffectBlurShadow {
                effectRadiusPixels
              } else { effectRadius }
              let localMinX = minX - effectRadius
              let localMinY = minY - effectRadius
              let localMaxX = maxX + effectRadius
              let localMaxY = maxY + effectRadius
              let glyphOriginX = if effectMode == TextEffectShadow
                || effectMode == TextEffectBlurShadow{
                  originX + effectOffsetX
                } else { originX }
              let glyphOriginY = if effectMode == TextEffectShadow
                || effectMode == TextEffectBlurShadow{
                  originY + effectOffsetY
                } else { originY }
              let inner = TransformRecord{
                A: scale,
                B: 0.0F,
                C: 0.0F,
                D: -scale,
                TX: glyphOriginX,
                TY: glyphOriginY,
                ParentIndex: -1,
              }
              var composed TransformRecord
              if !ComposeLogicalTransform(frame, parentTransformIndex, inner,
                out composed) {
                  emissionFailed = true
                  complete = false
                  result = false
                  return false
                }
              var glyphBounds ConservativeBounds
              if !TransformGlyphBounds(composed, localMinX, localMinY,
                localMaxX, localMaxY, out glyphBounds) {
                  emissionFailed = true
                  complete = false
                  result = false
                  return false
                }
              var pipelineKind uint32
              if effectMode != TextEffectFill
                || glyph.RenderMode == 2u {
                  pipelineKind = 0u
                } else if glyph.RenderMode == 3u {
                  pipelineKind = 1u
                } else {
                  emissionFailed = true
                  complete = false
                  result = false
                  return false
                }
              let glyphRunId = ResourceId{
                Kind: SceneResourceKind.GlyphRun,
                LogicalId: glyph.AtlasId.LogicalId,
                Version: uint64(glyph.ByteOffset / 8u) + 1uL,
              }
              let recordIndex = workspace.RecordCount
              workspace.EnsureRecordCapacity(recordIndex + 1)
              var foregroundR float32
              var foregroundG float32
              var foregroundB float32
              var foregroundA float32
              LinearForeground(color, pipelineKind, effectMode,
                out foregroundR, out foregroundG, out foregroundB,
                out foregroundA)
              workspace.Records[recordIndex] = HbGpuTextInstanceRecord{
                transform_m00: composed.A,
                transform_m01: composed.B,
                transform_m02: 0.0F,
                transform_m03: 0.0F,
                transform_m10: composed.C,
                transform_m11: composed.D,
                transform_m12: 0.0F,
                transform_m13: 0.0F,
                transform_m20: 0.0F,
                transform_m21: 0.0F,
                transform_m22: 1.0F,
                transform_m23: 0.0F,
                transform_m30: composed.TX,
                transform_m31: composed.TY,
                transform_m32: 0.0F,
                transform_m33: 1.0F,
                glyphBounds_x: localMinX,
                glyphBounds_y: localMinY,
                glyphBounds_z: localMaxX,
                glyphBounds_w: localMaxY,
                glyphInput_x: if effectMode == TextEffectFill {
                  glyph.ByteOffset / 8u
                } else { glyph.EffectByteOffset / 8u },
                glyphInput_y: effectMode,
                glyphInput_z: uint32(frame.ActiveClipChainId),
                glyphInput_w: uint32(BitConverter.SingleToInt32Bits(shaderEffectRadius)),
                foreground_x: foregroundR,
                foreground_y: foregroundG,
                foreground_z: foregroundB,
                foreground_w: foregroundA,
              }
              workspace.GlyphResources[recordIndex] = glyphRunId
              workspace.GlyphAtlasTexelOffsets[recordIndex] =
              glyph.ByteOffset / 8u
              workspace.GlyphAtlasTexelCounts[recordIndex] =
              glyph.ByteLength / 8u
              workspace.GlyphEffectAtlasTexelOffsets[recordIndex] =
              glyph.EffectByteOffset / 8u
              workspace.GlyphEffectAtlasTexelCounts[recordIndex] =
              glyph.EffectByteLength / 8u
              workspace.RecordCount = recordIndex + 1
              workspace.GlyphResourceCount = workspace.RecordCount
              workspace.GlyphCount = workspace.RecordCount
              var byteRangeEnd = uint64(glyph.ByteOffset)
              +uint64(glyph.ByteLength)
              let effectByteEnd = uint64(glyph.EffectByteOffset)
              +uint64(glyph.EffectByteLength)
              if effectByteEnd > byteRangeEnd {
                byteRangeEnd = effectByteEnd
              }
              AddSegmentRun(workspace, recordIndex, glyph.AtlasId, pipelineKind,
                byteRangeEnd)
              if !hasBounds {
                workspace.Bounds = glyphBounds
                hasBounds = true
              } else {
                workspace.Bounds = UnionBounds(workspace.Bounds, glyphBounds)
              }
            }
          }
          glyphIndex = glyphIndex + 1
        }
        runIndex = runIndex + 1
      }
      if result && workspace.RecordCount > 0 {
        CommitSegment(segment)
        segment.Shape = shape
        segment.RendererValidationCacheEligible = activeSegmentReuse
        segment.FontSize = fontSize
        segment.LineX = lineX
        segment.Baseline = baseline
        segment.Color = color
        segment.EffectMode = effectMode
        segment.EffectRadiusPixels = effectRadiusPixels
        segment.EffectOffsetX = effectOffsetX
        segment.EffectOffsetY = effectOffsetY
        segment.ParentTransform = parentTransform
        frame.AddCachedTextSegment(CachedTextSegmentRefRecord{
          Bounds: segment.Bounds,
          SegmentId: segment.Id,
          SegmentVersion: segment.Version,
          GlyphCount: segment.GlyphCount,
          ClipChainId: segment.ClipChainId,
          Segment: segment,
          FirstInstance: -1,
        })
      }
      return result
    }

  private func IsExactSegmentHit(
    segment VulkanRetainedTextSegment,
    frame SceneFrame,
    shape ShapedText,
    fontSize float32,
    lineX float32,
    baseline float32,
    color uint32,
    effectMode uint32,
    effectRadiusPixels float32,
    effectOffsetX float32,
    effectOffsetY float32,
    parentTransform TransformRecord) bool{
      if segment.Version == 0uL
        || segment.RecordCount <= 0
        || !Object.ReferenceEquals(segment.Shape, shape)
        || segment.AtlasGeneration != ResourceGeneration
        || segment.ClipChainId != frame.ActiveClipChainId
        || segment.Color != color
        || segment.EffectMode != effectMode{
          return false
        }
      return SameTextFloat(segment.FontSize, fontSize)
        && SameTextFloat(segment.LineX, lineX)
        && SameTextFloat(segment.Baseline, baseline)
        && SameTextFloat(segment.EffectRadiusPixels, effectRadiusPixels)
        && SameTextFloat(segment.EffectOffsetX, effectOffsetX)
        && SameTextFloat(segment.EffectOffsetY, effectOffsetY)
        && SameTextFloat(segment.ParentTransform.A, parentTransform.A)
        && SameTextFloat(segment.ParentTransform.B, parentTransform.B)
        && SameTextFloat(segment.ParentTransform.C, parentTransform.C)
        && SameTextFloat(segment.ParentTransform.D, parentTransform.D)
        && SameTextFloat(segment.ParentTransform.TX, parentTransform.TX)
        && SameTextFloat(segment.ParentTransform.TY, parentTransform.TY)
    }

  private func GetNodeSegmentCache(node Node) VulkanTextNodeSegmentCache {
    if nodeSegments.TryGetValue(node, out var existing) {
      return existing
    }
    let created = VulkanTextNodeSegmentCache()
    nodeSegments.Add(node, created)
    return created
  }

  private func BeginSegment(frame SceneFrame) VulkanRetainedTextSegment {
    guard let cache = activeNodeSegments else {
      throw InvalidOperationException("Vulkan text segment cache is not active")
    }
    if frame.ActiveClipChainId < 0 {
      throw InvalidOperationException("Vulkan text clip chain is invalid")
    }
    let index = cache.Cursor
    cache.EnsureCapacity(index + 1)
    var segment = cache.Segments[index]
    if segment == nil {
      if nextSegmentId == 0uL {
        throw InvalidOperationException("Vulkan text segment identity overflow")
      }
      let created = VulkanRetainedTextSegment(4)
      created.Id = nextSegmentId
      nextSegmentId = nextSegmentId + 1uL
      cache.Segments[index] = created
      segment = created
    }
    cache.Cursor = cache.Cursor + 1
    return segment
  }
  private func CommitSegment(segment VulkanRetainedTextSegment) {
    if segment.Id == 0uL {
      throw InvalidOperationException("cached text segment has no identity")
    }
    let workspace = buildWorkspace
    if segment.Version != 0uL && SameSegmentContent(segment, workspace) {
      return
    }
    if segment.Version == uint64.MaxValue {
      throw InvalidOperationException("cached text segment version overflow")
    }
    var capacity = workspace.RecordCount
    if workspace.GlyphResourceCount > capacity {
      capacity = workspace.GlyphResourceCount
    }
    segment.EnsureRecordCapacity(capacity)
    segment.EnsureRunCapacity(workspace.RunCount)
    Array.Copy(workspace.Records, segment.Records, workspace.RecordCount)
    Array.Copy(workspace.GlyphResources, segment.GlyphResources,
      workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphAtlasTexelOffsets, segment.GlyphAtlasTexelOffsets,
      workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphAtlasTexelCounts, segment.GlyphAtlasTexelCounts,
      workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphEffectAtlasTexelOffsets,
      segment.GlyphEffectAtlasTexelOffsets, workspace.GlyphResourceCount)
    Array.Copy(workspace.GlyphEffectAtlasTexelCounts,
      segment.GlyphEffectAtlasTexelCounts, workspace.GlyphResourceCount)
    Array.Copy(workspace.Runs, segment.Runs, workspace.RunCount)
    segment.Bounds = workspace.Bounds
    segment.GlyphCount = workspace.GlyphCount
    segment.ClipChainId = workspace.ClipChainId
    segment.RecordCount = workspace.RecordCount
    segment.RunCount = workspace.RunCount
    segment.GlyphResourceCount = workspace.GlyphResourceCount
    segment.AtlasGeneration = workspace.AtlasGeneration
    segment.Version = segment.Version + 1uL
  }

  private func SameSegmentContent(
    segment VulkanRetainedTextSegment,
    workspace VulkanTextSegmentBuildWorkspace) bool{
      if segment.RecordCount != workspace.RecordCount
        || segment.GlyphResourceCount != workspace.GlyphResourceCount
        || segment.RunCount != workspace.RunCount
        || segment.GlyphCount != workspace.GlyphCount{
          return false
        }
      if !SameTextFloat(segment.Bounds.X, workspace.Bounds.X)
        || !SameTextFloat(segment.Bounds.Y, workspace.Bounds.Y)
        || !SameTextFloat(segment.Bounds.Width, workspace.Bounds.Width)
        || !SameTextFloat(segment.Bounds.Height, workspace.Bounds.Height) {
          return false
        }
      if segment.ClipChainId != workspace.ClipChainId
        || segment.AtlasGeneration != workspace.AtlasGeneration{
          return false
        }
      var index int32 = 0
      while index < workspace.RecordCount {
        if !SameTextRecord(segment.Records[index], workspace.Records[index]) {
          return false
        }
        index = index + 1
      }
      index = 0
      while index < workspace.GlyphResourceCount {
        if !SameIdentity(segment.GlyphResources[index], workspace.GlyphResources[index])
          || segment.GlyphAtlasTexelOffsets[index]
        != workspace.GlyphAtlasTexelOffsets[index]
          || segment.GlyphAtlasTexelCounts[index]
        != workspace.GlyphAtlasTexelCounts[index]
          || segment.GlyphEffectAtlasTexelOffsets[index]
        != workspace.GlyphEffectAtlasTexelOffsets[index]
          || segment.GlyphEffectAtlasTexelCounts[index]
        != workspace.GlyphEffectAtlasTexelCounts[index]{
          return false
        }
        index = index + 1
      }
      index = 0
      while index < workspace.RunCount {
        let left = segment.Runs[index]
        let right = workspace.Runs[index]
        if left.FirstInstance != right.FirstInstance
          || left.InstanceCount != right.InstanceCount
          || !SameIdentity(left.AtlasId, right.AtlasId)
          || left.PipelineKind != right.PipelineKind
          || left.ByteRangeEnd != right.ByteRangeEnd{
            return false
          }
        index = index + 1
      }
      return true
    }

  private func SameTextRecord(
    left HbGpuTextInstanceRecord,
    right HbGpuTextInstanceRecord) bool -> SameTextFloat(left.transform_m00, right.transform_m00)
    && SameTextFloat(left.transform_m01, right.transform_m01)
    && SameTextFloat(left.transform_m02, right.transform_m02)
    && SameTextFloat(left.transform_m03, right.transform_m03)
    && SameTextFloat(left.transform_m10, right.transform_m10)
    && SameTextFloat(left.transform_m11, right.transform_m11)
    && SameTextFloat(left.transform_m12, right.transform_m12)
    && SameTextFloat(left.transform_m13, right.transform_m13)
    && SameTextFloat(left.transform_m20, right.transform_m20)
    && SameTextFloat(left.transform_m21, right.transform_m21)
    && SameTextFloat(left.transform_m22, right.transform_m22)
    && SameTextFloat(left.transform_m23, right.transform_m23)
    && SameTextFloat(left.transform_m30, right.transform_m30)
    && SameTextFloat(left.transform_m31, right.transform_m31)
    && SameTextFloat(left.transform_m32, right.transform_m32)
    && SameTextFloat(left.transform_m33, right.transform_m33)
    && SameTextFloat(left.glyphBounds_x, right.glyphBounds_x)
    && SameTextFloat(left.glyphBounds_y, right.glyphBounds_y)
    && SameTextFloat(left.glyphBounds_z, right.glyphBounds_z)
    && SameTextFloat(left.glyphBounds_w, right.glyphBounds_w)
    && left.glyphInput_x == right.glyphInput_x
    && left.glyphInput_y == right.glyphInput_y
    && left.glyphInput_z == right.glyphInput_z
    && left.glyphInput_w == right.glyphInput_w
    && SameTextFloat(left.foreground_x, right.foreground_x)
    && SameTextFloat(left.foreground_y, right.foreground_y)
    && SameTextFloat(left.foreground_z, right.foreground_z)
    && SameTextFloat(left.foreground_w, right.foreground_w)

  private func SameTextFloat(left float32, right float32) bool -> BitConverter.SingleToInt32Bits(left)
  == BitConverter.SingleToInt32Bits(right)

  private func AddSegmentRun(
    workspace VulkanTextSegmentBuildWorkspace,
    firstInstance int32,
    atlasId ResourceId,
    pipelineKind uint32,
    byteRangeEnd uint64) {
      if workspace.RunCount > 0 {
        let lastIndex = workspace.RunCount - 1
        var last = workspace.Runs[lastIndex]
        if last.AtlasId.Kind == atlasId.Kind
          && last.AtlasId.LogicalId == atlasId.LogicalId
          && last.AtlasId.Version == atlasId.Version
          && last.PipelineKind == pipelineKind{
            if last.InstanceCount == Int32.MaxValue {
              throw InvalidOperationException("Vulkan text segment run overflow")
            }
            last.InstanceCount = last.InstanceCount + 1
            if byteRangeEnd > last.ByteRangeEnd {
              last.ByteRangeEnd = byteRangeEnd
            }
            workspace.Runs[lastIndex] = last
            return
          }
      }
      let runIndex = workspace.RunCount
      if runIndex < 0 || runIndex == Int32.MaxValue
        || firstInstance < 0 || firstInstance >= workspace.RecordCount{
          throw InvalidOperationException("Vulkan text segment run overflow")
        }
      workspace.EnsureRunCapacity(runIndex + 1)
      workspace.Runs[runIndex] = VulkanTextSegmentRun{
        FirstInstance: firstInstance,
        InstanceCount: 1,
        AtlasId: atlasId,
        PipelineKind: pipelineKind,
        ByteRangeEnd: byteRangeEnd,
      }
      workspace.RunCount = runIndex + 1
    }

  private func ComposeLogicalTransform(
    frame SceneFrame,
    parentIndex int32,
    inner TransformRecord,
    out result TransformRecord) bool{
      var a = inner.A
      var b = inner.B
      var c = inner.C
      var d = inner.D
      var tx = inner.TX
      var ty = inner.TY
      var current = parentIndex
      var steps int32 = 0
      while current >= 0 {
        if current >= frame.TransformCount || steps >= frame.TransformCount {
          result = TransformRecord{}
          return false
        }
        let outer = frame.Transforms[current]
        let nextA = outer.A * a + outer.C * b
        let nextB = outer.B * a + outer.D * b
        let nextC = outer.A * c + outer.C * d
        let nextD = outer.B * c + outer.D * d
        let nextTX = outer.A * tx + outer.C * ty + outer.TX
        let nextTY = outer.B * tx + outer.D * ty + outer.TY
        a = nextA
        b = nextB
        c = nextC
        d = nextD
        tx = nextTX
        ty = nextTY
        current = outer.ParentIndex
        steps = steps + 1
      }
      if !FiniteValue(a) || !FiniteValue(b) || !FiniteValue(c)
        || !FiniteValue(d) || !FiniteValue(tx) || !FiniteValue(ty) {
          result = TransformRecord{}
          return false
        }
      result = TransformRecord{
        A: a,
        B: b,
        C: c,
        D: d,
        TX: tx,
        TY: ty,
        ParentIndex: -1,
      }
      return true
    }

  private func TransformGlyphBounds(
    transform TransformRecord,
    minX float32,
    minY float32,
    maxX float32,
    maxY float32,
    out result ConservativeBounds) bool{
      let x0 = transform.A * minX + transform.C * minY + transform.TX
      let y0 = transform.B * minX + transform.D * minY + transform.TY
      let x1 = transform.A * maxX + transform.C * minY + transform.TX
      let y1 = transform.B * maxX + transform.D * minY + transform.TY
      let x2 = transform.A * minX + transform.C * maxY + transform.TX
      let y2 = transform.B * minX + transform.D * maxY + transform.TY
      let x3 = transform.A * maxX + transform.C * maxY + transform.TX
      let y3 = transform.B * maxX + transform.D * maxY + transform.TY
      let left = MathF.Min(MathF.Min(x0, x1), MathF.Min(x2, x3))
      let right = MathF.Max(MathF.Max(x0, x1), MathF.Max(x2, x3))
      let top = MathF.Min(MathF.Min(y0, y1), MathF.Min(y2, y3))
      let bottom = MathF.Max(MathF.Max(y0, y1), MathF.Max(y2, y3))
      if !FiniteValue(left) || !FiniteValue(top) || !FiniteValue(right)
        || !FiniteValue(bottom) || right <= left || bottom <= top{
          result = ConservativeBounds{}
          return false
        }
      result = ConservativeBounds{
        X: left,
        Y: top,
        Width: right - left,
        Height: bottom - top,
      }
      return true
    }

  private func UnionBounds(
    left ConservativeBounds,
    right ConservativeBounds) ConservativeBounds{
      let minX = left.X < right.X ? left.X : right.X
      let minY = left.Y < right.Y ? left.Y : right.Y
      let maxX = left.Right > right.Right ? left.Right : right.Right
      let maxY = left.Bottom > right.Bottom ? left.Bottom : right.Bottom
      return ConservativeBounds{
        X: minX,
        Y: minY,
        Width: maxX - minX,
        Height: maxY - minY,
      }
    }

  private func LinearForeground(
    color uint32,
    pipelineKind uint32,
    effectMode uint32,
    out red float32,
    out green float32,
    out blue float32,
    out alpha float32) {
      let packed = int32(color)
      let redByte = (packed >> int32(24)) & int32(255)
      let greenByte = (packed >> int32(16)) & int32(255)
      let blueByte = (packed >> int32(8)) & int32(255)
      alpha = float32(packed & int32(255)) / 255.0F
      red = srgbToLinear[redByte]
      green = srgbToLinear[greenByte]
      blue = srgbToLinear[blueByte]
      if pipelineKind == 0u || effectMode != TextEffectFill {
        red = red * alpha
        green = green * alpha
        blue = blue * alpha
      }
    }

  private func ParentTransformMinimumScale(frame SceneFrame, parentIndex int32) float32 {
    var a = 1.0F
    var b = 0.0F
    var c = 0.0F
    var d = 1.0F
    var current = parentIndex
    var steps int32 = 0
    while current >= 0 {
      if current >= frame.TransformCount || steps >= frame.TransformCount {
        return 1.0F
      }
      let value = frame.Transforms[current]
      let nextA = value.A * a + value.C * b
      let nextB = value.B * a + value.D * b
      let nextC = value.A * c + value.C * d
      let nextD = value.B * c + value.D * d
      a = nextA
      b = nextB
      c = nextC
      d = nextD
      current = value.ParentIndex
      steps = steps + 1
    }
    let determinant = MathF.Abs(a * d - b * c)
    let firstLength = MathF.Sqrt(a * a + b * b)
    let secondLength = MathF.Sqrt(c * c + d * d)
    let maximum = firstLength > secondLength ? firstLength : secondLength
    if determinant <= 0.0001F || maximum <= 0.0001F {
      return 0.0001F
    }
    let result = determinant / maximum
    return result > 0.0001F ? result : 0.0001F
  }

  private func BeginContentClip(frame SceneFrame, node Node, transformIndex int32) bool {
    let bounds = ContentBounds(node)
    if bounds.IsEmpty { return false }
    frame.AddRectClipBegin(RectClipRecord{
      Bounds: bounds,
      TransformIndex: transformIndex,
      ParentIndex: -1,
    })
    return true
  }

  private func EndContentClip(frame SceneFrame, node Node, transformIndex int32) {
    frame.AddRectClipEnd(RectClipRecord{
      Bounds: ContentBounds(node),
      TransformIndex: transformIndex,
      ParentIndex: -1,
    })
  }

  private func ContentBounds(node Node) ConservativeBounds -> ConservativeBounds {
    X: TextLayouts.ContentLeft(node),
    Y: TextLayouts.ContentTop(node),
    Width: TextLayouts.ContentWidth(node),
    Height: TextLayouts.ContentHeight(node),
  }

  private func AddSelectionBoxes(
    frame SceneFrame,
    values IReadOnlyList[float32],
    originX float32,
    y float32,
    height float32,
    color Color,
    opacity float32,
    transformIndex int32) {
      if color.A <= 0.0F || opacity <= 0.0F { return }
      var index int32 = 0
      while index + 1 < values.Count {
        let left = values[index]
        let right = values[index + 1]
        if right > left {
          AddSolid(frame, ConservativeBounds{
            X: originX + left,
            Y: y,
            Width: right - left,
            Height: height,
          }, color, opacity, transformIndex)
        }
        index = index + 2
      }
    }

  private func AddSolid(
    frame SceneFrame,
    bounds ConservativeBounds,
    color Color,
    opacity float32,
    transformIndex int32) {
      if color.A <= 0.0F || opacity <= 0.0F || bounds.IsEmpty { return }
      frame.AddSolidBox(SolidBoxRecord{
        Bounds: bounds,
        Color: PackedColor(color, opacity),
        Opacity: 1.0F,
        TransformIndex: transformIndex,
      })
    }

  private func PackedColor(color Color, opacity float32) uint32 -> Color.FromNormalized(color.R, color.G, color.B, color.A * opacity).ToPackedRgba()

  private func BlinkVisible(value float64) bool {
    let phase = value - Math.Floor(value)
    return phase < 0.5
  }

  private func GetGlyph(run ShapedRun, glyphId uint32) VulkanTextAtlasGlyph? {
    let key = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId)
    var existingFound = false
    if glyphs.TryGetValue(key, out var existing) {
      let existingIndex = atlasSet.FindIndex(existing.AtlasId)
      if existingIndex >= 0 {
        return existing
      }
      existingFound = true
    }
    if capacityExhausted {
      throw InvalidOperationException("Vulkan text atlas capacity is exhausted")
    }
    var renderMode uint32 = 2u
    var providerResult VulkanTextProviderResult
    var effectResult VulkanTextProviderResult
    var effectExtents VulkanTextGlyphExtents
    let hasColorGlyph = (run.Provider.HasColorPaint() && run.Provider.GlyphHasColorPaint(glyphId))
      || (run.Provider.HasColorLayers() && run.Provider.GlyphHasColorLayers(glyphId))
    if hasColorGlyph {
      providerResult = run.Provider.EncodePaintGlyphInto(glyphId, 0u, glyphWorkspace)
      if providerResult.Status == VulkanTextProviderAbi.Success {
        renderMode = 3u
        effectResult = run.Provider.EncodeGlyphInto(glyphId, effectGlyphWorkspace)
        if effectResult.AbiVersion != VulkanTextProviderAbi.Version {
          throw InvalidOperationException("Vulkan text provider ABI version is invalid")
        }
        if effectResult.Status == VulkanTextProviderAbi.CapacityExceeded {
          throw InvalidOperationException("Vulkan text color effect glyph exceeds workspace capacity")
        }
        if effectResult.Status == VulkanTextProviderAbi.Success {
          if effectResult.Count < 0 || (effectResult.Count & 7) != 0 {
            throw InvalidOperationException("Vulkan text color effect encoding is not texel aligned")
          }
          effectExtents = effectGlyphWorkspace.GlyphExtents
        }
      } else if providerResult.Status == VulkanTextProviderAbi.CapacityExceeded {
        throw InvalidOperationException("Vulkan text color glyph exceeds workspace capacity")
      } else {
        colorGlyphFallback = true
        providerResult = run.Provider.EncodeGlyphInto(glyphId, glyphWorkspace)
      }
    } else {
      providerResult = run.Provider.EncodeGlyphInto(glyphId, glyphWorkspace)
    }
    if providerResult.AbiVersion != VulkanTextProviderAbi.Version {
      throw InvalidOperationException("Vulkan text provider ABI version is invalid")
    }
    if providerResult.Status == VulkanTextProviderAbi.CapacityExceeded {
      throw InvalidOperationException("Vulkan text glyph exceeds workspace capacity")
    }
    if providerResult.Status != VulkanTextProviderAbi.Success {
      throw InvalidOperationException("Vulkan text glyph encoding failed")
    }
    if providerResult.Count < 0 || (providerResult.Count & 7) != 0 {
      throw InvalidOperationException("Vulkan text glyph encoding is not texel aligned")
    }
    var effectByteCount uint32 = 0u
    if renderMode == 3u && effectResult.Status == VulkanTextProviderAbi.Success {
      effectByteCount = uint32(effectResult.Count)
    }
    let totalByteCount = uint64(providerResult.Count) + uint64(effectByteCount)
    var state = CurrentState()
    if uint64(state.NextByteOffset) + totalByteCount > state.Atlas.ByteSize
      || state.KeyCount >= int32(state.Atlas.ByteSize / 8uL) {
        var createdIndex int32 = -1
        if atlasSet.CanCreateAtlas {
          createdIndex = atlasSet.CreateAtlas()
        }
        if createdIndex < 0 {
          if !RecycleAtlas() {
            capacityExhausted = true
            throw InvalidOperationException("Vulkan text atlas capacity is exhausted")
          }
          state = CurrentState()
        } else {
          EnsureAtlasStates()
          state = states[createdIndex]!!
        }
        if totalByteCount > state.Atlas.ByteSize {
          capacityExhausted = true
          throw InvalidOperationException("Vulkan text glyph exceeds atlas capacity")
        }
      }
    let byteOffset = state.NextByteOffset
    if byteOffset > uint32(Int32.MaxValue) {
      throw InvalidOperationException("Vulkan text atlas byte offset exceeds managed array limits")
    }
    let effectByteOffset = byteOffset + uint32(providerResult.Count)
    let requiredByteCount = effectByteOffset + effectByteCount
    state.EnsureByteCapacity(requiredByteCount)
    Array.Copy(glyphWorkspace.ByteBuffer, 0, state.Bytes, int32(byteOffset), providerResult.Count)
    if effectByteCount != 0u {
      Array.Copy(effectGlyphWorkspace.ByteBuffer, 0, state.Bytes,
        int32(effectByteOffset), int32(effectByteCount))
    }
    let result = VulkanTextAtlasGlyph{
      AtlasId: state.Identity,
      ByteOffset: byteOffset,
      ByteLength: uint32(providerResult.Count),
      EffectByteOffset: if renderMode == 3u {
        if effectByteCount == 0u { 0u } else { effectByteOffset }
      } else { byteOffset },
      EffectByteLength: if renderMode == 3u {
        effectByteCount
      } else { uint32(providerResult.Count) },
      Scale: glyphWorkspace.GlyphScale,
      Extents: glyphWorkspace.GlyphExtents,
      EffectExtents: if renderMode != 3u || effectByteCount == 0u {
        glyphWorkspace.GlyphExtents
      } else { effectExtents },
      RenderMode: renderMode,
    }
    if existingFound {
      glyphs[key] = result
    } else {
      glyphs.Add(key, result)
    }
    state.AddKey(key)
    state.NextByteOffset = requiredByteCount
    return result
  }

  private func CachedGlyph(run ShapedRun, glyphId uint32) VulkanTextAtlasGlyph? {
    let key = VulkanTextAtlasGlyphKey(run.Family, run.Provider, glyphId)
    if glyphs.TryGetValue(key, out var value)
      && atlasSet.FindIndex(value.AtlasId) >= 0 {
        return value
      }
    return nil
  }

  private func CanRender(glyph VulkanTextAtlasGlyph) bool {
    let glyphEnd = uint64(glyph.ByteOffset) + uint64(glyph.ByteLength)
    return IsAtlasRangeResident(glyph.AtlasId, glyphEnd)
  }
  private func ProtectSegmentAtlases(segment VulkanRetainedTextSegment) bool {
    if segment.GlyphCount <= 0
      || segment.GlyphCount != segment.RecordCount
      || segment.GlyphResourceCount != segment.GlyphCount
      || segment.RunCount <= 0
      || segment.RunCount > segment.Runs.Length
      || segment.GlyphCount > segment.GlyphResources.Length
      || segment.GlyphCount > segment.GlyphAtlasTexelOffsets.Length
      || segment.GlyphCount > segment.GlyphAtlasTexelCounts.Length
      || segment.GlyphCount > segment.GlyphEffectAtlasTexelOffsets.Length
      || segment.GlyphCount > segment.GlyphEffectAtlasTexelCounts.Length{
        return false
      }
    var glyphBase int32 = 0
    var runIndex int32 = 0
    while runIndex < segment.RunCount {
      let run = segment.Runs[runIndex]
      if run.FirstInstance != glyphBase
        || run.InstanceCount <= 0
        || run.InstanceCount > segment.GlyphCount - glyphBase
        || !TryMarkAtlasActive(run.AtlasId) {
          return false
        }
      let runEnd = glyphBase + run.InstanceCount
      if run.ByteRangeEnd == 0uL
        || !IsAtlasRangeResident(run.AtlasId, run.ByteRangeEnd) {
          return false
        }
      glyphBase = runEnd
      runIndex = runIndex + 1
    }
    return glyphBase == segment.GlyphCount
  }

  private func CurrentState() VulkanTextSceneAtlasState {
    EnsureAtlasStates()
    let index = atlasSet.CurrentAtlasIndex
    guard let state = states[index] else {
      throw InvalidOperationException("Vulkan current text atlas state is unavailable")
    }
    return state
  }

  private func EnsureAtlasStates() {
    var index int32 = 0
    while index < states.Length {
      if atlasSet.IsActive(index) {
        let identity = atlasSet.IdentityAt(index)
        if let state = states[index] {
          if !SameIdentity(state.Identity, identity) {
            RemoveStateGlyphs(state)
            states[index] = nil
            stateCount = stateCount - 1
          }
        }
        if states[index] == nil {
          states[index] = VulkanTextSceneAtlasState(
            atlasSet.AtlasAt(index), identity)
          stateCount = stateCount + 1
        }
      } else if let state = states[index] {
        RemoveStateGlyphs(state)
        states[index] = nil
        stateCount = stateCount - 1
      }
      index = index + 1
    }
  }

  private func RecycleAtlas() bool {
    EnsureAtlasStates()
    let index = atlasSet.FindReclaimable(
      completedGlobalSubmissionSerial, activeAtlasUse)
    if index < 0 {
      return false
    }
    guard let state = states[index] else {
      throw InvalidOperationException("Vulkan reclaimable text atlas state is unavailable")
    }
    var identity ResourceId
    try {
      identity = atlasSet.RecycleAtlas(index, completedGlobalSubmissionSerial)
    } catch (error Exception) {
      RemoveStateGlyphs(state)
      states[index] = nil
      stateCount = stateCount - 1
      throw error
    }
    RemoveStateGlyphs(state)
    state.Reset(atlasSet.AtlasAt(index), identity)
    capacityExhausted = false
    return true
  }

  private func RemoveStateGlyphs(state VulkanTextSceneAtlasState) {
    var keyIndex int32 = 0
    while keyIndex < state.KeyCount {
      glyphs.Remove(state.Keys[keyIndex])
      state.Keys[keyIndex] = VulkanTextAtlasGlyphKey{}
      keyIndex = keyIndex + 1
    }
    state.KeyCount = 0
  }

  private func SameIdentity(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind && left.LogicalId == right.LogicalId
    && left.Version == right.Version

  private func MarkActiveAtlas(glyph VulkanTextAtlasGlyph) {
    TryMarkAtlasActive(glyph.AtlasId)
  }
}
