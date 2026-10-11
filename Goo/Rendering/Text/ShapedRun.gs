package Goo

import System
import System.Collections.Generic

internal data struct TextPoint(X float32, Y float32) { }

internal sealed class ShapedRun : IDisposable {
  internal prop Text string{ get; set; }
  internal prop Family string{ get; set; }
  internal prop Glyphs []uint32{ get; set; }
  internal prop Points []TextPoint{ get; set; }
  internal prop Clusters []uint32{ get; set; }
  internal prop LogicalStart int32{ get; set; }
  internal prop RightToLeft bool{ get; set; }
  internal prop VisualStart float32{ get; set; }
  internal prop VisualEnd float32{ get; set; }
  internal prop OwnsTypeface bool{ get; set; }
  internal prop Provider VulkanTextProvider{
    get {
      guard let lease = typefaceLease else { throw ObjectDisposedException("ShapedRun") }
      return lease.Provider
    }
  }
  private let typefaceLease TypefaceLease?
  private var disposed bool

  internal init(text string, family string, glyphs []uint32, points []TextPoint,
    clusters []uint32, logicalStart int32, rightToLeft bool, visualStart float32,
    visualEnd float32, ownsTypeface bool, lease TypefaceLease?) {
      Text = text
      Family = family
      Glyphs = glyphs
      Points = points
      Clusters = clusters
      LogicalStart = logicalStart
      RightToLeft = rightToLeft
      VisualStart = visualStart
      VisualEnd = visualEnd
      OwnsTypeface = ownsTypeface
      typefaceLease = lease
    }

  internal func Slice(start int32, end int32) ShapedRun? {
    let glyphs = List[uint32]()
    let points = List[TextPoint]()
    let clusters = List[uint32]()
    var firstGlyph int32 = -1
    var lastGlyph int32 = -1
    var glyph int32 = 0
    while glyph < Clusters.Length {
      let cluster = Clusters[glyph]
      var next = glyph + 1
      while next < Clusters.Length && Clusters[next] == cluster { next++ }
      let absoluteStart = LogicalStart + int32(cluster)
      if absoluteStart >= start && absoluteStart < end {
        if firstGlyph < 0 { firstGlyph = glyph }
        lastGlyph = next
        var i = glyph
        while i < next {
          glyphs.Add(Glyphs[i])
          points.Add(Points[i])
          clusters.Add(Clusters[i])
          i++
        }
      }
      glyph = next
    }
    if glyphs.Count == 0 { return nil }
    let lease = if let current = typefaceLease { current.Duplicate() } else { nil }
    let left = GlyphEdge(firstGlyph)
    let right = GlyphEdge(lastGlyph)
    return ShapedRun(Text, Family, glyphs.ToArray(), points.ToArray(), clusters.ToArray(),
      LogicalStart, RightToLeft, RightToLeft ? right : left, RightToLeft ? left : right,
      lease == nil, lease)
  }

  internal func GlyphEdge(glyph int32) float32 ->
    if glyph == 0 { MathF.Min(VisualStart, VisualEnd) }
    else if glyph < Points.Length { Points[glyph].X }
    else { MathF.Max(VisualStart, VisualEnd) }

  public func Dispose() {
    if disposed { return }
    disposed = true
    if let lease = typefaceLease { lease.Dispose() }
  }
}
