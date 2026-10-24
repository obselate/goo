import System
import System.Diagnostics
import System.Reflection
import System.Runtime.ExceptionServices
import System.Runtime.InteropServices
import System.Text
import System.Threading
import Goo
import Xunit

public sealed class WindowsClipboardTests {
    @Fact
    public func NativeClipboardRoundTripsRichFormatsImagesFilesAndBinaryData() {
        if !OperatingSystem.IsWindows() { return }
        var failure Exception?
        let thread = Thread(() -> {
            try { RoundTrip() }
            catch (error Exception) { failure = error }
        })
        thread.IsBackground = true
        thread.SetApartmentState(ApartmentState.STA)
        thread.Start()
        Assert.True(thread.Join(TimeSpan.FromMinutes(2)), "Windows clipboard check did not complete.")
        if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    }

    shared {
        private func RoundTrip() {
            const plain string = "clipboard héllo"
            const html string = "<b>clipboard héllo</b>"
            const rtf string = `{\rtf1 clipboard hello}`
            let png = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwOD"
                    + "QcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC")
            let representations = []TransferRepresentation{
                TransferRepresentation("text/plain;charset=utf-8", Encoding.UTF8.GetBytes(plain)),
                TransferRepresentation("text/html", Encoding.UTF8.GetBytes(html)),
                TransferRepresentation("text/rtf", Encoding.ASCII.GetBytes(rtf)),
                TransferRepresentation("image/png", png),
                TransferRepresentation("application/x-goo-test", []uint8{0, 1, 2, 0, 255}),
                TransferRepresentation("application/x-goo-empty", ReadOnlyMemory[uint8].Empty)
            }
            let uri = Uri(Environment.ProcessPath!!)
            let data = TransferData(representations, []Uri{uri})
            var written = Invoke[ClipboardWriteResult]("WriteTransfer", data, ClipboardIntent.Cut)
            Assert.True(written.Status == DataTransferStatus.Success, written.Error)
            let nativeHtml = ReadNativeFormat("HTML Format")
            let header = Encoding.ASCII.GetString(nativeHtml)
            let start = int32.Parse(header.Substring(
                header.IndexOf("StartFragment:", StringComparison.Ordinal) + 14, 10))
            let end = int32.Parse(header.Substring(header.IndexOf("EndFragment:", StringComparison.Ordinal) + 12, 10))
            Assert.Equal(html, Encoding.UTF8.GetString(nativeHtml, start, end - start))
            Assert.Equal(rtf,
                Encoding.ASCII.GetString(ReadNativeFormat("Rich Text Format")).TrimEnd('\0'))
            Assert.True(ReadNativeFormat("PNG").AsSpan(0, png.Length).SequenceEqual(png))
            let formats = Invoke[ClipboardFormats]("Query")
            Assert.Equal(ClipboardReadStatus.Success, formats.Status)
            Assert.True(formats.HasImage && formats.HasFiles)
            Assert.Contains("text/html", formats.Formats)
            Assert.Contains("text/rtf", formats.Formats)
            Assert.Contains("application/x-goo-test", formats.Formats)
            let types = []string{"text/plain;charset=utf-8", "text/html", "text/rtf", "image/png",
                "application/x-goo-test", "application/x-goo-empty", "text/uri-list"}
            let read = Invoke[ClipboardDataResult]("ReadTransfer", cast[object](types))
            Assert.True(read.Status == ClipboardReadStatus.Success, read.Error)
            Assert.Equal(ClipboardIntent.Cut, read.Intent)
            Assert.Equal(uri, Assert.Single(read.Data.Uris))
            Assert.Equal(representations.Length, read.Data.Representations.Count)
            for i in 0 ... representations.Length {
                Assert.Equal[uint8](representations[i].Bytes.ToArray(), read.Data.Representations[i].Bytes.ToArray())
            }
            let rtfAlias = Invoke[ClipboardDataResult]("ReadTransfer", cast[object]([]string{"application/rtf"}))
            Assert.True(rtfAlias.Status == ClipboardReadStatus.Success, rtfAlias.Error)
            Assert.Equal[uint8](representations[2].Bytes.ToArray(),
                Assert.Single(rtfAlias.Data.Representations).Bytes.ToArray())
            let bitmap = Invoke[ClipboardDataResult]("ReadTransfer", cast[object]([]string{"image/bmp"}))
            Assert.True(bitmap.Status == ClipboardReadStatus.Success, bitmap.Error)
            let bitmapBytes = Assert.Single(bitmap.Data.Representations).Bytes.Span
            Assert.True(bitmapBytes.Length >= 2 && bitmapBytes[0] == 66 && bitmapBytes[1] == 77)
            Assert.Equal(2, BitConverter.ToInt32(bitmapBytes.Slice(18, 4)))
            Assert.Equal(-2, BitConverter.ToInt32(bitmapBytes.Slice(22, 4)))
            for unsupported in []TransferData{
                TransferData([]TransferRepresentation{
                    TransferRepresentation("application/x-goo-CASE", ReadOnlyMemory[uint8].Empty),
                    TransferRepresentation("application/x-goo-case", ReadOnlyMemory[uint8].Empty)}, Array.Empty[Uri]()),
                TransferData([]TransferRepresentation{
                    TransferRepresentation("application/" + String('a', 244), ReadOnlyMemory[uint8].Empty)},
                    Array.Empty[Uri]()),
                TransferData(Array.Empty[TransferRepresentation](), []Uri{Uri("https://example.test/document")}),
                TransferData([]TransferRepresentation{
                    TransferRepresentation("text/plain", Encoding.UTF8.GetBytes("one" + char(0) + "two"))},
                    Array.Empty[Uri]())
            } {
                let rejected = Invoke[ClipboardWriteResult]("WriteTransfer", unsupported, ClipboardIntent.Copy)
                Assert.True(rejected.Status == DataTransferStatus.Unsupported, rejected.Error)
            }
            let unchanged = Invoke[ClipboardDataResult]("ReadTransfer", cast[object]([]string{"text/html"}))
            Assert.Equal(html, Encoding.UTF8.GetString(Assert.Single(unchanged.Data.Representations).Bytes.Span))
            let uriOnly = TransferData([]TransferRepresentation{
                TransferRepresentation("text/uri-list", Encoding.UTF8.GetBytes(uri.AbsoluteUri + Environment.NewLine))},
                Array.Empty[Uri]())
            written = Invoke[ClipboardWriteResult]("WriteTransfer", uriOnly, ClipboardIntent.Copy)
            Assert.True(written.Status == DataTransferStatus.Success, written.Error)
            let uriRead = Invoke[ClipboardDataResult]("ReadTransfer", cast[object]([]string{"text/uri-list"}))
            Assert.True(uriRead.Status == ClipboardReadStatus.Success, uriRead.Error)
            Assert.Equal(uri, Assert.Single(uriRead.Data.Uris))
            written = Invoke[ClipboardWriteResult]("WriteTransfer",
                TransferData([]TransferRepresentation{representations[0]}, Array.Empty[Uri]()), ClipboardIntent.Copy)
            Assert.True(written.Status == DataTransferStatus.Success, written.Error)
            Assert.Equal(html, Encoding.UTF8.GetString(read.Data.Representations[1].Bytes.Span))
            let child = Environment.GetEnvironmentVariable("GOO_CLIPBOARD_CHILD")
            if !string.IsNullOrEmpty(child) { ReadAfterSourceExit(child) }
        }

        private func ReadAfterSourceExit(executable string) {
            let start = ProcessStartInfo(executable)
            start.UseShellExecute = false
            start.RedirectStandardOutput = true
            start.RedirectStandardError = true
            start.Environment["GOO_CLIPBOARD_DATA_SMOKE"] = "1"
            start.Environment["GOO_CLIPBOARD_PRESERVE"] = "1"
            using let child = Process.Start(start)!!
            let output = child.StandardOutput.ReadToEndAsync()
            let error = child.StandardError.ReadToEndAsync()
            try { Assert.True(child.WaitForExit(60000), "Clipboard source did not exit.") }
            finally { if !child.HasExited { child.Kill(entireProcessTree: true) } }
            Assert.True(child.ExitCode == 0, output.GetAwaiter().GetResult() + error.GetAwaiter().GetResult())
            let read = Invoke[ClipboardDataResult]("ReadTransfer", cast[object]([]string{
                "text/plain;charset=utf-8", "text/html", "image/png", "application/x-goo-empty", "text/uri-list"}))
            Assert.True(read.Status == ClipboardReadStatus.Success, read.Error)
            Assert.Equal(ClipboardIntent.Cut, read.Intent)
            Assert.Equal(Uri(executable), Assert.Single(read.Data.Uris))
            Assert.Equal(4, read.Data.Representations.Count)
            Assert.Equal("clipboard plain", Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span))
            Assert.Equal("<b>clipboard plain</b>", Encoding.UTF8.GetString(read.Data.Representations[1].Bytes.Span))
            Assert.True(read.Data.Representations[3].Bytes.IsEmpty)
        }

        private func ReadNativeFormat(name string) []uint8 {
            Assert.True(OpenClipboard(nint(0)) != 0)
            try {
                let memory = GetClipboardData(RegisterClipboardFormatW(name))
                Assert.NotEqual[nint](nint(0), memory)
                let pointer = GlobalLock(memory)
                Assert.NotEqual[nint](nint(0), pointer)
                try {
                    let bytes = [checked(int32(GlobalSize(memory)))]uint8
                    Marshal.Copy(pointer, bytes, 0, bytes.Length)
                    return bytes
                } finally { GlobalUnlock(memory) }
            } finally { CloseClipboard() }
        }

        @DllImport("user32.dll")
        private func OpenClipboard(owner nint) int32;

        @DllImport("user32.dll")
        private func CloseClipboard() int32;

        @DllImport("user32.dll")
        private func GetClipboardData(format uint32) nint;

        @DllImport("user32.dll", CharSet: CharSet.Unicode)
        private func RegisterClipboardFormatW(name string) uint32;

        @DllImport("kernel32.dll")
        private func GlobalSize(memory nint) nuint;

        @DllImport("kernel32.dll")
        private func GlobalLock(memory nint) nint;

        @DllImport("kernel32.dll")
        private func GlobalUnlock(memory nint) int32;

        private func Invoke[T](name string, arguments ...object) T -> cast[T](typeof(Window).Assembly
            .GetType("Goo.ClipboardTransfer", true)!!
            .GetMethod(name, BindingFlags.Static | BindingFlags.NonPublic)!!
            .Invoke(nil, arguments)!!)
    }
}
