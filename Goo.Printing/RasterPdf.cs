using System.Globalization;
using System.IO.Compression;
using System.Text;

namespace Goo.Printing;

internal sealed class RasterPdf
{
    private readonly Output output;
    private readonly long[] offsets;
    private readonly int pageCount;
    private readonly PrintPageSettings settings;
    private byte[] row = [];
    private int written;

    internal RasterPdf(Stream destination, int pageCount, PrintPageSettings settings)
    {
        output = new Output(destination);
        offsets = new long[checked(3 + pageCount * 4)];
        this.pageCount = pageCount;
        this.settings = settings;
        output.Write("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"u8);
        Object(1);
        Text("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
        Object(2);
        Text($"<< /Type /Pages /Count {pageCount} /Kids [");
        for (var index = 0; index < pageCount; index++)
            Text($"{3 + index * 4} 0 R ");
        Text("] >>\nendobj\n");
    }

    internal void AddPage(WindowCapture capture, CancellationToken cancellation)
    {
        if (written >= pageCount)
            throw new InvalidOperationException("All PDF pages are already written.");
        var page = 3 + written * 4;
        var width = settings.WidthPoints.ToString("R", CultureInfo.InvariantCulture);
        var height = settings.HeightPoints.ToString("R", CultureInfo.InvariantCulture);
        Object(page);
        Text($"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources " +
            $"<< /XObject << /Image {page + 2} 0 R >> >> /Contents {page + 1} 0 R >>\nendobj\n");
        var commands = $"q {width} 0 0 {height} 0 0 cm /Image Do Q\n";
        Object(page + 1);
        Text($"<< /Length {commands.Length} >>\nstream\n{commands}endstream\nendobj\n");
        Object(page + 2);
        Text($"<< /Type /XObject /Subtype /Image /Width {capture.Width} /Height {capture.Height} " +
            $"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length {page + 3} 0 R >>\nstream\n");
        var start = output.Count;
        var pixelWidth = checked((int)capture.Width);
        var pixelHeight = checked((int)capture.Height);
        var stride = checked((int)capture.RowBytes);
        var pixels = capture.Pixels;
        var rowLength = checked(pixelWidth * 3);
        if (row.Length < rowLength)
            row = new byte[rowLength];
        using (var compressed = new ZLibStream(output, CompressionLevel.Fastest, true))
        {
            for (var y = 0; y < pixelHeight; y++)
            {
                cancellation.ThrowIfCancellationRequested();
                var input = checked(y * stride);
                for (var target = 0; target < rowLength; target += 3, input += 4)
                {
                    var white = 255 - pixels[input + 3];
                    row[target] = (byte)Math.Min(255, pixels[input] + white);
                    row[target + 1] = (byte)Math.Min(255, pixels[input + 1] + white);
                    row[target + 2] = (byte)Math.Min(255, pixels[input + 2] + white);
                }
                compressed.Write(row, 0, rowLength);
            }
        }
        var length = output.Count - start;
        Text("\nendstream\nendobj\n");
        Object(page + 3);
        Text(length.ToString(CultureInfo.InvariantCulture) + "\nendobj\n");
        written++;
    }

    internal void Complete()
    {
        if (written != pageCount)
            throw new InvalidOperationException("The PDF is missing pages.");
        var xref = output.Count;
        Text($"xref\n0 {offsets.Length}\n0000000000 65535 f \n");
        for (var index = 1; index < offsets.Length; index++)
        {
            if (offsets[index] > 9999999999)
                throw new IOException("The PDF exceeds the cross-reference size limit.");
            Text(offsets[index].ToString("D10", CultureInfo.InvariantCulture) + " 00000 n \n");
        }
        Text($"trailer\n<< /Size {offsets.Length} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        output.Flush();
    }

    private void Object(int id)
    {
        offsets[id] = output.Count;
        Text($"{id} 0 obj\n");
    }

    private void Text(string value)
    {
        Span<byte> bytes = value.Length <= 1024 ? stackalloc byte[value.Length] : new byte[value.Length];
        Encoding.ASCII.GetBytes(value.AsSpan(), bytes);
        output.Write(bytes);
    }

    private sealed class Output(Stream destination) : Stream
    {
        internal long Count { get; private set; }
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => destination.CanWrite;
        public override long Length => Count;
        public override long Position { get => Count; set => throw new NotSupportedException(); }
        public override void Flush() => destination.Flush();
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => Write(buffer.AsSpan(offset, count));
        public override void Write(ReadOnlySpan<byte> buffer)
        {
            destination.Write(buffer);
            Count = checked(Count + buffer.Length);
        }
    }
}
