package Goo

import System
import System.Buffers.Binary
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import System.Text
import System.Threading

@StructLayout(LayoutKind.Sequential)
internal struct WindowsTransferFormat {
    internal var Format uint16
    internal var TargetDevice nint
    internal var Aspect uint32
    internal var Index int32
    internal var Medium uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct WindowsTransferMedium {
    internal var Medium uint32
    internal var Value nint
    internal var Owner nint
}

internal sealed class WindowsTransferException : IOException {
    internal let Status DataTransferStatus
    internal init(operation string, result int32): base(operation + " failed: 0x" + uint32(result).ToString("X8", CultureInfo.InvariantCulture)) {
        Status = if result == int32(0x80070005u) { DataTransferStatus.Denied }
            else if result == int32(0x80010106u) || result == int32(0x80004001u) { DataTransferStatus.Unsupported }
            else { DataTransferStatus.Failed }
    }
}

internal unsafe partial class ClipboardTransfer {
    shared {
        internal func WindowsQueryFormats(offer nint) ClipboardFormats {
            var initialized bool
            var dataObject nint
            var enumerator nint
            try {
                if offer == nint(0) {
                    WindowsCheck(WindowsOleInitialize(nint(0)), "OleInitialize")
                    initialized = true
                    WindowsCheck(WindowsOleGetClipboard(out dataObject), "OleGetClipboard")
                } else { dataObject = offer }
                let enumerate = cast[unmanaged[Stdcall](nint, uint32, * nint) -> int32](
                    Marshal.ReadIntPtr(Marshal.ReadIntPtr(dataObject), 8 * nint.Size))
                WindowsCheck(enumerate(dataObject, 1u, &enumerator), "IDataObject.EnumFormatEtc")
                let next = cast[unmanaged[Stdcall](nint, uint32, * WindowsTransferFormat, * uint32) -> int32](
                    Marshal.ReadIntPtr(Marshal.ReadIntPtr(enumerator), 3 * nint.Size))
                let formats = List[string]()
                while true {
                    var format = WindowsTransferFormat{}
                    var fetched uint32 = 0u
                    let result = next(enumerator, 1u, &format, &fetched)
                    WindowsCheck(result, "IEnumFORMATETC.Next")
                    if fetched == 0u { break }
                    try {
                        let name = WindowsMimeType(uint32(format.Format))
                        if name != "" && !HasFormat(formats, name) {
                            if formats.Count == 128 { throw ClipboardLimitException("Clipboard exceeds 128 MIME types") }
                            formats.Add(name)
                        }
                    } finally { if format.TargetDevice != nint(0) { Marshal.FreeCoTaskMem(format.TargetDevice) } }
                }
                return ClipboardFormats(if formats.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, formats.ToArray())
            } catch (error ClipboardLimitException) { return ClipboardFormats(ClipboardReadStatus.TooLarge, []string{}, error.Message) }
            catch (error WindowsTransferException) { return ClipboardFormats(if error.Status == DataTransferStatus.Unsupported { ClipboardReadStatus.Unsupported } else { ClipboardReadStatus.Failed }, []string{}, error.Message) }
            catch (error DllNotFoundException) { return ClipboardFormats(ClipboardReadStatus.Unsupported, []string{}, error.Message) }
            catch (error EntryPointNotFoundException) { return ClipboardFormats(ClipboardReadStatus.Unsupported, []string{}, error.Message) }
            finally {
                WindowsReleaseObject(enumerator)
                if offer == nint(0) { WindowsReleaseObject(dataObject) }
                if initialized { WindowsOleUninitialize() }
            }
        }

        private func WindowsMimeType(format uint32) string {
            if format == UnicodeTextFormat { return "text/plain;charset=utf-8" }
            if format == 1u { return "text/plain" }
            if format == FileDropFormat { return UriList }
            if format == DibV5Format || format == 8u { return "image/bmp" }
            let buffer * char = stackalloc [257]char
            let length = WindowsFormatName(format, buffer, 257)
            if length == 0 { return "" }
            let name = Marshal.PtrToStringUni(nint(buffer), length)
            if name == "PNG" { return "image/png" }
            if name == "HTML Format" { return "text/html" }
            if name == "Rich Text Format" { return "text/rtf" }
            try { TransferRepresentation.ValidateType(name)
                return name }
            catch (_ ArgumentException) { return "" }
            catch (_ FormatException) { return "" }
        }

        private let dataObjectId []uint8 = Guid("0000010e-0000-0000-c000-000000000046").ToByteArray()
        private let windowsImageLimits ImageDecodeLimits = ImageDecodeLimits{ MaxEncodedBytes: MaxImageBytes }
        private const GlobalMedium uint32 = 1u
        private const StreamMedium uint32 = 4u
        private const UnicodeTextFormat uint32 = 13u
        private const FileDropFormat uint32 = 15u
        private const DibV5Format uint32 = 17u
        private const EmptyMimeTypesFormat string = "Goo Empty MIME Types"

        @DllImport("ole32.dll", EntryPoint: "OleInitialize")
        internal func WindowsOleInitialize(reserved nint) int32;
        @DllImport("ole32.dll", EntryPoint: "OleUninitialize")
        internal func WindowsOleUninitialize();
        @DllImport("ole32.dll", EntryPoint: "OleSetClipboard")
        private func WindowsOleSetClipboard(dataObject nint) int32;
        @DllImport("ole32.dll", EntryPoint: "OleGetClipboard")
        private func WindowsOleGetClipboard(out dataObject nint) int32;
        @DllImport("ole32.dll", EntryPoint: "OleFlushClipboard")
        private func WindowsOleFlushClipboard() int32;
        @DllImport("ole32.dll", EntryPoint: "OleIsCurrentClipboard")
        private func WindowsOleIsCurrentClipboard(dataObject nint) int32;
        @DllImport("ole32.dll", EntryPoint: "ReleaseStgMedium")
        private func WindowsReleaseMedium(ref medium WindowsTransferMedium);
        @DllImport("shell32.dll", EntryPoint: "SHCreateDataObject")
        private func WindowsCreateDataObject(folder nint, count uint32, children nint, inner nint, id nint, out result nint) int32;
        @DllImport("kernel32.dll", EntryPoint: "GlobalAlloc", SetLastError: true)
        private func WindowsAllocateGlobal(flags uint32, size nuint) nint;
        @DllImport("kernel32.dll", EntryPoint: "GlobalFree")
        private func WindowsFreeGlobal(memory nint) nint;
        @DllImport("user32.dll", EntryPoint: "GetClipboardFormatNameW", CharSet: CharSet.Unicode)
        private func WindowsFormatName(format uint32, name * char, capacity int32) int32;

        private func WindowsCheck(result int32, operation string) {
            if result < 0 { throw WindowsTransferException(operation, result) }
        }

        internal func WindowsReleaseObject(value nint) {
            if value == nint(0) { return }
            let release = cast[unmanaged[Stdcall](nint) -> uint32](Marshal.ReadIntPtr(Marshal.ReadIntPtr(value), 2 * nint.Size))
            release(value)
        }

        internal func WindowsCreateOffer(data TransferData, intent ClipboardIntent) nint {
            if data.Representations.Count > 1 {
                let types = HashSet[string](StringComparer.OrdinalIgnoreCase)
                for item in data.Representations {
                    if !types.Add(item.ContentType) { throw NotSupportedException("Windows clipboard MIME names cannot differ only by case") }
                }
            }
            let files = if data.Uris.Count > 0 { WindowsFileList(data.Uris) } else { Array.Empty[uint8]() }
            var result nint
            var completed bool
            fixed id * uint8 = dataObjectId {
                WindowsCheck(WindowsCreateDataObject(nint(0), 0u, nint(0), nint(0), nint(id), out result), "SHCreateDataObject")
            }
            var plainPublished bool
            var bitmapPublished bool
            var emptyTypes StringBuilder?
            try {
                for item in data.Representations {
                    WindowsAddFormat(result, WindowsRegisterType(item.ContentType), item.Data)
                    if item.Data.Length == 0 {
                        let empty = emptyTypes ?? StringBuilder()
                        empty.Append(item.ContentType)
                        empty.Append('\n')
                        emptyTypes = empty
                    }
                    if IsPlainText(item.ContentType) && !plainPublished {
                        let text = utf8.GetString(item.Data)
                        if text.IndexOf(char(0)) >= 0 { throw NotSupportedException("Native plain text cannot contain NUL") }
                        WindowsAddFormat(result, UnicodeTextFormat, unicode.GetBytes(text + "\0"))
                        plainPublished = true
                    } else if item.ContentType == "text/html" {
                        WindowsAddFormat(result, WinRegisterClipboardFormat("HTML Format"), WindowsHtml(item.Data))
                    } else if item.ContentType == "text/rtf" || item.ContentType == "application/rtf" {
                        WindowsAddFormat(result, WinRegisterClipboardFormat("Rich Text Format"), item.Data, true)
                    } else if item.ContentType == "image/png" {
                        WindowsAddFormat(result, WinRegisterClipboardFormat("PNG"), item.Data)
                    }
                    if !bitmapPublished && (item.ContentType == "image/png" || item.ContentType == "image/jpeg" || item.ContentType == "image/gif") {
                        WindowsAddFormat(result, DibV5Format, WindowsBitmap(item.Data))
                        bitmapPublished = true
                    }
                }
                if let empty = emptyTypes {
                    WindowsAddFormat(result, WinRegisterClipboardFormat(EmptyMimeTypesFormat), utf8.GetBytes(empty.ToString()))
                }
                if data.Uris.Count > 0 {
                    WindowsAddFormat(result, FileDropFormat, files)
                    let effect Span[uint8] = stackalloc [4]uint8
                    BinaryPrimitives.WriteUInt32LittleEndian(effect, if intent == ClipboardIntent.Cut { 2u } else { 1u })
                    WindowsAddFormat(result, WinRegisterClipboardFormat("Preferred DropEffect"), effect)
                }
                completed = true
                return result
            } finally { if !completed { WindowsReleaseObject(result) } }
        }

        private func WindowsRegisterType(contentType string) uint32 {
            if contentType.Length > 255 { throw NotSupportedException("Windows clipboard MIME names cannot exceed 255 characters") }
            let format = WinRegisterClipboardFormat(contentType)
            if format == 0u { throw NotSupportedException("The native clipboard cannot register MIME type " + contentType) }
            return format
        }

        private func WindowsAddFormat(dataObject nint, format uint32, bytes ReadOnlySpan[uint8], terminate bool = false) {
            if format == 0u { throw IOException("Native clipboard format registration failed") }
            var medium = WindowsTransferMedium{
                Value: WindowsAllocateGlobal(66u, nuint(Math.Max(1, bytes.Length + (terminate ? 1 : 0)))),
                Medium: GlobalMedium
            }
            if medium.Value == nint(0) { throw IOException("Cannot allocate native clipboard data") }
            let pointer = WinGlobalLock(medium.Value)
            if pointer == nint(0) { WindowsFreeGlobal(medium.Value)
                throw IOException("Cannot lock native clipboard data") }
            try { bytes.CopyTo(Span[uint8](cast[* uint8](pointer), bytes.Length)) }
            finally { WinGlobalUnlock(medium.Value) }
            var descriptor = WindowsTransferFormat{ Format: uint16(format), Aspect: 1u, Index: -1, Medium: medium.Medium }
            let set = cast[unmanaged[Stdcall](nint, * WindowsTransferFormat, * WindowsTransferMedium, int32) -> int32](
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(dataObject), 7 * nint.Size))
            let status = set(dataObject, &descriptor, &medium, 1)
            if status < 0 { WindowsReleaseMedium(ref medium)
                throw WindowsTransferException("IDataObject.SetData", status) }
        }

        private func WindowsWriteTransfer(data TransferData, intent ClipboardIntent) ClipboardWriteResult {
            if data.Representations.Count + (data.Uris.Count > 0 ? 1 : 0) > 128 {
                return ClipboardWriteResult(DataTransferStatus.TooLarge, "Generated file types exceed the 128 MIME type budget")
            }
            var initialized bool
            var dataObject nint
            try {
                WindowsCheck(WindowsOleInitialize(nint(0)), "OleInitialize")
                initialized = true
                dataObject = WindowsCreateOffer(data, intent)
                WindowsCheck(WindowsOleSetClipboard(dataObject), "OleSetClipboard")
                let ownership = WindowsOleIsCurrentClipboard(dataObject)
                WindowsCheck(ownership, "OleIsCurrentClipboard")
                if ownership != 0 { throw IOException("Clipboard offer changed before publication completed") }
                WindowsCheck(WindowsOleFlushClipboard(), "OleFlushClipboard")
                return ClipboardWriteResult(DataTransferStatus.Success)
            } catch (error WindowsTransferException) { return ClipboardWriteResult(error.Status, error.Message) }
            catch (error ImageLimitException) { return ClipboardWriteResult(DataTransferStatus.TooLarge, error.Message) }
            catch (error NativePathLimitException) { return ClipboardWriteResult(DataTransferStatus.TooLarge, error.Message) }
            catch (error ClipboardLimitException) { return ClipboardWriteResult(DataTransferStatus.TooLarge, error.Message) }
            catch (error NotSupportedException) { return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message) }
            catch (error DllNotFoundException) { return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message) }
            catch (error EntryPointNotFoundException) { return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message) }
            catch (error IOException) { return ClipboardWriteResult(DataTransferStatus.Failed, error.Message) }
            catch (error DecoderFallbackException) { return ClipboardWriteResult(DataTransferStatus.Failed, error.Message) }
            finally {
                WindowsReleaseObject(dataObject)
                if initialized { WindowsOleUninitialize() }
            }
        }

        internal func WindowsReadTransfer(types IReadOnlyList[string], offer nint) ClipboardDataResult {
            var initialized bool
            var dataObject nint
            try {
                if offer == nint(0) {
                    WindowsCheck(WindowsOleInitialize(nint(0)), "OleInitialize")
                    initialized = true
                    WindowsCheck(WindowsOleGetClipboard(out dataObject), "OleGetClipboard")
                } else { dataObject = offer }
                let items = List[TransferRepresentation](types.Count)
                let uris = List[Uri]()
                var total int64
                var intent = ClipboardIntent.Copy
                let emptyTypes = if WindowsReadFormat(dataObject, WinRegisterClipboardFormat(EmptyMimeTypesFormat), 128 * 256, out var names) {
                    "\n" + utf8.GetString(names)
                } else { "" }
                for contentType in types {
                    if contentType == UriList {
                        if WindowsGetMedium(dataObject, FileDropFormat, GlobalMedium, out var medium) {
                            try {
                                let files = WindowsReadDrop(medium.Value)
                                for path in files.Paths { uris.Add(Uri(path)) }
                            } finally { WindowsReleaseMedium(ref medium) }
                            if WindowsReadFormat(dataObject, WinRegisterClipboardFormat("Preferred DropEffect"), 4, out var effect) {
                                if effect.Length != 4 { throw InvalidDataException("Invalid native file-transfer intent") }
                                intent = if (BitConverter.ToUInt32(effect, 0) & 2u) != 0u { ClipboardIntent.Cut } else { ClipboardIntent.Copy }
                            }
                        } else if WindowsReadFormat(dataObject, WindowsRegisterType(UriList), MaxFileListBytes, out var encoded) {
                            let files = ParseFiles(utf8.GetString(encoded), false)
                            for path in files.Paths { uris.Add(Uri(path)) }
                        }
                        continue
                    }
                    let limit = Math.Min(if contentType.StartsWith("text/", StringComparison.Ordinal) { MaxTextBytes } else { MaxImageBytes }, int32(MaxImageBytes - total))
                    let empty = emptyTypes.Length > 0 && emptyTypes.Contains("\n" + contentType + "\n", StringComparison.Ordinal)
                    if !WindowsReadRepresentation(dataObject, contentType, if empty { 1 } else { limit }, out var bytes) { continue }
                    if empty {
                        if bytes.Length != 1 || bytes[0] != 0 { throw InvalidDataException("Invalid empty MIME representation") }
                        bytes = Array.Empty[uint8]()
                    }
                    total += bytes.Length
                    items.Add(TransferRepresentation(contentType, bytes))
                }
                return ClipboardDataResult(if items.Count == 0 && uris.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, TransferData(items, uris), intent)
            } catch (error ClipboardLimitException) { return ClipboardDataResult(ClipboardReadStatus.TooLarge, error: error.Message) }
            catch (error NativePathLimitException) { return ClipboardDataResult(ClipboardReadStatus.TooLarge, error: error.Message) }
            catch (error WindowsTransferException) { return ClipboardDataResult(if error.Status == DataTransferStatus.Unsupported { ClipboardReadStatus.Unsupported } else { ClipboardReadStatus.Failed }, error: error.Message) }
            catch (error NotSupportedException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error DllNotFoundException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error EntryPointNotFoundException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error IOException) { return ClipboardDataResult(ClipboardReadStatus.Failed, error: error.Message) }
            catch (error ArgumentException) { return ClipboardDataResult(ClipboardReadStatus.Failed, error: error.Message) }
            finally {
                if offer == nint(0) { WindowsReleaseObject(dataObject) }
                if initialized { WindowsOleUninitialize() }
            }
        }

        internal func WindowsReadFormat(dataObject nint, format uint32, limit int32, out bytes []uint8) bool {
            bytes = Array.Empty[uint8]()
            if !WindowsGetMedium(dataObject, format, StreamMedium | GlobalMedium, out var medium) { return false }
            try {
                if medium.Medium == StreamMedium { bytes = WindowsReadStream(medium.Value, limit) }
                else if medium.Medium == GlobalMedium { bytes = WindowsReadGlobal(medium.Value, limit) }
                else { throw NotSupportedException("The native clipboard representation is not a byte stream") }
                return true
            } finally { WindowsReleaseMedium(ref medium) }
        }

        private func WindowsGetMedium(dataObject nint, format uint32, media uint32, out medium WindowsTransferMedium) bool {
            medium = WindowsTransferMedium{}
            var descriptor = WindowsTransferFormat{ Format: uint16(format), Aspect: 1u, Index: -1, Medium: media }
            let get = cast[unmanaged[Stdcall](nint, * WindowsTransferFormat, * WindowsTransferMedium) -> int32](
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(dataObject), 3 * nint.Size))
            let status = get(dataObject, &descriptor, &medium)
            if status == int32(0x80040064u) || status == int32(0x80040069u) { return false }
            WindowsCheck(status, "IDataObject.GetData")
            return true
        }

        private func WindowsReadStream(stream nint, limit int32) []uint8 {
            let stat * uint8 = stackalloc [80]uint8
            let inspect = cast[unmanaged[Stdcall](nint, * uint8, uint32) -> int32](
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(stream), 12 * nint.Size))
            WindowsCheck(inspect(stream, stat, 1u), "IStream.Stat")
            let size = Marshal.ReadInt64(nint(stat), if nint.Size == 8 { 16 } else { 8 })
            if size < 0 || size > limit { throw ClipboardLimitException("Clipboard stream exceeds its byte budget") }
            if size == 0 { return Array.Empty[uint8]() }
            let bytes = [int32(size)]uint8
            let seek = cast[unmanaged[Stdcall](nint, int64, uint32, * uint64) -> int32](
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(stream), 5 * nint.Size))
            var position uint64 = 0uL
            WindowsCheck(seek(stream, 0L, 0u, &position), "IStream.Seek")
            let read = cast[unmanaged[Stdcall](nint, * uint8, uint32, * uint32) -> int32](
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(stream), 3 * nint.Size))
            fixed pointer * uint8 = bytes {
                var offset = 0
                while offset < bytes.Length {
                    var count uint32 = 0u
                    WindowsCheck(read(stream, pointer + offset, uint32(bytes.Length - offset), &count), "IStream.Read")
                    if count == 0u || count > uint32(bytes.Length - offset) { throw IOException("Native clipboard stream ended before its declared size") }
                    offset += int32(count)
                }
            }
            return bytes
        }

        private func WindowsReadGlobal(memory nint, limit int32) []uint8 {
            let size = WinGlobalSize(memory)
            if size > nuint(limit) { throw ClipboardLimitException("Clipboard representation exceeds its byte budget") }
            if size == nuint(0) { return Array.Empty[uint8]() }
            let pointer = WinGlobalLock(memory)
            if pointer == nint(0) { throw IOException("Cannot lock native clipboard data") }
            try {
                let bytes = [int32(size)]uint8
                Marshal.Copy(pointer, bytes, 0, bytes.Length)
                return bytes
            } finally { WinGlobalUnlock(memory) }
        }

        private func WindowsReadRepresentation(dataObject nint, contentType string, limit int32, out bytes []uint8) bool {
            if WindowsReadFormat(dataObject, WindowsRegisterType(contentType), limit, out bytes) { return true }
            if IsPlainText(contentType) {
                if !WindowsReadFormat(dataObject, UnicodeTextFormat, Math.Min(limit, MaxTextBytes) * 2 + 2, out var native) { return false }
                var end = 0
                while end + 1 < native.Length && (native[end] != 0 || native[end + 1] != 0) { end += 2 }
                bytes = utf8.GetBytes(unicode.GetString(native, 0, end))
            } else if contentType == "text/html" {
                if !WindowsReadFormat(dataObject, WinRegisterClipboardFormat("HTML Format"), Math.Min(limit, MaxTextBytes) + 4096, out var native) { return false }
                let header = Encoding.ASCII.GetString(native, 0, Math.Min(native.Length, 4096))
                let start = WindowsHtmlOffset(header, "StartFragment:")
                let end = WindowsHtmlOffset(header, "EndFragment:")
                if start < 0 || end < start || end > native.Length { throw InvalidDataException("Native HTML fragment offsets are invalid") }
                bytes = native.AsSpan(start, end - start).ToArray()
            } else if contentType == "text/rtf" || contentType == "application/rtf" {
                if !WindowsReadFormat(dataObject, WinRegisterClipboardFormat("Rich Text Format"), Math.Min(limit, MaxTextBytes) + 1, out var native) { return false }
                var end = native.Length
                while end > 0 && native[end - 1] == 0 { end-- }
                bytes = native.AsSpan(0, end).ToArray()
            } else if contentType == "image/png" {
                if !WindowsReadFormat(dataObject, WinRegisterClipboardFormat("PNG"), limit, out bytes) { return false }
            } else if contentType == "image/bmp" {
                if !WindowsGetMedium(dataObject, DibV5Format, GlobalMedium, out var medium)
                    && !WindowsGetMedium(dataObject, 8u, GlobalMedium, out medium) { return false }
                try { bytes = WindowsReadImageMemory(medium.Value, true, limit) }
                finally { WindowsReleaseMedium(ref medium) }
            } else { return false }
            if bytes.Length > limit { throw ClipboardLimitException("Clipboard representation exceeds its byte budget") }
            return true
        }

        internal func WindowsHtml(fragment []uint8) []uint8 {
            const prefix string = "<html><body><!--StartFragment-->"
            const suffix string = "<!--EndFragment--></body></html>"
            const template string = "Version:1.0\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n"
            let start = template.Length
            let first = start + prefix.Length
            let last = first + fragment.Length
            let end = last + suffix.Length
            let header = "Version:1.0\r\nStartHTML:" + start.ToString("D10", CultureInfo.InvariantCulture)
                + "\r\nEndHTML:" + end.ToString("D10", CultureInfo.InvariantCulture)
                + "\r\nStartFragment:" + first.ToString("D10", CultureInfo.InvariantCulture)
                + "\r\nEndFragment:" + last.ToString("D10", CultureInfo.InvariantCulture) + "\r\n"
            let bytes = [end + 1]uint8
            Encoding.ASCII.GetBytes(header, 0, header.Length, bytes, 0)
            Encoding.ASCII.GetBytes(prefix, 0, prefix.Length, bytes, start)
            fragment.CopyTo(bytes, first)
            Encoding.ASCII.GetBytes(suffix, 0, suffix.Length, bytes, last)
            return bytes
        }

        private func WindowsHtmlOffset(header string, key string) int32 {
            let index = header.IndexOf(key, StringComparison.Ordinal)
            if index < 0 { throw InvalidDataException("Native HTML is missing " + key) }
            let start = index + key.Length
            let end = header.IndexOf('\n', start)
            if end < 0 || !Int32.TryParse(header.Substring(start, end - start).Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) {
                throw InvalidDataException("Native HTML has an invalid " + key)
            }
            return value
        }

        private func WindowsFileList(uris IReadOnlyList[Uri]) []uint8 {
            let paths = StringBuilder()
            var units int32 = 0
            for i in 0 ... uris.Count {
                paths.Append(LocalTransferPath(uris[i], i, ref units))
                paths.Append(char(0))
            }
            paths.Append(char(0))
            let text = paths.ToString()
            let bytes = [20 + unicode.GetByteCount(text)]uint8
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(), 20u)
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(16), 1u)
            unicode.GetBytes(text, 0, text.Length, bytes, 20)
            return bytes
        }

        private func WindowsBitmap(encoded []uint8) []uint8 {
            let bounds = RasterDecodeBounds{ Limits: windowsImageLimits }
            using let image = RasterImageDecoder.DecodeRaw(encoded, bounds, CancellationToken.None, false)
            let bytes = [124 + image.Width * image.Height * 4]uint8
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(), 124u)
            BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(4), image.Width)
            BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(8), -image.Height)
            BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(12), uint16(1))
            BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(14), uint16(32))
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(16), 3u)
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(20), uint32(bytes.Length - 124))
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(40), 0x00ff0000u)
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(44), 0x0000ff00u)
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(48), 0x000000ffu)
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(52), 0xff000000u)
            BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(56), 0x73524742u)
            let pixels = image.Pixels
            for i in 0 ... image.Width * image.Height {
                let source = i * 4
                let target = 124 + source
                bytes[target] = pixels[source + 2]
                bytes[target + 1] = pixels[source + 1]
                bytes[target + 2] = pixels[source]
                bytes[target + 3] = pixels[source + 3]
            }
            return bytes
        }
    }
}
