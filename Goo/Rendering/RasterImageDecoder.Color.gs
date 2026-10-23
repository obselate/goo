package Goo

import System
import System.IO
import System.IO.Compression
import System.Threading

internal unsafe partial class RasterImageDecoder {
  shared {
    internal func DecodeColorManaged(bytes ReadOnlyMemory[uint8], limits ImageDecodeLimits,
      token CancellationToken) ImageSource {
        token.ThrowIfCancellationRequested()
        if bytes.Length > limits.MaxEncodedBytes { throw EncodedLimit(limits) }
        let bounds = RasterDecodeBounds{Limits: limits}
        ValidateFormat(bytes.Span, bounds, token)
        let profile = ReadColorProfile(bytes.Span, token, out var gray)
        return DecodePixels(bytes.Span, bounds, token, profile, gray, true)
      }

    private func ReadColorProfile(bytes ReadOnlySpan[uint8], token CancellationToken, out gray bool) ([]uint8)? {
      gray = false
      if bytes[0] == 137 && bytes[1] == 80 { return ReadPngProfile(bytes, token, out gray) }
      if bytes[0] != 255 || bytes[1] != 216 { return nil }
      var starts = Array.Empty[int32]()
      var lengths = Array.Empty[int32]()
      var total = 0
      var fragments = 0
      var offset = 2
      var components = 0
      var encodedBytes = 0
      while offset < bytes.Length {
        token.ThrowIfCancellationRequested()
        while offset < bytes.Length && bytes[offset] == 255 { offset++ }
        if offset >= bytes.Length { break }
        let marker = int32(bytes[offset])
        offset++
        if marker == 218 || marker == 217 { break }
        if marker == 1 { continue }
        let size = Big16(bytes, offset)
        if marker >= 192 && marker <= 194 { components = int32(bytes[offset + 7]) }
        if marker == 226 && size >= 16 && IsIccSignature(bytes.Slice(offset + 2, 12)) {
          let part = int32(bytes[offset + 14])
          let count = int32(bytes[offset + 15])
          if part == 0 || count == 0 || part > count
            || (total != 0 && total != count) { throw InvalidDataException("Invalid JPEG ICC fragments") }
          if total == 0 {
            starts = [count + 1]int32
            lengths = [count + 1]int32
            total = count
          }
          if starts[part] != 0 { throw InvalidDataException("Duplicate JPEG ICC fragment") }
          starts[part] = offset + 16
          lengths[part] = size - 16
          encodedBytes += size - 16
          if encodedBytes > ImageColorProfile.MaxProfileBytes { throw InvalidDataException("ICC profile exceeds its byte limit") }
          fragments++
        }
        offset += size
      }
      if total == 0 { return nil }
      if fragments != total { throw InvalidDataException("Missing JPEG ICC fragment") }
      if components == 4 { throw NotSupportedException("CMYK ICC conversion requires original CMYK samples") }
      gray = components == 1
      let profile = [encodedBytes]uint8
      var target = 0
      for part in 1 ... total + 1 {
        bytes.Slice(starts[part], lengths[part]).CopyTo(profile.AsSpan(target))
        target += lengths[part]
      }
      return profile
    }

    private func IsIccSignature(bytes ReadOnlySpan[uint8]) bool ->
    bytes[0] == 73 && bytes[1] == 67 && bytes[2] == 67 && bytes[3] == 95
    && bytes[4] == 80 && bytes[5] == 82 && bytes[6] == 79 && bytes[7] == 70
    && bytes[8] == 73 && bytes[9] == 76 && bytes[10] == 69 && bytes[11] == 0

    private func ReadPngProfile(bytes ReadOnlySpan[uint8], token CancellationToken, out gray bool) ([]uint8)? {
      gray = bytes[25] == 0 || bytes[25] == 4
      var offset = 8
      var profile ([]uint8)? = nil
      var srgb = false
      var cicp = false
      while offset < bytes.Length {
        token.ThrowIfCancellationRequested()
        let length = int32(U32(bytes, offset))
        let kind = U32(bytes, offset + 4)
        let chunk = bytes.Slice(offset + 8, length)
        if kind == 0x69434350u {
          if profile != nil { throw InvalidDataException("Duplicate PNG ICC profile") }
          let zero = chunk.IndexOf(uint8(0))
          if zero < 1 || zero > 79 || zero + 2 > chunk.Length || chunk[zero + 1] != 0 {
            throw InvalidDataException("Invalid PNG ICC profile header")
          }
          fixed compressed * uint8 = chunk.Slice(zero + 2) {
            using let input = UnmanagedMemoryStream(compressed, int64(chunk.Length - zero - 2))
            using let inflated = ZLibStream(input, CompressionMode.Decompress)
            using let output = BoundedInput.ReadAll(inflated, ImageColorProfile.MaxProfileBytes, "ICC profile", token)
            profile = output.Bytes.ToArray()
          }
        } else if kind == 0x73524742u { srgb = true }
        else if kind == 0x63494350u {
          if cicp { throw InvalidDataException("Duplicate PNG cICP declaration") }
          cicp = true
          if length != 4 || chunk[0] != 1 || chunk[1] != 13 || chunk[2] != 0 || chunk[3] != 1 {
            throw NotSupportedException("Unsupported PNG cICP color encoding")
          }
        }
        offset += length + 12
      }
      if profile != nil && srgb { throw InvalidDataException("Conflicting PNG sRGB and ICC declarations") }
      return if cicp { nil } else { profile }
    }
  }
}
