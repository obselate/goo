package Goo.Printing

import Goo
import System
import System.Globalization
import System.IO
import System.IO.Compression
import System.Text
import System.Threading

internal class RasterPdf {
    private let output Output
    private let offsets[]int64 = System.Array.Empty[int64]()
    private let pageCount int32
    private let settings PrintPageSettings
    private var row[]uint8 = System.Array.Empty[uint8]()
    private var written int32

    internal init(destination Stream, pageCount int32, settings PrintPageSettings) {
        output = Output(destination)
        offsets = [checked(3 + pageCount * 4)]int64
        this.pageCount = pageCount
        this.settings = settings
        output.Write(
            []uint8{
                0x25,
                0x50,
                0x44,
                0x46,
                0x2D,
                0x31,
                0x2E,
                0x34,
                0x0A,
                0x25,
                0xC3,
                0xA2,
                0xC3,
                0xA3,
                0xC3,
                0x8F,
                0xC3,
                0x93,
                0x0A
            }
        )
        Object(1)
        Text(`<< /Type /Catalog /Pages 2 0 R >>
endobj
`)
        Object(2)
        Text("<< /Type /Pages /Count $pageCount /Kids [")
        for var index = 0; index < pageCount; index++ {
            Text("${3 + index * 4} 0 R ")
        }
        Text(`] >>
endobj
`)
    }

    internal func AddPage(capture WindowCapture, cancellation CancellationToken) {
        if written >= pageCount {
            throw InvalidOperationException("All PDF pages are already written.")
        }
        let page = 3 + written * 4
        let width = settings.WidthPoints.ToString("R", CultureInfo.InvariantCulture)
        let height = settings.HeightPoints.ToString("R", CultureInfo.InvariantCulture)
        Object(page)
        Text(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $width $height] /Resources " +
                (`<< /XObject << /Image ` + "${page + 2}" + ` 0 R >> >> /Contents ` + "${page + 1}" + ` 0 R >>
endobj
`)
        )
        let commands = (`q ` + "$width" + ` 0 0 ` + "$height" + ` 0 0 cm /Image Do Q
`)
        Object(page + 1)
        Text((`<< /Length ` + "${commands.Length}" + ` >>
stream
` + "$commands" + `endstream
endobj
`))
        Object(page + 2)
        Text(
            "<< /Type /XObject /Subtype /Image /Width ${capture.Width} /Height ${capture.Height} " +
                (`/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ` + "${page + 3}" + ` 0 R >>
stream
`)
        )
        let start = output.Count
        let pixelWidth = checked(int32(capture.Width))
        let pixelHeight = checked(int32(capture.Height))
        let stride = checked(int32(capture.RowBytes))
        let pixels = capture.Pixels
        let rowLength = checked(pixelWidth * 3)
        if row.Length < rowLength {
            row = [rowLength]uint8
        }
        {
            using let compressed = ZLibStream(output, CompressionLevel.Fastest, true)
            for var y = 0; y < pixelHeight; y++ {
                cancellation.ThrowIfCancellationRequested()
                var input = checked(y * stride)
                {
                    var target = 0
                    while target < rowLength {
                        let white = 255 - int32(pixels[input + 3])
                        row[target] = uint8(Math.Min(255, int32(pixels[input]) + white))
                        row[target + 1] = uint8(Math.Min(255, int32(pixels[input + 1]) + white))
                        row[target + 2] = uint8(Math.Min(255, int32(pixels[input + 2]) + white))
                        target += 3
                        input += 4
                    }
                }
                compressed.Write(row, 0, rowLength)
            }
        }
        let length = output.Count - start
        Text(`
endstream
endobj
`)
        Object(page + 3)
        Text(length.ToString(CultureInfo.InvariantCulture) + `
endobj
`)
        written++
    }

    internal func Complete() {
        if written != pageCount {
            throw InvalidOperationException("The PDF is missing pages.")
        }
        let xref = output.Count
        Text((`xref
0 ` + "${offsets.Length}" + `
0000000000 65535 f 
`))
        for var index = 1; index < offsets.Length; index++ {
            if offsets[index] > 9999999999L {
                throw IOException("The PDF exceeds the cross-reference size limit.")
            }
            Text(offsets[index].ToString("D10", CultureInfo.InvariantCulture) + " 00000 n \n")
        }
        Text((`trailer
<< /Size ` + "${offsets.Length}" + ` /Root 1 0 R >>
startxref
` + "$xref" + `
%%EOF
`))
        output.Flush()
    }

    private func Object(id int32) {
        offsets[id] = output.Count
        Text(("$id" + ` 0 obj
`))
    }

    private func Text(value string) {
        let bytes = if value.Length <= 1024 {
            stackalloc[value.Length]uint8
        } else {
            [value.Length]uint8
        }
        Encoding.ASCII.GetBytes(value.AsSpan(), bytes)
        output.Write(bytes)
    }

    private class Output(destination Stream) : Stream {
        internal prop Count int64 {
            get;
            private set;
        }

        override prop CanRead bool -> false
        override prop CanSeek bool -> false
        override prop CanWrite bool -> destination.CanWrite
        override prop Length int64 -> Count

        override prop Position int64 {
            get -> Count
            set {
                throw NotSupportedException()
            }
        }

        override func Flush() -> destination.Flush()

        override func Read(buffer[]uint8, offset int32, count int32) int32 {
            throw NotSupportedException()
        }

        override func Seek(offset int64, origin SeekOrigin) int64 {
            throw NotSupportedException()
        }

        override func SetLength(value int64) {
            throw NotSupportedException()
        }

        override func Write(buffer[]uint8, offset int32, count int32) -> Write(buffer.AsSpan(offset, count))

        override func Write(buffer ReadOnlySpan[uint8]) {
            destination.Write(buffer)
            Count = checked(Count + int64(buffer.Length))
        }
    }
}
