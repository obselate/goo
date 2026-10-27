package Goo

import System
import System.IO

internal class ClipboardBitmap {
  shared {
    internal func ToPng(bytes []uint8) []uint8 {
      if bytes.Length < 54 || bytes[0] != 66 || bytes[1] != 77 { throw InvalidDataException("Invalid native BMP header") }
      let header = Little32(bytes, 14)
      if header < 40u || int64(header) + 14 > bytes.Length { throw InvalidDataException("Unsupported native BMP header") }
      let width = int32(Little32(bytes, 18))
      let signedHeight = int32(Little32(bytes, 22))
      if signedHeight == int32.MinValue { throw ClipboardLimitException("Native bitmap height is too large") }
      let height = Math.Abs(signedHeight)
      ValidateDimensions(width, height)
      let bits = int32(bytes[28]) | (int32(bytes[29]) << 8)
      let compression = Little32(bytes, 30)
      if bytes[26] != 1 || bytes[27] != 0 || (bits != 1 && bits != 4 && bits != 8 && bits != 16 && bits != 24 && bits != 32)
        || (compression != 0u && compression != 3u) { throw InvalidDataException("Unsupported native BMP encoding") }
      let offset = Little32(bytes, 10)
      let used = Little32(bytes, 46)
      let colors = if used != 0u { int64(used) } else if bits <= 8 { int64(1 << bits) } else { 0L }
      if bits <= 8 && colors > int64(1 << bits) { throw InvalidDataException("Native BMP palette exceeds the bit depth") }
      let masks = if header == 40u && compression == 3u { 12 } else { 0 }
      let stride = (int64(width) * bits + 31) / 32 * 4
      if int64(offset) < 14 + int64(header) + masks + colors * 4 || int64(offset) + stride * height > bytes.Length {
        throw InvalidDataException("Native BMP palette or pixels are truncated")
      }
      using let image = NativeImage.Decode(bytes)
      if image.Width != width || image.Height != height { throw InvalidDataException("Native BMP raster differs from its header") }
      return ImageSource.EncodePng(width, height, image.Pixels, false, ClipboardTransfer.MaxImageBytes)
    }

    internal func ValidateDimensions(width int32, height int32) {
      if width <= 0 || height <= 0 || width > 8192 || height > 8192 || int64(width) * height * 4 > ClipboardTransfer.MaxImageBytes {
        throw ClipboardLimitException("Native clipboard bitmap exceeds 8192 pixels per dimension or 64 MiB RGBA")
      }
    }

    private func Little32(bytes []uint8, offset int32) uint32 -> uint32(bytes[offset])
    | (uint32(bytes[offset + 1]) << 8) | (uint32(bytes[offset + 2]) << 16) | (uint32(bytes[offset + 3]) << 24)
  }
}
