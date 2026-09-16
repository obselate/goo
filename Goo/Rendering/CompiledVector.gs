package Goo

import System

internal sealed class CompiledVectorParseResult {
  internal let Reader CompiledVectorReader
  internal let Sections []CompiledVectorSection
  internal let Flags uint32
  internal let ViewBoxX float32
  internal let ViewBoxY float32
  internal let ViewBoxWidth float32
  internal let ViewBoxHeight float32

  internal init(reader CompiledVectorReader, sections []CompiledVectorSection, flags uint32,
    viewBoxX float32, viewBoxY float32, viewBoxWidth float32, viewBoxHeight float32) {
      Reader = reader
      Sections = sections
      Flags = flags
      ViewBoxX = viewBoxX
      ViewBoxY = viewBoxY
      ViewBoxWidth = viewBoxWidth
      ViewBoxHeight = viewBoxHeight
    }
}

internal sealed class CompiledVector {
  shared {
    internal func Load(bytes []uint8) CompiledVector {
      guard let value = TryLoad(bytes) else {
        throw FormatException("Invalid compiled vector asset")
      }
      return value
    }

    internal func TryLoad(bytes []uint8) CompiledVector? {
      guard let parsed = parse(bytes) else { return nil }
      return CompiledVector(parsed)
    }

    private func parse(bytes []uint8) CompiledVectorParseResult? {
      if bytes.Length < CompiledVectorLimits.HeaderByteCount
        || bytes.Length > CompiledVectorLimits.MaxAssetBytes{
          return nil
        }
      let owned = [bytes.Length]uint8
      Array.Copy(bytes, owned, bytes.Length)
      let reader = CompiledVectorReader(owned)
      let headerByteCount = int32(reader.ReadU16(6))
      let sectionCount = int32(reader.ReadU32(12))
      if reader.ReadU32(0) != CompiledVectorLimits.Magic
        || reader.ReadU16(4) != CompiledVectorLimits.Version
        || headerByteCount != CompiledVectorLimits.HeaderByteCount
        || sectionCount != CompiledVectorLimits.SectionCount
        || reader.ReadU32(8) != uint32(bytes.Length)
        || reader.ReadU32(16) != 0u
        || reader.ReadU32(20) != 0u {
          return nil
        }

      let flags = reader.ReadU32(16)
      let viewBoxX = reader.ReadF32(24)
      let viewBoxY = reader.ReadF32(28)
      let viewBoxWidth = reader.ReadF32(32)
      let viewBoxHeight = reader.ReadF32(36)
      if !reader.IsFinite(viewBoxX) || !reader.IsFinite(viewBoxY)
        || !reader.IsFinite(viewBoxWidth) || !reader.IsFinite(viewBoxHeight)
        || viewBoxWidth <= 0.0F || viewBoxHeight <= 0.0F {
          return nil
        }

      let sections = [CompiledVectorLimits.SectionCount]CompiledVectorSection
      var index int32 = 0
      while index < sectionCount {
        let descriptorOffset = 40 + index * 12
        let offsetWord = reader.ReadU32(descriptorOffset)
        let lengthWord = reader.ReadU32(descriptorOffset + 4)
        let countWord = reader.ReadU32(descriptorOffset + 8)
        let stride = sectionStride(index)
        if stride <= 0 || !validSection(reader.Length, offsetWord, lengthWord, countWord, stride,
          sectionLimit(index)) {
            return nil
          }
        sections[index] = CompiledVectorSection{
          Offset: int32(offsetWord),
          Length: int32(lengthWord),
          Count: int32(countWord),
          Stride: stride,
        }
        index++
      }
      if !sectionsDoNotOverlap(sections) {
        return nil
      }
      if !validateCurves(reader, sections[2])
        || !validateMorphCurves(reader, sections[10])
        || !validateContours(reader, sections[1], sections[2])
        || !validateNodes(reader, sections[0], sections[1], sections[3],
          sections[5], sections[7], sections[8], sections[9], sections[10])
        || !validatePaints(reader, sections[3], sections[4], sections[8])
        || !validatePaintStops(reader, sections[4])
        || !validateStrokes(reader, sections[5], sections[3], sections[6], sections[8])
        || !validateClips(reader, sections[7], sections[1])
        || !validateTracks(reader, sections[8], sections[9], sections[10])
        || !validateKeyframes(reader, sections[9]) {
          return nil
        }
      return CompiledVectorParseResult(reader, sections, flags,
        viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
    }

    private func sectionStride(index int32) int32 {
      switch CompiledVectorSectionKind(index) {
        case CompiledVectorSectionKind.Nodes { return CompiledVectorLimits.NodeStride }
        case CompiledVectorSectionKind.Contours { return CompiledVectorLimits.ContourStride }
        case CompiledVectorSectionKind.Curves { return CompiledVectorLimits.CurveStride }
        case CompiledVectorSectionKind.Paints { return CompiledVectorLimits.PaintStride }
        case CompiledVectorSectionKind.PaintStops { return CompiledVectorLimits.PaintStopStride }
        case CompiledVectorSectionKind.Strokes { return CompiledVectorLimits.StrokeStride }
        case CompiledVectorSectionKind.DashValues { return CompiledVectorLimits.DashValueStride }
        case CompiledVectorSectionKind.Clips { return CompiledVectorLimits.ClipStride }
        case CompiledVectorSectionKind.Tracks { return CompiledVectorLimits.TrackStride }
        case CompiledVectorSectionKind.Keyframes { return CompiledVectorLimits.KeyframeStride }
        case CompiledVectorSectionKind.MorphCurves { return CompiledVectorLimits.MorphCurveStride }
        case _ { return 0 }
      }
    }

    private func sectionLimit(index int32) int32 {
      switch CompiledVectorSectionKind(index) {
        case CompiledVectorSectionKind.Nodes { return CompiledVectorLimits.MaxNodes }
        case CompiledVectorSectionKind.Contours { return CompiledVectorLimits.MaxContours }
        case CompiledVectorSectionKind.Curves { return CompiledVectorLimits.MaxCurves }
        case CompiledVectorSectionKind.Paints { return CompiledVectorLimits.MaxPaints }
        case CompiledVectorSectionKind.PaintStops { return CompiledVectorLimits.MaxPaintStops }
        case CompiledVectorSectionKind.Strokes { return CompiledVectorLimits.MaxStrokes }
        case CompiledVectorSectionKind.DashValues { return CompiledVectorLimits.MaxDashValues }
        case CompiledVectorSectionKind.Clips { return CompiledVectorLimits.MaxClips }
        case CompiledVectorSectionKind.Tracks { return CompiledVectorLimits.MaxTracks }
        case CompiledVectorSectionKind.Keyframes { return CompiledVectorLimits.MaxKeyframes }
        case CompiledVectorSectionKind.MorphCurves { return CompiledVectorLimits.MaxMorphCurves }
        case _ { return 0 }
      }
    }

    private func validSection(length int32, offsetWord uint32, lengthWord uint32,
      countWord uint32, stride int32, countLimit int32) bool{
        if countWord > uint32(countLimit) || offsetWord > uint32(length)
          || lengthWord > uint32(length) || countWord > uint32(Int32.MaxValue) {
            return false
          }
        if countWord == 0u {
          return offsetWord == 0u && lengthWord == 0u
        }
        if offsetWord < uint32(CompiledVectorLimits.HeaderByteCount)
          || (offsetWord & 3u) != 0u {
            return false
          }
        let expected = uint64(countWord) * uint64(stride)
        return if expected != uint64(lengthWord) || expected > uint64(Int32.MaxValue) { false } else { uint64(offsetWord) + expected <= uint64(length) }
      }

    private func sectionsDoNotOverlap(sections []CompiledVectorSection) bool {
      var i int32 = 0
      while i < sections.Length {
        if sections[i].Count > 0 {
          let start = int64(sections[i].Offset)
          let end = start + int64(sections[i].Length)
          var j int32 = 0
          while j < i {
            if sections[j].Count > 0 {
              let otherStart = int64(sections[j].Offset)
              let otherEnd = otherStart + int64(sections[j].Length)
              if start < otherEnd && otherStart < end { return false }
            }
            j++
          }
        }
        i++
      }
      return true
    }

    private func validateNodes(reader CompiledVectorReader, section CompiledVectorSection,
      contours CompiledVectorSection, paints CompiledVectorSection,
      strokes CompiledVectorSection,
      clips CompiledVectorSection, tracks CompiledVectorSection,
      keyframes CompiledVectorSection, morphCurves CompiledVectorSection) bool{
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          let parent = reader.ReadU32(offset)
          let firstChild = reader.ReadU32(offset + 4)
          let childCount = reader.ReadU32(offset + 8)
          let flags = reader.ReadU32(offset + 12)
          let contourStart = reader.ReadU32(offset + 16)
          let contourCount = reader.ReadU32(offset + 20)
          let paint = reader.ReadU32(offset + 24)
          let stroke = reader.ReadU32(offset + 28)
          let clip = reader.ReadU32(offset + 32)
          let transformTrack = reader.ReadU32(offset + 36)
          let opacityTrack = reader.ReadU32(offset + 40)
          let morphTrack = reader.ReadU32(offset + 44)
          if !validOptional(morphTrack, tracks.Count)
            || !reader.IsFinite(reader.ReadF32(offset + 48))
            || !reader.IsFinite(reader.ReadF32(offset + 52))
            || !reader.IsFinite(reader.ReadF32(offset + 56))
            || !reader.IsFinite(reader.ReadF32(offset + 60))
            || !reader.IsFinite(reader.ReadF32(offset + 64))
            || !reader.IsFinite(reader.ReadF32(offset + 68))
            || !reader.IsFinite(reader.ReadF32(offset + 72))
            || reader.ReadF32(offset + 72) < 0.0F
            || reader.ReadF32(offset + 72) > 1.0F
            || reader.ReadU32(offset + 76) != 0u
            || (flags & ^CompiledVectorLimits.NodeEvenOdd) != 0u
            || !validOptional(parent, section.Count)
            || !validRange(firstChild, childCount, section.Count, childCount == 0u)
            || !validRange(contourStart, contourCount, contours.Count, false)
            || !validOptional(paint, paints.Count)
            || !validOptional(stroke, strokes.Count)
            || !validOptional(clip, clips.Count)
            || !validOptional(transformTrack, tracks.Count)
            || !validOptional(opacityTrack, tracks.Count)
            || !trackReferenceKind(reader, transformTrack, tracks,
              CompiledVectorTrackKind.Transform, CompiledVectorValueKind.Transform)
            || !trackReferenceKind(reader, opacityTrack, tracks,
              CompiledVectorTrackKind.Opacity, CompiledVectorValueKind.Scalar)
            || !trackReferenceKind(reader, morphTrack, tracks,
              CompiledVectorTrackKind.Morph, CompiledVectorValueKind.Morph)
            || !validateMorphNode(reader, contourStart, contourCount,
              morphTrack, contours, tracks, keyframes, morphCurves) {
                return false
              }
          i++
        }

        i = 0
        while i < section.Count {
          let parent = reader.ReadU32(section.Offset + i * section.Stride)
          if parent != CompiledVectorLimits.MissingIndex {
            let parentOffset = section.Offset + int32(parent) * section.Stride
            let parentFirst = reader.ReadU32(parentOffset + 4)
            let parentCount = reader.ReadU32(parentOffset + 8)
            if parentCount == 0u || uint32(i) < parentFirst
              || uint32(i) - parentFirst >= parentCount{
                return false
              }
          }
          let firstChild = reader.ReadU32(section.Offset + i * section.Stride + 4)
          let childCount = reader.ReadU32(section.Offset + i * section.Stride + 8)
          if childCount > 0u {
            var childIndex uint32 = 0u
            while childIndex < childCount {
              let child = firstChild + childIndex
              if reader.ReadU32(section.Offset + int32(child) * section.Stride) != uint32(i) {
                return false
              }
              childIndex++
            }
          }
          var depth int32 = 0
          var cursor = parent
          while cursor != CompiledVectorLimits.MissingIndex {
            if depth >= section.Count { return false }
            cursor = reader.ReadU32(section.Offset + int32(cursor) * section.Stride)
            depth++
          }
          if depth >= CompiledVectorLimits.MaxRenderDepth { return false }
          i++
        }
        return true
      }

    private func validateMorphNode(reader CompiledVectorReader, contourStart uint32,
      contourCount uint32, morphTrack uint32,
      contours CompiledVectorSection, tracks CompiledVectorSection,
      keyframes CompiledVectorSection, morphCurves CompiledVectorSection) bool{
        if morphTrack == CompiledVectorLimits.MissingIndex {
          return true
        }
        let trackOffset = tracks.Offset + int32(morphTrack) * tracks.Stride
        if reader.ReadU16(trackOffset) != uint16(CompiledVectorTrackKind.Morph)
          || reader.ReadU16(trackOffset + 2) != uint16(CompiledVectorValueKind.Morph) {
            return false
          }
        let keyframeStart = reader.ReadU32(trackOffset + 4)
        let keyframeCount = reader.ReadU32(trackOffset + 8)
        if !validRange(keyframeStart, keyframeCount, keyframes.Count, false) {
          return false
        }
        var baseCurveCount uint32 = 0u
        var contourIndex uint32 = 0u
        while contourIndex < contourCount {
          let contour = CompiledVectorContourView(reader,
            contours.Offset + int32(contourStart + contourIndex) * contours.Stride)
          baseCurveCount = baseCurveCount + contour.CurveCount
          contourIndex++
        }
        var keyframeIndex uint32 = 0u
        while keyframeIndex < keyframeCount {
          let keyframeOffset = keyframes.Offset
          +int32(keyframeStart + keyframeIndex) * keyframes.Stride
          let targetStart = reader.ReadU32(keyframeOffset + 4)
          let targetCount = reader.ReadU32(keyframeOffset + 8)
          if targetCount != baseCurveCount
            || !validRange(targetStart, targetCount, morphCurves.Count, false)
            || !validateMorphKeyframeReserved(reader, keyframeOffset)
            || !validateMorphTopology(reader, contourStart, contourCount, contours,
              morphCurves, targetStart, targetCount) {
                return false
              }
          keyframeIndex++
        }
        return true
      }

    private func validateMorphKeyframeReserved(reader CompiledVectorReader,
      offset int32) bool -> reader.ReadU32(offset + 12) == 0u
      && reader.ReadU32(offset + 16) == 0u
      && reader.ReadU32(offset + 20) == 0u
      && reader.ReadU32(offset + 24) == 0u

    private func validateMorphTopology(reader CompiledVectorReader,
      contourStart uint32, contourCount uint32, contours CompiledVectorSection,
      morphCurves CompiledVectorSection, targetStart uint32, targetCount uint32) bool{
        var targetOffset uint32 = 0u
        var contourIndex uint32 = 0u
        while contourIndex < contourCount {
          let contour = CompiledVectorContourView(reader,
            contours.Offset + int32(contourStart + contourIndex) * contours.Stride)
          if contour.CurveCount > 0u {
            let first = CompiledVectorMorphCurveView(reader,
              morphCurves.Offset + int32(targetStart + targetOffset) * morphCurves.Stride)
            var curveIndex uint32 = 1u
            while curveIndex < contour.CurveCount {
              let current = CompiledVectorMorphCurveView(reader,
                morphCurves.Offset
                +int32(targetStart + targetOffset + curveIndex) * morphCurves.Stride)
              let previous = CompiledVectorMorphCurveView(reader,
                morphCurves.Offset
                +int32(targetStart + targetOffset + curveIndex - 1u) * morphCurves.Stride)
              if current.X0 != previous.X1 || current.Y0 != previous.Y1 {
                return false
              }
              curveIndex++
            }
            if contour.Closed {
              let lastIndex int32 = int32(targetStart + targetOffset + contour.CurveCount - 1u)
              let last = CompiledVectorMorphCurveView(reader,
                morphCurves.Offset + lastIndex * morphCurves.Stride)
              if last.X1 != first.X0 || last.Y1 != first.Y0 {
                return false
              }
            }
          }
          targetOffset = targetOffset + contour.CurveCount
          contourIndex++
        }
        return targetOffset == targetCount
      }

    private func validateContours(reader CompiledVectorReader, section CompiledVectorSection,
      curves CompiledVectorSection) bool{
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          let curveStart = reader.ReadU32(offset)
          let curveCount = reader.ReadU32(offset + 4)
          let flags = reader.ReadU32(offset + 8)
          if reader.ReadU32(offset + 12) != 0u
            || (flags & ^CompiledVectorLimits.ContourClosed) != 0u
            || !validRange(curveStart, curveCount, curves.Count, false)
            || (curveCount == 0u && flags != 0u) {
              return false
            }
          if curveCount > 0u {
            let first = CompiledVectorCurveView(reader,
              curves.Offset + int32(curveStart) * curves.Stride)
            var curveIndex uint32 = 1u
            while curveIndex < curveCount {
              let current = CompiledVectorCurveView(reader,
                curves.Offset + int32(curveStart + curveIndex) * curves.Stride)
              let previous = CompiledVectorCurveView(reader,
                curves.Offset + int32(curveStart + curveIndex - 1u) * curves.Stride)
              if current.X0 != previous.X1 || current.Y0 != previous.Y1 {
                return false
              }
              curveIndex++
            }
            if (flags & CompiledVectorLimits.ContourClosed) != 0u {
              let last = CompiledVectorCurveView(reader,
                curves.Offset + int32(curveStart + curveCount - 1u) * curves.Stride)
              if last.X1 != first.X0 || last.Y1 != first.Y0 { return false }
            }
          }
          i++
        }
        return true
      }

    private func validateCurves(reader CompiledVectorReader, section CompiledVectorSection) bool {
      var i int32 = 0
      while i < section.Count {
        let offset = section.Offset + i * section.Stride
        if !reader.IsFinite(reader.ReadF32(offset))
          || !reader.IsFinite(reader.ReadF32(offset + 4))
          || !reader.IsFinite(reader.ReadF32(offset + 8))
          || !reader.IsFinite(reader.ReadF32(offset + 12))
          || !reader.IsFinite(reader.ReadF32(offset + 16))
          || !reader.IsFinite(reader.ReadF32(offset + 20)) {
            return false
          }
        i++
      }
      return true
    }

    private func validateMorphCurves(reader CompiledVectorReader,
      section CompiledVectorSection) bool{
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          if !reader.IsFinite(reader.ReadF32(offset))
            || !reader.IsFinite(reader.ReadF32(offset + 4))
            || !reader.IsFinite(reader.ReadF32(offset + 8))
            || !reader.IsFinite(reader.ReadF32(offset + 12))
            || !reader.IsFinite(reader.ReadF32(offset + 16))
            || !reader.IsFinite(reader.ReadF32(offset + 20)) {
              return false
            }
          i++
        }
        return true
      }

    private func validatePaints(reader CompiledVectorReader, section CompiledVectorSection,
      stops CompiledVectorSection, tracks CompiledVectorSection) bool{
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          let kind = reader.ReadU16(offset)
          let stopStart = reader.ReadU32(offset + 32)
          let stopCount = reader.ReadU32(offset + 36)
          if kind > uint16(CompiledVectorPaintKind.RadialGradient)
            || reader.ReadU16(offset + 2) != uint16(0)
            || !reader.IsFinite(reader.ReadF32(offset + 8))
            || reader.ReadF32(offset + 8) < 0.0F
            || reader.ReadF32(offset + 8) > 1.0F
            || !reader.IsFinite(reader.ReadF32(offset + 12))
            || !reader.IsFinite(reader.ReadF32(offset + 16))
            || !reader.IsFinite(reader.ReadF32(offset + 20))
            || !reader.IsFinite(reader.ReadF32(offset + 24))
            || !validRange(stopStart, stopCount, stops.Count, false)
            || (kind != uint16(CompiledVectorPaintKind.Solid) && stopCount < 2u)
            || !validOptional(reader.ReadU32(offset + 28), tracks.Count)
            || !trackReferenceKind(reader, reader.ReadU32(offset + 28), tracks,
              CompiledVectorTrackKind.Color, CompiledVectorValueKind.Color)
            || (kind == uint16(CompiledVectorPaintKind.LinearGradient)
                && reader.ReadF32(offset + 12) == reader.ReadF32(offset + 20)
                && reader.ReadF32(offset + 16) == reader.ReadF32(offset + 24))
            || (kind == uint16(CompiledVectorPaintKind.RadialGradient)
                && (reader.ReadF32(offset + 20) <= reader.ReadF32(offset + 12)
                    || reader.ReadF32(offset + 24) <= reader.ReadF32(offset + 16))) {
                      return false
                    }
          if stopCount > 0u {
            var stopIndex uint32 = 0u
            var previousOffset float32 = -1.0F
            while stopIndex < stopCount {
              let stop = CompiledVectorPaintStopView(reader,
                stops.Offset + int32(stopStart + stopIndex) * stops.Stride)
              if stop.Offset < previousOffset { return false }
              previousOffset = stop.Offset
              stopIndex++
            }
          }
          i++
        }
        return true
      }

    private func validatePaintStops(reader CompiledVectorReader,
      section CompiledVectorSection) bool{
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          let stop = reader.ReadF32(offset)
          if !reader.IsFinite(stop) || stop < 0.0F || stop > 1.0F
            || reader.ReadU32(offset + 8) != 0u {
              return false
            }
          i++
        }
        return true
      }

    private func validateStrokes(reader CompiledVectorReader, section CompiledVectorSection,
      paints CompiledVectorSection, dashes CompiledVectorSection,
      tracks CompiledVectorSection) bool{
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          let width = reader.ReadF32(offset)
          let miter = reader.ReadF32(offset + 4)
          let dashOffset = reader.ReadF32(offset + 16)
          let dashStart = reader.ReadU32(offset + 28)
          let dashCount = reader.ReadU32(offset + 32)
          if !reader.IsFinite(width) || width < 0.0F
            || !reader.IsFinite(miter) || miter < 1.0F
            || reader.ReadU32(offset + 8) > uint32(StrokeCap.Square)
            || reader.ReadU32(offset + 12) > uint32(StrokeJoin.Bevel)
            || !reader.IsFinite(dashOffset)
            || !validOptional(reader.ReadU32(offset + 20), paints.Count)
            || !validOptional(reader.ReadU32(offset + 24), tracks.Count)
            || !trackReferenceKind(reader, reader.ReadU32(offset + 24), tracks,
              CompiledVectorTrackKind.Stroke, CompiledVectorValueKind.Stroke)
            || !validRange(dashStart, dashCount, dashes.Count, false)
            || (dashCount != 0u && (dashCount & 1u) != 0u)
            || reader.ReadU32(offset + 36) != 0u {
              return false
            }
          var dashIndex uint32 = 0u
          var hasPositiveDash bool = false
          while dashIndex < dashCount {
            let dash = reader.ReadF32(dashes.Offset + int32(dashStart + dashIndex) * dashes.Stride)
            if !reader.IsFinite(dash) || dash < 0.0F { return false }
            if dash > 0.0F { hasPositiveDash = true }
            dashIndex++
          }
          if dashCount != 0u && !hasPositiveDash { return false }
          i++
        }
        return true
      }

    private func validateClips(reader CompiledVectorReader, section CompiledVectorSection,
      contours CompiledVectorSection) bool{
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          if !validRange(reader.ReadU32(offset), reader.ReadU32(offset + 4), contours.Count, false)
            || reader.ReadU32(offset + 8) > uint32(FillRule.EvenOdd)
            || !validOptional(reader.ReadU32(offset + 12), section.Count) {
              return false
            }
          i++
        }
        i = 0
        while i < section.Count {
          var depth int32 = 0
          var cursor = reader.ReadU32(section.Offset + i * section.Stride + 12)
          while cursor != CompiledVectorLimits.MissingIndex {
            if depth >= section.Count { return false }
            cursor = reader.ReadU32(section.Offset + int32(cursor) * section.Stride + 12)
            depth++
          }
          if depth >= CompiledVectorLimits.MaxRenderDepth { return false }
          i++
        }
        return true
      }

    private func validateTracks(reader CompiledVectorReader, section CompiledVectorSection,
      keyframes CompiledVectorSection, morphCurves CompiledVectorSection) bool{
        let ownership = [keyframes.Count]int32
        var i int32 = 0
        while i < section.Count {
          let offset = section.Offset + i * section.Stride
          let kind = reader.ReadU16(offset)
          let valueKind = reader.ReadU16(offset + 2)
          let keyframeStart = reader.ReadU32(offset + 4)
          let keyframeCount = reader.ReadU32(offset + 8)
          let duration = reader.ReadF32(offset + 12)
          let flags = reader.ReadU32(offset + 16)
          if kind > uint16(CompiledVectorTrackKind.Morph)
            || valueKind > uint16(CompiledVectorValueKind.Morph)
            || !trackValueKindCompatible(kind, valueKind)
            || !validRange(keyframeStart, keyframeCount, keyframes.Count, false)
            || !reader.IsFinite(duration) || duration < 0.0F
            || (keyframeCount > 0u && duration <= 0.0F)
            || (flags & ^(CompiledVectorLimits.TrackLoop | CompiledVectorLimits.TrackPingPong)) != 0u
            || ((flags & CompiledVectorLimits.TrackPingPong) != 0u
                && (flags & CompiledVectorLimits.TrackLoop) == 0u)
            || reader.ReadU32(offset + 20) != 0u {
              return false
            }
          if keyframeCount > 0u {
            var keyframeIndex uint32 = 0u
            var previousTime float32 = -1.0F
            while keyframeIndex < keyframeCount {
              let keyframeOffset = keyframes.Offset
              +int32(keyframeStart + keyframeIndex) * keyframes.Stride
              let ownershipIndex = int32(keyframeStart + keyframeIndex)
              if ownership[ownershipIndex] != 0 {
                return false
              }
              ownership[ownershipIndex] = i + 1
              let keyframe = CompiledVectorKeyframeView(reader, keyframeOffset)
              if keyframe.Time < previousTime
                || (duration > 0.0F && keyframe.Time > duration) {
                  return false
                }
              if !validateTrackKeyframe(reader, keyframeOffset, kind, morphCurves) {
                return false
              }
              previousTime = keyframe.Time
              keyframeIndex++
            }
          }
          i++
        }
        i = 0
        while i < ownership.Length {
          if ownership[i] == 0 {
            return false
          }
          i++
        }
        return true
      }

    private func trackValueKindCompatible(kind uint16, valueKind uint16) bool {
      switch CompiledVectorTrackKind(kind) {
        case CompiledVectorTrackKind.Transform {
          return valueKind == uint16(CompiledVectorValueKind.Transform)
        }
        case CompiledVectorTrackKind.Opacity {
          return valueKind == uint16(CompiledVectorValueKind.Scalar)
        }
        case CompiledVectorTrackKind.Color {
          return valueKind == uint16(CompiledVectorValueKind.Color)
        }
        case CompiledVectorTrackKind.Stroke {
          return valueKind == uint16(CompiledVectorValueKind.Stroke)
        }
        case CompiledVectorTrackKind.Morph {
          return valueKind == uint16(CompiledVectorValueKind.Morph)
        }
        case _ { return false }
      }
    }

    private func validateTrackKeyframe(reader CompiledVectorReader, offset int32,
      kind uint16, morphCurves CompiledVectorSection) bool{
        if CompiledVectorTrackKind(kind) == CompiledVectorTrackKind.Morph {
          return reader.IsFinite(reader.ReadF32(offset))
            && reader.ReadF32(offset) >= 0.0F
            && validRange(reader.ReadU32(offset + 4), reader.ReadU32(offset + 8),
              morphCurves.Count, false)
            && validateMorphKeyframeReserved(reader, offset)
            && validateEasing(reader, offset)
        }
        if !validateRegularKeyframe(reader, offset) { return false }
        switch CompiledVectorTrackKind(kind) {
          case CompiledVectorTrackKind.Opacity {
            return normalized(reader.ReadF32(offset + 4))
              && zeroKeyframeTail(reader, offset + 8, 5)
          }
          case CompiledVectorTrackKind.Color {
            return normalized(reader.ReadF32(offset + 4))
              && normalized(reader.ReadF32(offset + 8))
              && normalized(reader.ReadF32(offset + 12))
              && normalized(reader.ReadF32(offset + 16))
              && zeroKeyframeTail(reader, offset + 20, 2)
          }
          case CompiledVectorTrackKind.Stroke {
            return reader.ReadF32(offset + 4) >= 0.0F
              && reader.ReadF32(offset + 8) >= 1.0F
              && strokeOrdinal(reader.ReadF32(offset + 12))
              && strokeOrdinal(reader.ReadF32(offset + 16))
              && reader.ReadF32(offset + 24) == 0.0F
          }
          case _ { return true }
        }
      }

    private func validateRegularKeyframe(reader CompiledVectorReader, offset int32) bool -> finiteKeyframeValue(reader, offset + 4)
      && finiteKeyframeValue(reader, offset + 8)
      && finiteKeyframeValue(reader, offset + 12)
      && finiteKeyframeValue(reader, offset + 16)
      && finiteKeyframeValue(reader, offset + 20)
      && finiteKeyframeValue(reader, offset + 24)
      && validateEasing(reader, offset)

    private func validateEasing(reader CompiledVectorReader, offset int32) bool -> reader.ReadU32(offset + 28) <= uint32(CompiledVectorEasingKind.Cubic)
      && finiteKeyframeValue(reader, offset + 32)
      && finiteKeyframeValue(reader, offset + 36)
      && finiteKeyframeValue(reader, offset + 40)
      && finiteKeyframeValue(reader, offset + 44)
      && (reader.ReadU32(offset + 28) == uint32(CompiledVectorEasingKind.Cubic)
          || (reader.ReadF32(offset + 32) == 0.0F
              && reader.ReadF32(offset + 36) == 0.0F
              && reader.ReadF32(offset + 40) == 0.0F
              && reader.ReadF32(offset + 44) == 0.0F))
      && (reader.ReadU32(offset + 28) != uint32(CompiledVectorEasingKind.Cubic)
          || (reader.ReadF32(offset + 32) >= 0.0F && reader.ReadF32(offset + 32) <= 1.0F
              && reader.ReadF32(offset + 36) >= 0.0F && reader.ReadF32(offset + 36) <= 1.0F
              && reader.ReadF32(offset + 40) >= 0.0F && reader.ReadF32(offset + 40) <= 1.0F
              && reader.ReadF32(offset + 44) >= 0.0F && reader.ReadF32(offset + 44) <= 1.0F))

    private func normalized(value float32) bool -> value >= 0.0F && value <= 1.0F

    private func strokeOrdinal(value float32) bool -> value == 0.0F || value == 1.0F || value == 2.0F

    private func finiteKeyframeValue(reader CompiledVectorReader, offset int32) bool {
      let value = reader.ReadF32(offset)
      return !Single.IsNaN(value) && !Single.IsInfinity(value)
    }

    private func zeroKeyframeTail(reader CompiledVectorReader, offset int32,
      count int32) bool{
        var index int32 = 0
        while index < count {
          if reader.ReadF32(offset + index * 4) != 0.0F {
            return false
          }
          index++
        }
        return true
      }

    private func trackReferenceKind(reader CompiledVectorReader, index uint32,
      tracks CompiledVectorSection, expectedKind CompiledVectorTrackKind,
      expectedValueKind CompiledVectorValueKind) bool{
        if index == CompiledVectorLimits.MissingIndex { return true }
        if index >= uint32(tracks.Count) { return false }
        let offset = tracks.Offset + int32(index) * tracks.Stride
        return reader.ReadU16(offset) == uint16(expectedKind)
          && reader.ReadU16(offset + 2) == uint16(expectedValueKind)
      }

    private func validateKeyframes(reader CompiledVectorReader, section CompiledVectorSection) bool {
      var i int32 = 0
      while i < section.Count {
        let offset = section.Offset + i * section.Stride
        if !reader.IsFinite(reader.ReadF32(offset)) || reader.ReadF32(offset) < 0.0F {
          return false
        }
        i++
      }
      return true
    }

    private func validOptional(value uint32, count int32) bool -> value == CompiledVectorLimits.MissingIndex || value < uint32(count)

    private func validRange(start uint32, count uint32, total int32, allowEmpty bool) bool {
      if count == 0u {
        return allowEmpty ? start == CompiledVectorLimits.MissingIndex || start <= uint32(total) : start <= uint32(total)
      }
      return start != CompiledVectorLimits.MissingIndex && start <= uint32(total)
        && count <= uint32(total) - start
    }
  }

  private let reader CompiledVectorReader
  private let sections []CompiledVectorSection
  private let flags uint32
  private let viewBoxX float32
  private let viewBoxY float32
  private let viewBoxWidth float32
  private let viewBoxHeight float32

  private init(parsed CompiledVectorParseResult) {
    reader = parsed.Reader
    sections = parsed.Sections
    flags = parsed.Flags
    viewBoxX = parsed.ViewBoxX
    viewBoxY = parsed.ViewBoxY
    viewBoxWidth = parsed.ViewBoxWidth
    viewBoxHeight = parsed.ViewBoxHeight
  }

  internal prop Version uint16{ get -> CompiledVectorLimits.Version }
  internal prop Flags uint32{ get -> flags }
  internal prop ByteCount int32{ get -> reader.Length }
  internal prop ViewBoxX float32{ get -> viewBoxX }
  internal prop ViewBoxY float32{ get -> viewBoxY }
  internal prop ViewBoxWidth float32{ get -> viewBoxWidth }
  internal prop ViewBoxHeight float32{ get -> viewBoxHeight }
  internal prop NodeCount int32{ get -> sections[0].Count }
  internal prop ContourCount int32{ get -> sections[1].Count }
  internal prop CurveCount int32{ get -> sections[2].Count }
  internal prop MorphCurveCount int32{ get -> sections[10].Count }
  internal prop PaintCount int32{ get -> sections[3].Count }
  internal prop PaintStopCount int32{ get -> sections[4].Count }
  internal prop StrokeCount int32{ get -> sections[5].Count }
  internal prop DashValueCount int32{ get -> sections[6].Count }
  internal prop ClipCount int32{ get -> sections[7].Count }
  internal prop TrackCount int32{ get -> sections[8].Count }
  internal prop KeyframeCount int32{ get -> sections[9].Count }

  internal func NodeAt(index int32) CompiledVectorNodeView -> CompiledVectorNodeView(reader, elementOffset(0, index))

  internal func ContourAt(index int32) CompiledVectorContourView -> CompiledVectorContourView(reader, elementOffset(1, index))

  internal func CurveAt(index int32) CompiledVectorCurveView -> CompiledVectorCurveView(reader, elementOffset(2, index))

  internal func MorphCurveAt(index int32) CompiledVectorMorphCurveView -> CompiledVectorMorphCurveView(reader, elementOffset(10, index))

  internal func PaintAt(index int32) CompiledVectorPaintView -> CompiledVectorPaintView(reader, elementOffset(3, index))

  internal func PaintStopAt(index int32) CompiledVectorPaintStopView -> CompiledVectorPaintStopView(reader, elementOffset(4, index))

  internal func StrokeAt(index int32) CompiledVectorStrokeView -> CompiledVectorStrokeView(reader, elementOffset(5, index))

  internal func DashValueAt(index int32) float32 -> reader.ReadF32(elementOffset(6, index))

  internal func ClipAt(index int32) CompiledVectorClipView -> CompiledVectorClipView(reader, elementOffset(7, index))

  internal func TrackAt(index int32) CompiledVectorTrackView -> CompiledVectorTrackView(reader, elementOffset(8, index))

  internal func KeyframeAt(index int32) CompiledVectorKeyframeView -> CompiledVectorKeyframeView(reader, elementOffset(9, index))

  internal func MorphKeyframeAt(index int32) CompiledVectorMorphKeyframeView -> CompiledVectorMorphKeyframeView(reader, elementOffset(9, index))

  internal func PathForNode(index int32) VectorPath {
    let node = NodeAt(index)
    return PathForContours(int32(node.ContourStart), int32(node.ContourCount))
  }

  internal func MutablePathForNode(index int32) VectorPath {
    let node = NodeAt(index)
    return MutablePathForContours(int32(node.ContourStart), int32(node.ContourCount))
  }

  internal func PathForContours(contourStart int32, contourCount int32) VectorPath -> buildPathForContours(contourStart, contourCount, false)

  internal func MutablePathForContours(contourStart int32, contourCount int32) VectorPath -> buildPathForContours(contourStart, contourCount, true)

  private func buildPathForContours(contourStart int32, contourCount int32,
    mutable bool) VectorPath{
      if contourCount == 0 {
        if !mutable {
          return VectorPath.CreateNormalized(
            []PathQuadratic{}, []PathContour{}, float64(viewBoxX), float64(viewBoxY),
            float64(viewBoxWidth), float64(viewBoxHeight))
        }
        let owner = VectorPathNormalizedOwner(0, 0, float64(viewBoxX), float64(viewBoxY),
          float64(viewBoxWidth), float64(viewBoxHeight))
        return VectorPath.CreateMutableNormalized(owner, float64(viewBoxX), float64(viewBoxY),
          float64(viewBoxWidth), float64(viewBoxHeight))
      }
      var totalCurves int32 = 0
      var contourIndex int32 = 0
      while contourIndex < contourCount {
        totalCurves = totalCurves + int32(ContourAt(contourStart + contourIndex).CurveCount)
        contourIndex++
      }
      let quadratics = [totalCurves]PathQuadratic
      let contours = [contourCount]PathContour
      var curveOffset int32 = 0
      contourIndex = 0
      while contourIndex < contourCount {
        let source = ContourAt(contourStart + contourIndex)
        let sourceStart = int32(source.CurveStart)
        let sourceCount = int32(source.CurveCount)
        contours[contourIndex] = PathContour{
          Start: curveOffset,
          End: curveOffset + sourceCount,
          Closed: source.Closed,
        }
        var curveIndex int32 = 0
        while curveIndex < sourceCount {
          let curve = CurveAt(sourceStart + curveIndex)
          quadratics[curveOffset + curveIndex] = PathQuadratic{
            X0: curve.X0,
            Y0: curve.Y0,
            CX: curve.CX,
            CY: curve.CY,
            X1: curve.X1,
            Y1: curve.Y1,
          }
          curveIndex++
        }
        curveOffset = curveOffset + sourceCount
        contourIndex++
      }
      if !mutable {
        return VectorPath.CreateNormalized(quadratics, contours,
          float64(viewBoxX), float64(viewBoxY), float64(viewBoxWidth), float64(viewBoxHeight))
      }
      let owner = VectorPathNormalizedOwner(totalCurves, contourCount,
        float64(viewBoxX), float64(viewBoxY), float64(viewBoxWidth), float64(viewBoxHeight))
      owner.Update(quadratics, totalCurves, contours, contourCount)
      return VectorPath.CreateMutableNormalized(owner, float64(viewBoxX), float64(viewBoxY),
        float64(viewBoxWidth), float64(viewBoxHeight))
    }

  private func elementOffset(sectionIndex int32, index int32) int32 {
    if index < 0 || index >= sections[sectionIndex].Count {
      throw ArgumentOutOfRangeException("index")
    }
    return sections[sectionIndex].Offset + index * sections[sectionIndex].Stride
  }
}
