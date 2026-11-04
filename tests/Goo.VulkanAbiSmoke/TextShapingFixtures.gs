package Goo

import System
import System.IO
import System.Threading.Tasks

internal partial class TextShaping {
  shared {
    internal func PrimaryFaceCacheCountForTests() int32 {
      lock (PrimaryFacesLock) { return PrimaryFaces.Count }
    }

    internal func PrimaryFaceCacheByteBudgetForTests() int64 -> PrimaryFaceCacheByteBudget

    internal func PrimaryFaceCacheBytesForTests() int64 {
      lock (PrimaryFacesLock) { return primaryFaceCacheBytes }
    }

    internal func FallbackPreloadForTests() Task {
      lock PrimaryFacesLock { return fallbackPreload }
    }

    internal func RunEllipsisGate(fontPath string) {
      using let font = FontSource("GooEllipsisFixture", 400, false, File.ReadAllBytes(fontPath))
      font.Register()
      let samples = []string{
        "office café affine ffi ffl AVATAR To Wa typography",
        "שלום עולם טקסט ארוך לבדיקת חיתוך ושמירה על אותיות",
        "مرحبا بالعالم العربية لاختبار النص الطويل والاتصال",
        "Title שלום 123 العربية office café mixed directions",
        "Emoji 👩🏽‍💻 family 👨‍👩‍👧‍👦 flags 🇺🇸🇸🇪 and 😀 end",
        "Combining á ạ̈ क्‍षि हिन्दी বাংলা ภาษาไทย end",
        "漢字かなカナ 中文测试 文本截断 日本語 한국어 글자 end",
        "office café",
      }
      var checks = 0
      var cacheChecks = 0
      var cacheReuses = 0
      for text in samples {
        for direction in []int32{0, 1, 2} {
          for spacing in []float32{0f, 0.75f, -0.5f} {
            using let whole = Shape(text, font.Family, 21f, 400, false, spacing, direction)
            for step in 0 ... 101 {
              let width = whole.Width * float32(step) / 100f
              let node = Node{Content: text, FontFamily: font.Family, FontSize: 14,
                TextScaleFactor: 1.5f, FontWeight: 400, Direction: Direction(direction),
                LetterSpacing: spacing, TextWrap: TextWrap.NoWrap, TextTrimming: TextTrimming.Ellipsis}
              let paragraph = TextAnalyses.For(node).Paragraph(0)
              let line = TextLayouts.shapeNoWrap(node, paragraph, width)
              let expected = if whole.Width <= width { text } else {
                ReferenceEllipsis(text, font.Family, spacing, direction, width)
              }
              if line.Content != expected {
                throw InvalidOperationException("Ellipsis cut differs at case " + checks.ToString())
              }
              using let expectedShape = Shape(expected, font.Family, 21f, 400, false, spacing,
                BaseDirection(text, direction))
              guard let actual = line.Shape else { throw InvalidOperationException("Missing ellipsis shape") }
              if !SameEllipsisShape(expectedShape, actual) {
                throw InvalidOperationException("Ellipsis glyphs differ at case " + checks.ToString())
              }
              actual.Dispose()
              let prior = TextLayouts.shape(node, paragraph, 0, text.Length)
              let clamped = TextLayouts.ellipsizeClampedLine(node, prior, width)
              let expectedClamped = ReferenceEllipsis(text, font.Family, spacing, direction, width)
              using let clampedShape = Shape(expectedClamped, font.Family, 21f, 400, false, spacing,
                BaseDirection(text, direction))
              guard let actualClamped = clamped.Shape else { throw InvalidOperationException("Missing clamped shape") }
              if clamped.Content != expectedClamped || !SameEllipsisShape(clampedShape, actualClamped) {
                throw InvalidOperationException("Clamped ellipsis differs at case " + checks.ToString())
              }
              actualClamped.Dispose()
              let cached = TextLayouts.For(node, width)
              let limit = Single.IsFinite(cached.WidthLimit) ? cached.WidthLimit : whole.Width + 1f
              for paintWidth in []float32{MathF.Max(0f, MathF.BitDecrement(limit)), limit,
                width + 1f / 3f, MathF.Max(0f, width - 1f / 3f)} {
                let painted = TextLayouts.For(node, paintWidth)
                let expectedPaint = whole.Width <= paintWidth ? text
                  : ReferenceEllipsis(text, font.Family, spacing, direction, paintWidth)
                using let expectedPaintShape = Shape(expectedPaint, font.Family, 21f, 400, false, spacing,
                  BaseDirection(text, direction))
                guard let paintedShape = painted.Lines[0].Shape else {
                  throw InvalidOperationException("Missing cached ellipsis shape")
                }
                if painted.Lines[0].Content != expectedPaint || !SameEllipsisShape(expectedPaintShape, paintedShape) {
                  throw InvalidOperationException("Cached ellipsis differs at case " + cacheChecks.ToString())
                }
                if paintWidth >= cached.MinWidth && paintWidth < cached.WidthLimit {
                  if !Object.ReferenceEquals(cached, painted) {
                    throw InvalidOperationException("Stable text width did not reuse its layout")
                  }
                  cacheReuses++
                }
                cacheChecks++
              }
              TextLayouts.Dispose(node)
              checks++
            }
          }
        }
      }
      Console.WriteLine("ELLIPSIS_IDENTITY cases=" + checks.ToString())
      if cacheReuses == 0 { throw InvalidOperationException("No text width cache reuse was exercised") }
      Console.WriteLine("ELLIPSIS_CACHE_IDENTITY cases=" + cacheChecks.ToString() + " reused=" + cacheReuses.ToString())
    }

    private func ReferenceEllipsis(text string, family string, spacing float32, direction int32,
      width float32) string {
      let elements = UnicodeGraphemes.Starts(text)
      let resolved = BaseDirection(text, direction)
      if elements.Length == 0 || MeasureUncached("…", family, 21f, 400, false, spacing, resolved, "") > width { return "…" }
      var low = 0
      var high = elements.Length
      while low < high {
        let middle = low + (high - low + 1) / 2
        let end = middle < elements.Length ? elements[middle] : text.Length
        if MeasureUncached(text.Substring(0, end) + "…", family, 21f, 400, false, spacing, resolved, "") <= width {
          low = middle
        } else { high = middle - 1 }
      }
      return text.Substring(0, low < elements.Length ? elements[low] : text.Length) + "…"
    }

    private func SameEllipsisShape(expected ShapedText, actual ShapedText) bool {
      if expected.Width != actual.Width || expected.Ascent != actual.Ascent
        || expected.Descent != actual.Descent || expected.RightToLeft != actual.RightToLeft
        || expected.Runs.Count != actual.Runs.Count { return false }
      for index in 0 ... expected.Runs.Count {
        let a = expected.Runs[index]
        let b = actual.Runs[index]
        if a.Text != b.Text || a.Family != b.Family || a.LogicalStart != b.LogicalStart
          || a.RightToLeft != b.RightToLeft || a.VisualStart != b.VisualStart
          || a.VisualEnd != b.VisualEnd || a.Glyphs.Length != b.Glyphs.Length { return false }
        for glyph in 0 ... a.Glyphs.Length {
          if a.Glyphs[glyph] != b.Glyphs[glyph] || a.Clusters[glyph] != b.Clusters[glyph]
            || a.Points[glyph] != b.Points[glyph] { return false }
        }
      }
      return true
    }
  }
}
