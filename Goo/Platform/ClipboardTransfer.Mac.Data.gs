package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Text

internal unsafe partial class ClipboardTransfer {
    shared {
        @DllImport("/System/Library/Frameworks/CoreServices.framework/CoreServices")
        private func UTTypeCreatePreferredIdentifierForTag(tagClass nint, tag nint, conformsTo nint) nint;
        @DllImport("/System/Library/Frameworks/CoreServices.framework/CoreServices")
        private func UTTypeCopyPreferredTagWithClass(identifier nint, tagClass nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func MacSetTypeData(receiver nint, selector nint, data nint, formatType nint) uint8;

        private func MacTransferType(contentType string) nint {
            if IsPlainText(contentType) { return MacString("public.utf8-plain-text") }
            let value = UTTypeCreatePreferredIdentifierForTag(MacString("public.mime-type"), MacString(contentType), nint(0))
            if value == nint(0) { throw NotSupportedException("The pasteboard cannot represent MIME type " + contentType) }
            return MacSend(value, sel_registerName("autorelease"))
        }

        private func MacMimeName(formatType nint) string {
            if MacCount(formatType, sel_registerName("length")) > nuint(4096) { throw ClipboardLimitException("Pasteboard type exceeds its text budget") }
            let name = BoundedUtf8(MacSend(formatType, sel_registerName("UTF8String")), 16384)
            if name == "public.file-url" { return UriList }
            if name == "public.utf8-plain-text" { return "text/plain;charset=utf-8" }
            if name.IndexOf('/') >= 0 { return name }
            let mime = UTTypeCopyPreferredTagWithClass(formatType, MacString("public.mime-type"))
            if mime == nint(0) { return "" }
            try {
                if MacCount(mime, sel_registerName("length")) > nuint(256) { throw ClipboardLimitException("Pasteboard MIME name exceeds 256 characters") }
                return BoundedUtf8(MacSend(mime, sel_registerName("UTF8String")), 256)
            } finally { CFRelease(mime) }
        }

        private func MacQueryFormats() ClipboardFormats {
            let pool = objc_autoreleasePoolPush()
            try {
                let board = MacPasteboard()
                if board == nint(0) { throw NotSupportedException("The native pasteboard is unavailable") }
                let generation = MacSend(board, sel_registerName("changeCount"))
                let types = MacSend(board, sel_registerName("types"))
                let count = MacCount(types, sel_registerName("count"))
                if count > nuint(512) { throw ClipboardLimitException("Pasteboard exceeds 512 native types") }
                let formats = List[string]()
                for i in 0 ... int32(count) {
                    let name = MacMimeName(MacAt(types, sel_registerName("objectAtIndex:"), nuint(i)))
                    if name == "" { continue }
                    try { TransferRepresentation.ValidateType(name) }
                    catch (_ ArgumentException) { continue }
                    catch (_ FormatException) { continue }
                    if HasFormat(formats, name) { continue }
                    if formats.Count == 128 { throw ClipboardLimitException("Clipboard exceeds 128 MIME types") }
                    formats.Add(name)
                }
                if generation != MacSend(board, sel_registerName("changeCount")) { throw IOException("Pasteboard changed while reading its formats") }
                return ClipboardFormats(if formats.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, formats.ToArray())
            } catch (error ClipboardLimitException) { return ClipboardFormats(ClipboardReadStatus.TooLarge, []string{}, error.Message) }
            catch (error NotSupportedException) { return ClipboardFormats(ClipboardReadStatus.Unsupported, []string{}, error.Message) }
            catch (error DllNotFoundException) { return ClipboardFormats(ClipboardReadStatus.Unsupported, []string{}, error.Message) }
            catch (error EntryPointNotFoundException) { return ClipboardFormats(ClipboardReadStatus.Unsupported, []string{}, error.Message) }
            catch (error IOException) { return ClipboardFormats(ClipboardReadStatus.Failed, []string{}, error.Message) }
            finally { objc_autoreleasePoolPop(pool) }
        }

        internal func MacCreateTransferObjects(data TransferData) nint {
            var units int32 = 0
            for i in 0 ... data.Uris.Count { LocalTransferPath(data.Uris[i], i, ref units) }
            let count = data.Uris.Count + (data.Representations.Count > 0 ? 1 : 0)
            let objects = MacSendArg(objc_getClass("NSMutableArray"), sel_registerName("arrayWithCapacity:"), nint(count))
            if objects == nint(0) { throw IOException("Cannot allocate pasteboard items") }
            if data.Representations.Count > 0 {
                let item = MacSend(objc_getClass("NSPasteboardItem"), sel_registerName("new"))
                if item == nint(0) { throw IOException("Cannot allocate a pasteboard item") }
                MacSend(item, sel_registerName("autorelease"))
                for representation in data.Representations {
                    var native nint
                    fixed pointer * uint8 = representation.Data { native = CFDataCreate(nint(0), pointer, nint(representation.Data.Length)) }
                    if native == nint(0) { throw IOException("Cannot copy pasteboard bytes") }
                    try {
                        if MacSetTypeData(item, sel_registerName("setData:forType:"), native, MacString(representation.ContentType)) == 0 {
                            throw IOException("Cannot set pasteboard MIME data")
                        }
                        let formatType = MacTransferType(representation.ContentType)
                        if MacSendArg(item, sel_registerName("dataForType:"), formatType) == nint(0)
                            && MacSetTypeData(item, sel_registerName("setData:forType:"), native, formatType) == 0 {
                            throw IOException("Cannot set native pasteboard data")
                        }
                    } finally { CFRelease(native) }
                }
                MacSendArg(objects, sel_registerName("addObject:"), item)
            }
            for uri in data.Uris {
                let url = MacSendArg(objc_getClass("NSURL"), sel_registerName("URLWithString:"), MacString(uri.AbsoluteUri))
                if url == nint(0) { throw IOException("Cannot create a native file URL") }
                MacSendArg(objects, sel_registerName("addObject:"), url)
            }
            return objects
        }

        private func MacWriteTransfer(data TransferData, intent ClipboardIntent) ClipboardWriteResult {
            if intent == ClipboardIntent.Cut { return ClipboardWriteResult(DataTransferStatus.Unsupported, "macOS does not support native file Cut publication") }
            if data.Representations.Count + (data.Uris.Count > 0 ? 1 : 0) > 128 {
                return ClipboardWriteResult(DataTransferStatus.TooLarge, "Generated file types exceed the 128 MIME type budget")
            }
            let pool = objc_autoreleasePoolPush()
            try {
                let board = MacPasteboard()
                if board == nint(0) { throw NotSupportedException("The native pasteboard is unavailable") }
                if data.Representations.Count == 0 && data.Uris.Count == 0 {
                    MacSend(board, sel_registerName("clearContents"))
                    return ClipboardWriteResult(DataTransferStatus.Success)
                }
                let objects = MacCreateTransferObjects(data)
                MacSend(board, sel_registerName("clearContents"))
                if MacBoolArg(board, sel_registerName("writeObjects:"), objects) == 0 { throw IOException("Cannot publish native pasteboard items") }
                return ClipboardWriteResult(DataTransferStatus.Success)
            } catch (error ClipboardLimitException) { return ClipboardWriteResult(DataTransferStatus.TooLarge, error.Message) }
            catch (error NativePathLimitException) { return ClipboardWriteResult(DataTransferStatus.TooLarge, error.Message) }
            catch (error NotSupportedException) { return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message) }
            catch (error DllNotFoundException) { return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message) }
            catch (error EntryPointNotFoundException) { return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message) }
            catch (error IOException) { return ClipboardWriteResult(DataTransferStatus.Failed, error.Message) }
            finally { objc_autoreleasePoolPop(pool) }
        }

        private func MacReadNativeType(board nint, formatType nint, limit int32, out bytes []uint8) bool {
            bytes = Array.Empty[uint8]()
            let data = MacSendArg(board, sel_registerName("dataForType:"), formatType)
            if data == nint(0) {
                if MacBoolArg(MacSend(board, sel_registerName("types")), sel_registerName("containsObject:"), formatType) != 0 {
                    throw IOException("The pasteboard did not return its advertised data")
                }
                return false
            }
            let length = CFDataGetLength(data)
            if length < nint(0) || length > nint(limit) { throw ClipboardLimitException("Pasteboard representation exceeds its byte budget") }
            if length == nint(0) { return true }
            let pointer = CFDataGetBytePtr(data)
            if pointer == nint(0) { throw IOException("Native pasteboard bytes are unavailable") }
            bytes = [int32(length)]uint8
            Marshal.Copy(pointer, bytes, 0, bytes.Length)
            return true
        }

        private func MacReadRepresentation(board nint, contentType string, limit int32, out bytes []uint8) bool {
            if MacReadNativeType(board, MacString(contentType), limit, out bytes) { return true }
            if MacReadNativeType(board, MacTransferType(contentType), limit, out bytes) { return true }
            if !IsPlainText(contentType) { return false }
            for i in 0 ... 2 {
                let formatType = MacString(if i == 0 { "public.utf16-plain-text" } else { "public.utf16-external-plain-text" })
                if !MacReadNativeType(board, formatType, Math.Min(limit, MaxTextBytes) * 2 + 2, out var native) { continue }
                let bigEndian = native.Length >= 2 && native[0] == 254 && native[1] == 255
                let hasBom = bigEndian || (native.Length >= 2 && native[0] == 255 && native[1] == 254)
                if i == 1 && !hasBom { throw InvalidDataException("External UTF-16 pasteboard text has no byte-order marker") }
                let offset = if hasBom { 2 } else { 0 }
                let encoding = if bigEndian { UnicodeEncoding(true, false, true) } else { unicode }
                let text = encoding.GetString(native, offset, native.Length - offset)
                if utf8.GetByteCount(text) > limit { throw ClipboardLimitException("Pasteboard text exceeds its byte budget") }
                bytes = utf8.GetBytes(text)
                return true
            }
            return false
        }

        private func MacReadTransfer(types IReadOnlyList[string]) ClipboardDataResult {
            let pool = objc_autoreleasePoolPush()
            try {
                let board = MacPasteboard()
                if board == nint(0) { throw NotSupportedException("The native pasteboard is unavailable") }
                let generation = MacSend(board, sel_registerName("changeCount"))
                let items = List[TransferRepresentation](types.Count)
                let uris = List[Uri]()
                var total int64
                for contentType in types {
                    if contentType == UriList {
                        let files = if MacReadNativeType(board, MacString(UriList), MaxFileListBytes, out var encoded) {
                            ParseFiles(utf8.GetString(encoded), false)
                        } else { MacReadFiles() }
                        for path in files.Paths { uris.Add(Uri(path)) }
                        continue
                    }
                    let limit = Math.Min(if contentType.StartsWith("text/", StringComparison.Ordinal) { MaxTextBytes } else { MaxImageBytes }, int32(MaxImageBytes - total))
                    if !MacReadRepresentation(board, contentType, limit, out var bytes) { continue }
                    total += bytes.Length
                    items.Add(TransferRepresentation(contentType, bytes))
                }
                if generation != MacSend(board, sel_registerName("changeCount")) { throw IOException("Pasteboard changed during the transfer") }
                return ClipboardDataResult(if items.Count == 0 && uris.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, TransferData(items, uris))
            } catch (error ClipboardLimitException) { return ClipboardDataResult(ClipboardReadStatus.TooLarge, error: error.Message) }
            catch (error NativePathLimitException) { return ClipboardDataResult(ClipboardReadStatus.TooLarge, error: error.Message) }
            catch (error NotSupportedException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error DllNotFoundException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error EntryPointNotFoundException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error IOException) { return ClipboardDataResult(ClipboardReadStatus.Failed, error: error.Message) }
            catch (error ArgumentException) { return ClipboardDataResult(ClipboardReadStatus.Failed, error: error.Message) }
            finally { objc_autoreleasePoolPop(pool) }
        }
    }
}
