import System
import System.Diagnostics
import System.Reflection
import System.Runtime.InteropServices
import System.Text
import Goo
import Xunit

public sealed class MacClipboardTests {
    @Fact
    public func NativePasteboardRoundTripsRichFormatsImagesAndFileUrls() {
        if !OperatingSystem.IsMacOS() { return }
        let library = NativeLibrary.Load("/System/Library/Frameworks/AppKit.framework/AppKit")
        let pool = objc_autoreleasePoolPush()
        try {
            let plain = Encoding.UTF8.GetBytes("clipboard héllo")
            let html = Encoding.UTF8.GetBytes("<b>clipboard héllo</b>")
            let rtf = Encoding.ASCII.GetBytes(`{\rtf1 clipboard hello}`)
            let png = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwOD"
                    + "QcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC")
            let representations = []TransferRepresentation{
                TransferRepresentation("text/plain;charset=utf-8", plain),
                TransferRepresentation("text/plain", plain),
                TransferRepresentation("text/html", html),
                TransferRepresentation("text/rtf", rtf),
                TransferRepresentation("image/png", png),
                TransferRepresentation("application/x-goo-test", []uint8{0, 1, 2, 0, 255}),
                TransferRepresentation("application/x-goo-empty", ReadOnlyMemory[uint8].Empty)
            }
            let uris = []Uri{Uri(Environment.ProcessPath!!), Uri(typeof(Window).Assembly.Location)}
            let data = TransferData(representations, uris)
            var written = Invoke[ClipboardWriteResult]("WriteTransfer", data, ClipboardIntent.Copy)
            Assert.True(written.Status == DataTransferStatus.Success, written.Error)
            Assert.Equal[uint8](plain, ReadNativeFormat("public.utf8-plain-text"))
            Assert.Equal[uint8](html, ReadNativeFormat("public.html"))
            Assert.Equal[uint8](rtf, ReadNativeFormat("public.rtf"))
            Assert.Equal[uint8](png, ReadNativeFormat("public.png"))
            for representation in representations {
                Assert.Equal[uint8](representation.Bytes.ToArray(), ReadNativeFormat("io.github.obselate.goo.mime."
                    + Convert.ToHexString(Encoding.ASCII.GetBytes(representation.ContentType))))
            }
            let formats = Invoke[ClipboardFormats]("Query")
            Assert.True(formats.Status == ClipboardReadStatus.Success, formats.Error)
            Assert.True(formats.HasImage && formats.HasFiles)
            Assert.Contains("text/html", formats.Formats)
            Assert.Contains("text/rtf", formats.Formats)
            Assert.Contains("application/x-goo-test", formats.Formats)
            let types = []string{"text/plain;charset=utf-8", "text/plain", "text/html", "text/rtf", "image/png",
                "application/x-goo-test", "application/x-goo-empty", "text/uri-list"}
            let read = Invoke[ClipboardDataResult]("ReadTransfer", cast[object](types))
            Assert.True(read.Status == ClipboardReadStatus.Success, read.Error)
            Assert.Equal(ClipboardIntent.Copy, read.Intent)
            Assert.Equal[Uri](uris, read.Data.Uris)
            Assert.Equal(representations.Length, read.Data.Representations.Count)
            for i in 0 ... representations.Length {
                Assert.Equal[uint8](representations[i].Bytes.ToArray(), read.Data.Representations[i].Bytes.ToArray())
            }
            let alias = Invoke[ClipboardDataResult]("ReadTransfer", cast[object]([]string{"application/rtf"}))
            Assert.True(alias.Status == ClipboardReadStatus.Success, alias.Error)
            Assert.Equal[uint8](rtf, Assert.Single(alias.Data.Representations).Bytes.ToArray())
            let cut = Invoke[ClipboardWriteResult]("WriteTransfer", data, ClipboardIntent.Cut)
            Assert.Equal(DataTransferStatus.Unsupported, cut.Status)
            Assert.Equal[uint8](html, ReadNativeFormat("public.html"))
            written = Invoke[ClipboardWriteResult]("WriteTransfer",
                TransferData([]TransferRepresentation{representations[0]}, Array.Empty[Uri]()), ClipboardIntent.Copy)
            Assert.True(written.Status == DataTransferStatus.Success, written.Error)
            Assert.Equal[uint8](html, read.Data.Representations[2].Bytes.ToArray())
            let child = Environment.GetEnvironmentVariable("GOO_CLIPBOARD_CHILD")
            if !string.IsNullOrEmpty(child) { ReadAfterSourceExit(child) }
        } finally {
            objc_autoreleasePoolPop(pool)
            NativeLibrary.Free(library)
        }
    }

    shared {
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
            try { Assert.True(child.WaitForExit(60000), "Pasteboard source did not exit.") }
            finally { if !child.HasExited { child.Kill(entireProcessTree: true) } }
            Assert.True(child.ExitCode == 0, output.GetAwaiter().GetResult() + error.GetAwaiter().GetResult())
            let read = Invoke[ClipboardDataResult]("ReadTransfer", cast[object]([]string{
                "text/plain;charset=utf-8", "text/html", "image/png", "application/x-goo-empty", "text/uri-list"}))
            Assert.True(read.Status == ClipboardReadStatus.Success, read.Error)
            Assert.Equal(ClipboardIntent.Copy, read.Intent)
            Assert.Equal(Uri(executable), Assert.Single(read.Data.Uris))
            Assert.Equal(4, read.Data.Representations.Count)
            Assert.Equal("clipboard plain", Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span))
            Assert.Equal("<b>clipboard plain</b>", Encoding.UTF8.GetString(read.Data.Representations[1].Bytes.Span))
            Assert.True(read.Data.Representations[3].Bytes.IsEmpty)
        }

        private func ReadNativeFormat(name string) []uint8 {
            let type = CFStringCreateWithCString(nint(0), name, 0x08000100u)
            Assert.NotEqual[nint](nint(0), type)
            try {
                let board = Send(objc_getClass("NSPasteboard"), sel_registerName("generalPasteboard"))
                let data = SendArg(board, sel_registerName("dataForType:"), type)
                Assert.NotEqual[nint](nint(0), data)
                let bytes = [checked(int32(CFDataGetLength(data)))]uint8
                if bytes.Length > 0 { Marshal.Copy(CFDataGetBytePtr(data), bytes, 0, bytes.Length) }
                return bytes
            } finally { CFRelease(type) }
        }

        @DllImport("/usr/lib/libobjc.A.dylib")
        private func objc_getClass(name string) nint;

        @DllImport("/usr/lib/libobjc.A.dylib")
        private func sel_registerName(name string) nint;

        @DllImport("/usr/lib/libobjc.A.dylib")
        private func objc_autoreleasePoolPush() nint;

        @DllImport("/usr/lib/libobjc.A.dylib")
        private func objc_autoreleasePoolPop(pool nint);

        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func Send(receiver nint, selector nint) nint;

        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func SendArg(receiver nint, selector nint, argument nint) nint;

        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        private func CFStringCreateWithCString(allocator nint, value string, encoding uint32) nint;

        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        private func CFRelease(value nint);

        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        private func CFDataGetLength(data nint) nint;

        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        private func CFDataGetBytePtr(data nint) nint;

        private func Invoke[T](name string, arguments ...object) T -> cast[T](typeof(Window).Assembly
            .GetType("Goo.ClipboardTransfer", true)!!
            .GetMethod(name, BindingFlags.Static | BindingFlags.NonPublic)!!
            .Invoke(nil, arguments)!!)
    }
}
