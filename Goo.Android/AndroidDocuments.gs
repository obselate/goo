package Goo.Android

import Android.App
import Android.Content
import Android.OS
import Android.Provider
import Goo
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks
import AndroidUri = Android.Net.Uri

/// <summary>Access requested or granted for an Android document URI.</summary>
@Flags
public enum DocumentAccess {
    /// <summary>No document access.</summary>
    None = 0,
    /// <summary>Read document contents.</summary>
    Read = 1,
    /// <summary>Replace document contents.</summary>
    Write = 2
}

/// <summary>The outcome of document stream or grant access.</summary>
public enum DocumentStatus {
    /// <summary>The operation completed.</summary>
    Success,
    /// <summary>The operation was cancelled.</summary>
    Cancelled,
    /// <summary>The URI or operation is not supported.</summary>
    Unsupported,
    /// <summary>The provider denied access.</summary>
    Denied,
    /// <summary>The document was not found.</summary>
    NotFound,
    /// <summary>The provider operation failed.</summary>
    Failed
}

/// <summary>Hints for the Android system document picker.</summary>
public sealed class DocumentPickerOptions {
    /// <summary>Gets MIME filters. The default accepts all document types.</summary>
    public prop MimeTypes IReadOnlyList[string] { get; init; }

    /// <summary>Gets the suggested display name for a newly created document.</summary>
    public prop SuggestedName string { get; init; }

    /// <summary>Gets an optional content URI for the initial location.</summary>
    public prop InitialUri Uri? { get; init; }

    /// <summary>Gets whether an open picker may return multiple documents.</summary>
    public prop Multiple bool { get; init; }

    /// <summary>Gets requested access. The default is Read.</summary>
    public prop Access DocumentAccess { get; init; }

    /// <summary>Creates default document picker hints.</summary>
    public init() {
        MimeTypes = DefaultMimeTypes
        SuggestedName = ""
        Access = DocumentAccess.Read
    }

    shared {
        private let DefaultMimeTypes IReadOnlyList[string] = Array.AsReadOnly([]string{"*/*"})
    }
}

/// <summary>An owned URI selection and the access flags returned by the picker.</summary>
public sealed class DocumentPickerResult {
    /// <summary>Gets the picker outcome.</summary>
    public prop Status FileDialogStatus { get; }

    /// <summary>Gets immutable content URI references. No filesystem paths are returned.</summary>
    public prop Uris IReadOnlyList[Uri] { get; }

    /// <summary>Gets returned read and write grant flags, not requested flags.</summary>
    public prop GrantedAccess DocumentAccess { get; }

    /// <summary>Gets whether the returned grant supports explicit persistence.</summary>
    public prop CanPersist bool { get; }

    /// <summary>Gets a bounded failure reason or an empty string.</summary>
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

/// <summary>A caller-owned document stream or an explicit access failure.</summary>
public sealed class DocumentStreamResult {
    /// <summary>Gets the stream-open outcome.</summary>
    public prop Status DocumentStatus { get; }

    /// <summary>Gets the caller-owned stream only when Status is Success.</summary>
    public prop Stream Stream? { get; }

    /// <summary>Gets a bounded failure reason or an empty string.</summary>
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

/// <summary>The outcome of an explicit document grant change.</summary>
public sealed class DocumentOperationResult {
    /// <summary>Gets the grant-change outcome.</summary>
    public prop Status DocumentStatus { get; }

    /// <summary>Gets a bounded failure reason or an empty string.</summary>
    public prop Error string { get; }

    internal init(status DocumentStatus, error string = "") {
        Status = status
        Error = if error.Length > MaxErrorUnits { error.Substring(0, MaxErrorUnits) } else { error }
    }

    shared {
        private const MaxErrorUnits int32 = 1024
    }
}

/// <summary>Owns the Activity's SAF picker, content URI streams and explicit persisted grants.</summary>
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

    /// <summary>Launches the system document picker on the Activity's main thread.</summary>
    /// <param name="kind">OpenFile, SaveFile or Folder. SaveFile creates a new document.</param>
    /// <param name="options">MIME filters, content URI location and requested access.</param>
    /// <param name="cancellation">Cancels this request without persisting its URI grants.</param>
    /// <returns>Owned URI references and the access flags actually returned by Android.</returns>
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

    /// <summary>Opens a caller-owned content stream off the UI thread. A tree root has no byte stream.</summary>
    /// <param name="uri">The content URI to read. No path conversion occurs.</param>
    /// <param name="cancellation">Cancels before opening or discards a stream opened after cancellation.</param>
    /// <returns>An explicit result and, on success, a caller-owned stream.</returns>
    public func OpenReadAsync(uri Uri, cancellation CancellationToken = default(CancellationToken))
        Task[DocumentStreamResult] -> OpenAsync(uri, false, cancellation)

    /// <summary>Opens whole-document replacement with truncation off the UI thread.</summary>
    /// <param name="uri">The writable content URI. A tree root has no byte stream.</param>
    /// <param name="cancellation">Cancels before opening or discards a stream opened after cancellation.</param>
    /// <returns>An explicit result and, on success, a caller-owned stream.</returns>
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
                if Volatile.Read(ref disposed) || cancellation.IsCancellationRequested {
                    stream.Dispose()
                    return DocumentStreamResult(DocumentStatus.Cancelled)
                }
                return DocumentStreamResult(DocumentStatus.Success, stream)
            } catch (error Exception) when (Known(error)) {
                return DocumentStreamResult(Status(error), error: error.Message)
            }
        })
    }

    /// <summary>Explicitly persists URI access that the provider granted as persistable.</summary>
    /// <param name="uri">The granted content URI.</param>
    /// <param name="access">The returned Read and Write bits to retain.</param>
    /// <returns>Success or an explicit grant failure. No persistence is automatic.</returns>
    public func PersistAccess(uri Uri, access DocumentAccess) DocumentOperationResult ->
        ChangeAccess(uri, access, false)

    /// <summary>Releases the specified persisted URI access without deleting the document.</summary>
    /// <param name="uri">The persisted content URI.</param>
    /// <param name="access">The persisted Read and Write bits to release.</param>
    /// <returns>Success or an explicit grant failure.</returns>
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
