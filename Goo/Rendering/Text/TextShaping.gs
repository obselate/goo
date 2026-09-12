package Goo

import System
import System.Collections.Generic
import System.IO
import System.Text
import System.Threading

private data struct TextFontSelection(Family string, Path string?, Registration FontRegistration?) { }
private data struct TextProviderShapeResult(Workspace VulkanTextShapingWorkspace, Count int32) { }

private struct TextPrimaryFaceKey : IEquatable[TextPrimaryFaceKey] {
  private let families string
  private let weight int32
  private let italic bool
  private let registryGeneration uint64

  internal init(families string, weight int32, italic bool, registryGeneration uint64) {
    this.families = families
    this.weight = weight
    this.italic = italic
    this.registryGeneration = registryGeneration
  }

  func Equals(other TextPrimaryFaceKey) bool ->
  String.Equals(families, other.families, StringComparison.Ordinal)
    && weight == other.weight && italic == other.italic
    && registryGeneration == other.registryGeneration

  override func Equals(value object?) bool -> switch value {
    case other is TextPrimaryFaceKey: Equals(other)
    case _: false
  }

  override func GetHashCode() int32 {
    let hash = HashCode()
    hash.Add(families, StringComparer.Ordinal)
    hash.Add(weight)
    hash.Add(italic)
    hash.Add(registryGeneration)
    return hash.ToHashCode()
  }
}

internal class TextShaping {
  shared {
    private let PrimaryFaces Dictionary[TextPrimaryFaceKey, TypefaceResource] =
    Dictionary[TextPrimaryFaceKey, TypefaceResource]()
    private let PrimaryFaceOrder Queue[TextPrimaryFaceKey] = Queue[TextPrimaryFaceKey]()
    private let PrimaryFacesLock object = Object()
    private var primaryFaceDisposals int32
    private var primaryFaceCacheBytes int64
    private const PrimaryFaceCacheCapacity int32 = 64
    private const PrimaryFaceCacheByteBudget int64 = 33554432L
    private const ShapingWorkspaceRetainedCapacity int32 = 4096
    @ThreadStatic
    private var shapingWorkspace VulkanTextShapingWorkspace?
    @ThreadStatic
    private var textAnalysisScratch UnicodeTextAnalysisScratch?

    internal func Metrics(families string, size float32, weight int32, italic bool)
    TextFontMetrics{
      let lease = ResolveCachedPrimary(families, weight, italic)
      try {
        return MetricsFor(lease.Provider.Metrics, size)
      } finally {
        lease.Dispose()
      }
    }

    internal func MeasureLineUncached(paragraph string, start int32, length int32,
      families string, size float32, weight int32, italic bool, letterSpacing float32,
      direction int32) float32{
        validateRange(paragraph, start, length, direction)
        let shaped = ShapeUncached(paragraph, start, length, families, size, weight, italic,
          letterSpacing, direction, nil)
        try { return shaped.Width } finally { shaped.Dispose() }
      }

    internal func Ellipsize(text string, families string, size float32, weight int32, italic bool,
      letterSpacing float32, direction int32, maxWidth float32) string{
        let ellipsis = "\u2026"
        let baseDirection = BaseDirection(text, direction)
        let elements = UnicodeGraphemes.Starts(text)
        if elements.Length == 0 { return ellipsis }
        if MeasureUncached(ellipsis, families, size, weight, italic, letterSpacing,
          baseDirection) > maxWidth{ return ellipsis }
        var low int32 = 0
        var high = elements.Length
        while low < high {
          let middle = low + (high - low + 1) / 2
          let end = if middle < elements.Length { elements[middle] } else { text.Length }
          let candidate = text.Substring(0, end) + ellipsis
          if MeasureUncached(candidate, families, size, weight, italic, letterSpacing,
            baseDirection) <= maxWidth{
              low = middle
            } else {
              high = middle - 1
            }
        }
        let fitEnd = if low < elements.Length { elements[low] } else { text.Length }
        return text.Substring(0, fitEnd) + ellipsis
      }

    internal func Shape(text string, families string, size float32, weight int32, italic bool,
      letterSpacing float32, direction int32) ShapedText ->
    ShapeLine(text, 0, text.Length, families, size, weight, italic, letterSpacing,
      direction, nil)

    internal func ShapeLine(paragraph string, start int32, length int32, families string,
      size float32, weight int32, italic bool, letterSpacing float32, direction int32)
    ShapedText -> ShapeLine(paragraph, start, length, families, size, weight, italic,
      letterSpacing, direction, nil)

    internal func ShapeLine(paragraph string, start int32, length int32, families string,
      size float32, weight int32, italic bool, letterSpacing float32, direction int32,
      resolution BidiResolution?) ShapedText{
        validateRange(paragraph, start, length, direction)
        return ShapeUncached(paragraph, start, length, families, size, weight, italic,
          letterSpacing, direction, resolution)
      }

    internal func ResolveParagraph(text string, direction int32) BidiResolution ->
    ResolveBidi(text, direction)

    internal func BaseDirection(text string, direction int32) int32 {
      if direction == 1 || direction == 2 { return direction }
      return if ResolveBidi(text, direction).RightToLeft { 2 } else { 1 }
    }

    internal func Slice(shaped ShapedText, start int32, end int32) ShapedText ->
    shaped.Slice(start, end)

    internal func GlyphCount(shaped ShapedText) int32 -> shaped.GlyphCount

    internal func PrimaryFaceCacheCountForTests() int32 {
      lock (PrimaryFacesLock) { return PrimaryFaces.Count }
    }

    internal func PrimaryFaceCacheByteBudgetForTests() int64 -> PrimaryFaceCacheByteBudget

    internal func PrimaryFaceCacheBytesForTests() int64 {
      lock (PrimaryFacesLock) { return primaryFaceCacheBytes }
    }

    private func MeasureUncached(text string, families string, size float32, weight int32,
      italic bool, letterSpacing float32, direction int32) float32 ->
    MeasureLineUncached(text, 0, text.Length, families, size, weight, italic,
      letterSpacing, direction)

    private func ShapeUncached(paragraph string, lineStart int32, lineLength int32,
      families string, size float32, weight int32, italic bool, letterSpacing float32,
      direction int32, paragraphResolution BidiResolution?) ShapedText{
        let text = paragraph.Substring(lineStart, lineLength)
        let primary = ResolveCachedPrimary(families, weight, italic)
        let metrics = MetricsFor(primary.Provider.Metrics, size)
        let scratchOwner = AnalysisScratch()
        let scratch = scratchOwner.Rent(paragraph.Length)
        var ascent = metrics.Ascent
        var descent = metrics.Descent
        let runs = List[ShapedRun]()
        let fallbackCandidates = scratch.BeginFallbackCandidates()
        var cursor = 0.0F
        var extra = 0.0F
        var hasCluster = false
        var priorCluster uint32 = 0u
        var rightToLeft = direction == 2
        try {
          if lineLength == 0 {
            return ShapedText(text, runs, 0.0F, ascent, descent, rightToLeft)
          }

          let scriptRuns = UnicodeScripts.Resolve(paragraph, scratch)
          let resolution = if let value = paragraphResolution { value } else {
            ResolveBidi(paragraph, direction)
          }
          if resolution.Info == nil {
            appendDirectionalRange(paragraph, lineStart, lineLength, lineStart, direction == 2,
              families, weight, italic, size, letterSpacing, primary, fallbackCandidates,
              runs, ref cursor, ref extra, ref ascent, ref descent, ref hasCluster, ref priorCluster,
              scratch, scriptRuns)
            return ShapedText(text, runs, cursor + extra, ascent, descent,
              direction == 2)
          }

          guard let info = resolution.Info else {
            throw InvalidOperationException("Bidi resolution has no paragraph information")
          }
          let lineEnd = lineStart + lineLength
          var paragraphInfo Unicode.Bidi.ParagraphInfo
          var foundParagraph = false
          for candidate in info.Paragraphs {
            if lineStart >= candidate.Range.Start && lineEnd <= candidate.Range.End {
              paragraphInfo = candidate
              foundParagraph = true
              break
            }
          }
          if !foundParagraph { throw ArgumentOutOfRangeException("length") }
          rightToLeft = paragraphInfo.Level.IsRtl()
          let visual = info.VisualRuns(paragraphInfo, Unicode.Bidi.TextRange(lineStart, lineEnd))
          for visualRun in visual.Item2 {
            let rtl = info.Levels[visualRun.Start].IsRtl()
            appendDirectionalRange(paragraph, visualRun.Start, visualRun.Length, lineStart, rtl,
              families, weight, italic, size, letterSpacing, primary, fallbackCandidates,
              runs, ref cursor, ref extra, ref ascent, ref descent, ref hasCluster, ref priorCluster,
              scratch, scriptRuns)
          }
          return ShapedText(text, runs, cursor + extra, ascent, descent,
            rightToLeft)
        } catch (error Exception) {
          for run in runs { run.Dispose() }
          throw error
        } finally {
          var candidateIndex int32 = 0
          while candidateIndex < fallbackCandidates.Count {
            fallbackCandidates[candidateIndex].Dispose()
            candidateIndex++
          }
          fallbackCandidates.Clear()
          primary.Dispose()
          scratchOwner.Return(scratch)
        }
      }

    private func appendDirectionalRange(paragraph string, rangeStart int32, rangeLength int32,
      lineStart int32, rtl bool, families string, weight int32, italic bool, size float32,
      letterSpacing float32, primary TypefaceLease, fallbackCandidates List[TypefaceLease],
      runs List[ShapedRun], ref cursor float32, ref extra float32, ref ascent float32,
      ref descent float32, ref hasCluster bool, ref priorCluster uint32,
      scratch UnicodeTextAnalysisScratchScope, scriptRuns List[UnicodeScriptRun]) {
        let rangeEnd = rangeStart + rangeLength
        if rtl {
          var scriptIndex = scriptRuns.Count
          while scriptIndex > 0 {
            scriptIndex--
            let scriptRun = scriptRuns[scriptIndex]
            let scriptEnd = scriptRun.Start + scriptRun.Length
            let start = if scriptRun.Start < rangeStart { rangeStart } else { scriptRun.Start }
            let end = if scriptEnd > rangeEnd { rangeEnd } else { scriptEnd }
            if end > start {
              appendScriptRange(paragraph, start, end - start, lineStart, rtl, families, weight,
                italic, size, letterSpacing, primary, fallbackCandidates, runs, ref cursor,
                ref extra, ref ascent, ref descent, ref hasCluster, ref priorCluster, scratch,
                scriptRun.Script)
            }
          }
        } else {
          var scriptIndex int32 = 0
          while scriptIndex < scriptRuns.Count {
            let scriptRun = scriptRuns[scriptIndex]
            let scriptEnd = scriptRun.Start + scriptRun.Length
            let start = if scriptRun.Start < rangeStart { rangeStart } else { scriptRun.Start }
            let end = if scriptEnd > rangeEnd { rangeEnd } else { scriptEnd }
            if end > start {
              appendScriptRange(paragraph, start, end - start, lineStart, rtl, families, weight,
                italic, size, letterSpacing, primary, fallbackCandidates, runs, ref cursor,
                ref extra, ref ascent, ref descent, ref hasCluster, ref priorCluster, scratch,
                scriptRun.Script)
            }
            scriptIndex++
          }
        }
      }

    private func appendScriptRange(paragraph string, textStart int32, textLength int32,
      lineStart int32, rtl bool, families string, weight int32, italic bool, size float32,
      letterSpacing float32, primary TypefaceLease, fallbackCandidates List[TypefaceLease],
      runs List[ShapedRun], ref cursor float32, ref extra float32, ref ascent float32,
      ref descent float32, ref hasCluster bool, ref priorCluster uint32,
      scratch UnicodeTextAnalysisScratchScope, script uint32) {
        let text = paragraph.Substring(textStart, textLength)
        let direction = if rtl { 5u } else { 4u }
        let shaped = ShapeProvider(text, primary.Provider, direction, script)
        let count = shaped.Count
        let workspace = shaped.Workspace
        if !HasMissingGlyphs(workspace.GlyphBuffer, count) {
          appendGlyphRange(text, textStart, lineStart, rtl, size, letterSpacing, primary,
            workspace.GlyphBuffer, count, runs, ref cursor, ref extra, ref ascent, ref descent,
            ref hasCluster, ref priorCluster, scratch)
          return
        }

        if fallbackCandidates.Count == 0 {
          let resolved = ResolveFallbackCandidates(families, weight, italic, primary)
          for candidate in resolved { fallbackCandidates.Add(candidate) }
        }
        let primaryGlyphs = [count]VulkanTextGlyph
        if count != 0 { Array.Copy(workspace.GlyphBuffer, primaryGlyphs, count) }
        let graphemeScalars = scratch.BeginGraphemeScalars(text.Length)
        let boundaries = UnicodeGraphemes.Starts(text, graphemeScalars,
          scratch.BeginFallbackStarts(text.Length))
        let missing = [boundaries.Count]bool
        for glyph in primaryGlyphs {
          if glyph.GlyphId == 0u {
            markMissingClusterSpan(primaryGlyphs, int32(glyph.Cluster), text.Length, boundaries,
              missing)
          }
        }
        let selected = [boundaries.Count]int32
        var i int32 = 0
        while i < boundaries.Count {
          if missing[i] {
            let start = boundaries[i]
            let end = if i + 1 < boundaries.Count { boundaries[i + 1] } else { text.Length }
            let clusterText = text.Substring(start, end - start)
            var candidate int32 = 1
            while candidate < fallbackCandidates.Count {
              let candidateShaped = ShapeProvider(clusterText,
                fallbackCandidates[candidate].Provider, direction, script)
              let candidateCount = candidateShaped.Count
              let candidateWorkspace = candidateShaped.Workspace
              if HasUsableGlyphs(candidateWorkspace.GlyphBuffer, candidateCount) {
                selected[i] = candidate
                break
              }
              candidate++
            }
          }
          i++
        }

        if rtl {
          var endIndex = boundaries.Count
          while endIndex > 0 {
            let selection = selected[endIndex - 1]
            var startIndex = endIndex - 1
            while startIndex > 0 && selected[startIndex - 1] == selection { startIndex-- }
            appendFallbackGroup(text, textStart, lineStart, rtl, boundaries[startIndex],
              if endIndex < boundaries.Count { boundaries[endIndex] } else { text.Length },
              size, letterSpacing, fallbackCandidates[selection], direction, script, runs,
              ref cursor, ref extra, ref ascent, ref descent, ref hasCluster, ref priorCluster,
              scratch)
            endIndex = startIndex
          }
        } else {
          var startIndex int32 = 0
          while startIndex < boundaries.Count {
            let selection = selected[startIndex]
            var endIndex = startIndex + 1
            while endIndex < boundaries.Count && selected[endIndex] == selection { endIndex++ }
            appendFallbackGroup(text, textStart, lineStart, rtl, boundaries[startIndex],
              if endIndex < boundaries.Count { boundaries[endIndex] } else { text.Length },
              size, letterSpacing, fallbackCandidates[selection], direction, script, runs,
              ref cursor, ref extra, ref ascent, ref descent, ref hasCluster, ref priorCluster,
              scratch)
            startIndex = endIndex
          }
        }
      }

    private func appendFallbackGroup(text string, rangeStart int32, lineStart int32, rtl bool,
      groupStart int32, groupEnd int32, size float32, letterSpacing float32,
      selected TypefaceLease, direction uint32, script uint32, runs List[ShapedRun],
      ref cursor float32, ref extra float32, ref ascent float32, ref descent float32,
      ref hasCluster bool, ref priorCluster uint32, scratch UnicodeTextAnalysisScratchScope) {
        let groupText = text.Substring(groupStart, groupEnd - groupStart)
        let shaped = ShapeProvider(groupText, selected.Provider, direction, script)
        let count = shaped.Count
        let workspace = shaped.Workspace
        appendGlyphRange(groupText, rangeStart + groupStart, lineStart, rtl, size, letterSpacing,
          selected, workspace.GlyphBuffer, count, runs, ref cursor, ref extra, ref ascent,
          ref descent, ref hasCluster, ref priorCluster, scratch)
      }

    private func appendGlyphRange(text string, rangeStart int32, lineStart int32, rtl bool,
      size float32, letterSpacing float32, selected TypefaceLease, source []VulkanTextGlyph,
      count int32, runs List[ShapedRun], ref cursor float32, ref extra float32,
      ref ascent float32, ref descent float32, ref hasCluster bool, ref priorCluster uint32,
      scratch UnicodeTextAnalysisScratchScope) {
        let glyphs = [count]uint32
        let points = [count]TextPoint
        let clusters = [count]uint32
        let graphemeScalars = scratch.BeginGraphemeScalars(text.Length)
        let boundaries = UnicodeGraphemes.Starts(text, graphemeScalars,
          scratch.BeginGlyphStarts(text.Length))
        let factor = size / 64.0F
        var rawWidth = 0.0F
        var spacingCount int32 = 0
        var localPrior uint32 = 0u
        var hasLocalPrior = false
        var i int32 = 0
        while i < count {
          let glyph = source[i]
          glyphs[i] = glyph.GlyphId
          clusters[i] = glyph.Cluster
          let clusterChanged = !hasLocalPrior || glyph.Cluster != localPrior
          if clusterChanged && hasLocalPrior && boundaryContains(boundaries, int32(glyph.Cluster)) {
            spacingCount++
          }
          rawWidth = rawWidth + MathF.Abs(float32(glyph.XAdvance) * factor)
          localPrior = glyph.Cluster
          hasLocalPrior = true
          i++
        }
        if hasCluster && count != 0 && boundaryContains(boundaries, int32(clusters[0])) {
          spacingCount++
        }
        let runSpacing = float32(spacingCount) * letterSpacing
        let runWidth = rawWidth + runSpacing
        let base = cursor + extra
        let origin = if rtl { base + runWidth } else { base }
        var consumed = 0.0F
        localPrior = 0u
        hasLocalPrior = false
        i = 0
        while i < count {
          let glyph = source[i]
          let clusterChanged = !hasLocalPrior || glyph.Cluster != localPrior
          if clusterChanged && hasLocalPrior && boundaryContains(boundaries, int32(glyph.Cluster)) {
            consumed = consumed + letterSpacing
          }
          let xOffset = float32(glyph.XOffset) * factor
          let yOffset = float32(glyph.YOffset) * factor
          let x = if rtl { origin - consumed + xOffset }
          else { origin + consumed + xOffset }
          points[i] = TextPoint(x, yOffset)
          consumed = consumed + MathF.Abs(float32(glyph.XAdvance) * factor)
          localPrior = glyph.Cluster
          hasLocalPrior = true
          i++
        }
        if count != 0 {
          let usedMetrics = MetricsFor(selected.Provider.Metrics, size)
          ascent = MathF.Min(ascent, usedMetrics.Ascent)
          descent = MathF.Max(descent, usedMetrics.Descent)
          let runStart = if rtl { base + runWidth } else { base }
          let runEnd = if rtl { base } else { base + runWidth }
          let lease = selected.Duplicate()
          runs.Add(ShapedRun(text, selected.Family, glyphs, points, clusters,
            rangeStart - lineStart, rtl, runStart, runEnd, false, lease))
        }
        cursor = cursor + rawWidth
        extra = extra + runSpacing
        if count != 0 {
          hasCluster = true
          priorCluster = clusters[count - 1]
        }
      }

    private func ShapeProvider(text string, provider VulkanTextProvider, direction uint32,
      script uint32)
    TextProviderShapeResult{
      let options = VulkanTextShapingOptions{
        Direction: direction, Script: script, Language: nil, ClusterLevel: 0u, Flags: 0u,
        Features: nil,
      }
      var workspace = ShapingWorkspace(0)
      var providerResult = provider.ShapeInto(text, options, workspace)
      if providerResult.AbiVersion != VulkanTextProviderAbi.Version {
        throw InvalidOperationException("Vulkan text provider ABI version is invalid")
      }
      if providerResult.Status == VulkanTextProviderAbi.CapacityExceeded {
        workspace = ShapingWorkspace(providerResult.Required)
        providerResult = provider.ShapeInto(text, options, workspace)
      }
      if providerResult.AbiVersion != VulkanTextProviderAbi.Version {
        throw InvalidOperationException("Vulkan text provider ABI version is invalid")
      }
      if providerResult.Status != VulkanTextProviderAbi.Success {
        throw InvalidOperationException("Vulkan text shaping failed")
      }
      if providerResult.Count < 0 || providerResult.Count != workspace.GlyphCount {
        throw InvalidOperationException("Vulkan text shaping output is invalid")
      }
      return TextProviderShapeResult(workspace, providerResult.Count)
    }

    private func HasMissingGlyphs(source []VulkanTextGlyph, count int32) bool {
      var i int32 = 0
      while i < count {
        if source[i].GlyphId == 0u { return true }
        i++
      }
      return false
    }

    private func HasUsableGlyphs(source []VulkanTextGlyph, count int32) bool {
      if count == 0 { return false }
      var i int32 = 0
      while i < count {
        if source[i].GlyphId == 0u { return false }
        i++
      }
      return true
    }

    private func markMissingClusterSpan(source []VulkanTextGlyph, clusterStart int32,
      textLength int32, boundaries List[int32], missing []bool) {
        if clusterStart < 0 || clusterStart >= textLength { return }
        var clusterEnd = textLength
        var glyphIndex int32 = 0
        while glyphIndex < source.Length {
          let candidate = int32(source[glyphIndex].Cluster)
          if candidate > clusterStart && candidate < clusterEnd { clusterEnd = candidate }
          glyphIndex++
        }
        var i int32 = 0
        while i < boundaries.Count {
          let start = boundaries[i]
          let end = if i + 1 < boundaries.Count { boundaries[i + 1] } else { textLength }
          if start < clusterEnd && end > clusterStart { missing[i] = true }
          i++
        }
      }

    private func boundaryContains(boundaries List[int32], value int32) bool {
      var index int32 = 0
      while index < boundaries.Count {
        let boundary = boundaries[index]
        if boundary == value { return true }
        if boundary > value { return false }
        index++
      }
      return false
    }

    private func MetricsFor(metrics VulkanHarfBuzzMetrics, size float32) TextFontMetrics {
      if metrics.UnitsPerEm == 0u { throw InvalidOperationException("HarfBuzz font UPEM is zero") }
      let scale = size / float32(metrics.UnitsPerEm)
      return TextFontMetrics(-float32(metrics.Ascender) * scale,
        -float32(metrics.Descender) * scale)
    }

    private func ShapingWorkspace(required int32) VulkanTextShapingWorkspace {
      if required < 0 || required > VulkanTextShapingWorkspace.MaxGlyphCapacity {
        throw InvalidOperationException("Vulkan text shaping output exceeds workspace capacity")
      }
      if required > ShapingWorkspaceRetainedCapacity {
        return VulkanTextShapingWorkspace(required)
      }
      if let current = shapingWorkspace {
        if current.GlyphCapacity >= required { return current }
        var capacity = current.GlyphCapacity
        if capacity == 0 { capacity = 256 }
        while capacity < required {
          if capacity >= ShapingWorkspaceRetainedCapacity / 2 {
            capacity = ShapingWorkspaceRetainedCapacity
          } else {
            capacity = capacity * 2
          }
        }
        let created = VulkanTextShapingWorkspace(capacity)
        shapingWorkspace = created
        return created
      }
      let capacity = if required > 256 { required } else { 256 }
      let created = VulkanTextShapingWorkspace(capacity)
      shapingWorkspace = created
      return created
    }
    private func AnalysisScratch() UnicodeTextAnalysisScratch {
      if let current = textAnalysisScratch {
        return current
      }
      let created = UnicodeTextAnalysisScratch()
      textAnalysisScratch = created
      return created
    }

    private func validateRange(paragraph string, start int32, length int32, direction int32) {
      if paragraph == nil { throw ArgumentNullException("paragraph") }
      if start < 0 { throw ArgumentOutOfRangeException("start") }
      if length < 0 { throw ArgumentOutOfRangeException("length") }
      if start > paragraph.Length - length { throw ArgumentOutOfRangeException("length") }
      if direction < 0 || direction > 2 { throw ArgumentOutOfRangeException("direction") }
    }

    private func ResolveBidi(text string, direction int32) BidiResolution {
      if text == nil { throw ArgumentNullException("text") }
      if text.Length == 0 { return BidiResolution(nil, direction == 2) }
      if !RequiresBidi(text, direction) { return BidiResolution(nil, false) }
      let defaultLevel = if direction == 1 { Unicode.Bidi.Level.Ltr() }
      else if direction == 2 { Unicode.Bidi.Level.Rtl() } else { nil }
      let info = Unicode.Bidi.BidiInfo.New(text, defaultLevel)
      return BidiResolution(info, info.Paragraphs.Count != 0 && info.Paragraphs[0].Level.IsRtl())
    }

    private func RequiresBidi(text string, direction int32) bool {
      if direction == 2 { return text.Length != 0 }
      for rune in text.EnumerateRunes() {
        let value = Unicode.Bidi.CharData.BidiClass(rune)
        if value == Unicode.Bidi.BidiClass.AL || value == Unicode.Bidi.BidiClass.AN
          || value == Unicode.Bidi.BidiClass.FSI || value == Unicode.Bidi.BidiClass.LRE
          || value == Unicode.Bidi.BidiClass.LRI || value == Unicode.Bidi.BidiClass.LRO
          || value == Unicode.Bidi.BidiClass.PDF || value == Unicode.Bidi.BidiClass.PDI
          || value == Unicode.Bidi.BidiClass.R || value == Unicode.Bidi.BidiClass.RLE
          || value == Unicode.Bidi.BidiClass.RLI || value == Unicode.Bidi.BidiClass.RLO{
            return true
          }
      }
      return false
    }

    private func ResolveCachedPrimary(families string, weight int32, italic bool) TypefaceLease {
      let registryGeneration = FontRegistry.Generation
      let key = TextPrimaryFaceKey(families, weight, italic, registryGeneration)
      lock (PrimaryFacesLock) {
        if PrimaryFaces.TryGetValue(key, out var cached) { return cached.Lease() }
      }
      let registration = ResolveRegisteredPrimary(families, weight, italic)
      var evicted List[TypefaceResource]?
      var uncached TypefaceResource?
      var lease TypefaceLease
      lock (PrimaryFacesLock) {
        if PrimaryFaces.TryGetValue(key, out var cached) { return cached.Lease() }
        let selection = if let value = registration {
          TextFontSelection(value.Family, nil, value)
        } else {
          ResolveSystemPrimary(families, weight, italic)
        }
        let resource = CreateTypefaceResource(selection)
        if resource.ByteSize > PrimaryFaceCacheByteBudget {
          lease = resource.Lease()
          uncached = resource
        } else {
          PrimaryFaces.Add(key, resource)
          PrimaryFaceOrder.Enqueue(key)
          primaryFaceCacheBytes = primaryFaceCacheBytes + resource.ByteSize
          while PrimaryFaceOrder.Count > PrimaryFaceCacheCapacity
            || primaryFaceCacheBytes > PrimaryFaceCacheByteBudget{
              let oldKey = PrimaryFaceOrder.Dequeue()
              if PrimaryFaces.Remove(oldKey, out var removed) {
                primaryFaceCacheBytes = primaryFaceCacheBytes - removed.ByteSize
                if let values = evicted {
                  values.Add(removed)
                } else {
                  let values = List[TypefaceResource]()
                  values.Add(removed)
                  evicted = values
                }
              }
            }
          lease = resource.Lease()
        }
      }
      if let value = uncached { value.Release() }
      if let values = evicted {
        for value in values {
          value.Release()
          Interlocked.Increment(&primaryFaceDisposals)
        }
      }
      return lease
    }

    private func CreateTypefaceResource(selection TextFontSelection) TypefaceResource {
      if let registration = selection.Registration {
        return TypefaceResource(selection.Family, registration.Bytes, registration.FaceIndex,
          registration.Variations, registration.SourceId, registration.Generation)
      }
      guard let path = selection.Path else {
        throw InvalidOperationException("System font selection has no path")
      }
      return TypefaceResource(selection.Family, File.ReadAllBytes(path), 0u, nil, 0uL, 0uL)
    }

    private func ResolveFallbackCandidates(families string, weight int32, italic bool,
      primary TypefaceLease) List[TypefaceLease]{
        let result = List[TypefaceLease]()
        result.Add(primary.Duplicate())
        try {
          let familiesSeen = List[string]()
          familiesSeen.Add(primary.Family)
          let names = SplitFamilies(families)
          var i int32 = 0
          while i < names.Length && result.Count < PrimaryFaceCacheCapacity {
            let name = names[i]
            var seenFamily = false
            for previous in familiesSeen {
              if previous == name {
                seenFamily = true
                break
              }
            }
            if !seenFamily {
              let candidate = ResolveCachedPrimary(name, weight, italic)
              if candidate.IsRegistered || normalizeFamily(candidate.Family) == normalizeFamily(name) {
                result.Add(candidate)
                familiesSeen.Add(name)
              } else {
                candidate.Dispose()
              }
            }
            i++
          }
          if OperatingSystem.IsAndroid() && result.Count < PrimaryFaceCacheCapacity {
            let name = "Noto Color Emoji"
            var seenFamily = false
            for previous in familiesSeen {
              if normalizeFamily(previous) == normalizeFamily(name) {
                seenFamily = true
                break
              }
            }
            if !seenFamily {
              let candidate = ResolveCachedPrimary(name, 400, false)
              if candidate.IsRegistered || normalizeFamily(candidate.Family) == normalizeFamily(name) {
                result.Add(candidate)
                familiesSeen.Add(name)
              } else {
                candidate.Dispose()
              }
            }
          }
          return result
        } catch (error Exception) {
          for lease in result { lease.Dispose() }
          throw error
        }
      }

    private func ResolveRegisteredPrimary(families string, weight int32, italic bool)
    FontRegistration? {
      let names = SplitFamilies(families)
      for name in names {
        if let found = FontRegistry.Resolve(name, weight, italic) { return found }
      }
      return nil
    }

    private func ResolveSystemPrimary(families string, weight int32, italic bool)
    TextFontSelection{
      let names = SplitFamilies(families)
      for name in names {
        if File.Exists(name) { return TextFontSelection(name, name, nil) }
        if let found = SystemFontResolvers.Current().Find(name, weight, italic) {
          return TextFontSelection(name, found, nil)
        }
      }
      if let found = SystemFontResolvers.Current().Find("sans-serif", weight, italic) {
        return TextFontSelection("sans-serif", found, nil)
      }
      throw InvalidOperationException("No Vulkan text font file could be resolved")
    }

    private func SplitFamilies(families string) []string {
      if families == nil || families.Trim().Length == 0 { return [1]string{"sans-serif"} }
      return families.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
    }

    private func normalizeFamily(value string) string -> value.Trim().ToLowerInvariant()
  }
}
