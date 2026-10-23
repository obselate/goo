package Goo

import System
import System.Collections.Generic
import System.Net.Mime

/// Selects whether a file clipboard publication prefers copying or a deferred move.
public enum ClipboardIntent {
    /// Publishes references without requesting source removal.
    Copy;
    /// Requests a deferred file move where the native clipboard supports that intent.
    Cut;
}

/// Reports a native data publication outcome without throwing for platform failures.
public enum DataTransferStatus {
    /// Every requested representation was published.
    Success;
    /// The transfer was cancelled before completion.
    Cancelled;
    /// The host cannot provide the requested transfer or intent.
    Unsupported;
    /// The transfer exceeds a native or managed data budget.
    TooLarge;
    /// The operating system denied access to the transfer.
    Denied;
    /// A native transfer operation failed.
    Failed;
}

/// Owns immutable bytes for one exact MIME representation of a selection.
public sealed class TransferRepresentation {
    private let contentType string
    private let bytes []uint8
    /// Gets the exact MIME type offered to native consumers.
    public prop ContentType string { get -> contentType }
    /// Gets owned bytes that remain valid after clipboard replacement or window close.
    public prop Bytes ReadOnlyMemory[uint8] { get -> ReadOnlyMemory[uint8](bytes) }
    internal prop Data []uint8 { get -> bytes }

    /// Copies a bounded MIME representation into managed ownership.
    /// @param contentType A MIME type of at most 256 ASCII bytes, without control characters.
    /// @param bytes Encoded bytes, at most 64 MiB, without a text terminator.
    public init(contentType string, bytes ReadOnlyMemory[uint8]) {
        ValidateType(contentType)
        if bytes.Length > ClipboardTransfer.MaxImageBytes { throw ArgumentOutOfRangeException("bytes") }
        this.contentType = contentType
        this.bytes = bytes.ToArray()
    }

    internal init(contentType string, bytes []uint8) {
        this.contentType = contentType
        this.bytes = bytes
    }

    shared {
        internal func ValidateType(value string) {
            if value == nil { throw ArgumentNullException("contentType") }
            if value.Length == 0 || value.Length > 256 { throw ArgumentException("MIME type exceeds its length budget", "contentType") }
            for c in value {
                if c < char(32) || c > char(126) { throw ArgumentException("MIME types must contain printable ASCII", "contentType") }
            }
            let parsed = ContentType(value)
            if parsed.MediaType.IndexOf('/') <= 0 { throw ArgumentException("MIME type requires a type and subtype", "contentType") }
        }
    }
}

/// Owns MIME alternatives and an ordered document URI selection without reading document contents.
public sealed class TransferData {
    private let representations IReadOnlyList[TransferRepresentation]
    private let uris IReadOnlyList[Uri]
    /// Gets immutable MIME alternatives for the same logical selection.
    public prop Representations IReadOnlyList[TransferRepresentation] { get -> representations }
    /// Gets document references, which do not imply local paths or persistent access grants.
    public prop Uris IReadOnlyList[Uri] { get -> uris }

    /// Captures at most 128 representations, 64 MiB total bytes and 4096 bounded absolute URIs.
    /// @param representations Owned MIME alternatives with unique exact type names.
    /// @param uris Absolute document references in selection order, without a duplicate text/uri-list representation.
    public init(representations IReadOnlyList[TransferRepresentation], uris IReadOnlyList[Uri]) {
        if representations == nil { throw ArgumentNullException("representations") }
        if uris == nil { throw ArgumentNullException("uris") }
        if representations.Count > 128 { throw ArgumentOutOfRangeException("representations") }
        if uris.Count > NativeFilePaths.MaxCount { throw ArgumentOutOfRangeException("uris") }
        let types = HashSet[string](StringComparer.Ordinal)
        let copied = [representations.Count]TransferRepresentation
        var total int64
        for i in 0 ... copied.Length {
            let item = representations[i]
            if item == nil { throw ArgumentException("Representations cannot contain null", "representations") }
            if !types.Add(item.ContentType) { throw ArgumentException("MIME representations must be unique", "representations") }
            total += item.Bytes.Length
            if total > ClipboardTransfer.MaxImageBytes { throw ArgumentOutOfRangeException("representations") }
            if item.ContentType.StartsWith("text/", StringComparison.Ordinal) && item.Bytes.Length > ClipboardTransfer.MaxTextBytes {
                throw ArgumentOutOfRangeException("representations")
            }
            copied[i] = item
        }
        if uris.Count > 0 && types.Contains("text/uri-list") { throw ArgumentException("Use Uris instead of a duplicate URI-list representation", "representations") }
        let references = [uris.Count]Uri
        var units int32
        for i in 0 ... references.Length {
            let uri = uris[i]
            if uri == nil || !uri.IsAbsoluteUri { throw ArgumentException("Document URIs must be absolute", "uris") }
            let value = uri.AbsoluteUri
            if value.Length > NativeFilePaths.MaxPathUnits || value.IndexOf(char(0)) >= 0
                || value.Length > NativeFilePaths.MaxTotalUnits - units { throw ArgumentOutOfRangeException("uris") }
            units += value.Length
            references[i] = uri
        }
        this.representations = Array.AsReadOnly[TransferRepresentation](copied)
        this.uris = Array.AsReadOnly[Uri](references)
    }

    shared {
        internal let Empty TransferData = TransferData(Array.Empty[TransferRepresentation](), Array.Empty[Uri]())
    }
}

/// Contains an owned multi-format clipboard snapshot and its file-transfer intent.
public sealed class ClipboardDataResult {
    /// Gets the snapshot outcome, independently of individual representation lengths.
    public prop Status ClipboardReadStatus { get; }
    /// Gets owned MIME bytes and URI references, or an empty payload on failure.
    public prop Data TransferData { get; }
    /// Gets the native file-transfer hint, defaulting to Copy when no marker exists.
    public prop Intent ClipboardIntent { get; }
    /// Gets a bounded explanation of native failure or excessive data.
    public prop Error string { get; }

    internal init(status ClipboardReadStatus, data TransferData? = nil, intent ClipboardIntent = ClipboardIntent.Copy, error string = "") {
        Status = status
        Data = data ?? TransferData.Empty
        Intent = intent
        Error = if error.Length > 1024 { error.Substring(0, 1024) } else { error }
    }
}

/// Reports whether all requested clipboard representations were published.
public sealed class ClipboardWriteResult {
    /// Gets the publication outcome, not confirmation that another application pasted it.
    public prop Status DataTransferStatus { get; }
    /// Gets a bounded native failure explanation, or an empty string.
    public prop Error string { get; }

    internal init(status DataTransferStatus, error string = "") {
        Status = status
        Error = if error.Length > 1024 { error.Substring(0, 1024) } else { error }
    }
}
