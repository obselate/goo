package Goo

import Microsoft.Win32.SafeHandles
import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.IO.Compression
import System.Runtime.InteropServices
import System.Text
import System.Threading

internal sealed class HarfBuzzBufferHandle : SafeHandle {
  internal init(handle nint) : base(nint(0), true) {
    SetHandle(handle)
  }

  public override prop IsInvalid bool{ get -> handle == nint(0) }

  protected override func ReleaseHandle() bool {
    if handle != nint(0) {
      hb_buffer_destroy(handle)
      SetHandle(nint(0))
    }
    return true
  }
}

internal unsafe sealed class VulkanTextFont : IDisposable, VulkanTextProvider {
  const MaxTextUnits int32 = 1048576
  internal const MaxFontBytes int32 = 536870912
  const MaxSvgBlobBytes int32 = 4194304
  const MaxBitmapRgbaBytes int64 = 67108864L
  const MaxVariations int32 = 16
  const MaxFeatures int32 = 32
  const MaxLanguageUnits int32 = 64
  const MaxLanguageCacheEntries int32 = 4096
  const DisposedFlag int32 = 1 << 30
  const ActiveOpMask int32 = (1 << 30) - 1
  private let fontBytes FontData
  private var fontRetained bool
  private var harfBuzzBlob nint
  private var harfBuzzFace nint
  private var harfBuzzFont nint
  private var harfBuzzDesignFont nint
  private var harfBuzzBitmapFont nint
  private var harfBuzzDraw nint
  private var harfBuzzPaint nint
  private var harfBuzzDesignScale int32
  private var hinting VulkanTextHinting?
  private let faceIndex uint32
  private let faceCount uint32
  private let variations([]VulkanTextVariation)?
  private let encodeGate object
  private let disposeGate object
  private let subFontGate object
  private var opState int32
  private let threadSubFont ThreadLocal[nint]
  private let subFonts List[nint]
  private var metrics VulkanHarfBuzzMetrics
  private var hasColorPaint bool
  private var hasColorLayers bool
  private var hasColorBitmaps bool
  private var hasColorSvg bool
  private var hasColorPalettes bool
  private var disposed bool
  private let profileName string?

  public prop Metrics VulkanHarfBuzzMetrics{ get -> metrics }
  internal prop ByteSize int64{ get -> int64(fontBytes.Length) }
  internal prop HeapByteSize int64{ get -> if fontBytes.Path == nil { ByteSize } else { 0L } }
  internal prop FaceIndex uint32{ get -> faceIndex }
  internal prop FaceCount uint32{ get -> faceCount }
  public prop AbiVersion uint32{ get -> VulkanTextProviderAbi.Version }
  public prop OutlineHintingAvailable bool{ get -> !hasColorPaint && !hasColorLayers && !hasColorBitmaps }

  shared {
    private let languageCache ConcurrentDictionary[string, nint] =
    ConcurrentDictionary[string, nint](StringComparer.Ordinal)
    @ThreadStatic
    private var pooledShapeBuffer HarfBuzzBufferHandle?

    private func ResolveLanguage(language string) nint {
      if languageCache.TryGetValue(language, out var cached) {
        return cached
      }
      let utf8 = Encoding.UTF8.GetBytes(language)
      var handle = nint(0)
      if utf8.Length != 0 {
        fixed utf8Ptr * uint8 = utf8 {
          handle = hb_language_from_string(nint(utf8Ptr), utf8.Length)
        }
      }
      if handle != nint(0) && languageCache.Count < MaxLanguageCacheEntries {
        languageCache.TryAdd(language, handle)
      }
      return handle
    }

    private func BorrowShapeBuffer() nint {
      var retained = pooledShapeBuffer
      if retained == nil || retained.IsInvalid || retained.IsClosed {
        let raw = hb_buffer_create()
        if raw == nint(0) {
          return nint(0)
        }
        retained = HarfBuzzBufferHandle(raw)
        pooledShapeBuffer = retained
        return raw
      }
      let raw = retained.DangerousGetHandle()
      hb_buffer_clear_contents(raw)
      return raw
    }

    internal func ValidateFace(bytes FontData, selectedFaceIndex uint32) uint32 {
      var retained = false
      var blob nint
      try {
        bytes.DangerousAddRef(ref retained)
        blob = hb_blob_create(bytes.DangerousGetHandle(), uint32(bytes.Length), 1u,
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
        if retained { bytes.DangerousRelease() }
      }
    }
  }

  internal init(
    bytes FontData,
    pixelHeight uint32,
    selectedFaceIndex uint32,
    selectedVariations([]VulkanTextVariation)?, family string? = nil, systemWeight int32? = nil) {
      profileName = family
      let recorder = FrameRecorder.Current
      let profileStart = if recorder != nil { Stopwatch.GetTimestamp() } else { 0L }
      encodeGate = Object()
      disposeGate = Object()
      subFontGate = Object()
      threadSubFont = ThreadLocal[nint]()
      subFonts = List[nint]()
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
        fontBytes.DangerousAddRef(ref fontRetained)
        harfBuzzBlob = hb_blob_create(fontBytes.DangerousGetHandle(), uint32(fontBytes.Length), 1u, nint(0), nint(0))
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
        hasColorBitmaps = hb_ot_color_has_png(harfBuzzFace) != 0u
        hasColorSvg = hb_ot_color_has_svg(harfBuzzFace) != 0u
        hasColorPalettes = hb_ot_color_has_palettes(harfBuzzFace) != 0u
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
        ApplyVariations(harfBuzzFont, variations, systemWeight)
        hb_font_make_immutable(harfBuzzFont)
        harfBuzzDesignFont = hb_font_create(harfBuzzFace)
        if harfBuzzDesignFont == nint(0) {
          throw InvalidOperationException("hb_font_create design font failed")
        }
        harfBuzzDesignScale = int32(upem)
        hb_font_set_scale(harfBuzzDesignFont, harfBuzzDesignScale, harfBuzzDesignScale)
        hb_ot_font_set_funcs(harfBuzzDesignFont)
        ApplyVariations(harfBuzzDesignFont, variations, systemWeight)
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
        rethrow
      }
    }

  internal func Profile(recorder FrameRecorder, baseline bool) uint64 {
    let bytesId = recorder.ManagedResource(fontBytes, out var firstBytes)
    if firstBytes {
      recorder.Resource(FrameResourceKind.Font, bytesId, VulkanDiagnosticEventIds.ResourceCreate,
        if fontBytes.Path == nil { "font.bytes" } else { "font.mapping" },
        name: fontBytes.Path ?? profileName, bytes: uint64(fontBytes.Length), baseline: true)
    }
    let id = recorder.ManagedResource(this, out var first)
    if first || !baseline {
      recorder.Resource(FrameResourceKind.FontFace, id,
        VulkanDiagnosticEventIds.ResourceCreate, "font.face", name: profileName, parent: bytesId, baseline: baseline)
    }
    return id
  }

  private func TryAcquireShapeFont(out subFont nint) bool {
    subFont = nint(0)
    while true {
      let state = Volatile.Read(in opState)
      if (state & DisposedFlag) != 0 {
        return false
      }
      if Interlocked.CompareExchange(ref opState, state + 1, state) == state {
        break
      }
    }
    var current = threadSubFont.Value
    if current == nint(0) {
      lock (subFontGate) {
        if (Volatile.Read(in opState) & DisposedFlag) != 0 || harfBuzzFont == nint(0) {
          Interlocked.Decrement(ref opState)
          return false
        }
        current = threadSubFont.Value
        if current == nint(0) {
          current = hb_font_create_sub_font(harfBuzzFont)
          if current == nint(0) {
            Interlocked.Decrement(ref opState)
            return false
          }
          subFonts.Add(current)
          threadSubFont.Value = current
        }
      }
    }
    subFont = current
    return true
  }

  private func ReleaseShapeOp() {
    Interlocked.Decrement(ref opState)
  }

  public func TryGetNominalGlyph(codepoint uint32, out glyphId uint32) bool {
    glyphId = 0u
    if !TryAcquireShapeFont(out var subFont) {
      return false
    }
    try {
      var resolved uint32 = 0u
      if hb_font_get_nominal_glyph(subFont, codepoint, ref resolved) != 0u && resolved != 0u {
        glyphId = resolved
        return true
      }
      return false
    } finally {
      ReleaseShapeOp()
    }
  }

  internal func FillNominalGlyphs(codepoints []uint32, glyphs []uint32, count int32) uint32 {
    if count <= 0 || codepoints.Length < count || glyphs.Length < count {
      return 0u
    }
    if !TryAcquireShapeFont(out var subFont) {
      return 0u
    }
    try {
      fixed ucPtr * uint32 = codepoints {
        fixed gPtr * uint32 = glyphs {
          return hb_font_get_nominal_glyphs(subFont, uint32(count), nint(ucPtr), 4u, nint(gPtr), 4u)
        }
      }
    } finally {
      ReleaseShapeOp()
    }
  }

  public func ShapeInto(text string, options VulkanTextShapingOptions,
    workspace VulkanTextShapingWorkspace) VulkanTextProviderResult{
      if text == nil || workspace == nil {
        return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
      }
      return ShapeInto(text, 0, text.Length, options, workspace)
    }

  public func ShapeInto(text string, itemOffset int32, itemLength int32,
    options VulkanTextShapingOptions, workspace VulkanTextShapingWorkspace) VulkanTextProviderResult{
      if text == nil || workspace == nil {
        return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
      }
      if itemOffset < 0 || itemLength < 0 || itemOffset > text.Length - itemLength || itemLength > MaxTextUnits {
        return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
      }
      if !TryAcquireShapeFont(out var subFont) {
        return ProviderResult(VulkanTextProviderAbi.Disposed, 0, 0)
      }
      try {
        workspace.Reset()
        try {
          ValidateShapingOptions(options)
        } catch (error Exception) {
          return ProviderResult(VulkanTextProviderAbi.InvalidArgument, 0, 0)
        }
        let buffer = BorrowShapeBuffer()
        if buffer == nint(0) {
          return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
        }
        try {
          fixed textPtr * char = text {
            hb_buffer_add_utf16(buffer, nint(textPtr), text.Length, uint32(itemOffset), itemLength)
          }
          if options.Direction != 0u {
            hb_buffer_set_direction(buffer, options.Direction)
          }
          if options.Script != 0u {
            hb_buffer_set_script(buffer, options.Script)
          }
          if options.Language != nil && options.Language!!.Length != 0 {
            let language = ResolveLanguage(options.Language!!)
            if language != nint(0) {
              hb_buffer_set_language(buffer, language)
            }
          }
          hb_buffer_set_cluster_level(buffer, options.ClusterLevel)
          hb_buffer_set_flags(buffer, options.Flags)
          hb_buffer_guess_segment_properties(buffer)
          var shapeResult uint32 = 0u
          if options.Features != nil && options.Features!!.Length != 0 {
            let features = options.Features!!
            fixed featurePtr * VulkanTextFeature = features {
              shapeResult = hb_shape_full(subFont, buffer, nint(featurePtr), uint32(features.Length), nint(0))
            }
          } else {
            shapeResult = hb_shape_full(subFont, buffer, nint(0), 0u, nint(0))
          }
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
            let baseCluster = uint32(itemOffset)
            var index uint32 = 0u
            while index < length {
              let info = infos[index]
              let position = positions[index]
              workspace.GlyphBuffer[int32(index)] = VulkanTextGlyph{
                GlyphId: info.codepoint,
                Cluster: info.cluster >= baseCluster ? info.cluster - baseCluster : 0u,
                XAdvance: position.xAdvance,
                YAdvance: position.yAdvance,
                XOffset: position.xOffset,
                YOffset: position.yOffset,
                Flags: info.mask & 3u,
              }
              index++
            }
          }
          workspace.SetGlyphCount(int32(length))
          return ProviderResult(VulkanTextProviderAbi.Success, int32(length), int32(length))
        } finally {
          hb_buffer_clear_contents(buffer)
        }
      } catch (error Exception) {
        return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
      } finally {
        ReleaseShapeOp()
      }
    }

  public func EncodeGlyphInto(glyphId uint32,
    workspace VulkanTextProviderWorkspace, ppem int32) VulkanTextProviderResult {
      lock (encodeGate) {
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
          var extents = VulkanTextGlyphExtents{}
          let drawn = if ppem > 0 && OutlineHintingAvailable {
            let fitter = hinting ?? VulkanTextHinting(harfBuzzDesignFont, harfBuzzDesignScale)
            hinting = fitter
            fitter.Draw(harfBuzzDesignFont, glyphId, harfBuzzDraw, ppem)
              || hb_gpu_draw_glyph_or_fail(harfBuzzDraw, harfBuzzDesignFont, glyphId) != 0u
          } else { hb_gpu_draw_glyph_or_fail(harfBuzzDraw, harfBuzzDesignFont, glyphId) != 0u }
          if !drawn {
            if !hasColorBitmaps {
              return ProviderResult(VulkanTextProviderAbi.NativeFailure, 0, 0)
            }
            hb_gpu_draw_clear(harfBuzzDraw)
            if hb_font_get_glyph_extents(harfBuzzDesignFont, glyphId, ref extents) != 0u
              && extents.Width != 0 && extents.Height != 0 {
              var state = VulkanHarfBuzzDrawState{}
              hb_draw_rectangle(hb_gpu_draw_get_funcs(harfBuzzDraw), harfBuzzDraw, ref state,
                float32(extents.XBearing), float32(extents.YBearing),
                float32(extents.Width), float32(extents.Height), float32(harfBuzzDesignScale) / 16.0F)
            }
          }
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
      lock (encodeGate) {
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
    lock (encodeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hasColorPaint
    }
  }

  public func HasColorLayers() bool {
    lock (encodeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hasColorLayers
    }
  }

  public func HasColorBitmaps() bool {
    lock (encodeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hasColorBitmaps
    }
  }

  public func HasColorSvg() bool {
    lock (encodeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hasColorSvg
    }
  }

  public func GlyphHasColorPaint(glyphId uint32) bool {
    lock (encodeGate) {
      if disposed {
        throw ObjectDisposedException("VulkanTextFont")
      }
      return hb_ot_color_glyph_has_paint(harfBuzzFace, glyphId) != 0u
    }
  }

  public func GlyphHasColorLayers(glyphId uint32) bool {
    lock (encodeGate) {
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

  public func TryDecodeColorBitmapGlyph(glyphId uint32, ppem int32,
    out width int32, out height int32, out rgba([]uint8)?,
    out extents VulkanTextGlyphExtents, out scale int32) bool {
      width = 0
      height = 0
      rgba = nil
      extents = VulkanTextGlyphExtents{}
      scale = harfBuzzDesignScale
      lock (encodeGate) {
        if disposed || !hasColorBitmaps {
          return false
        }
        try {
          if harfBuzzBitmapFont == nint(0) {
            harfBuzzBitmapFont = hb_font_create(harfBuzzFace)
            if harfBuzzBitmapFont == nint(0) {
              return false
            }
            hb_font_set_scale(harfBuzzBitmapFont, harfBuzzDesignScale, harfBuzzDesignScale)
            hb_ot_font_set_funcs(harfBuzzBitmapFont)
            ApplyVariations(harfBuzzBitmapFont, variations, nil)
          }
          let effectivePpem = ppem > 0 ? uint32(ppem) : 128u
          hb_font_set_scale(harfBuzzBitmapFont, harfBuzzDesignScale, harfBuzzDesignScale)
          hb_font_set_ppem(harfBuzzBitmapFont, effectivePpem, effectivePpem)
          let blob = hb_ot_color_glyph_reference_png(harfBuzzBitmapFont, glyphId)
          if blob == nint(0) {
            return false
          }
          try {
            var dataLength uint32 = 0u
            let dataPtr = hb_blob_get_data(blob, ref dataLength)
            if dataPtr == nint(0) || dataLength == 0u || dataLength > uint32(Int32.MaxValue) {
              return false
            }
            let encoded = [int32(dataLength)]uint8
            Marshal.Copy(dataPtr, encoded, 0, int32(dataLength))
            using let decoded = NativeImage.Decode(ReadOnlySpan[uint8](encoded))
            let decodedWidth = decoded.Width
            let decodedHeight = decoded.Height
            if decodedWidth <= 0 || decodedHeight <= 0 {
              return false
            }
            let pixelByteCount64 = int64(decodedWidth) * int64(decodedHeight) * 4L
            if pixelByteCount64 <= 0L || pixelByteCount64 > MaxBitmapRgbaBytes {
              return false
            }
            let totalBytes = int32(pixelByteCount64)
            let srcPixels = decoded.Pixels
            let premultiplied = [totalBytes]uint8
            var offset int32 = 0
            while offset < totalBytes {
              let r = uint32(srcPixels[offset])
              let g = uint32(srcPixels[offset + 1])
              let b = uint32(srcPixels[offset + 2])
              let a = uint32(srcPixels[offset + 3])
              if a == 255u {
                premultiplied[offset] = uint8(r)
                premultiplied[offset + 1] = uint8(g)
                premultiplied[offset + 2] = uint8(b)
                premultiplied[offset + 3] = uint8(255)
              } else if a == 0u {
                premultiplied[offset] = uint8(0)
                premultiplied[offset + 1] = uint8(0)
                premultiplied[offset + 2] = uint8(0)
                premultiplied[offset + 3] = uint8(0)
              } else {
                premultiplied[offset] = uint8((r * a + 127u) / 255u)
                premultiplied[offset + 1] = uint8((g * a + 127u) / 255u)
                premultiplied[offset + 2] = uint8((b * a + 127u) / 255u)
                premultiplied[offset + 3] = uint8(a)
              }
              offset = offset + 4
            }
            var glyphExtents = VulkanTextGlyphExtents{}
            let gotExtents = hb_font_get_glyph_extents(harfBuzzBitmapFont, glyphId, ref glyphExtents) != 0u
            if !gotExtents || glyphExtents.Width <= 0 || glyphExtents.Height >= 0 {
              let fallbackAscent = metrics.Ascender > 0 ? metrics.Ascender : harfBuzzDesignScale
              let fallbackSpan = metrics.Ascender - metrics.Descender
              let fallbackHeight = fallbackSpan > 0 ? fallbackSpan : harfBuzzDesignScale
              glyphExtents = VulkanTextGlyphExtents{
                XBearing: 0,
                YBearing: fallbackAscent,
                Width: harfBuzzDesignScale,
                Height: -fallbackHeight,
              }
            }
            width = decodedWidth
            height = decodedHeight
            rgba = premultiplied
            extents = glyphExtents
            scale = harfBuzzDesignScale
            return true
          } finally {
            hb_blob_destroy(blob)
          }
        } catch (error Exception) {
          width = 0
          height = 0
          rgba = nil
          return false
        }
      }
    }

  public func TryGetColorSvgGlyph(glyphId uint32, out svgBytes([]uint8)?,
    out extents VulkanTextGlyphExtents, out scale int32) bool {
      svgBytes = nil
      extents = VulkanTextGlyphExtents{}
      scale = harfBuzzDesignScale
      lock (encodeGate) {
        if disposed || !hasColorSvg {
          return false
        }
        try {
          let blob = hb_ot_color_glyph_reference_svg(harfBuzzFace, glyphId)
          if blob == nint(0) {
            return false
          }
          try {
            var dataLength uint32 = 0u
            let dataPtr = hb_blob_get_data(blob, ref dataLength)
            if dataPtr == nint(0) || dataLength == 0u || dataLength > uint32(MaxSvgBlobBytes) {
              return false
            }
            let rawLength = int32(dataLength)
            let rawBytes = [rawLength]uint8
            Marshal.Copy(dataPtr, rawBytes, 0, rawLength)
            if rawLength >= 2 && rawBytes[0] == uint8(31) && rawBytes[1] == uint8(139) {
              using let compressed = MemoryStream(rawBytes)
              using let gzip = GZipStream(compressed, CompressionMode.Decompress)
              using let output = MemoryStream()
              let scratch = [4096]uint8
              while true {
                let readCount = gzip.Read(scratch, 0, scratch.Length)
                if readCount <= 0 {
                  break
                }
                if output.Length + int64(readCount) > int64(MaxSvgBlobBytes) {
                  return false
                }
                output.Write(scratch, 0, readCount)
              }
              svgBytes = output.ToArray()
            } else {
              svgBytes = rawBytes
            }
            if svgBytes == nil || svgBytes.Length == 0 {
              svgBytes = nil
              return false
            }
            var glyphExtents = VulkanTextGlyphExtents{}
            let gotExtents = hb_font_get_glyph_extents(harfBuzzDesignFont, glyphId, ref glyphExtents) != 0u
            if !gotExtents || glyphExtents.Width <= 0 || glyphExtents.Height >= 0 {
              let fallbackAscent = metrics.Ascender > 0 ? metrics.Ascender : harfBuzzDesignScale
              let fallbackSpan = metrics.Ascender - metrics.Descender
              let fallbackHeight = fallbackSpan > 0 ? fallbackSpan : harfBuzzDesignScale
              glyphExtents = VulkanTextGlyphExtents{
                XBearing: 0,
                YBearing: fallbackAscent,
                Width: harfBuzzDesignScale,
                Height: -fallbackHeight,
              }
            }
            extents = glyphExtents
            scale = harfBuzzDesignScale
            return true
          } finally {
            hb_blob_destroy(blob)
          }
        } catch (error Exception) {
          svgBytes = nil
          return false
        }
      }
    }

  public func Dispose() {
    lock (disposeGate) {
      if (Volatile.Read(in opState) & DisposedFlag) != 0 {
        return
      }
      Interlocked.Or(ref opState, DisposedFlag)
      var spin = SpinWait()
      while (Volatile.Read(in opState) & ActiveOpMask) != 0 {
        spin.SpinOnce()
      }
      lock (encodeGate) {
        if disposed {
          return
        }
        disposed = true
        hinting?.Dispose()
        hinting = nil
        lock (subFontGate) {
          for sub in subFonts {
            if sub != nint(0) {
              hb_font_destroy(sub)
            }
          }
          subFonts.Clear()
        }
        threadSubFont.Dispose()
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
        if harfBuzzBitmapFont != nint(0) {
          hb_font_destroy(harfBuzzBitmapFont)
          harfBuzzBitmapFont = nint(0)
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
        if fontRetained {
          fontBytes.DangerousRelease()
          fontRetained = false
        }
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

  private func ApplyVariations(font nint, values([]VulkanTextVariation)?, systemWeight int32?) {
    if values == nil || values.Length == 0 {
      if let weight = systemWeight {
        var variation = VulkanTextVariation{ Tag: VulkanTextTag("wght"), Value: float32(weight) }
        hb_font_set_variations(font, nint(&variation), 1u)
      }
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
