package Goo

import System
import System.IO
import System.Runtime.InteropServices
import System.Text

internal class VulkanTextProviderAbi {
  shared {
    const Version uint32 = 1u
    const Success uint32 = 0u
    const InvalidArgument uint32 = 1u
    const CapacityExceeded uint32 = 2u
    const NativeFailure uint32 = 3u
    const OutputUnavailable uint32 = 4u
    const Disposed uint32 = 5u
  }
}

@DllImport("goo-harfbuzz", EntryPoint: "hb_blob_create", CallingConvention: CallingConvention.Cdecl)
internal func hb_blob_create(data nint, length uint32, memoryMode uint32, userData nint, destroy nint) nint;

@DllImport("goo-harfbuzz", EntryPoint: "hb_blob_destroy", CallingConvention: CallingConvention.Cdecl)
internal func hb_blob_destroy(blob nint) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_blob_get_data", CallingConvention: CallingConvention.Cdecl)
internal unsafe func hb_blob_get_data(blob nint, ref length uint32) nint;

@DllImport("goo-harfbuzz", EntryPoint: "hb_face_create", CallingConvention: CallingConvention.Cdecl)
internal func hb_face_create(blob nint, index uint32) nint;

@DllImport("goo-harfbuzz", EntryPoint: "hb_face_count", CallingConvention: CallingConvention.Cdecl)
internal func hb_face_count(blob nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_face_destroy", CallingConvention: CallingConvention.Cdecl)
internal func hb_face_destroy(face nint) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_face_get_glyph_count", CallingConvention: CallingConvention.Cdecl)
internal func hb_face_get_glyph_count(face nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_face_get_upem", CallingConvention: CallingConvention.Cdecl)
internal func hb_face_get_upem(face nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_font_create", CallingConvention: CallingConvention.Cdecl)
internal func hb_font_create(face nint) nint;

@DllImport("goo-harfbuzz", EntryPoint: "hb_font_destroy", CallingConvention: CallingConvention.Cdecl)
internal func hb_font_destroy(font nint) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_font_get_extents_for_direction", CallingConvention: CallingConvention.Cdecl)
internal unsafe func hb_font_get_extents_for_direction(font nint, direction uint32, ref extents VulkanHarfBuzzFontExtents) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_font_set_scale", CallingConvention: CallingConvention.Cdecl)
internal func hb_font_set_scale(font nint, xScale int32, yScale int32) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_font_set_variations", CallingConvention: CallingConvention.Cdecl)
internal func hb_font_set_variations(font nint, variations nint, variationCount uint32) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_ot_font_set_funcs", CallingConvention: CallingConvention.Cdecl)
internal func hb_ot_font_set_funcs(font nint) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_ot_color_has_paint", CallingConvention: CallingConvention.Cdecl)
internal func hb_ot_color_has_paint(face nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_ot_color_has_layers", CallingConvention: CallingConvention.Cdecl)
internal func hb_ot_color_has_layers(face nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_ot_color_glyph_get_layers", CallingConvention: CallingConvention.Cdecl)
internal func hb_ot_color_glyph_get_layers(face nint, glyph uint32, startOffset uint32,
  ref layerCount uint32, layers nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_ot_color_glyph_has_paint", CallingConvention: CallingConvention.Cdecl)
internal func hb_ot_color_glyph_has_paint(face nint, glyph uint32) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_create", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_create() nint;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_destroy", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_destroy(buffer nint) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_add_utf16", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_add_utf16(buffer nint, text nint, textLength int32, itemOffset uint32, itemLength int32) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_guess_segment_properties", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_guess_segment_properties(buffer nint) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_set_direction", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_set_direction(buffer nint, direction uint32) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_set_script", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_set_script(buffer nint, script uint32) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_set_language", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_set_language(buffer nint, language nint) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_set_cluster_level", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_set_cluster_level(buffer nint, clusterLevel uint32) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_set_flags", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_set_flags(buffer nint, flags uint32) void;

@DllImport("goo-harfbuzz", EntryPoint: "hb_language_from_string", CallingConvention: CallingConvention.Cdecl)
internal func hb_language_from_string(language nint, length int32) nint;

@DllImport("goo-harfbuzz", EntryPoint: "hb_shape_full", CallingConvention: CallingConvention.Cdecl)
internal func hb_shape_full(font nint, buffer nint, features nint, featureCount uint32, shaperList nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_get_length", CallingConvention: CallingConvention.Cdecl)
internal func hb_buffer_get_length(buffer nint) uint32;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_get_glyph_infos", CallingConvention: CallingConvention.Cdecl)
internal unsafe func hb_buffer_get_glyph_infos(buffer nint, ref length uint32) * VulkanHarfBuzzGlyphInfo;

@DllImport("goo-harfbuzz", EntryPoint: "hb_buffer_get_glyph_positions", CallingConvention: CallingConvention.Cdecl)
internal unsafe func hb_buffer_get_glyph_positions(buffer nint, ref length uint32) * VulkanHarfBuzzGlyphPosition;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_draw_create_or_fail", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_draw_create_or_fail() nint;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_draw_destroy", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_draw_destroy(draw nint) void;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_draw_glyph_or_fail", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_draw_glyph_or_fail(draw nint, font nint, glyph uint32) uint32;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_draw_encode", CallingConvention: CallingConvention.Cdecl)
internal unsafe func hb_gpu_draw_encode(draw nint, ref extents VulkanTextGlyphExtents) nint;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_draw_recycle_blob", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_draw_recycle_blob(draw nint, blob nint) void;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_draw_set_scale", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_draw_set_scale(draw nint, xScale int32, yScale int32) void;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_paint_create_or_fail", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_paint_create_or_fail() nint;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_paint_destroy", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_paint_destroy(paint nint) void;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_paint_set_palette", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_paint_set_palette(paint nint, palette uint32) void;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_paint_set_scale", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_paint_set_scale(paint nint, xScale int32, yScale int32) void;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_paint_glyph_or_fail", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_paint_glyph_or_fail(paint nint, font nint, glyph uint32) uint32;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_paint_encode", CallingConvention: CallingConvention.Cdecl)
internal unsafe func hb_gpu_paint_encode(paint nint, ref extents VulkanTextGlyphExtents) nint;

@DllImport("goo-harfbuzz-gpu", EntryPoint: "hb_gpu_paint_recycle_blob", CallingConvention: CallingConvention.Cdecl)
internal func hb_gpu_paint_recycle_blob(paint nint, blob nint) void;

internal unsafe data struct VulkanHarfBuzzGlyphInfo {
  var codepoint uint32
  var mask uint32
  var cluster uint32
  var var1 uint32
  var var2 uint32
}

internal unsafe data struct VulkanHarfBuzzGlyphPosition {
  var xAdvance int32
  var yAdvance int32
  var xOffset int32
  var yOffset int32
  var var1 int32
}

internal unsafe data struct VulkanHarfBuzzFontExtents {
  var ascender int32
  var descender int32
  var lineGap int32
  var reserved9 int32
  var reserved8 int32
  var reserved7 int32
  var reserved6 int32
  var reserved5 int32
  var reserved4 int32
  var reserved3 int32
  var reserved2 int32
  var reserved1 int32
}

internal unsafe data struct VulkanTextGlyphExtents {
  var XBearing int32
  var YBearing int32
  var Width int32
  var Height int32
}

internal data struct VulkanHarfBuzzMetrics {
  var UnitsPerEm uint32
  var GlyphCount uint32
  var Scale int32
  var Ascender int32
  var Descender int32
  var LineGap int32
}

internal data struct VulkanTextProviderResult {
  var AbiVersion uint32
  var Status uint32
  var Count int32
  var Required int32
}

internal sealed class VulkanTextProviderWorkspace {
  shared {
    const MaxByteCapacity int32 = 268435456
  }

  private let byteBuffer []uint8
  private var byteCount int32
  private var requiredByteCount int32
  private var glyphExtents VulkanTextGlyphExtents
  private var glyphScale int32
  private var glyphPalette uint32

  internal prop ByteBuffer []uint8{ get -> byteBuffer }
  internal prop ByteCapacity int32{ get -> byteBuffer.Length }
  internal prop ByteCount int32{ get -> byteCount }
  internal prop GlyphExtents VulkanTextGlyphExtents{ get -> glyphExtents }
  internal prop GlyphScale int32{ get -> glyphScale }

  internal init(bytes []uint8) {
    if bytes.Length > MaxByteCapacity {
      throw ArgumentOutOfRangeException("bytes")
    }
    byteBuffer = bytes
    Reset()
  }

  internal func Reset() {
    byteCount = 0
    requiredByteCount = 0
    glyphExtents = VulkanTextGlyphExtents{}
    glyphScale = 0
    glyphPalette = 0u
  }

  internal func SetRequiredByteCount(value int32) {
    requiredByteCount = value
  }

  internal func SetEncoding(byteLength int32, extents VulkanTextGlyphExtents,
    scale int32, palette uint32) {
      byteCount = byteLength
      glyphExtents = extents
      glyphScale = scale
      glyphPalette = palette
    }
}

internal sealed class VulkanTextShapingWorkspace {
  shared {
    const MaxGlyphCapacity int32 = 1048576
  }

  private let glyphBuffer []VulkanTextGlyph
  private var glyphCount int32

  internal prop GlyphBuffer []VulkanTextGlyph{ get -> glyphBuffer }
  internal prop GlyphCapacity int32{ get -> glyphBuffer.Length }
  internal prop GlyphCount int32{ get -> glyphCount }

  internal init(capacity int32) {
    if capacity < 0 || capacity > MaxGlyphCapacity {
      throw ArgumentOutOfRangeException("capacity")
    }
    glyphBuffer = [capacity]VulkanTextGlyph
  }

  internal func Reset() {
    glyphCount = 0
  }

  internal func SetGlyphCount(value int32) {
    if value < 0 || value > glyphBuffer.Length {
      throw ArgumentOutOfRangeException("value")
    }
    glyphCount = value
  }
}

internal interface VulkanTextProvider {
  prop AbiVersion uint32 { get; }
  prop Metrics VulkanHarfBuzzMetrics { get; }
  func ShapeInto(text string, options VulkanTextShapingOptions,
    workspace VulkanTextShapingWorkspace) VulkanTextProviderResult;
  func EncodeGlyphInto(glyphId uint32,
    workspace VulkanTextProviderWorkspace) VulkanTextProviderResult;
  func EncodePaintGlyphInto(glyphId uint32, paletteIndex uint32,
    workspace VulkanTextProviderWorkspace) VulkanTextProviderResult;
  func HasColorPaint() bool;
  func HasColorLayers() bool;
  func GlyphHasColorPaint(glyphId uint32) bool;
  func GlyphHasColorLayers(glyphId uint32) bool;
}

internal data struct VulkanTextVariation {
  var Tag uint32
  var Value float32
}

internal data struct VulkanTextFeature {
  var Tag uint32
  var Value uint32
  var Start uint32
  var End uint32
}

internal data struct VulkanTextShapingOptions {
  var Direction uint32
  var Script uint32
  var Language string?
  var ClusterLevel uint32
  var Flags uint32
  var Features([]VulkanTextFeature)?
}

internal data struct VulkanTextGlyph {
  var GlyphId uint32
  var Cluster uint32
  var XAdvance int32
  var YAdvance int32
  var XOffset int32
  var YOffset int32
}
