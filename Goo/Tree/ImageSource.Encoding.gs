package Goo

import System
import System.IO
import System.IO.Compression

public partial class ImageSource {
  /// Encodes this source as owned PNG bytes with straight RGBA pixels.
  /// Encoding is synchronous and can run outside the UI thread.
  /// @returns The encoded PNG bytes.
  /// @exception ObjectDisposedException when this source is disposed.
  public func EncodePng() []uint8 {
    guard let current = retainImage() else { throw ObjectDisposedException("ImageSource") }
    try { return EncodePng(width, height, current.Pixels(), true, Int32.MaxValue) }
    finally { current.Release() }
  }

  shared {
    internal func EncodePng(width int32, height int32, pixels ReadOnlySpan[uint8],
      premultiplied bool, maxBytes int32) []uint8 {
      using let compressed = MemoryStream()
      let zlib = ZLibStream(compressed, CompressionLevel.Fastest, true)
      let straight = if premultiplied { [width * 4]uint8 } else { Array.Empty[uint8]() }
      try {
        for row in 0 ... height {
          zlib.WriteByte(uint8(0))
          let source = pixels.Slice(row * width * 4, width * 4)
          if premultiplied {
            for column in 0 ... width {
              let offset = column * 4
              let alpha = int32(source[offset + 3])
              for channel in 0 ... 3 {
                straight[offset + channel] = if alpha == 0 { uint8(0) } else {
                  uint8(Math.Min(255, (int32(source[offset + channel]) * 255 + alpha / 2) / alpha))
                }
              }
              straight[offset + 3] = uint8(alpha)
            }
            zlib.Write(straight)
          } else { zlib.Write(source) }
          if compressed.Length > maxBytes - 57 { throw ClipboardLimitException("Encoded PNG exceeds its byte limit") }
        }
      } finally { zlib.Dispose() }
      if compressed.Length > maxBytes - 57 { throw ClipboardLimitException("Encoded PNG exceeds its byte limit") }
      using let output = MemoryStream(int32(compressed.Length) + 57)
      output.Write([]uint8{137, 80, 78, 71, 13, 10, 26, 10})
      let header = [13]uint8
      Put32(header, 0, uint32(width))
      Put32(header, 4, uint32(height))
      header[8] = 8
      header[9] = 6
      Chunk(output, []uint8{73, 72, 68, 82}, header)
      Chunk(output, []uint8{73, 68, 65, 84}, ReadOnlySpan[uint8](compressed.GetBuffer(), 0, int32(compressed.Length)))
      Chunk(output, []uint8{73, 69, 78, 68}, ReadOnlySpan[uint8].Empty)
      return output.ToArray()
    }

    private func Chunk(output MemoryStream, kind []uint8, bytes ReadOnlySpan[uint8]) {
      let number = [4]uint8
      Put32(number, 0, uint32(bytes.Length))
      output.Write(number)
      output.Write(kind)
      output.Write(bytes)
      var crc = 0xFFFFFFFFu
      for value in kind { crc = RasterImageDecoder.CrcUpdate(crc, value) }
      for value in bytes { crc = RasterImageDecoder.CrcUpdate(crc, value) }
      Put32(number, 0, crc ^ 0xFFFFFFFFu)
      output.Write(number)
    }

    private func Put32(bytes []uint8, offset int32, value uint32) {
      bytes[offset] = uint8(value >> 24)
      bytes[offset + 1] = uint8(value >> 16)
      bytes[offset + 2] = uint8(value >> 8)
      bytes[offset + 3] = uint8(value)
    }
  }
}
