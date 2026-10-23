package Goo

import System
import System.Diagnostics
import System.IO
import System.IO.Compression
import System.Threading

internal data struct RasterDecodeBounds {
  var Limits ImageDecodeLimits
  var MaxWidth int32
  var MaxHeight int32
}

internal unsafe partial class RasterImageDecoder {
  shared {
    private const MaxIconEdge uint32 = 1024u
    private let signature []uint8 = []uint8{137, 80, 78, 71, 13, 10, 26, 10}
    private let crcTable []uint32 = CreateCrcTable()

    internal func Load(path string, limits ImageDecodeLimits, token CancellationToken) ImageSource {
      guard let recorder = FrameRecorder.Current else {
        using let file = File.OpenRead(path)
        return Load(file, limits, token)
      }
      let start = Stopwatch.GetTimestamp()
      var completed = false
      try {
        using let file = File.OpenRead(path)
        let image = Load(file, limits, token)
        if !Object.ReferenceEquals(FrameRecorder.Current, recorder) {
          completed = true
          return image
        }
        let end = Stopwatch.GetTimestamp()
        let id = image.ProfileIdentity(recorder)
        let name = Path.GetFileName(path)
        recorder.Publish(FrameTraceRecord{Kind: FrameTraceKind.Metadata,
          Ticks: end - recorder.Origin, ResourceId: id, ResourceKind: int32(FrameResourceKind.ImageSource),
          Name: if name.Length > 128 { name.Substring(0, 128) } else { name }, Source: "resource.name"})
        recorder.ResourceDuration(FrameResourceKind.ImageSource, id, "image.load", start, end: end)
        completed = true
        return image
      } finally {
        if !completed { recorder.ResourceDuration(FrameResourceKind.ImageSource, 0uL, "image.load", start, result: if token.IsCancellationRequested { -2 } else { -1 }) }
      }
    }

    internal func LoadThumbnail(path string, maxWidth int32, maxHeight int32,
      limits ImageDecodeLimits, token CancellationToken) ImageSource {
        token.ThrowIfCancellationRequested()
        using let file = File.OpenRead(path)
        return LoadThumbnail(file, maxWidth, maxHeight, limits, token)
      }

    internal func LoadThumbnail(stream Stream, maxWidth int32, maxHeight int32,
      limits ImageDecodeLimits, token CancellationToken) ImageSource ->
    Load(stream, RasterDecodeBounds{ Limits: limits, MaxWidth: maxWidth, MaxHeight: maxHeight }, token)

    internal func Load(stream Stream, limits ImageDecodeLimits, token CancellationToken) ImageSource ->
    Load(stream, RasterDecodeBounds{ Limits: limits }, token)

    private func EncodedLimit(limits ImageDecodeLimits) ImageLimitException ->
    ImageLimitException("Encoded image exceeds " + limits.MaxEncodedBytes.ToString() + " bytes", 0, 0)

    private func Load(stream Stream, bounds RasterDecodeBounds, token CancellationToken) ImageSource {
      token.ThrowIfCancellationRequested()
      var encoded NativeBytes
      try { encoded = BoundedInput.ReadAll(stream, bounds.Limits.MaxEncodedBytes, "Encoded image", token) }
      catch (error InvalidDataException) { throw EncodedLimit(bounds.Limits) }
      using let retained = encoded
      return DecodeCore(encoded.Bytes, bounds, token)
    }

    internal func DecodeIconPng(bytes []uint8) NativeImage ->
    DecodeRaw(bytes, RasterDecodeBounds{ Limits: ImageDecodeLimits.Default }, CancellationToken.None, true)

    private func ThumbnailSize(sourceWidth int32, sourceHeight int32, bounds RasterDecodeBounds,
      out width int32, out height int32) {
        width = sourceWidth
        height = sourceHeight
        if bounds.MaxWidth <= 0 || (sourceWidth <= bounds.MaxWidth && sourceHeight <= bounds.MaxHeight) { return }
        if int64(sourceWidth) * bounds.MaxHeight > int64(sourceHeight) * bounds.MaxWidth {
          width = bounds.MaxWidth
          height = int32(Math.Max(1L, (int64(sourceHeight) * bounds.MaxWidth + sourceWidth / 2) / sourceWidth))
        } else {
          width = int32(Math.Max(1L, (int64(sourceWidth) * bounds.MaxHeight + sourceHeight / 2) / sourceHeight))
          height = bounds.MaxHeight
        }
      }

    private func DecodeCore(bytes ReadOnlySpan[uint8], bounds RasterDecodeBounds,
      token CancellationToken) ImageSource {
      guard let recorder = FrameRecorder.Current else { return DecodePixels(bytes, bounds, token) }
      let start = Stopwatch.GetTimestamp()
      var completed = false
      try {
        let source = DecodePixels(bytes, bounds, token)
        if !Object.ReferenceEquals(FrameRecorder.Current, recorder) {
          completed = true
          return source
        }
        let end = Stopwatch.GetTimestamp()
        recorder.ResourceDuration(FrameResourceKind.ImageSource, source.ProfileIdentity(recorder),
          "image.decode", start, bytes: uint64(bytes.Length), end: end)
        completed = true
        return source
      } finally {
        if !completed { recorder.ResourceDuration(FrameResourceKind.ImageSource, 0uL, "image.decode", start,
          result: if token.IsCancellationRequested { -2 } else { -1 }) }
      }
    }

    private func DecodePixels(bytes ReadOnlySpan[uint8], bounds RasterDecodeBounds,
      token CancellationToken, profile ([]uint8)? = nil, gray bool = false, validated bool = false) ImageSource {
      if bytes.Length > bounds.Limits.MaxEncodedBytes { throw EncodedLimit(bounds.Limits) }
      let orientation = ReadOrientation(bytes, token)
      let orientedBounds = RasterDecodeBounds{Limits: bounds.Limits,
        MaxWidth: if orientation >= 5 { bounds.MaxHeight } else { bounds.MaxWidth },
        MaxHeight: if orientation >= 5 { bounds.MaxWidth } else { bounds.MaxHeight }}
      using let image = DecodeRaw(bytes, orientedBounds, token, false, validated)
      let pixels = image.Pixels
      if let color = profile { IccColorTransform.Convert(color, gray, pixels, token) }
      var offset = 0
      while offset < pixels.Length {
        if (offset & 65535) == 0 { token.ThrowIfCancellationRequested() }
        let alpha = int32(pixels[offset + 3])
        if alpha != 255 {
          for channel in 0 ... 3 {
            pixels[offset + channel] = uint8((int32(pixels[offset + channel]) * alpha + 127) / 255)
          }
        }
        offset += 4
      }
      ThumbnailSize(image.Width, image.Height, orientedBounds, out var width, out var height)
      if width != image.Width || height != image.Height {
        let resized = Resample(pixels, image.Width, image.Height, width, height, orientation, token)
        token.ThrowIfCancellationRequested()
        return ImageSource.Transfer(if orientation >= 5 { height } else { width },
          if orientation >= 5 { width } else { height }, resized, () -> { })
      }
      token.ThrowIfCancellationRequested()
      return OrientedSource(image.Width, image.Height, pixels, orientation, token)
    }

    internal func DecodeRaw(bytes ReadOnlySpan[uint8], bounds RasterDecodeBounds, token CancellationToken,
      pngOnly bool, validated bool = false) NativeImage {
      token.ThrowIfCancellationRequested()
      if bytes.Length > bounds.Limits.MaxEncodedBytes { throw EncodedLimit(bounds.Limits) }
      if !validated {
        if pngOnly { ValidatePng(bytes, bounds, token) } else { ValidateFormat(bytes, bounds, token) }
      }
      if pngOnly && (U32(bytes, 16) > MaxIconEdge || U32(bytes, 20) > MaxIconEdge) {
        throw InvalidDataException("Window icon exceeds 1024 pixels per side")
      }
      token.ThrowIfCancellationRequested()
      let image = NativeImage.Decode(bytes)
      var valid = false
      try {
        ValidateDimensions(image.Width, image.Height, bounds)
        token.ThrowIfCancellationRequested()
        valid = true
        return image
      } finally {
        if !valid { image.Dispose() }
      }
    }

    private func Resample(pixels ReadOnlySpan[uint8], sourceWidth int32, sourceHeight int32,
      width int32, height int32, orientation int32, token CancellationToken) []uint8 {
        let resized = [width * height * 4]uint8
        let spans = [width * 4]int32
        let row = [width * 4]int32
        let sums = [width * 4]int64
        for x in 0 ... width {
          let left = x * sourceWidth
          let right = left + sourceWidth
          let first = left / width
          let last = (right - 1) / width
          let target = x * 4
          spans[target] = first * 4
          spans[target + 1] = last * 4
          spans[target + 2] = Math.Min(right, (first + 1) * width) - left
          spans[target + 3] = if last > first { right - last * width } else { 0 }
        }
        let area = float64(sourceWidth) * float64(sourceHeight)
        var cachedRow = -1
        let step = OrientationStep(height, orientation) * 4
        for y in 0 ... height {
          token.ThrowIfCancellationRequested()
          Array.Clear(sums)
          let top = y * sourceHeight
          let bottom = top + sourceHeight
          for sy in top / height ... (bottom - 1) / height + 1 {
            token.ThrowIfCancellationRequested()
            if cachedRow != sy {
              FilterRow(pixels, sy * sourceWidth * 4, width, spans, row)
              cachedRow = sy
            }
            let weight = Math.Min(bottom, (sy + 1) * height) - Math.Max(top, sy * height)
            for channel in 0 ... row.Length { sums[channel] += int64(row[channel]) * weight }
          }
          var target = OrientationRow(width, height, y, orientation) * 4
          for x in 0 ... width {
            for channel in 0 ... 4 {
              resized[target + channel] = uint8(Math.Round(float64(sums[x * 4 + channel]) / area))
            }
            target += step
          }
        }
        return resized
      }

    private func FilterRow(pixels ReadOnlySpan[uint8], offset int32, width int32, spans []int32, row []int32) {
      for x in 0 ... width {
        let target = x * 4
        let first = offset + spans[target]
        let last = offset + spans[target + 1]
        let firstWeight = spans[target + 2]
        let lastWeight = spans[target + 3]
        var red int32
        var green int32
        var blue int32
        var alpha int32
        var source = first + 4
        while source < last {
          red += pixels[source]
          green += pixels[source + 1]
          blue += pixels[source + 2]
          alpha += pixels[source + 3]
          source += 4
        }
        row[target] = red * width + int32(pixels[first]) * firstWeight + int32(pixels[last]) * lastWeight
        row[target + 1] = green * width + int32(pixels[first + 1]) * firstWeight + int32(pixels[last + 1]) * lastWeight
        row[target + 2] = blue * width + int32(pixels[first + 2]) * firstWeight + int32(pixels[last + 2]) * lastWeight
        row[target + 3] = alpha * width + int32(pixels[first + 3]) * firstWeight + int32(pixels[last + 3]) * lastWeight
      }
    }

    internal func Decode(bytes ReadOnlyMemory[uint8], limits ImageDecodeLimits,
      token CancellationToken) ImageSource {
        token.ThrowIfCancellationRequested()
        return DecodeCore(bytes.Span, RasterDecodeBounds{ Limits: limits }, token)
      }

    // Preflight the complete bounded zlib stream before stb can expand it. Header
    // dimensions alone do not bound a decoder's intermediate decompression buffer.
    private func ValidatePng(bytes ReadOnlySpan[uint8], bounds RasterDecodeBounds, token CancellationToken) {
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
      using let compressed = NativeBytes(bytes.Length)
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
          if width > 2147483647u || height > 2147483647u { throw InvalidDataException("Invalid PNG dimensions") }
          ValidateDimensions(int32(width), int32(height), bounds)
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
          compressed.Append(bytes.Slice(start, length))
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
      using let inflated = ZLibStream(compressed.Stream(), CompressionMode.Decompress)
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

    private func U32(bytes ReadOnlySpan[uint8], offset int32) uint32 ->
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

    private func Crc(bytes ReadOnlySpan[uint8], offset int32, count int32) uint32 {
      var crc = 0xFFFFFFFFu
      for i in offset ... offset + count { crc = (crc >> 8) ^ crcTable[int32((crc ^ bytes[i]) & 255u)] }
      return crc ^ 0xFFFFFFFFu
    }

    internal func CrcUpdate(crc uint32, value uint8) uint32 ->
    (crc >> 8) ^ crcTable[int32((crc ^ uint32(value)) & 255u)]
  }
}
