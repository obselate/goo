package Goo.VulkanProof

import System
import System.IO

internal class VulkanTextPaintE2E {
  const V0Font string = "HarfBuzz-chromacheck-colr.ttf"
  const V1Font string = "HarfBuzz-adwaita-colrv1.ttf"
  const ExpectedV0Glyph uint32 = 1u
  const ExpectedV1Glyph uint32 = 2u
  const ExpectedV0Bytes int32 = 424
  const ExpectedV1Bytes int32 = 6984
  const ExpectedV0Digest uint64 = 4061157383081379794uL
  const ExpectedV1Digest uint64 = 13280611930759481112uL
  const ExpectedV0XBearing int32 = 0
  const ExpectedV0YBearing int32 = 1024
  const ExpectedV0Width int32 = 1024
  const ExpectedV0Height int32 = -1024
  const ExpectedV1XBearing int32 = 188
  const ExpectedV1YBearing int32 = 950
  const ExpectedV1Width int32 = 1050
  const ExpectedV1Height int32 = -1200
  const ExpectedScale int32 = 1024

  internal func Run() {
    Verify(
      V0Font,
      ExpectedV0Glyph,
      true,
      false,
      false,
      ExpectedV0Bytes,
      ExpectedV0Digest,
      ExpectedV0XBearing,
      ExpectedV0YBearing,
      ExpectedV0Width,
      ExpectedV0Height)
    Verify(
      V1Font,
      ExpectedV1Glyph,
      false,
      true,
      true,
      ExpectedV1Bytes,
      ExpectedV1Digest,
      ExpectedV1XBearing,
      ExpectedV1YBearing,
      ExpectedV1Width,
      ExpectedV1Height)
    Console.WriteLine("TEXT_PAINT_E2E v0=ok v1=ok")
  }

  private func Verify(
    fileName string,
    glyphId uint32,
    expectedHasLayers bool,
    expectedHasPaint bool,
    expectedGlyphPaint bool,
    expectedBytes int32,
    expectedDigest uint64,
    expectedXBearing int32,
    expectedYBearing int32,
    expectedWidth int32,
    expectedHeight int32) {
      let path = Path.Combine(AppContext.BaseDirectory, fileName)
      if !File.Exists(path) {
        throw FileNotFoundException("HarfBuzz COLR proof font is missing", path)
      }
      var font VulkanTextFont? = nil
      try {
        font = LoadVulkanTextFont(path, 16u)
        if font.Metrics.Scale != ExpectedScale {
          throw InvalidOperationException("HarfBuzz paint scale contract failed")
        }
        if font.HasColorPaint() != expectedHasPaint {
          throw InvalidOperationException("HarfBuzz COLR paint table contract failed")
        }
        if font.HasColorLayers() != expectedHasLayers {
          throw InvalidOperationException("HarfBuzz COLR layer table contract failed")
        }
        if font.GlyphHasColorPaint(glyphId) != expectedGlyphPaint {
          throw InvalidOperationException("HarfBuzz COLR glyph paint contract failed")
        }
        let encoded = font.EncodePaintGlyph(glyphId, 0u)
        if encoded.Scale != ExpectedScale || encoded.Palette != 0u {
          throw InvalidOperationException("HarfBuzz paint encoding scale contract failed")
        }
        if encoded.Bytes.Length != expectedBytes || (encoded.Bytes.Length & 7) != 0 {
          throw InvalidOperationException("HarfBuzz paint encoding size contract failed")
        }
        if encoded.Extents.XBearing != expectedXBearing
          || encoded.Extents.YBearing != expectedYBearing
          || encoded.Extents.Width != expectedWidth
          || encoded.Extents.Height != expectedHeight{
            throw InvalidOperationException("HarfBuzz paint extents contract failed")
          }
        let digest = VulkanTextEncodedDigest(encoded.Bytes)
        if digest != expectedDigest {
          throw InvalidOperationException("HarfBuzz paint encoding digest contract failed")
        }
        Console.WriteLine("TEXT_PAINT font=" + fileName
          +" hasPaint=" + font.HasColorPaint().ToString()
          +" hasLayers=" + font.HasColorLayers().ToString()
          +" glyphPaint=" + font.GlyphHasColorPaint(glyphId).ToString()
          +" bytes=" + encoded.Bytes.Length.ToString()
          +" digest=" + digest.ToString()
          +" xBearing=" + encoded.Extents.XBearing.ToString()
          +" yBearing=" + encoded.Extents.YBearing.ToString()
          +" width=" + encoded.Extents.Width.ToString()
          +" height=" + encoded.Extents.Height.ToString())
      } finally {
        if let value = font {
          value.Dispose()
        }
      }
    }
}
