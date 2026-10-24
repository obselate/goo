package Goo

import System
import System.Buffers.Binary
import System.IO
import System.Threading

/// Converts consumer-decoded straight RGBA samples from bounded ICC profiles to SDR sRGB.
public sealed class ImageColorProfile {
  private init() { }

  shared {
    internal const MaxProfileBytes int32 = 4194304
    private const Rgb uint32 = 0x52474220u
    private const Gray uint32 = 0x47524159u
    private const Curve uint32 = 0x63757276u
    private const Parametric uint32 = 0x70617261u

    /// Converts straight RGBA8 samples in place before ImageSource.Transfer or alpha premultiplication.
    /// Alpha bytes are unchanged. Failed or cancelled output must not be published.
    /// @param profile The complete ICC v2/v4 profile, at most 4 MiB.
    /// @param straightRgba The nonempty RGBA8 buffer. Its length must be divisible by four.
    /// @param gray True for original gray samples replicated into the RGB channels.
    /// @param cancellationToken Cancels conversion before publication.
    /// @returns Success, InvalidData, Unsupported for LUT or incompatible profiles, or Cancelled.
    public func ToSrgb(profile ReadOnlyMemory[uint8], straightRgba Span[uint8], gray bool,
      cancellationToken CancellationToken) ImageDecodeStatus {
        if straightRgba.Length == 0 || straightRgba.Length % 4 != 0 {
          throw ArgumentException("A complete RGBA pixel buffer is required", "straightRgba")
        }
        try {
          cancellationToken.ThrowIfCancellationRequested()
          Convert(profile.Span, gray, straightRgba, cancellationToken)
          return ImageDecodeStatus.Success
        } catch (error OperationCanceledException) {
          return ImageDecodeStatus.Cancelled
        } catch (error InvalidDataException) {
          return ImageDecodeStatus.InvalidData
        } catch (error NotSupportedException) {
          return ImageDecodeStatus.Unsupported
        }
      }

    internal func Convert(profile ReadOnlySpan[uint8], gray bool, pixels Span[uint8], token CancellationToken) {
      if profile.Length < 132 || profile.Length > MaxProfileBytes || U32(profile, 0) != uint32(profile.Length)
        || U32(profile, 36) != 0x61637370u { throw InvalidDataException("Invalid ICC profile header") }
      if (profile[8] != 2 && profile[8] != 4) || U32(profile, 20) != 0x58595A20u {
        throw NotSupportedException("Only ICC v2/v4 XYZ matrix and gray profiles are supported")
      }
      let kind = U32(profile, 12)
      if kind != 0x73636E72u && kind != 0x6D6E7472u && kind != 0x73706163u {
        throw NotSupportedException("Unsupported ICC profile class")
      }
      let expectedModel = if gray { Gray } else { Rgb }
      if U32(profile, 16) != expectedModel {
        throw NotSupportedException("ICC profile does not match the decoded sample model")
      }
      let count = U32(profile, 128)
      if int64(count) * 12 > profile.Length - 132 { throw InvalidDataException("Invalid ICC tag table") }
      for i in 0 ... int32(count) {
        let tag = U32(profile, 132 + i * 12)
        let offset = U32(profile, 136 + i * 12)
        let length = U32(profile, 140 + i * 12)
        if offset < uint32(132 + int32(count) * 12) || length < 8u || int64(offset) + length > profile.Length {
          throw InvalidDataException("Invalid ICC tag bounds")
        }
        let type = U32(profile, int32(offset))
        if tag == 0x41324230u || tag == 0x41324231u || tag == 0x41324232u
          || tag == 0x44324230u || tag == 0x44324231u || tag == 0x44324232u || tag == 0x44324233u
          || type == 0x6D667431u || type == 0x6D667432u || type == 0x6D414220u || type == 0x6D424120u {
            throw NotSupportedException("LUT-based ICC profiles are not supported")
          }
      }
      let redTag = Tag(profile, if gray { 0x6B545243u } else { 0x72545243u })
      let greenTag = if gray { redTag } else { Tag(profile, 0x67545243u) }
      let blueTag = if gray { redTag } else { Tag(profile, 0x62545243u) }
      let red = Table(redTag)
      let green = if redTag.SequenceEqual(greenTag) { red } else { Table(greenTag) }
      let blue = if redTag.SequenceEqual(blueTag) { red }
        else if greenTag.SequenceEqual(blueTag) { green } else { Table(blueTag) }
      let matrix = [9]float64
      if gray {
        let white = Tag(profile, 0x77747074u)
        for row in 0 ... 3 { matrix[row * 3] = Xyz(white, row) }
      } else {
        let r = Tag(profile, 0x7258595Au)
        let g = Tag(profile, 0x6758595Au)
        let b = Tag(profile, 0x6258595Au)
        for row in 0 ... 3 {
          matrix[row * 3] = Xyz(r, row)
          matrix[row * 3 + 1] = Xyz(g, row)
          matrix[row * 3 + 2] = Xyz(b, row)
        }
      }
      for column in 0 ... 3 {
        let x = matrix[column]
        let y = matrix[column + 3]
        let z = matrix[column + 6]
        matrix[column] = 3.1338561 * x - 1.6168667 * y - 0.4906146 * z
        matrix[column + 3] = -0.9787684 * x + 1.9161415 * y + 0.0334540 * z
        matrix[column + 6] = 0.0719453 * x - 0.2289914 * y + 1.4052427 * z
      }
      for offset in 0 ... pixels.Length / 4 {
        if (offset & 16383) == 0 { token.ThrowIfCancellationRequested() }
        let index = offset * 4
        let r = red[int32(pixels[index])]
        let g = if gray { 0.0 } else { green[int32(pixels[index + 1])] }
        let b = if gray { 0.0 } else { blue[int32(pixels[index + 2])] }
        pixels[index] = Encode(matrix[0] * r + matrix[1] * g + matrix[2] * b)
        pixels[index + 1] = Encode(matrix[3] * r + matrix[4] * g + matrix[5] * b)
        pixels[index + 2] = Encode(matrix[6] * r + matrix[7] * g + matrix[8] * b)
      }
    }

    private func Tag(profile ReadOnlySpan[uint8], name uint32) ReadOnlySpan[uint8] {
      let count = int32(U32(profile, 128))
      var result ReadOnlySpan[uint8]
      for i in 0 ... count {
        if U32(profile, 132 + i * 12) != name { continue }
        if !result.IsEmpty { throw InvalidDataException("Duplicate ICC tag") }
        result = profile.Slice(int32(U32(profile, 136 + i * 12)), int32(U32(profile, 140 + i * 12)))
      }
      if result.IsEmpty { throw NotSupportedException("ICC profile has no required matrix or tone curve tag") }
      return result
    }

    private func Xyz(tag ReadOnlySpan[uint8], channel int32) float64 {
      if tag.Length < 20 || U32(tag, 0) != 0x58595A20u { throw InvalidDataException("Invalid ICC XYZ tag") }
      return Fixed(tag, 8 + channel * 4)
    }

    private func Table(tag ReadOnlySpan[uint8]) []float64 {
      let kind = U32(tag, 0)
      if tag.Length < 12 { throw InvalidDataException("Truncated ICC tone curve") }
      let table = [256]float64
      let parameters = [7]float64
      var count int32
      var function int32
      if kind == Curve {
        let entries = U32(tag, 8)
        if int64(entries) * 2 > tag.Length - 12 { throw InvalidDataException("Truncated ICC curve entries") }
        count = int32(entries)
      } else if kind == Parametric {
        function = int32(BinaryPrimitives.ReadUInt16BigEndian(tag.Slice(8, 2)))
        count = switch function { case 0: 1 case 1: 3 case 2: 4 case 3: 5 case 4: 7 default: 0 }
        if count == 0 { throw NotSupportedException("Unsupported ICC parametric curve") }
        if count * 4 > tag.Length - 12 { throw InvalidDataException("Truncated ICC curve parameters") }
        for i in 0 ... count { parameters[i] = Fixed(tag, 12 + i * 4) }
        if parameters[0] <= 0.0 || (function > 0 && parameters[1] <= 0.0) {
          throw InvalidDataException("Invalid ICC curve parameters")
        }
      } else { throw NotSupportedException("Unsupported ICC tone curve type") }
      for i in 0 ... 256 {
        let x = float64(i) / 255.0
        var value float64
        if kind == Parametric { value = ParametricValue(x, function, parameters) }
        else if count == 0 { value = x }
        else if count == 1 {
          let gamma = float64(BinaryPrimitives.ReadUInt16BigEndian(tag.Slice(12, 2))) / 256.0
          if gamma <= 0.0 { throw InvalidDataException("Invalid ICC curve gamma") }
          value = Math.Pow(x, gamma)
        } else {
          let position = x * float64(count - 1)
          let first = int32(position)
          let second = Math.Min(first + 1, count - 1)
          let a = float64(BinaryPrimitives.ReadUInt16BigEndian(tag.Slice(12 + first * 2, 2)))
          let b = float64(BinaryPrimitives.ReadUInt16BigEndian(tag.Slice(12 + second * 2, 2)))
          value = (a + (b - a) * (position - first)) / 65535.0
        }
        if !Double.IsFinite(value) || value < 0.0 || value > 1.0001
          || (i > 0 && value < table[i - 1]) { throw InvalidDataException("Invalid ICC tone curve") }
        table[i] = value
      }
      return table
    }

    private func ParametricValue(x float64, function int32, p []float64) float64 -> switch function {
      case 0: Math.Pow(x, p[0])
      case 1: if x >= -p[2] / p[1] { Math.Pow(p[1] * x + p[2], p[0]) } else { 0.0 }
      case 2: if x >= -p[2] / p[1] { Math.Pow(p[1] * x + p[2], p[0]) + p[3] } else { p[3] }
      case 3: if x >= p[4] { Math.Pow(p[1] * x + p[2], p[0]) } else { p[3] * x }
      default: if x >= p[4] { Math.Pow(p[1] * x + p[2], p[0]) + p[5] } else { p[3] * x + p[6] }
    }

    private func Encode(value float64) uint8 {
      let linear = Math.Clamp(value, 0.0, 1.0)
      let encoded = if linear <= 0.0031308 { linear * 12.92 } else { 1.055 * Math.Pow(linear, 1.0 / 2.4) - 0.055 }
      return uint8(Math.Round(encoded * 255.0))
    }

    private func U32(bytes ReadOnlySpan[uint8], offset int32) uint32 ->
    BinaryPrimitives.ReadUInt32BigEndian(bytes.Slice(offset, 4))

    private func Fixed(bytes ReadOnlySpan[uint8], offset int32) float64 ->
    float64(BinaryPrimitives.ReadInt32BigEndian(bytes.Slice(offset, 4))) / 65536.0
  }
}
