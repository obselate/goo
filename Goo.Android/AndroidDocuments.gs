package Goo.Android

import Android.App
import Android.Content
import Android.OS
import Android.Provider
import Android.Runtime
import Android.Systems
import Goo
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks
import AndroidUri = Android.Net.Uri

/// Access requested or granted for an Android document URI.
@Flags
public enum DocumentAccess {
    /// No document access.
    None = 0,
    /// Read document contents.
    Read = 1,
    /// Replace document contents.
    Write = 2
}

/// The outcome of document stream or grant access.
public enum DocumentStatus {
    /// The operation completed.
    Success,
    /// The operation was cancelled.
    Cancelled,
    /// The URI or operation is not supported.
    Unsupported,
    /// The provider denied access.
    Denied,
    /// The document was not found.
    NotFound,
    /// The provider operation failed.
    Failed
}

/// Hints for the Android system document picker.
public sealed class DocumentPickerOptions {
    /// Gets MIME filters. The default accepts all document types.
    public prop MimeTypes IReadOnlyList[string] { get; init; }

    /// Gets the suggested display name for a newly created document.
    public prop SuggestedName string { get; init; }

    /// Gets an optional content URI for the initial location.
    public prop InitialUri Uri? { get; init; }

    /// Gets whether an open picker may return multiple documents.
    public prop Multiple bool { get; init; }

    /// Gets requested access. The default is Read.
    public prop Access DocumentAccess { get; init; }

    /// Creates default document picker hints.
    public init() {
        MimeTypes = DefaultMimeTypes
        SuggestedName = ""
        Access = DocumentAccess.Read
    }

    shared {
        private let DefaultMimeTypes IReadOnlyList[string] = Array.AsReadOnly([]string{"*/*"})
    }
}

/// An owned URI selection and the access flags returned by the picker.
public sealed class DocumentPickerResult {
    /// Gets the picker outcome.
    public prop Status FileDialogStatus { get; }

    /// Gets immutable content URI references. No filesystem paths are returned.
    public prop Uris IReadOnlyList[Uri] { get; }

    /// Gets returned read and write grant flags, not requested flags.
    public prop GrantedAccess DocumentAccess { get; }

    /// Gets whether the returned grant supports explicit persistence.
    public prop CanPersist bool { get; }

    /// Gets a bounded failure reason or an empty string.
    public prop Error string { get; }

    internal init(status FileDialogStatus, uris []?Uri = nil, access DocumentAccess = DocumentAccess.None,
        canPersist bool = false, error string? = "") {
        Status = status
        Uris = Array.AsReadOnly(uris ?? Array.Empty[Uri]())
        GrantedAccess = access
        CanPersist = canPersist
        let detail = error ?? ""
        Error = if detail.Length > MaxErrorUnits { detail.Substring(0, MaxErrorUnits) } else { detail }
    }

    shared {
        private const MaxErrorUnits int32 = 1024
    }
}

/// A caller-owned document stream or an explicit access failure.
public sealed class DocumentStreamResult {
    /// Gets the stream-open outcome.
    public prop Status DocumentStatus { get; }

    /// Gets the caller-owned stream only when Status is Success.
    public prop Stream Stream? { get; }

    /// Gets a bounded failure reason or an empty string.
    public prop Error string { get; }

    internal init(status DocumentStatus, stream Stream? = nil, error string = "") {
        Status = status
        Stream = stream
        Error = if error.Length > MaxErrorUnits { error.Substring(0, MaxErrorUnits) } else { error }
    }

    shared {
        private const MaxErrorUnits int32 = 1024
    }
}

/// The outcome of an explicit document grant change.
public sealed class DocumentOperationResult {
    /// Gets the grant-change outcome.
    public prop Status DocumentStatus { get; }

    /// Gets a bounded failure reason or an empty string.
    public prop Error string { get; }

    internal init(status DocumentStatus, error string = "") {
        Status = status
        Error = if error.Length > MaxErrorUnits { error.Substring(0, MaxErrorUnits) } else { error }
    }

    shared {
        private const MaxErrorUnits int32 = 1024
    }
}

/// Owns the Activity's SAF picker, content URI streams and explicit persisted grants.
public sealed class AndroidDocuments {
    private let owner Activity
    private let context Context
    private let resolver ContentResolver
    private let handler Handler = Handler(Looper.MainLooper!!)
    private var pending Pending?
    private var disposed bool

    private sealed class Pending {
        internal let Code int32
        internal let Multiple bool
        internal let Completion TaskCompletionSource[DocumentPickerResult] =
            TaskCompletionSource[DocumentPickerResult](TaskCreationOptions.RunContinuationsAsynchronously)
        internal var Cancellation CancellationTokenRegistration

        internal init(code int32, multiple bool) {
            Code = code
            Multiple = multiple
        }
    }

    internal init(owner Activity) {
        this.owner = owner
        context = owner.ApplicationContext!!
        resolver = context.ContentResolver!!
    }

    /// Launches the system document picker on the Activity's main thread.
    /// @param kind OpenFile, SaveFile or Folder. SaveFile creates a new document.
    /// @param options MIME filters, content URI location and requested access.
    /// @param cancellation Cancels this request without persisting its URI grants.
    /// @returns Owned URI references and the access flags actually returned by Android.
    public func ShowPickerAsync(kind FileDialogKind, options DocumentPickerOptions? = nil,
        cancellation CancellationToken = default(CancellationToken)) Task[DocumentPickerResult] {
        RequireMainThread()
        let settings = options ?? DocumentPickerOptions()
        let types = ValidateOptions(kind, settings)
        if Volatile.Read(ref disposed) || owner.IsFinishing || owner.IsDestroyed
            || cancellation.IsCancellationRequested {
            return Task.FromResult(DocumentPickerResult(FileDialogStatus.Cancelled))
        }
        if pending != nil {
            return Task.FromResult(DocumentPickerResult(FileDialogStatus.Failed,
                error: "A document picker is already open"))
        }

        using let intent = Intent(if kind == FileDialogKind.OpenFile { Intent.ActionOpenDocument }
            else if kind == FileDialogKind.SaveFile { Intent.ActionCreateDocument }
            else { Intent.ActionOpenDocumentTree })
        intent.AddFlags(ActivityFlags(int32(settings.Access)) | ActivityFlags.GrantPersistableUriPermission)
        if kind == FileDialogKind.Folder { intent.AddFlags(ActivityFlags.GrantPrefixUriPermission) }
        else {
            intent.AddCategory(Intent.CategoryOpenable)
            intent.SetType(if types.Length == 1 { types[0] } else { AllMimeTypes })
            if types.Length > 1 { intent.PutExtra(Intent.ExtraMimeTypes, types) }
            if kind == FileDialogKind.OpenFile { intent.PutExtra(Intent.ExtraAllowMultiple, settings.Multiple) }
            else if settings.SuggestedName.Length > 0 { intent.PutExtra(Intent.ExtraTitle, settings.SuggestedName) }
        }
        if let reference = settings.InitialUri {
            using let initial = AndroidUri.Parse(reference.AbsoluteUri)!!
            intent.PutExtra(DocumentsContract.ExtraInitialUri, initial)
        }
        let request = Pending(Interlocked.Increment(ref nextRequestCode) & RequestCodeMask, settings.Multiple)
        pending = request
        request.Cancellation = cancellation.Register(() -> { handler.Post(() -> Cancel(request)) })
        try { owner.StartActivityForResult(intent, request.Code) }
        catch (error ActivityNotFoundException) {
            Complete(request, DocumentPickerResult(FileDialogStatus.Unsupported, error: error.Message))
        } catch (error Java.Lang.Exception) {
            Complete(request, DocumentPickerResult(FileDialogStatus.Failed, error: error.Message))
        }
        return request.Completion.Task
    }

    internal func HandleResult(requestCode int32, resultCode Result, data Intent?) bool {
        guard let request = pending else { return false }
        if request.Code != requestCode { return false }
        if resultCode == Result.Canceled {
            Complete(request, DocumentPickerResult(FileDialogStatus.Cancelled))
            return true
        }
        if resultCode != Result.Ok || data == nil {
            Complete(request, DocumentPickerResult(FileDialogStatus.Failed,
                error: "The picker returned no document selection"))
            return true
        }
        try {
            let uris = List[Uri]()
            let seen = HashSet[string](StringComparer.Ordinal)
            var units int32
            let add = (uri AndroidUri?) -> {
                guard let reference = uri else { return }
                let value = reference.ToString()!!
                if !seen.Add(value) { return }
                if reference.Scheme != ContentScheme {
                    throw NotSupportedException("The picker did not return a content URI")
                }
                if uris.Count >= NativeFilePaths.MaxCount || value.Length > NativeFilePaths.MaxPathUnits
                    || value.Length > NativeFilePaths.MaxTotalUnits - units {
                    throw ClipboardLimitException("Document selection exceeds its URI budget")
                }
                units += value.Length
                uris.Add(Uri(value, UriKind.Absolute))
            }
            using let single = data.Data
            add(single)
            using let clip = data.ClipData
            if clip != nil {
                if clip.ItemCount > NativeFilePaths.MaxCount {
                    throw ClipboardLimitException("Document selection exceeds 4096 items")
                }
                for i in 0 ... clip.ItemCount {
                    using let item = clip.GetItemAt(i)
                    using let uri = item?.Uri
                    add(uri)
                }
            }
            if uris.Count == 0 || !request.Multiple && uris.Count != 1 {
                throw IOException("The picker returned an invalid document count")
            }
            let access = DocumentAccess(int32(data.Flags) & int32(DocumentAccess.Read | DocumentAccess.Write))
            Complete(request, DocumentPickerResult(FileDialogStatus.Success, uris.ToArray(), access,
                int32(data.Flags & ActivityFlags.GrantPersistableUriPermission) != 0))
        } catch (error Exception) when (Known(error)) {
            let status = if error is ClipboardLimitException { FileDialogStatus.TooLarge }
                else if error is NotSupportedException { FileDialogStatus.Unsupported } else { FileDialogStatus.Failed }
            Complete(request, DocumentPickerResult(status, error: error.Message))
        }
        return true
    }

    private func Complete(request Pending, result DocumentPickerResult) {
        if pending != request { return }
        pending = nil
        request.Cancellation.Dispose()
        request.Completion.TrySetResult(result)
    }

    private func Cancel(request Pending) {
        if pending != request { return }
        var error string?
        try { owner.FinishActivity(request.Code) }
        catch (failure Java.Lang.Exception) { error = failure.Message }
        Complete(request, DocumentPickerResult(FileDialogStatus.Cancelled, error: error))
    }

    internal func Dispose() {
        Volatile.Write(ref disposed, true)
        if let request = pending { Cancel(request) }
        handler.RemoveCallbacksAndMessages(nil)
    }

    /// Opens a caller-owned content stream off the UI thread. A tree root has no byte stream.
    /// @param uri The content URI to read. No path conversion occurs.
    /// @param cancellation Cancels before opening or discards a stream opened after cancellation.
    /// @returns An explicit result and, on success, a caller-owned stream.
    public func OpenReadAsync(uri Uri, cancellation CancellationToken = default(CancellationToken))
        Task[DocumentStreamResult] -> OpenAsync(uri, false, cancellation)

    /// Opens whole-document replacement with truncation off the UI thread.
    /// @param uri The writable content URI. A tree root has no byte stream.
    /// @param cancellation Cancels before opening or discards a stream opened after cancellation.
    /// @returns An explicit result and, on success, a caller-owned stream.
    public func OpenWriteAsync(uri Uri, cancellation CancellationToken = default(CancellationToken))
        Task[DocumentStreamResult] -> OpenAsync(uri, true, cancellation)

    private func OpenAsync(uri Uri, write bool, cancellation CancellationToken) Task[DocumentStreamResult] {
        ArgumentNullException.ThrowIfNull(uri, paramName: "uri")
        if !uri.IsAbsoluteUri { throw ArgumentException("An absolute content URI is required", "uri") }
        if uri.Scheme != ContentScheme {
            return Task.FromResult(DocumentStreamResult(DocumentStatus.Unsupported,
                error: "Document access requires a content URI"))
        }
        return Task.Run(() -> {
            if Volatile.Read(ref disposed) || cancellation.IsCancellationRequested {
                return DocumentStreamResult(DocumentStatus.Cancelled)
            }
            try {
                using let source = AndroidUri.Parse(uri.AbsoluteUri)!!
                if DocumentsContract.IsTreeUri(source) && !DocumentsContract.IsDocumentUri(context, source) {
                    return DocumentStreamResult(DocumentStatus.Unsupported,
                        error: "A document tree is not a byte stream")
                }
                let stream = if write { resolver.OpenOutputStream(source, ReplaceMode) }
                    else { resolver.OpenInputStream(source) }
                if stream == nil {
                    return DocumentStreamResult(DocumentStatus.Failed,
                        error: "The document provider did not open a stream")
                }
                let retained Stream = if !write && stream is InputStreamInvoker input {
                    AndroidInputStream(input.BaseInputStream)
                } else { stream }
                if Volatile.Read(ref disposed) || cancellation.IsCancellationRequested {
                    retained.Dispose()
                    return DocumentStreamResult(DocumentStatus.Cancelled)
                }
                return DocumentStreamResult(DocumentStatus.Success, retained)
            } catch (error Exception) when (Known(error)) {
                return DocumentStreamResult(Status(error), error: error.Message)
            }
        })
    }

    /// Explicitly persists URI access that the provider granted as persistable.
    /// @param uri The granted content URI.
    /// @param access The returned Read and Write bits to retain.
    /// @returns Success or an explicit grant failure. No persistence is automatic.
    public func PersistAccess(uri Uri, access DocumentAccess) DocumentOperationResult ->
        ChangeAccess(uri, access, false)

    /// Releases the specified persisted URI access without deleting the document.
    /// @param uri The persisted content URI.
    /// @param access The persisted Read and Write bits to release.
    /// @returns Success or an explicit grant failure.
    public func ReleaseAccess(uri Uri, access DocumentAccess) DocumentOperationResult -> ChangeAccess(uri, access, true)

    private func ChangeAccess(uri Uri, access DocumentAccess, release bool) DocumentOperationResult {
        RequireMainThread()
        ValidateAccess(access)
        ArgumentNullException.ThrowIfNull(uri, paramName: "uri")
        if !uri.IsAbsoluteUri { throw ArgumentException("An absolute content URI is required", "uri") }
        if Volatile.Read(ref disposed) { return DocumentOperationResult(DocumentStatus.Cancelled) }
        if uri.Scheme != ContentScheme {
            return DocumentOperationResult(DocumentStatus.Unsupported, "Document grants require a content URI")
        }
        try {
            using let source = AndroidUri.Parse(uri.AbsoluteUri)!!
            if release { resolver.ReleasePersistableUriPermission(source, ActivityFlags(int32(access))) }
            else { resolver.TakePersistableUriPermission(source, ActivityFlags(int32(access))) }
            return DocumentOperationResult(DocumentStatus.Success)
        } catch (error Exception) when (Known(error)) {
            return DocumentOperationResult(Status(error), error.Message)
        }
    }

    shared {
        private const ContentScheme string = "content"
        private const AllMimeTypes string = "*/*"
        private const MimeFilterCharacters string = "!#$$%&'*+-.^_`|~/"
        private const MaxMimeTypes int32 = 128
        private const RequestCodeMask int32 = 0xffff
        private const ReplaceMode string = "wt"
        private var nextRequestCode int32 = 0x4740

        private func ValidateOptions(kind FileDialogKind, options DocumentPickerOptions) []string {
            if kind != FileDialogKind.OpenFile && kind != FileDialogKind.SaveFile && kind != FileDialogKind.Folder {
                throw ArgumentOutOfRangeException("kind")
            }
            ValidateAccess(options.Access)
            ArgumentNullException.ThrowIfNull(options.MimeTypes, paramName: "options.MimeTypes")
            ArgumentNullException.ThrowIfNull(options.SuggestedName, paramName: "options.SuggestedName")
            if options.MimeTypes.Count < 1 || options.MimeTypes.Count > MaxMimeTypes {
                throw ArgumentOutOfRangeException("MimeTypes")
            }
            if options.SuggestedName.Length > NativeFilePaths.MaxPathUnits || options.SuggestedName.Contains(char(0)) {
                throw ArgumentException("Invalid suggested document name", "options")
            }
            if let initial = options.InitialUri {
                if !initial.IsAbsoluteUri || initial.Scheme != ContentScheme {
                    throw ArgumentException("The initial location must be a content URI", "options")
                }
            }
            let types = [options.MimeTypes.Count]string
            for i in 0 ... types.Length {
                let type = options.MimeTypes[i]
                TransferRepresentation.ValidateType(type)
                let slash = type.IndexOf('/')
                let wildcard = type.IndexOf('*')
                if slash <= 0 || slash == type.Length - 1 || type.IndexOf('/', slash + 1) >= 0
                    || type.Any(character -> !(char.IsAsciiLetterOrDigit(character)
                        || MimeFilterCharacters.Contains(character)))
                    || wildcard >= 0 && type != AllMimeTypes && (wildcard != slash + 1 || type.Length != slash + 2) {
                    throw ArgumentException("A MIME filter must be type/subtype or type/*", "options")
                }
                types[i] = type.ToLowerInvariant()
            }
            if kind == FileDialogKind.SaveFile && (options.Multiple || types.Length != 1 || types[0].Contains('*')
                || (options.Access & DocumentAccess.Write) == DocumentAccess.None) {
                throw ArgumentException("Save requires one concrete MIME type, single selection and Write access",
                    "options")
            }
            if kind == FileDialogKind.Folder && (options.Multiple || types.Length != 1 || types[0] != AllMimeTypes) {
                throw ArgumentException("Folder selection does not accept MIME filters or multiple selection",
                    "options")
            }
            return types
        }

        private func ValidateAccess(access DocumentAccess) {
            if access == DocumentAccess.None
                || (access & ~(DocumentAccess.Read | DocumentAccess.Write)) != DocumentAccess.None {
                throw ArgumentOutOfRangeException("access")
            }
        }

        private func RequireMainThread() {
            if Looper.MyLooper() != Looper.MainLooper {
                throw InvalidOperationException("Document picker and grant operations require the Android main thread")
            }
        }

        private func Known(error Exception) bool -> error is IOException || error is UnauthorizedAccessException
            || error is FormatException || error is NotSupportedException || error is ClipboardLimitException
            || error is Java.Lang.Exception || error is System.OperationCanceledException

        private func Status(error Exception) DocumentStatus ->
            if error is Java.Lang.SecurityException || error is UnauthorizedAccessException { DocumentStatus.Denied }
            else if error is Java.IO.FileNotFoundException || error is FileNotFoundException { DocumentStatus.NotFound }
            else if error is Java.Lang.UnsupportedOperationException || error is NotSupportedException {
                DocumentStatus.Unsupported
            }
            else if error is Android.OS.OperationCanceledException || error is System.OperationCanceledException {
                DocumentStatus.Cancelled
            } else { DocumentStatus.Failed }
    }
}

internal sealed class AndroidInputStream(input Java.IO.InputStream) : InputStreamInvoker(input) {
    public override prop CanSeek bool {
        get {
            if BaseInputStream is not Java.IO.FileInputStream file { return false }
            using let descriptor = file.FD!!
            try {
                Os.Lseek(descriptor, 0L, OsConstants.SeekCur)
                return true
            } catch (error ErrnoException) when (error.Errno == OsConstants.Espipe) {
                return false
            }
        }
    }
}
