package Goo

import System
import System.IO
import System.IO.Compression
import System.Threading
import StbImageSharp

internal class PngImageDecoder {
  shared {
    private const MaxEncodedBytes int32 = 16777216
    private const MaxDecodedBytes int32 = 67108864
    private let signature []uint8 = []uint8{137, 80, 78, 71, 13, 10, 26, 10}
    private let crcTable []uint32 = CreateCrcTable()

    internal func Load(path string, token CancellationToken) ImageSource {
      using let file = File.OpenRead(path)
      if file.Length > MaxEncodedBytes { throw InvalidDataException("Encoded image exceeds 16 MiB") }
      using let encoded = MemoryStream()
      let buffer = [65536]uint8
      while true {
        token.ThrowIfCancellationRequested()
        let count = file.Read(buffer, 0, buffer.Length)
        if count == 0 { break }
        if encoded.Length + count > MaxEncodedBytes { throw InvalidDataException("Encoded image exceeds 16 MiB") }
        encoded.Write(buffer, 0, count)
      }
      let bytes = encoded.ToArray()
      Validate(bytes, token)
      token.ThrowIfCancellationRequested()
      guard let image = StbImageSharp.ImageResult.FromMemory(bytes, ColorComponents.RedGreenBlueAlpha) else {
        throw InvalidDataException("PNG decoder returned no image")
      }
      token.ThrowIfCancellationRequested()
      guard let pixels = image.Data else { throw InvalidDataException("PNG decoder returned no pixels") }
      var offset = 0
      while offset < pixels.Length {
        let alpha = int32(pixels[offset + 3])
        for channel in 0 ... 3 {
          pixels[offset + channel] = uint8((int32(pixels[offset + channel]) * alpha + 127) / 255)
        }
        offset += 4
      }
      return ImageSource.Transfer(image.Width, image.Height, pixels, () -> { })
    }

    // Preflight the complete bounded zlib stream before stb can expand it. Header
    // dimensions alone do not bound a decoder's intermediate decompression buffer.
    private func Validate(bytes []uint8, token CancellationToken) {
      if bytes.Length < 8 { throw InvalidDataException("Truncated image header") }
      for i in 0 ... 8 {
        if bytes[i] != signature[i] { throw NotSupportedException("Only PNG images are supported; use ImageSource for other formats") }
      }
      var offset = 8
      var expected int64
      var seenHeader = false
      var seenData = false
      var dataEnded = false
      var ended = false
      using let compressed = MemoryStream()
      while offset < bytes.Length {
        token.ThrowIfCancellationRequested()
        if bytes.Length - offset < 12 { throw InvalidDataException("Truncated PNG chunk") }
        let size = U32(bytes, offset)
        if int64(size) + 12 > bytes.Length - offset { throw InvalidDataException("Truncated PNG chunk data") }
        let length = int32(size)
        let kind = U32(bytes, offset + 4)
        let start = offset + 8
        if Crc(bytes, offset + 4, length + 4) != U32(bytes, start + length) {
          throw InvalidDataException("PNG chunk checksum mismatch")
        }
        if !seenHeader && kind != 0x49484452u { throw InvalidDataException("PNG must start with IHDR") }
        if kind == 0x49484452u {
          if seenHeader || length != 13 { throw InvalidDataException("Invalid or duplicate PNG header") }
          seenHeader = true
          let width = U32(bytes, start)
          let height = U32(bytes, start + 4)
          if width == 0u || height == 0u || width > 8192u || height > 8192u
            || int64(width) * int64(height) * 4 > MaxDecodedBytes{
              throw InvalidDataException("PNG exceeds 8192 pixels per dimension or 64 MiB decoded RGBA")
            }
          let depth = int32(bytes[start + 8])
          let color = int32(bytes[start + 9])
          let channels = color == 0 || color == 3 ? 1 : color == 2 ? 3 : color == 4 ? 2 : color == 6 ? 4 : 0
          if channels == 0 || (depth != 8 && depth != 16 && !(color == 0 || color == 3))
            || (depth != 1 && depth != 2 && depth != 4 && depth != 8 && depth != 16)
            || (color == 3 && depth == 16) {
              throw NotSupportedException("Unsupported PNG color type or bit depth")
            }
          if bytes[start + 10] != uint8(0) || bytes[start + 11] != uint8(0) || bytes[start + 12] > uint8(1) {
            throw NotSupportedException("Unsupported PNG compression, filter, or interlace method")
          }
          if bytes[start + 12] == uint8(0) {
            expected = (int64(width) * channels * depth + 7) / 8 * height + height
          } else {
            let xs = []int32{0, 4, 0, 2, 0, 1, 0}
            let ys = []int32{0, 0, 4, 0, 2, 0, 1}
            let dx = []int32{8, 8, 4, 4, 2, 2, 1}
            let dy = []int32{8, 8, 8, 4, 4, 2, 2}
            for pass in 0 ... 7 {
              let w = (int32(width) - xs[pass] + dx[pass] - 1) / dx[pass]
              let h = (int32(height) - ys[pass] + dy[pass] - 1) / dy[pass]
              if w > 0 && h > 0 { expected += ((int64(w) * channels * depth + 7) / 8 + 1) * h }
            }
          }
        } else if kind == 0x49444154u {
          if dataEnded { throw InvalidDataException("PNG IDAT chunks must be consecutive") }
          seenData = true
          compressed.Write(bytes, start, length)
        } else {
          if seenData { dataEnded = true }
          if kind == 0x49454E44u {
            if length != 0 || !seenData || start + 4 != bytes.Length { throw InvalidDataException("Invalid PNG end chunk") }
            ended = true
          } else if kind != 0x504C5445u && (bytes[offset + 4] & uint8(32)) == uint8(0) {
            throw NotSupportedException("Unsupported critical PNG chunk")
          }
        }
        offset = start + length + 4
      }
      if !ended { throw InvalidDataException("PNG has no end chunk") }
      compressed.Position = 0
      using let inflated = ZLibStream(compressed, CompressionMode.Decompress)
      let buffer = [65536]uint8
      var total int64
      while true {
        token.ThrowIfCancellationRequested()
        let count = inflated.Read(buffer, 0, buffer.Length)
        if count == 0 { break }
        total += count
        if total > expected { throw InvalidDataException("PNG decompression exceeds its declared raster size") }
      }
      if total != expected { throw InvalidDataException("PNG pixel data is truncated") }
    }

    private func U32(bytes []uint8, offset int32) uint32 ->
    (uint32(bytes[offset]) << 24) | (uint32(bytes[offset + 1]) << 16)
    | (uint32(bytes[offset + 2]) << 8) | uint32(bytes[offset + 3])

    private func CreateCrcTable() []uint32 {
      let table = [256]uint32
      for i in 0 ... 256 {
        var crc = uint32(i)
        for bit in 0 ... 8 { crc = (crc >> 1) ^ ((crc & 1u) != 0u ? 0xEDB88320u : 0u) }
        table[i] = crc
      }
      return table
    }

    private func Crc(bytes []uint8, offset int32, count int32) uint32 {
      var crc = 0xFFFFFFFFu
      for i in offset ... offset + count { crc = (crc >> 8) ^ crcTable[int32((crc ^ bytes[i]) & 255u)] }
      return crc ^ 0xFFFFFFFFu
    }
  }
}
