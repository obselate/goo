package Goo

import System
import System.Buffers.Binary
import System.Threading

internal unsafe partial class RasterImageDecoder {
  shared {
    private func ReadOrientation(bytes ReadOnlySpan[uint8], token CancellationToken) int32 {
      var orientation = 1
      var found = false
      if bytes.Length < 8 { return orientation }
      if bytes[0] == 137 && bytes[1] == 80 {
        var offset = 8
        while bytes.Length - offset >= 12 {
          token.ThrowIfCancellationRequested()
          let size = U32(bytes, offset)
          if int64(size) + 12 > bytes.Length - offset { return 1 }
          let length = int32(size)
          if U32(bytes, offset + 4) == 0x65584966u {
            if found { return 1 }
            found = true
            orientation = TiffOrientation(bytes.Slice(offset + 8, length))
          }
          offset += length + 12
        }
      } else if bytes[0] == 255 && bytes[1] == 216 {
        var offset = 2
        while offset < bytes.Length {
          token.ThrowIfCancellationRequested()
          if bytes[offset] != 255 { return 1 }
          while offset < bytes.Length && bytes[offset] == 255 { offset++ }
          if offset >= bytes.Length { return 1 }
          let marker = bytes[offset]
          offset++
          if marker == 218 || marker == 217 { return orientation }
          if marker == 1 { continue }
          if bytes.Length - offset < 2 { return 1 }
          let size = Big16(bytes, offset)
          if size < 2 || size > bytes.Length - offset { return 1 }
          if marker == 225 && size >= 8 && bytes[offset + 2] == 69 && bytes[offset + 3] == 120
            && bytes[offset + 4] == 105 && bytes[offset + 5] == 102
            && bytes[offset + 6] == 0 && bytes[offset + 7] == 0 {
              if found { return 1 }
              found = true
              orientation = TiffOrientation(bytes.Slice(offset + 8, size - 8))
            }
          offset += size
        }
      }
      return orientation
    }

    private func TiffOrientation(bytes ReadOnlySpan[uint8]) int32 {
      if bytes.Length < 8 { return 1 }
      let little = bytes[0] == 73 && bytes[1] == 73
      if !little && !(bytes[0] == 77 && bytes[1] == 77) { return 1 }
      if Tiff16(bytes, 2, little) != 42 { return 1 }
      let start = Tiff32(bytes, 4, little)
      if start < 8u || int64(start) + 2 > bytes.Length { return 1 }
      let count = Tiff16(bytes, int32(start), little)
      if int64(start) + 2 + int64(count) * 12 + 4 > bytes.Length {
        return 1
      }
      var orientation = 1
      var found = false
      for i in 0 ... count {
        let offset = int32(start) + 2 + i * 12
        if Tiff16(bytes, offset, little) != 0x0112 { continue }
        if found || Tiff16(bytes, offset + 2, little) != 3 || Tiff32(bytes, offset + 4, little) != 1u {
          return 1
        }
        found = true
        orientation = Tiff16(bytes, offset + 8, little)
        if orientation < 1 || orientation > 8 { return 1 }
      }
      return orientation
    }

    private func Tiff16(bytes ReadOnlySpan[uint8], offset int32, little bool) int32 ->
    if little { int32(BinaryPrimitives.ReadUInt16LittleEndian(bytes.Slice(offset, 2))) }
    else { int32(BinaryPrimitives.ReadUInt16BigEndian(bytes.Slice(offset, 2))) }

    private func Tiff32(bytes ReadOnlySpan[uint8], offset int32, little bool) uint32 ->
    if little { BinaryPrimitives.ReadUInt32LittleEndian(bytes.Slice(offset, 4)) }
    else { BinaryPrimitives.ReadUInt32BigEndian(bytes.Slice(offset, 4)) }

    private func OrientedSource(width int32, height int32, pixels ReadOnlySpan[uint8], orientation int32,
      token CancellationToken) ImageSource {
        if orientation == 1 { return ImageSource.Transfer(width, height, pixels.ToArray(), () -> { }) }
        let output = [pixels.Length]uint8
        let targetWidth = if orientation >= 5 { height } else { width }
        let targetHeight = if orientation >= 5 { width } else { height }
        let step = OrientationStep(height, orientation)
        for y in 0 ... height {
          token.ThrowIfCancellationRequested()
          var target = OrientationRow(width, height, y, orientation)
          for x in 0 ... width {
            pixels.Slice((y * width + x) * 4, 4).CopyTo(output.AsSpan(target * 4, 4))
            target += step
          }
        }
        return ImageSource.Transfer(targetWidth, targetHeight, output, () -> { })
      }

    private func OrientationStep(height int32, orientation int32) int32 -> switch orientation {
      case 2 or 3: -1
      case 5 or 6: height
      case 7 or 8: -height
      default: 1
    }

    private func OrientationRow(width int32, height int32, y int32, orientation int32) int32 -> switch orientation {
      case 2: y * width + width - 1
      case 3: (height - y) * width - 1
      case 4: (height - y - 1) * width
      case 5: y
      case 6: height - y - 1
      case 7: width * height - y - 1
      case 8: height * (width - 1) + y
      default: y * width
    }
  }
}
