package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import System.Runtime.ExceptionServices
import System.Text
import System.Threading
import Hexa.NET.SDL3

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate ClipboardDataCallback(userData nint, contentType nint, ref size nuint) nint;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate ClipboardCleanupCallback(userData nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate ClipboardWatchCallback(userData nint, nativeEvent nint) uint8;

internal sealed class ClipboardPublication {
    internal let Items IReadOnlyList[TransferRepresentation]
    internal let Pins []GCHandle
    internal var Handle GCHandle
    private var disposed bool

    internal init(items IReadOnlyList[TransferRepresentation]) {
        Items = items
        Pins = [items.Count]GCHandle
        try {
            for i in 0 ... items.Count { Pins[i] = GCHandle.Alloc(items[i].Data, GCHandleType.Pinned) }
            Handle = GCHandle.Alloc(this)
        } catch (error Exception) {
            Dispose()
            ExceptionDispatchInfo.Capture(error).Throw()
        }
    }

    internal func Dispose() {
        if disposed { return }
        disposed = true
        for i in 0 ... Pins.Length { if Pins[i].IsAllocated { Pins[i].Free() } }
        if Handle.IsAllocated { Handle.Free() }
    }
}

internal unsafe partial class ClipboardTransfer {
    shared {
        private const UriList string = "text/uri-list"
        private const GnomeFiles string = "x-special/gnome-copied-files"
        private const KdeCut string = "application/x-kde-cutselection"
        private var clipboardGeneration int64
        private let dataCallback ClipboardDataCallback = SupplyClipboardData
        private let cleanupCallback ClipboardCleanupCallback = ReleaseClipboardData
        private let watchCallback ClipboardWatchCallback = WatchClipboard
        private let dataAddress nint = Marshal.GetFunctionPointerForDelegate(dataCallback)
        private let cleanupAddress nint = Marshal.GetFunctionPointerForDelegate(cleanupCallback)
        private let watchAddress nint = Marshal.GetFunctionPointerForDelegate(watchCallback)

        @DllImport("SDL3", EntryPoint: "SDL_SetClipboardData", CallingConvention: CallingConvention.Cdecl)
        private func PublishClipboard(callback nint, cleanup nint, userData nint, types nint, count nuint) uint8;
        @DllImport("SDL3", EntryPoint: "SDL_AddEventWatch", CallingConvention: CallingConvention.Cdecl)
        private func AddClipboardWatch(callback nint, userData nint) uint8;
        @DllImport("SDL3", EntryPoint: "SDL_RemoveEventWatch", CallingConvention: CallingConvention.Cdecl)
        private func RemoveClipboardWatch(callback nint, userData nint);

        internal func ValidateTypes(contentTypes IReadOnlyList[string]) []string {
            if contentTypes == nil { throw ArgumentNullException("contentTypes") }
            if contentTypes.Count > 128 { throw ArgumentOutOfRangeException("contentTypes") }
            let types = [contentTypes.Count]string
            let seen = HashSet[string](StringComparer.Ordinal)
            for i in 0 ... types.Length {
                let value = contentTypes[i]
                TransferRepresentation.ValidateType(value)
                if !seen.Add(value) { throw ArgumentException("Requested MIME types must be unique", "contentTypes") }
                types[i] = value
            }
            return types
        }

        private func WaylandDataAvailable() bool -> OperatingSystem.IsLinux() && SDL.GetCurrentVideoDriverS() == "wayland"

        private func IsPlainText(contentType string) bool -> contentType == "text/plain" || contentType.StartsWith("text/plain;", StringComparison.Ordinal)

        internal func WriteTransfer(data TransferData, intent ClipboardIntent) ClipboardWriteResult {
            if OperatingSystem.IsWindows() { return WindowsWriteTransfer(data, intent) }
            if OperatingSystem.IsMacOS() { return MacWriteTransfer(data, intent) }
            if !WaylandDataAvailable() { return ClipboardWriteResult(DataTransferStatus.Unsupported, "This host does not provide multi-format clipboard publication") }
            var publication ClipboardPublication?
            let names = List[nint]()
            var nativeTypes nint
            try {
                let items = List[TransferRepresentation](data.Representations.Count + 3)
                items.AddRange(data.Representations)
                if data.Uris.Count > 0 {
                    for item in items {
                        if item.ContentType == GnomeFiles || item.ContentType == KdeCut {
                            throw ArgumentException("File intent representations are generated from Uris", "data")
                        }
                    }
                    let uriList = EncodeLocalUris(data.Uris)
                    items.Add(TransferRepresentation(UriList, Encoding.UTF8.GetBytes(uriList)))
                    let prefix = if intent == ClipboardIntent.Cut { "cut\n" } else { "copy\n" }
                    items.Add(TransferRepresentation(GnomeFiles, Encoding.UTF8.GetBytes(prefix + uriList)))
                    items.Add(TransferRepresentation(KdeCut, []uint8{if intent == ClipboardIntent.Cut { uint8(49) } else { uint8(48) }}))
                }
                if items.Count > 128 { throw ClipboardLimitException("Generated file types exceed the 128 MIME type budget") }
                var total int64
                for item in items {
                    total += item.Data.Length
                    if total > MaxImageBytes { throw ClipboardLimitException("Clipboard alternatives exceed 64 MiB") }
                }
                publication = ClipboardPublication(items)
                nativeTypes = Marshal.AllocHGlobal(items.Count * nint.Size)
                for i in 0 ... items.Count {
                    let name = Marshal.StringToCoTaskMemUTF8(items[i].ContentType)
                    names.Add(name)
                    Marshal.WriteIntPtr(nativeTypes, i * nint.Size, name)
                }
                if PublishClipboard(dataAddress, cleanupAddress, GCHandle.ToIntPtr(publication.Handle), nativeTypes, nuint(items.Count)) == 0 {
                    let error = SDL.GetErrorS() ?? "Native clipboard publication failed"
                    SDL.ClearClipboardData()
                    publication.Dispose()
                    return ClipboardWriteResult(DataTransferStatus.Failed, error)
                }
                return ClipboardWriteResult(DataTransferStatus.Success)
            } catch (error ClipboardLimitException) {
                publication?.Dispose()
                return ClipboardWriteResult(DataTransferStatus.TooLarge, error.Message)
            } catch (error NativePathLimitException) {
                publication?.Dispose()
                return ClipboardWriteResult(DataTransferStatus.TooLarge, error.Message)
            } catch (error InvalidDataException) {
                publication?.Dispose()
                return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message)
            } catch (error NotSupportedException) {
                publication?.Dispose()
                return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message)
            } catch (error DllNotFoundException) {
                publication?.Dispose()
                return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message)
            } catch (error EntryPointNotFoundException) {
                publication?.Dispose()
                return ClipboardWriteResult(DataTransferStatus.Unsupported, error.Message)
            } finally {
                for name in names { Marshal.FreeCoTaskMem(name) }
                if nativeTypes != nint(0) { Marshal.FreeHGlobal(nativeTypes) }
            }
        }

        internal func EncodeLocalUris(uris IReadOnlyList[Uri]) string {
            let encoded = StringBuilder()
            var units int32 = 0
            for i in 0 ... uris.Count {
                let uri = uris[i]
                LocalTransferPath(uri, i, ref units)
                encoded.Append(uri.AbsoluteUri)
                encoded.Append("\r\n")
                if encoded.Length > MaxFileListBytes - 5 { throw ClipboardLimitException("Clipboard URI list exceeds 1 MiB") }
            }
            return encoded.ToString()
        }

        private func LocalTransferPath(uri Uri, index int32, ref units int32) string {
            if !uri.IsFile || uri.Query != "" || uri.Fragment != ""
                || (uri.Host != "" && !String.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)) {
                throw NotSupportedException("Native desktop file publication requires local file URIs")
            }
            let path = uri.LocalPath
            NativeFilePaths.Validate(path, index, ref units)
            return path
        }

        internal func ReadTransfer(types IReadOnlyList[string]) ClipboardDataResult {
            if OperatingSystem.IsWindows() { return WindowsReadTransfer(types) }
            if OperatingSystem.IsMacOS() { return MacReadTransfer(types) }
            if !WaylandDataAvailable() { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: "This host does not provide multi-format clipboard reads") }
            var watching bool
            try {
                watching = AddClipboardWatch(watchAddress, nint(0)) != 0
                if !watching { throw IOException(SDL.GetErrorS() ?? "Clipboard change observation failed") }
                let formats = Query()
                if formats.Status != ClipboardReadStatus.Success { return ClipboardDataResult(formats.Status, error: formats.Error) }
                let generation = Interlocked.Read(ref clipboardGeneration)
                let items = List[TransferRepresentation](types.Count)
                let uris = List[Uri]()
                var intent = ClipboardIntent.Copy
                var total int64
                for contentType in types {
                    if contentType == UriList {
                        let fileType = FileFormat(formats.Formats)
                        if fileType == "" { continue }
                        let files = ParseFiles(utf8.GetString(ReadData(fileType, MaxFileListBytes)), fileType == GnomeFiles)
                        for path in files.Paths { uris.Add(Uri(path)) }
                        intent = ReadFileIntent(formats.Formats, files.Paths)
                        continue
                    }
                    if !HasFormat(formats.Formats, contentType) { continue }
                    let limit = if contentType.StartsWith("text/", StringComparison.Ordinal) { MaxTextBytes } else { MaxImageBytes }
                    let bytes = ReadData(contentType, Math.Min(limit, int32(MaxImageBytes - total)))
                    total += bytes.Length
                    items.Add(TransferRepresentation(contentType, bytes))
                }
                if Interlocked.Read(ref clipboardGeneration) != generation { throw IOException("Clipboard ownership changed during the multi-format read") }
                let data = TransferData(items, uris)
                return ClipboardDataResult(if items.Count == 0 && uris.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, data, intent)
            } catch (error ClipboardLimitException) { return ClipboardDataResult(ClipboardReadStatus.TooLarge, error: error.Message) }
            catch (error NativePathLimitException) { return ClipboardDataResult(ClipboardReadStatus.TooLarge, error: error.Message) }
            catch (error DllNotFoundException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error EntryPointNotFoundException) { return ClipboardDataResult(ClipboardReadStatus.Unsupported, error: error.Message) }
            catch (error IOException) { return ClipboardDataResult(ClipboardReadStatus.Failed, error: error.Message) }
            catch (error ArgumentException) { return ClipboardDataResult(ClipboardReadStatus.Failed, error: error.Message) }
            finally { if watching { RemoveClipboardWatch(watchAddress, nint(0)) } }
        }

        private func ReadFileIntent(formats IReadOnlyList[string], paths IReadOnlyList[string]) ClipboardIntent {
            var marker ClipboardIntent?
            if HasFormat(formats, GnomeFiles) {
                let text = utf8.GetString(ReadData(GnomeFiles, MaxFileListBytes))
                let files = ParseFiles(text, true)
                if files.Paths.Count != paths.Count { throw InvalidDataException("Clipboard file intent refers to a different selection") }
                for i in 0 ... paths.Count {
                    if files.Paths[i] != paths[i] { throw InvalidDataException("Clipboard file intent refers to a different selection") }
                }
                marker = if text.StartsWith("cut\n", StringComparison.Ordinal) || text.StartsWith("cut\r\n", StringComparison.Ordinal) { ClipboardIntent.Cut } else { ClipboardIntent.Copy }
            }
            if HasFormat(formats, KdeCut) {
                let bytes = ReadData(KdeCut, 1)
                if bytes.Length != 1 || (bytes[0] != 48 && bytes[0] != 49) { throw InvalidDataException("Invalid KDE clipboard cut marker") }
                let kde = if bytes[0] == 49 { ClipboardIntent.Cut } else { ClipboardIntent.Copy }
                if marker != nil && marker != kde { throw InvalidDataException("Clipboard file-cut markers disagree") }
                marker = kde
            }
            return marker ?? ClipboardIntent.Copy
        }

        private func HasFormat(formats IReadOnlyList[string], contentType string) bool {
            for format in formats { if format == contentType { return true } }
            return false
        }

        private func SupplyClipboardData(userData nint, contentType nint, ref size nuint) nint {
            size = nuint(0)
            if contentType == nint(0) { return nint(0) }
            try {
                let handle = GCHandle.FromIntPtr(userData)
                guard let publication = handle.Target as ClipboardPublication? else { return nint(0) }
                for i in 0 ... publication.Items.Count {
                    let item = publication.Items[i]
                    var matches = true
                    for j in 0 ... item.ContentType.Length {
                        if Marshal.ReadByte(contentType, j) != uint8(item.ContentType[j]) { matches = false
                            break }
                    }
                    if matches && Marshal.ReadByte(contentType, item.ContentType.Length) == 0 {
                        size = nuint(item.Data.Length)
                        return publication.Pins[i].AddrOfPinnedObject()
                    }
                }
            } catch (_ Exception) { }
            return nint(0)
        }

        private func ReleaseClipboardData(userData nint) {
            try {
                let handle = GCHandle.FromIntPtr(userData)
                if let publication = handle.Target as ClipboardPublication? { publication.Dispose() }
            } catch (_ Exception) { }
        }

        private func WatchClipboard(userData nint, nativeEvent nint) uint8 {
            if nativeEvent != nint(0) && uint32(Marshal.ReadInt32(nativeEvent)) == uint32(SDLEventType.ClipboardUpdate) {
                Interlocked.Increment(ref clipboardGeneration)
            }
            return 1
        }
    }
}
