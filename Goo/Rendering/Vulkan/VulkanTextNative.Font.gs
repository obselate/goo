package Goo

import System
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Text

internal unsafe sealed class VulkanTextFont : IDisposable, VulkanTextProvider {
  const MaxTextUnits int32 = 1048576
  internal const MaxFontBytes int32 = 67108864
  const MaxVariations int32 = 16
  const MaxFeatures int32 = 32
  const MaxLanguageUnits int32 = 64
  private let fontBytes []uint8
  private var fontPin GCHandle
  private var harfBuzzBlob nint
  private var harfBuzzFace nint
  private var harfBuzzFont nint
  private var harfBuzzDesignFont nint
  private var harfBuzzDraw nint
  private var harfBuzzPaint nint
  private var harfBuzzDesignScale int32
  private let faceIndex uint32
  private let faceCount uint32
  private let variations([]VulkanTextVariation)?
  private let nativeGate object
  private var metrics VulkanHarfBuzzMetrics
  private var hasColorPaint bool
  private var hasColorLayers bool
  private var disposed bool
  private let profileName string?

  public prop Metrics VulkanHarfBuzzMetrics{ get -> metrics }
  internal prop ByteSize int64{ get -> int64(fontBytes.Length) }
  internal prop FaceIndex uint32{ get -> faceIndex }
  internal prop FaceCount uint32{ get -> faceCount }
  public prop AbiVersion uint32{ get -> VulkanTextProviderAbi.Version }

  shared {
    internal func ReadBytes(path string) []uint8 {
      using let stream = File.OpenRead(path)
      let length = stream.Length
      if length > MaxFontBytes { throw InvalidDataException("Font exceeds 64 MiB") }
      let bytes = [int32(length)]uint8
      stream.ReadExactly(bytes, 0, bytes.Length)
      return bytes
    }

    internal func ValidateFace(bytes []uint8, selectedFaceIndex uint32) uint32 {
      if bytes.Length == 0 {
        throw ArgumentException("Font bytes are empty", "bytes")
      }
      if bytes.Length > MaxFontBytes { throw ArgumentOutOfRangeException("bytes") }
      var pin GCHandle
      var blob nint
      try {
        pin = GCHandle.Alloc(bytes, GCHandleType.Pinned)
        blob = hb_blob_create(pin.AddrOfPinnedObject(), uint32(bytes.Length), 1u,
          nint(0), nint(0))
        if blob == nint(0) {
          throw InvalidOperationException("hb_blob_create failed")
        }
        let count = hb_face_count(blob)
        if count == 0u || selectedFaceIndex >= count {
          throw ArgumentOutOfRangeException("faceIndex")
        }
        return count
      } finally {
        if blob != nint(0) { hb_blob_destroy(blob) }
        if pin.IsAllocated { pin.Free() }
      }
    }
  }

  internal init(
    bytes []uint8,
    pixelHeight uint32,
    selectedFaceIndex uint32,
    selectedVariations([]VulkanTextVariation)?, family string? = nil) {
      profileName = family
      let recorder = FrameRecorder.Current
      let profileStart = if recorder != nil { Stopwatch.GetTimestamp() } else { 0L }
      nativeGate = Object()
      if bytes.Length == 0 {
        throw ArgumentException("Font bytes are empty", "bytes")
      }
      if bytes.Length > MaxFontBytes { throw ArgumentOutOfRangeException("bytes") }
      if pixelHeight == 0u || pixelHeight > 33554431u {
        throw ArgumentOutOfRangeException("pixelHeight")
      }
      fontBytes = bytes
      faceIndex = selectedFaceIndex
      variations = CopyVariations(selectedVariations)
      try {
        fontPin = GCHandle.Alloc(fontBytes, GCHandleType.Pinned)
        let fontAddress = fontPin.AddrOfPinnedObject()
        harfBuzzBlob = hb_blob_create(fontAddress, uint32(fontBytes.Length), 1u, nint(0), nint(0))
        if harfBuzzBlob == nint(0) {
          throw InvalidOperationException("hb_blob_create failed")
        }
        faceCount = hb_face_count(harfBuzzBlob)
        if faceCount == 0u || selectedFaceIndex >= faceCount {
          throw ArgumentOutOfRangeException("faceIndex")
        }
        harfBuzzFace = hb_face_create(harfBuzzBlob, selectedFaceIndex)
        if harfBuzzFace == nint(0) {
          throw InvalidOperationException("hb_face_create failed")
        }
        hasColorPaint = hb_ot_color_has_paint(harfBuzzFace) != 0u
        hasColorLayers = hb_ot_color_has_layers(harfBuzzFace) != 0u
        let upem = hb_face_get_upem(harfBuzzFace)
        if upem == 0u || upem > uint32(Int32.MaxValue) {
          throw InvalidOperationException("HarfBuzz face UPEM is invalid")
        }
        harfBuzzFont = hb_font_create(harfBuzzFace)
        if harfBuzzFont == nint(0) {
          throw InvalidOperationException("hb_font_create failed")
        }
        let scale = int32(pixelHeight * 64u)
        hb_font_set_scale(harfBuzzFont, scale, scale)
        hb_ot_font_set_funcs(harfBuzzFont)
        ApplyVariations(harfBuzzFont, variations)
        harfBuzzDesignFont = hb_font_create(harfBuzzFace)
        if harfBuzzDesignFont == nint(0) {
          throw InvalidOperationException("hb_font_create design font failed")
        }
        harfBuzzDesignScale = int32(upem)
        hb_font_set_scale(harfBuzzDesignFont, harfBuzzDesignScale, harfBuzzDesignScale)
        hb_ot_font_set_funcs(harfBuzzDesignFont)
        ApplyVariations(harfBuzzDesignFont, variations)
        metrics = ReadMetrics(harfBuzzDesignFont)
        if let current = recorder {
          Profile(current, false)
          current.ResourceDuration(FrameResourceKind.FontFace, current.ManagedResource(this), "font.face.create", profileStart)
        }
      } catch (error Exception) {
        if let current = recorder {
          current.ResourceDuration(FrameResourceKind.FontFace, 0uL, "font.face.create", profileStart, result: -1)
        }
        Dispose()
        throw error
      }
    }

  internal func Profile(recorder FrameRecorder, baseline bool) uint64 {
    let bytesId = recorder.ManagedResource(fontBytes, out var firstBytes)
    if firstBytes {
      recorder.Resource(FrameResourceKind.Font, bytesId, VulkanDiagnosticEventIds.ResourceCreate,
        "font.bytes", name: profileName, bytes: uint64(fontBytes.Length), baseline: true)
    }
    let id = recorder.ManagedResource(this, out var first)
    if first || !baseline {
      recorder.Resource(FrameResourceKind.FontFace, id,
        VulkanDiagnosticEventIds.ResourceCreate, "font.face", name: profileName, parent: bytesId, baseline: baseline)
    }
    return id
  }

  public func ShapeInto(text string, options VulkanTextShapingOptions,
    workspace VulkanTextShapingWorkspace) VulkanTextProviderResult{
      lock (nativeGate) {
        if disposed {
          return ProviderResult(VulkanTextProviderAbi.Disposed, 0, 0)
        }
        if text == nil || workspace == nil {
          return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
        }
        if text.Length > MaxTextUnits {
          return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
        }
        workspace.Reset()
        try {
          try {
            ValidateShapingOptions(options)
          } catch (error Exception) {
            return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
          }
          let textPin = GCHandle.Alloc(text, GCHandleType.Pinned)
          var featurePin GCHandle
          var hasFeaturePin bool = false
          try {
            let textAddress = textPin.AddrOfPinnedObject()
            let buffer = hb_buffer_create()
            if buffer == nint(0) {
              return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
            }
            try {
              hb_buffer_add_utf16(buffer, textAddress, text.Length, 0u, text.Length)
              if options.Direction != 0u {
                hb_buffer_set_direction(buffer, options.Direction)
              }
              if options.Script != 0u {
                hb_buffer_set_script(buffer, options.Script)
              }
              if options.Language != nil && options.Language!!.Length != 0 {
                let languageBytes = Encoding.UTF8.GetBytes(options.Language!!)
                let languagePin = GCHandle.Alloc(languageBytes, GCHandleType.Pinned)
                try {
                  let language = hb_language_from_string(languagePin.AddrOfPinnedObject(), languageBytes.Length)
                  if language != nint(0) {
                    hb_buffer_set_language(buffer, language)
                  }
                } finally {
                  languagePin.Free()
                }
              }
              hb_buffer_set_cluster_level(buffer, options.ClusterLevel)
              hb_buffer_set_flags(buffer, options.Flags)
              hb_buffer_guess_segment_properties(buffer)
              var featureAddress nint = nint(0)
              var featureCount uint32 = 0u
              if options.Features != nil && options.Features!!.Length != 0 {
                featurePin = GCHandle.Alloc(options.Features!!, GCHandleType.Pinned)
                hasFeaturePin = true
                featureAddress = featurePin.AddrOfPinnedObject()
                featureCount = uint32(options.Features!!.Length)
              }
              let shapeResult = hb_shape_full(harfBuzzFont, buffer, featureAddress, featureCount, nint(0))
              if shapeResult == 0u {
                return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
              }
              let length = hb_buffer_get_length(buffer)
              if length > uint32(Int32.MaxValue) {
                return ProviderResult(VulkanTextProviderAbi.OutputUnavailable, 0, 0)
              }
              if length > uint32(workspace.GlyphCapacity) {
                return ProviderResult(VulkanTextProviderAbi.CapacityExceeded, 0, int32(length))
              }
              var infoLength uint32 = length
              var positionLength uint32 = length
              if length != 0u {
                let infos = hb_buffer_get_glyph_infos(buffer, ref infoLength)
                let positions = hb_buffer_get_glyph_positions(buffer, ref positionLength)
                if infos == nil || positions == nil || infoLength != length || positionLength != length {
                  return ProviderResult(VulkanTextProviderAbi.OutputUnavailable, 0, 0)
                }
                var index uint32 = 0u
                while index < length {
                  let info = infos[index]
                  let position = positions[index]
                  workspace.GlyphBuffer[int32(index)] = VulkanTextGlyph{
                    GlyphId: info.codepoint,
                    Cluster: info.cluster,
                    XAdvance: position.xAdvance,
                    YAdvance: position.yAdvance,
                    XOffset: position.xOffset,
                    YOffset: position.yOffset,
                  }
                  index++
                }
              }
              workspace.SetGlyphCount(int32(length))
              return ProviderResult(VulkanTextProviderAbi.Success, int32(length), int32(length))
            } finally {
              if hasFeaturePin {
                featurePin.Free()
              }
              hb_buffer_destroy(buffer)
            }
          } finally {
            textPin.Free()
          }
        } catch (error Exception) {
          return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
        }
      }
    }

  public func EncodeGlyphInto(glyphId uint32,
    workspace VulkanTextProviderWorkspace) VulkanTextProviderResult{
      lock (nativeGate) {
        if disposed {
          return ProviderResult(VulkanTextProviderAbi.Disposed, 0, 0)
        }
        if workspace == nil {
          return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
        }
        workspace.Reset()
        try {
          if harfBuzzDraw == nint(0) {
            harfBuzzDraw = hb_gpu_draw_create_or_fail()
            if harfBuzzDraw == nint(0) {
              return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
            }
          }
          hb_gpu_draw_set_scale(harfBuzzDraw, harfBuzzDesignScale, harfBuzzDesignScale)
          let drawResult = hb_gpu_draw_glyph_or_fail(harfBuzzDraw, harfBuzzDesignFont, glyphId)
          if drawResult == 0u {
            return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
          }
          var extents = VulkanTextGlyphExtents{}
          let blob = hb_gpu_draw_encode(harfBuzzDraw, ref extents)
          if blob == nint(0) {
            return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
          }
          try {
            var length uint32 = 0u
            let data = hb_blob_get_data(blob, ref length)
            if length > uint32(Int32.MaxValue) {
              return ProviderResult(VulkanTextProviderAbi.OutputUnavailable, 0, 0)
            }
            if length > uint32(workspace.ByteCapacity) {
              workspace.SetRequiredByteCount(int32(length))
              return ProviderResult(VulkanTextProviderAbi.CapacityExceeded, 0, int32(length))
            }
            if length != 0u && data == nint(0) {
              return ProviderResult(VulkanTextProviderAbi.OutputUnavailable, 0, 0)
            }
            if length != 0u {
              Marshal.Copy(data, workspace.ByteBuffer, 0, int32(length))
            }
            workspace.SetEncoding(int32(length), extents, harfBuzzDesignScale, 0u)
            return ProviderResult(VulkanTextProviderAbi.Success, int32(length), int32(length))
          } finally {
            hb_gpu_draw_recycle_blob(harfBuzzDraw, blob)
          }
        } catch (error Exception) {
          return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
        }
      }
    }

  public func EncodePaintGlyphInto(glyphId uint32, paletteIndex uint32,
    workspace VulkanTextProviderWorkspace) VulkanTextProviderResult{
      lock (nativeGate) {
        if disposed {
          return ProviderResult(VulkanTextProviderAbi.Disposed, 0, 0)
        }
        if workspace == nil {
          return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
        }
        workspace.Reset()
        try {
          if harfBuzzPaint == nint(0) {
            harfBuzzPaint = hb_gpu_paint_create_or_fail()
            if harfBuzzPaint == nint(0) {
              return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
            }
          }
          hb_gpu_paint_set_scale(harfBuzzPaint, harfBuzzDesignScale, harfBuzzDesignScale)
          hb_gpu_paint_set_palette(harfBuzzPaint, paletteIndex)
          let paintResult = hb_gpu_paint_glyph_or_fail(harfBuzzPaint, harfBuzzDesignFont, glyphId)
          if paintResult == 0u {
            return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
          }
          var extents = VulkanTextGlyphExtents{}
          let blob = hb_gpu_paint_encode(harfBuzzPaint, ref extents)
          if blob == nint(0) {
            return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
          }
          try {
            var length uint32 = 0u
            let data = hb_blob_get_data(blob, ref length)
            if length == 0u || data == nint(0) {
              return ProviderResult(VulkanTextProviderAbi.OutputUnavailable, 0, 0)
            }
            if length > uint32(Int32.MaxValue) {
              return ProviderResult(VulkanTextProviderAbi.OutputUnavailable, 0, 0)
            }
            if length > uint32(workspace.ByteCapacity) {
              workspace.SetRequiredByteCount(int32(length))
              return ProviderResult(VulkanTextProviderAbi.CapacityExceeded, 0, int32(length))
            }
            Marshal.Copy(data, workspace.ByteBuffer, 0, int32(length))
            workspace.SetEncoding(int32(length), extents, harfBuzzDesignScale, paletteIndex)
            return ProviderResult(VulkanTextProviderAbi.Success, int32(length), int32(length))
          } finally {
            hb_gpu_paint_recycle_blob(harfBuzzPaint, blob)
          }
        } catch (error Exception) {
          return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
        }
      }
    }

  public func HasColorPaint() bool {
    lock (nativeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hasColorPaint
    }
  }

  public func HasColorLayers() bool {
    lock (nativeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hasColorLayers
    }
  }

  public func GlyphHasColorPaint(glyphId uint32) bool {
    lock (nativeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hb_ot_color_glyph_has_paint(harfBuzzFace, glyphId) != 0u
    }
  }

  public func GlyphHasColorLayers(glyphId uint32) bool {
    lock (nativeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      var layerCount uint32 = 0u
      let layerResult = hb_ot_color_glyph_get_layers(
        harfBuzzFace,
        glyphId,
        0u,
        ref layerCount,
        nint(0))
      return layerResult != 0u || layerCount != 0u
    }
  }

  public func Dispose() {
    lock (nativeGate) {
      if disposed {
        return
      }
      disposed = true
      if harfBuzzDraw != nint(0) {
        hb_gpu_draw_destroy(harfBuzzDraw)
        harfBuzzDraw = nint(0)
      }
      if harfBuzzPaint != nint(0) {
        hb_gpu_paint_destroy(harfBuzzPaint)
        harfBuzzPaint = nint(0)
      }
      if harfBuzzFont != nint(0) {
        hb_font_destroy(harfBuzzFont)
        harfBuzzFont = nint(0)
      }
      if harfBuzzDesignFont != nint(0) {
        hb_font_destroy(harfBuzzDesignFont)
        harfBuzzDesignFont = nint(0)
      }
      if harfBuzzFace != nint(0) {
        hb_face_destroy(harfBuzzFace)
        if let recorder = FrameRecorder.Current {
          let id = Profile(recorder, true)
          recorder.Resource(FrameResourceKind.FontFace, id, VulkanDiagnosticEventIds.ResourceEvict, "font.face.release")
          recorder.ReleaseManagedResource(this)
        }
        harfBuzzFace = nint(0)
      }
      if harfBuzzBlob != nint(0) {
        hb_blob_destroy(harfBuzzBlob)
        harfBuzzBlob = nint(0)
      }
      if fontPin.IsAllocated {
        fontPin.Free()
      }
    }
  }

  private func CopyVariations(values([]VulkanTextVariation)?)([]VulkanTextVariation)? {
    if values == nil || values.Length == 0 {
      return nil
    }
    if values.Length > MaxVariations {
      throw ArgumentOutOfRangeException("variations")
    }
    let copy = [values.Length]VulkanTextVariation
    var index int32 = 0
    while index < values.Length {
      let value = values[index]
      if value.Tag == 0u || Single.IsNaN(value.Value) || Single.IsInfinity(value.Value) {
        throw ArgumentException("Variation records are invalid", "variations")
      }
      copy[index] = value
      index++
    }
    return copy
  }

  private func ApplyVariations(font nint, values([]VulkanTextVariation)?) {
    if values == nil || values.Length == 0 {
      return
    }
    let pin = GCHandle.Alloc(values, GCHandleType.Pinned)
    try {
      hb_font_set_variations(font, pin.AddrOfPinnedObject(), uint32(values.Length))
    } finally {
      pin.Free()
    }
  }

  private func ValidateShapingOptions(options VulkanTextShapingOptions) {
    if options.Direction != 0u && (options.Direction < 4u || options.Direction > 7u) {
      throw ArgumentOutOfRangeException("direction")
    }
    if options.Language != nil && options.Language!!.Length > MaxLanguageUnits {
      throw ArgumentOutOfRangeException("language")
    }
    if options.ClusterLevel > 3u {
      throw ArgumentOutOfRangeException("clusterLevel")
    }
    if (options.Flags & 0xFFFFFF00u) != 0u {
      throw ArgumentOutOfRangeException("flags")
    }
    if options.Features == nil || options.Features!!.Length == 0 {
      return
    }
    if options.Features!!.Length > MaxFeatures {
      throw ArgumentOutOfRangeException("features")
    }
    var index int32 = 0
    while index < options.Features!!.Length {
      let feature = options.Features!! [index]
      if feature.Tag == 0u || feature.Start > feature.End {
        throw ArgumentException("Feature records are invalid", "features")
      }
      index++
    }
  }

  private func ReadMetrics(font nint) VulkanHarfBuzzMetrics {
    var extents = VulkanHarfBuzzFontExtents{}
    hb_font_get_extents_for_direction(font, 4u, ref extents)
    return VulkanHarfBuzzMetrics{
      UnitsPerEm: hb_face_get_upem(harfBuzzFace),
      GlyphCount: hb_face_get_glyph_count(harfBuzzFace),
      Scale: harfBuzzDesignScale,
      Ascender: extents.ascender,
      Descender: extents.descender,
      LineGap: extents.lineGap,
    }
  }

  private func ProviderResult(status uint32, count int32, required int32)
  VulkanTextProviderResult -> VulkanTextProviderResult{
    AbiVersion: VulkanTextProviderAbi.Version,
    Status: status,
    Count: count,
    Required: required,
  }
}

internal func LoadVulkanTextFont(path string, pixelHeight uint32) VulkanTextFont -> LoadVulkanTextFont(path, pixelHeight, 0u, nil)

internal func LoadVulkanTextFont(
  path string,
  pixelHeight uint32,
  faceIndex uint32,
  variations([]VulkanTextVariation)?) VulkanTextFont{
    if path == nil {
      throw ArgumentNullException("path")
    }
    return VulkanTextFont(VulkanTextFont.ReadBytes(path), pixelHeight, faceIndex, variations)
  }

internal func VulkanTextTag(value string) uint32 {
  if value == nil || value.Length != 4 {
    throw ArgumentException("OpenType tags must contain four characters", "value")
  }
  let bytes = Encoding.ASCII.GetBytes(value)
  return (uint32(bytes[0]) << 24)
  | (uint32(bytes[1]) << 16)
  | (uint32(bytes[2]) << 8)
  | uint32(bytes[3])
}
