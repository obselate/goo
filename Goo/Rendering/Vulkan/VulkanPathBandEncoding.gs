package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel

internal data struct PathAnalyticHeader {
  internal let Format uint32
  internal let FillRuleMask uint32
  internal let HorizontalBandCount uint32
  internal let VerticalBandCount uint32
  internal let HorizontalCurveIndexCount uint32
  internal let VerticalCurveIndexCount uint32
  internal let CurveCount uint32
  internal let Reserved uint32
  internal let MinimumX float32
  internal let MinimumY float32
  internal let MaximumX float32
  internal let MaximumY float32
}

internal data struct PathAnalyticBand {
  internal let Minimum float32
  internal let Maximum float32
  internal let Split float32
  internal let ForwardStart uint32
  internal let ForwardCount uint32
  internal let ReverseStart uint32
  internal let ReverseCount uint32
  internal let Flags uint32
}

internal data struct PathAnalyticCurve {
  internal let X0 float32
  internal let Y0 float32
  internal let CX float32
  internal let CY float32
  internal let X1 float32
  internal let Y1 float32
  internal let Flags uint32
  internal let Reserved uint32
}

internal sealed class PathBandEncoding {
  internal const FormatVersion uint32 = 1u
  internal const FillRuleNonZeroMask uint32 = 1u
  internal const FillRuleEvenOddMask uint32 = 2u
  internal const HeaderByteStride int64 = 48
  internal const BandByteStride int64 = 32
  internal const IndexByteStride int64 = 4
  internal const CurveByteStride int64 = 32

  shared {
    internal let Empty PathBandEncoding = CreateEmpty(1uL)

    internal func CreateEmpty(revision uint64) PathBandEncoding {
      let result = PathBandEncoding(0.0F, 0.0F, 0.0F, 0.0F,
        []PathAnalyticBand{}, []PathAnalyticBand{}, []uint32{}, []uint32{},
        []PathAnalyticCurve{}, 0u, revision)
      result.Reset(revision)
      return result
    }
  }

  private var minimumX float32
  private var minimumY float32
  private var maximumX float32
  private var maximumY float32
  private let horizontalBands IReadOnlyList[PathAnalyticBand]
  private let verticalBands IReadOnlyList[PathAnalyticBand]
  private let horizontalCurveIndices IReadOnlyList[uint32]
  private let verticalCurveIndices IReadOnlyList[uint32]
  private let curves IReadOnlyList[PathAnalyticCurve]
  private let horizontalBandBuffer List[PathAnalyticBand]
  private let verticalBandBuffer List[PathAnalyticBand]
  private let horizontalIndexBuffer List[uint32]
  private let verticalIndexBuffer List[uint32]
  private let curveBuffer List[PathAnalyticCurve]
  private var header PathAnalyticHeader
  private var fillRuleMask uint32
  private var words []uint32
  private var wordCount int32
  private var byteCount int64
  private var geometryRevision uint64

  internal init(minimumX float32, minimumY float32, maximumX float32, maximumY float32,
    horizontalBands []PathAnalyticBand, verticalBands []PathAnalyticBand,
    horizontalCurveIndices []uint32, verticalCurveIndices []uint32,
    curves []PathAnalyticCurve, fillRuleMask uint32, revision uint64 = 1uL) {
      this.minimumX = minimumX
      this.minimumY = minimumY
      this.maximumX = maximumX
      this.maximumY = maximumY
      horizontalBandBuffer = List[PathAnalyticBand](horizontalBands.Length)
      verticalBandBuffer = List[PathAnalyticBand](verticalBands.Length)
      horizontalIndexBuffer = List[uint32](horizontalCurveIndices.Length)
      verticalIndexBuffer = List[uint32](verticalCurveIndices.Length)
      curveBuffer = List[PathAnalyticCurve](curves.Length)
      this.horizontalBands = ReadOnlyCollection[PathAnalyticBand](horizontalBandBuffer)
      this.verticalBands = ReadOnlyCollection[PathAnalyticBand](verticalBandBuffer)
      this.horizontalCurveIndices = ReadOnlyCollection[uint32](horizontalIndexBuffer)
      this.verticalCurveIndices = ReadOnlyCollection[uint32](verticalIndexBuffer)
      this.curves = ReadOnlyCollection[PathAnalyticCurve](curveBuffer)
      words = []uint32{}
      Rebuild(minimumX, minimumY, maximumX, maximumY, horizontalBands,
        verticalBands, horizontalCurveIndices, verticalCurveIndices, curves,
        fillRuleMask, revision)
    }

  internal prop Format uint32{ get -> FormatVersion }
  internal prop MinimumX float32{ get -> minimumX }
  internal prop MinimumY float32{ get -> minimumY }
  internal prop MaximumX float32{ get -> maximumX }
  internal prop MaximumY float32{ get -> maximumY }
  internal prop HorizontalBands IReadOnlyList[PathAnalyticBand]{ get -> horizontalBands }
  internal prop VerticalBands IReadOnlyList[PathAnalyticBand]{ get -> verticalBands }
  internal prop HorizontalCurveIndices IReadOnlyList[uint32]{ get -> horizontalCurveIndices }
  internal prop VerticalCurveIndices IReadOnlyList[uint32]{ get -> verticalCurveIndices }
  internal prop Curves IReadOnlyList[PathAnalyticCurve]{ get -> curves }
  internal prop Header PathAnalyticHeader{ get -> header }
  internal prop Words []uint32{ get -> words }
  internal prop WordCount int32{ get -> wordCount }
  internal prop FillRuleMask uint32{ get -> fillRuleMask }
  internal prop GeometryRevision uint64{ get -> geometryRevision }
  internal prop HorizontalBandCount int32{ get -> horizontalBands.Count }
  internal prop VerticalBandCount int32{ get -> verticalBands.Count }
  internal prop HorizontalCurveIndexCount int32{ get -> horizontalCurveIndices.Count }
  internal prop VerticalCurveIndexCount int32{ get -> verticalCurveIndices.Count }
  internal prop CurveCount int32{ get -> curves.Count }
  internal prop ByteCount int64{ get -> byteCount }
  internal prop HeaderByteCount int64{ get -> HeaderByteStride }
  internal prop BandByteCount int64{
    get -> int64(horizontalBands.Count + verticalBands.Count) * BandByteStride
  }
  internal prop IndexByteCount int64{
    get -> int64(horizontalCurveIndices.Count + verticalCurveIndices.Count) * IndexByteStride
  }
  internal prop CurveByteCount int64{ get -> int64(curves.Count) * CurveByteStride }

  internal func Rebuild(minimumX float32, minimumY float32, maximumX float32, maximumY float32,
    nextHorizontalBands IReadOnlyList[PathAnalyticBand],
    nextVerticalBands IReadOnlyList[PathAnalyticBand],
    nextHorizontalIndices IReadOnlyList[uint32],
    nextVerticalIndices IReadOnlyList[uint32],
    nextCurves IReadOnlyList[PathAnalyticCurve], nextFillRuleMask uint32,
    revision uint64) {
      this.minimumX = minimumX
      this.minimumY = minimumY
      this.maximumX = maximumX
      this.maximumY = maximumY
      horizontalBandBuffer.Clear()
      verticalBandBuffer.Clear()
      horizontalIndexBuffer.Clear()
      verticalIndexBuffer.Clear()
      curveBuffer.Clear()
      var index int32 = 0
      while index < nextHorizontalBands.Count {
        horizontalBandBuffer.Add(nextHorizontalBands[index])
        index++
      }
      index = 0
      while index < nextVerticalBands.Count {
        verticalBandBuffer.Add(nextVerticalBands[index])
        index++
      }
      index = 0
      while index < nextHorizontalIndices.Count {
        horizontalIndexBuffer.Add(nextHorizontalIndices[index])
        index++
      }
      index = 0
      while index < nextVerticalIndices.Count {
        verticalIndexBuffer.Add(nextVerticalIndices[index])
        index++
      }
      index = 0
      while index < nextCurves.Count {
        curveBuffer.Add(nextCurves[index])
        index++
      }
      fillRuleMask = nextFillRuleMask
      geometryRevision = revision == 0uL ? 1uL : revision
      header = PathAnalyticHeader{
        Format: FormatVersion,
        FillRuleMask: fillRuleMask,
        HorizontalBandCount: uint32(horizontalBandBuffer.Count),
        VerticalBandCount: uint32(verticalBandBuffer.Count),
        HorizontalCurveIndexCount: uint32(horizontalIndexBuffer.Count),
        VerticalCurveIndexCount: uint32(verticalIndexBuffer.Count),
        CurveCount: uint32(curveBuffer.Count),
        Reserved: 0u,
        MinimumX: minimumX,
        MinimumY: minimumY,
        MaximumX: maximumX,
        MaximumY: maximumY,
      }
      Repack()
    }

  internal func Reset(revision uint64) {
    this.minimumX = 0.0F
    this.minimumY = 0.0F
    this.maximumX = 0.0F
    this.maximumY = 0.0F
    horizontalBandBuffer.Clear()
    verticalBandBuffer.Clear()
    horizontalIndexBuffer.Clear()
    verticalIndexBuffer.Clear()
    curveBuffer.Clear()
    fillRuleMask = 0u
    header = PathAnalyticHeader{}
    geometryRevision = revision == 0uL ? 1uL : revision
    wordCount = 0
    byteCount = 0
  }

  internal func Supports(fillRule FillRule) bool {
    let mask = if fillRule == FillRule.EvenOdd {
      FillRuleEvenOddMask
    } else {
      FillRuleNonZeroMask
    }
    return (fillRuleMask & mask) != 0u
  }

  private func Repack() {
    let requiredWordCount = int32(HeaderByteStride / 4)
    +(horizontalBands.Count + verticalBands.Count) * int32(BandByteStride / 4)
    +(horizontalCurveIndices.Count + verticalCurveIndices.Count) * int32(IndexByteStride / 4)
    +curves.Count * int32(CurveByteStride / 4)
    if requiredWordCount > words.Length {
      words = [ArrayGrowthCapacity(words.Length, requiredWordCount,
        requiredWordCount)]uint32
    }
    wordCount = requiredWordCount
    var offset int32 = 0
    appendHeader(words, ref offset, header)
    appendBands(words, ref offset, horizontalBands)
    appendBands(words, ref offset, verticalBands)
    appendIndices(words, ref offset, horizontalCurveIndices)
    appendIndices(words, ref offset, verticalCurveIndices)
    appendCurves(words, ref offset, curves)
    byteCount = int64(wordCount) * 4
  }

  private func appendHeader(words []uint32, ref offset int32, header PathAnalyticHeader) {
    words[offset] = header.Format
    offset++
    words[offset] = header.FillRuleMask
    offset++
    words[offset] = header.HorizontalBandCount
    offset++
    words[offset] = header.VerticalBandCount
    offset++
    words[offset] = header.HorizontalCurveIndexCount
    offset++
    words[offset] = header.VerticalCurveIndexCount
    offset++
    words[offset] = header.CurveCount
    offset++
    words[offset] = header.Reserved
    offset++
    words[offset] = BitConverter.SingleToUInt32Bits(header.MinimumX)
    offset++
    words[offset] = BitConverter.SingleToUInt32Bits(header.MinimumY)
    offset++
    words[offset] = BitConverter.SingleToUInt32Bits(header.MaximumX)
    offset++
    words[offset] = BitConverter.SingleToUInt32Bits(header.MaximumY)
    offset++
  }

  private func appendBands(words []uint32, ref offset int32,
    values IReadOnlyList[PathAnalyticBand]) {
      for i in 0 ... values.Count {
        let value = values[i]
        words[offset] = BitConverter.SingleToUInt32Bits(value.Minimum)
        offset++
        words[offset] = BitConverter.SingleToUInt32Bits(value.Maximum)
        offset++
        words[offset] = BitConverter.SingleToUInt32Bits(value.Split)
        offset++
        words[offset] = value.ForwardStart
        offset++
        words[offset] = value.ForwardCount
        offset++
        words[offset] = value.ReverseStart
        offset++
        words[offset] = value.ReverseCount
        offset++
        words[offset] = value.Flags
        offset++
      }
    }

  private func appendIndices(words []uint32, ref offset int32,
    values IReadOnlyList[uint32]) {
      for i in 0 ... values.Count {
        words[offset] = values[i]
        offset++
      }
    }

  private func appendCurves(words []uint32, ref offset int32,
    values IReadOnlyList[PathAnalyticCurve]) {
      for i in 0 ... values.Count {
        let value = values[i]
        words[offset] = BitConverter.SingleToUInt32Bits(value.X0)
        offset++
        words[offset] = BitConverter.SingleToUInt32Bits(value.Y0)
        offset++
        words[offset] = BitConverter.SingleToUInt32Bits(value.CX)
        offset++
        words[offset] = BitConverter.SingleToUInt32Bits(value.CY)
        offset++
        words[offset] = BitConverter.SingleToUInt32Bits(value.X1)
        offset++
        words[offset] = BitConverter.SingleToUInt32Bits(value.Y1)
        offset++
        words[offset] = value.Flags
        offset++
        words[offset] = value.Reserved
        offset++
      }
    }
}
