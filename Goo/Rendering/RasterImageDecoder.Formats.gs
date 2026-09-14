package Goo

import System
import System.IO
import System.Threading

internal partial class RasterImageDecoder {
  shared {
    private func ValidateFormat(bytes []uint8, token CancellationToken) {
      if bytes.Length < 8 { throw InvalidDataException("Truncated image header") }
      if bytes[0] == 137 && bytes[1] == 80 { ValidatePng(bytes, token)
        return }
      if bytes[0] == 255 && bytes[1] == 216 { ValidateJpeg(bytes, token)
        return }
      if bytes[0] == 71 && bytes[1] == 73 && bytes[2] == 70
        && bytes[3] == 56 && (bytes[4] == 55 || bytes[4] == 57) && bytes[5] == 97 {
          ValidateGif(bytes, token)
          return
        }
      throw NotSupportedException("Only PNG, JPEG, and GIF images are supported; use ImageSource for other formats")
    }

    private func ValidateDimensions(width int32, height int32) {
      if width <= 0 || height <= 0 || width > 8192 || height > 8192
        || int64(width) * height * 4 > MaxDecodedBytes{
          throw InvalidDataException("Image exceeds 8192 pixels per dimension or 64 MiB decoded RGBA")
        }
    }

    // Validate every marker and entropy block before the decoder allocates the
    // raster. A JPEG has one frame; successive progressive scans refine it.
    private func ValidateJpeg(bytes []uint8, token CancellationToken) {
      var offset = 2
      var frame = false
      var scans int32
      while offset < bytes.Length {
        token.ThrowIfCancellationRequested()
        if bytes[offset] != 255 { throw InvalidDataException("Invalid JPEG marker") }
        while offset < bytes.Length && bytes[offset] == 255 { offset++ }
        if offset >= bytes.Length { break }
        let marker = int32(bytes[offset])
        offset++
        if marker == 217 {
          if !frame || scans == 0 { throw InvalidDataException("JPEG has no image scan") }
          return
        }
        if marker == 216 || marker == 0 || (marker >= 208 && marker <= 215) {
          throw InvalidDataException("Unexpected JPEG marker")
        }
        if marker == 1 { continue }
        if bytes.Length - offset < 2 { throw InvalidDataException("Truncated JPEG segment") }
        let size = Big16(bytes, offset)
        if size < 2 || size > bytes.Length - offset { throw InvalidDataException("Truncated JPEG segment") }
        if marker >= 192 && marker <= 207 && marker != 196 && marker != 200 && marker != 204 {
          if marker != 192 && marker != 193 && marker != 194 { throw NotSupportedException("Unsupported JPEG frame encoding") }
          if frame || size < 8 { throw InvalidDataException("Invalid or duplicate JPEG frame") }
          if bytes[offset + 2] != 8 { throw NotSupportedException("Only 8-bit JPEG samples are supported") }
          ValidateDimensions(Big16(bytes, offset + 5), Big16(bytes, offset + 3))
          let components = int32(bytes[offset + 7])
          if (components != 1 && components != 3 && components != 4) || size != 8 + components * 3 {
            throw InvalidDataException("Invalid JPEG component table")
          }
          frame = true
        }
        offset += size
        if marker == 218 {
          if !frame || size < 6 { throw InvalidDataException("JPEG scan precedes its frame") }
          scans++
          if scans > 64 { throw InvalidDataException("JPEG exceeds 64 scans") }
          while offset < bytes.Length {
            if (offset & 65535) == 0 { token.ThrowIfCancellationRequested() }
            if bytes[offset] != 255 { offset++
              continue }
            let start = offset
            while offset < bytes.Length && bytes[offset] == 255 { offset++ }
            if offset >= bytes.Length { break }
            let next = int32(bytes[offset])
            if next == 0 || (next >= 208 && next <= 215) { offset++
              continue }
            offset = start
            break
          }
        }
      }
      throw InvalidDataException("JPEG has no end marker")
    }

    // Decode only the first frame. All remaining blocks are checked for bounded
    // structure, without allocating or decompressing the rest of an animation.
    private func ValidateGif(bytes []uint8, token CancellationToken) {
      if bytes.Length < 13 { throw InvalidDataException("Truncated GIF screen descriptor") }
      let width = Little16(bytes, 6)
      let height = Little16(bytes, 8)
      ValidateDimensions(width, height)
      var offset = 13
      if (bytes[10] & uint8(128)) != 0 { offset += 3 * (1 << (int32(bytes[10] & uint8(7)) + 1)) }
      var frames int32
      while offset < bytes.Length {
        token.ThrowIfCancellationRequested()
        let kind = bytes[offset]
        offset++
        if kind == 59 {
          if frames == 0 { throw InvalidDataException("GIF contains no image") }
          return
        }
        if kind == 33 {
          if offset >= bytes.Length { throw InvalidDataException("Truncated GIF extension") }
          offset++
          offset = SkipGifBlocks(bytes, offset, nil, token)
          continue
        }
        if kind != 44 || bytes.Length - offset < 9 { throw InvalidDataException("Invalid GIF image descriptor") }
        let left = Little16(bytes, offset)
        let top = Little16(bytes, offset + 2)
        let frameWidth = Little16(bytes, offset + 4)
        let frameHeight = Little16(bytes, offset + 6)
        if frameWidth <= 0 || frameHeight <= 0 || left + frameWidth > width || top + frameHeight > height {
          throw InvalidDataException("GIF frame is outside its logical screen")
        }
        let flags = bytes[offset + 8]
        offset += 9
        if (flags & uint8(128)) != 0 { offset += 3 * (1 << (int32(flags & uint8(7)) + 1)) }
        if offset >= bytes.Length { throw InvalidDataException("Truncated GIF color table") }
        let codeSize = int32(bytes[offset])
        if codeSize < 2 || codeSize > 8 { throw InvalidDataException("Invalid GIF LZW code size") }
        offset++
        if frames == 0 {
          using let compressed = MemoryStream()
          offset = SkipGifBlocks(bytes, offset, compressed, token)
          ValidateGifCodes(compressed.ToArray(), codeSize, frameWidth * frameHeight, token)
        } else { offset = SkipGifBlocks(bytes, offset, nil, token) }
        frames++
        if frames > 1024 { throw InvalidDataException("GIF exceeds 1024 frames") }
      }
      throw InvalidDataException("GIF has no trailer")
    }

    private func SkipGifBlocks(bytes []uint8, start int32, copy MemoryStream?, token CancellationToken) int32 {
      var offset = start
      while offset < bytes.Length {
        token.ThrowIfCancellationRequested()
        let count = int32(bytes[offset])
        offset++
        if count == 0 { return offset }
        if count > bytes.Length - offset { throw InvalidDataException("Truncated GIF data block") }
        copy?.Write(bytes, offset, count)
        offset += count
      }
      throw InvalidDataException("Unterminated GIF data blocks")
    }

    // Track expansion lengths in the fixed 4096-code dictionary. This rejects
    // early termination and over-expansion without materializing pixel indices.
    private func ValidateGifCodes(bytes []uint8, minimum int32, pixels int32, token CancellationToken) {
      let lengths = [4096]int32
      let clear = 1 << minimum
      let end = clear + 1
      for i in 0 ... clear { lengths[i] = 1 }
      var next = end + 1
      var size = minimum + 1
      var bit int64
      var previous int32
      var expanded int32
      var codes int32
      var started = false
      while bit + size <= int64(bytes.Length) * 8 {
        if (codes & 1023) == 0 { token.ThrowIfCancellationRequested() }
        codes++
        var code int32
        for i in 0 ... size {
          code |= ((int32(bytes[int32((bit + i) / 8)]) >> int32((bit + i) % 8)) & 1) << i
        }
        bit += size
        if code == clear { next = end + 1
          size = minimum + 1
          previous = 0
          started = true
          continue }
        if !started { throw InvalidDataException("GIF LZW stream must start with clear") }
        if code == end {
          if expanded != pixels { throw InvalidDataException("GIF pixel data is truncated") }
          return
        }
        if code > next || (code == next && previous == 0) { throw InvalidDataException("Invalid GIF LZW code") }
        let length = if code == next { previous + 1 } else { lengths[code] }
        if length <= 0 || length > pixels - expanded { throw InvalidDataException("GIF decompression exceeds its declared raster size") }
        expanded += length
        if previous > 0 && next < 4096 {
          lengths[next] = previous + 1
          next++
          if next == (1 << size) && size < 12 { size++ }
        }
        previous = length
      }
      throw InvalidDataException("GIF LZW stream has no end code")
    }

    private func Big16(bytes []uint8, offset int32) int32 -> (int32(bytes[offset]) << 8) | int32(bytes[offset + 1])
    private func Little16(bytes []uint8, offset int32) int32 -> int32(bytes[offset]) | (int32(bytes[offset + 1]) << 8)
  }
}
