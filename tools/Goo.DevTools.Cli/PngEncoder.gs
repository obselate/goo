package Goo.DevTools.Cli

import System
import System.Buffers.Binary
import System.IO
import System.IO.Compression
import System.Text

internal shared class PngEncoder {
    private let Signature[]uint8 = []uint8{
        uint8(137),
        uint8(80),
        uint8(78),
        uint8(71),
        uint8(13),
        uint8(10),
        uint8(26),
        uint8(10)
    }

    func Encode(rgba[]uint8, width int32, height int32, stride int32)[]uint8 {
        if width <= 0 || height <= 0 {
            throw CliException("The endpoint returned an RGBA capture with invalid dimensions.")
        }
        let rowBytes = checked(width * 4)
        if stride < rowBytes || rgba.LongLength < int64(stride) * int64(height) {
            throw CliException("The endpoint returned an RGBA capture with an invalid stride or payload length.")
        }
        using let output = MemoryStream()
        output.Write(Signature)
        var header = stackalloc[13]uint8
        BinaryPrimitives.WriteUInt32BigEndian(header[0 .. 4], checked(uint32(width)))
        BinaryPrimitives.WriteUInt32BigEndian(header[4 .. 8], checked(uint32(height)))
        header[8] = uint8(8)
        header[9] = uint8(6)
        WriteChunk(output, "IHDR", header)
        var compressed[]uint8
        {
            using let encoded = MemoryStream()
            {
                using let zlib = ZLibStream(encoded, CompressionLevel.SmallestSize, leaveOpen: true)
                let row = [rowBytes + 1]uint8
                for var y = 0; y < height; y++ {
                    row[0] = uint8(0)
                    CopyUnpremultipliedRow(rgba, checked(y * stride), row.AsSpan(1, rowBytes))
                    zlib.Write(row, 0, row.Length)
                }
            }
            compressed = encoded.ToArray()
        }
        WriteChunk(output, "IDAT", compressed)
        WriteChunk(output, "IEND", []uint8{})
        return output.ToArray()
    }

    func IsPng(value ReadOnlySpan[uint8]) bool ->
        value.Length >= Signature.Length && value[.. Signature.Length].SequenceEqual(Signature)

    private func WriteChunk(output Stream, type string, data ReadOnlySpan[uint8]) {
        let length = stackalloc[4]uint8
        BinaryPrimitives.WriteUInt32BigEndian(length, checked(uint32(data.Length)))
        output.Write(length)
        let typeBytes = Encoding.ASCII.GetBytes(type)
        output.Write(typeBytes)
        output.Write(data)
        let checksum = stackalloc[4]uint8
        BinaryPrimitives.WriteUInt32BigEndian(checksum, Crc32(typeBytes, data))
        output.Write(checksum)
    }

    private func Crc32(type ReadOnlySpan[uint8], data ReadOnlySpan[uint8]) uint32 {
        var crc = 0xffffffffu
        for value in type {
            crc = Update(crc, value)
        }
        for value in data {
            crc = Update(crc, value)
        }
        return ~crc
    }

    private func Update(crc uint32, value uint8) uint32 {
        var crc = crc
        crc ^= uint32(value)
        for var bit = 0; bit < 8; bit++ {
            crc = (crc >> 1) ^ (0xedb88320u & uint32(-int32((crc & uint32(1)))))
        }
        return crc
    }

    private func CopyUnpremultipliedRow(rgba[]uint8, offset int32, row Span[uint8]) {
        var row = row
        for var index = 0; index < row.Length; index += 4 {
            let alpha = rgba[offset + index + 3]
            row[index + 3] = alpha
            if alpha == uint8(0) {
                row[index] = uint8(0)
                row[index + 1] = uint8(0)
                row[index + 2] = uint8(0)
                continue
            }
            if alpha == uint8.MaxValue {
                row[index] = rgba[offset + index]
                row[index + 1] = rgba[offset + index + 1]
                row[index + 2] = rgba[offset + index + 2]
                continue
            }
            row[index] = Unpremultiply(rgba[offset + index], alpha)
            row[index + 1] = Unpremultiply(rgba[offset + index + 1], alpha)
            row[index + 2] = Unpremultiply(rgba[offset + index + 2], alpha)
        }
    }

    private func Unpremultiply(value uint8, alpha uint8) uint8 {
        let result = (int32(value) * 255 + int32(alpha) / 2) / int32(alpha)
        return uint8(Math.Min(result, uint8.MaxValue))
    }
}
