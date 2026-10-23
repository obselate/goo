using Android.App;
using Android.Content;
using Android.OS;
using Android.Provider;
using AndroidUri = Android.Net.Uri;

namespace Goo.Android;

/// <summary>Access requested or granted for an Android document URI.</summary>
[Flags]
public enum DocumentAccess
{
    /// <summary>No document access.</summary>
    None = 0,
    /// <summary>Read document contents.</summary>
    Read = 1,
    /// <summary>Replace document contents.</summary>
    Write = 2
}

/// <summary>The outcome of document stream or grant access.</summary>
public enum DocumentStatus
{
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
public sealed class DocumentPickerOptions
{
    private static readonly IReadOnlyList<string> DefaultMimeTypes = Array.AsReadOnly(new[] { "*/*" });
    /// <summary>Gets MIME filters. The default accepts all document types.</summary>
    public IReadOnlyList<string> MimeTypes { get; init; } = DefaultMimeTypes;
    /// <summary>Gets the suggested display name for a newly created document.</summary>
    public string SuggestedName { get; init; } = "";
    /// <summary>Gets an optional content URI for the initial location.</summary>
    public Uri? InitialUri { get; init; }
    /// <summary>Gets whether an open picker may return multiple documents.</summary>
    public bool Multiple { get; init; }
    /// <summary>Gets requested access. The default is Read.</summary>
    public DocumentAccess Access { get; init; } = DocumentAccess.Read;
}

/// <summary>An owned URI selection and the access flags returned by the picker.</summary>
public sealed class DocumentPickerResult
{
    /// <summary>Gets the picker outcome.</summary>
    public FileDialogStatus Status { get; }
    /// <summary>Gets immutable content URI references. No filesystem paths are returned.</summary>
    public IReadOnlyList<Uri> Uris { get; }
    /// <summary>Gets returned read and write grant flags, not requested flags.</summary>
    public DocumentAccess GrantedAccess { get; }
    /// <summary>Gets whether the returned grant supports explicit persistence.</summary>
    public bool CanPersist { get; }
    /// <summary>Gets a bounded failure reason or an empty string.</summary>
    public string Error { get; }

    internal DocumentPickerResult(FileDialogStatus status, Uri[]? uris = null,
        DocumentAccess access = DocumentAccess.None, bool canPersist = false, string? error = "")
    {
        Status = status;
        Uris = Array.AsReadOnly(uris ?? []);
        GrantedAccess = access;
        CanPersist = canPersist;
        error ??= "";
        Error = error.Length > 1024 ? error[..1024] : error;
    }
}

/// <summary>A caller-owned document stream or an explicit access failure.</summary>
public sealed class DocumentStreamResult
{
    /// <summary>Gets the stream-open outcome.</summary>
    public DocumentStatus Status { get; }
    /// <summary>Gets the caller-owned stream only when Status is Success.</summary>
    public Stream? Stream { get; }
    /// <summary>Gets a bounded failure reason or an empty string.</summary>
    public string Error { get; }

    internal DocumentStreamResult(DocumentStatus status, Stream? stream = null, string error = "")
    {
        Status = status;
        Stream = stream;
        Error = error.Length > 1024 ? error[..1024] : error;
    }
}

/// <summary>The outcome of an explicit document grant change.</summary>
public sealed class DocumentOperationResult
{
    /// <summary>Gets the grant-change outcome.</summary>
    public DocumentStatus Status { get; }
    /// <summary>Gets a bounded failure reason or an empty string.</summary>
    public string Error { get; }

    internal DocumentOperationResult(DocumentStatus status, string error = "")
    {
        Status = status;
        Error = error.Length > 1024 ? error[..1024] : error;
    }
}

/// <summary>Owns the Activity's SAF picker, content URI streams and explicit persisted grants.</summary>
public sealed class AndroidDocuments
{
    private static int nextRequestCode = 0x4740;
    private readonly Activity owner;
    private readonly Context context;
    private readonly ContentResolver resolver;
    private readonly Handler handler = new(Looper.MainLooper!);
    private Pending? pending;
    private volatile bool disposed;

    private sealed class Pending(int code, bool multiple)
    {
        internal readonly int Code = code;
        internal readonly bool Multiple = multiple;
        internal readonly TaskCompletionSource<DocumentPickerResult> Completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal CancellationTokenRegistration Cancellation;
    }

    internal AndroidDocuments(Activity owner)
    {
        this.owner = owner;
        context = owner.ApplicationContext!;
        resolver = context.ContentResolver!;
    }

    /// <summary>Launches the system document picker on the Activity's main thread.</summary>
    /// <param name="kind">OpenFile, SaveFile or Folder. SaveFile creates a new document.</param>
    /// <param name="options">MIME filters, content URI location and requested access.</param>
    /// <param name="cancellation">Cancels this request without persisting its URI grants.</param>
    /// <returns>Owned URI references and the access flags actually returned by Android.</returns>
    public Task<DocumentPickerResult> ShowPickerAsync(FileDialogKind kind, DocumentPickerOptions? options = null,
        CancellationToken cancellation = default)
    {
        RequireMainThread();
        options ??= new DocumentPickerOptions();
        var types = ValidateOptions(kind, options);
        if (disposed || owner.IsFinishing || owner.IsDestroyed || cancellation.IsCancellationRequested)
            return Task.FromResult(new DocumentPickerResult(FileDialogStatus.Cancelled));
        if (pending is not null)
            return Task.FromResult(new DocumentPickerResult(FileDialogStatus.Failed, error: "A document picker is already open"));
        using var intent = new Intent(kind switch {
            FileDialogKind.OpenFile => Intent.ActionOpenDocument,
            FileDialogKind.SaveFile => Intent.ActionCreateDocument,
            _ => Intent.ActionOpenDocumentTree
        });
        intent.AddFlags((ActivityFlags)(int)options.Access | ActivityFlags.GrantPersistableUriPermission);
        if (kind == FileDialogKind.Folder) intent.AddFlags(ActivityFlags.GrantPrefixUriPermission);
        else
        {
            intent.AddCategory(Intent.CategoryOpenable);
            intent.SetType(types.Length == 1 ? types[0] : "*/*");
            if (types.Length > 1) intent.PutExtra(Intent.ExtraMimeTypes, types);
            if (kind == FileDialogKind.OpenFile) intent.PutExtra(Intent.ExtraAllowMultiple, options.Multiple);
            else if (options.SuggestedName.Length > 0) intent.PutExtra(Intent.ExtraTitle, options.SuggestedName);
        }
        if (options.InitialUri is not null)
        {
            using var initial = AndroidUri.Parse(options.InitialUri.AbsoluteUri)!;
            intent.PutExtra(DocumentsContract.ExtraInitialUri, initial);
        }
        var request = new Pending(Interlocked.Increment(ref nextRequestCode) & 0xffff, options.Multiple);
        pending = request;
        request.Cancellation = cancellation.Register(() => handler.Post(() => Cancel(request)));
        try { owner.StartActivityForResult(intent, request.Code); }
        catch (ActivityNotFoundException error) { Complete(request, new DocumentPickerResult(FileDialogStatus.Unsupported, error: error.Message)); }
        catch (Java.Lang.Exception error) { Complete(request, new DocumentPickerResult(FileDialogStatus.Failed, error: error.Message)); }
        return request.Completion.Task;
    }

    private static string[] ValidateOptions(FileDialogKind kind, DocumentPickerOptions options)
    {
        if (kind is not (FileDialogKind.OpenFile or FileDialogKind.SaveFile or FileDialogKind.Folder))
            throw new ArgumentOutOfRangeException(nameof(kind));
        ValidateAccess(options.Access);
        ArgumentNullException.ThrowIfNull(options.MimeTypes);
        ArgumentNullException.ThrowIfNull(options.SuggestedName);
        if (options.MimeTypes.Count is < 1 or > 128) throw new ArgumentOutOfRangeException(nameof(options.MimeTypes));
        if (options.SuggestedName.Length > NativeFilePaths.MaxPathUnits || options.SuggestedName.Contains('\0'))
            throw new ArgumentException("Invalid suggested document name", nameof(options));
        if (options.InitialUri is not null && (!options.InitialUri.IsAbsoluteUri || options.InitialUri.Scheme != "content"))
            throw new ArgumentException("The initial location must be a content URI", nameof(options));
        var types = new string[options.MimeTypes.Count];
        for (int i = 0; i < types.Length; i++)
        {
            var type = options.MimeTypes[i];
            TransferRepresentation.ValidateType(type);
            int slash = type.IndexOf('/');
            int wildcard = type.IndexOf('*');
            if (slash <= 0 || slash == type.Length - 1 || type.IndexOf('/', slash + 1) >= 0
                || type.Any(character => !(char.IsAsciiLetterOrDigit(character) || "!#$%&'*+-.^_`|~/".Contains(character)))
                || wildcard >= 0 && type != "*/*" && (wildcard != slash + 1 || type.Length != slash + 2))
                throw new ArgumentException("A MIME filter must be type/subtype or type/*", nameof(options));
            types[i] = type.ToLowerInvariant();
        }
        if (kind == FileDialogKind.SaveFile && (options.Multiple || types.Length != 1 || types[0].Contains('*')
            || (options.Access & DocumentAccess.Write) == 0))
            throw new ArgumentException("Save requires one concrete MIME type, single selection and Write access", nameof(options));
        if (kind == FileDialogKind.Folder && (options.Multiple || types.Length != 1 || types[0] != "*/*"))
            throw new ArgumentException("Folder selection does not accept MIME filters or multiple selection", nameof(options));
        return types;
    }

    internal bool HandleResult(int requestCode, Result resultCode, Intent? data)
    {
        if (pending is not { } request || request.Code != requestCode) return false;
        if (resultCode == Result.Canceled)
        {
            Complete(request, new DocumentPickerResult(FileDialogStatus.Cancelled));
            return true;
        }
        if (resultCode != Result.Ok || data is null)
        {
            Complete(request, new DocumentPickerResult(FileDialogStatus.Failed, error: "The picker returned no document selection"));
            return true;
        }
        try
        {
            var uris = new List<Uri>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            int units = 0;
            void Add(AndroidUri? uri)
            {
                if (uri is null) return;
                var value = uri.ToString()!;
                if (!seen.Add(value)) return;
                if (uri.Scheme != "content") throw new NotSupportedException("The picker did not return a content URI");
                if (uris.Count >= NativeFilePaths.MaxCount || value.Length > NativeFilePaths.MaxPathUnits
                    || value.Length > NativeFilePaths.MaxTotalUnits - units)
                    throw new ClipboardLimitException("Document selection exceeds its URI budget");
                units += value.Length;
                uris.Add(new Uri(value, UriKind.Absolute));
            }
            using var single = data.Data;
            Add(single);
            using var clip = data.ClipData;
            if (clip is not null)
            {
                if (clip.ItemCount > NativeFilePaths.MaxCount) throw new ClipboardLimitException("Document selection exceeds 4096 items");
                for (int i = 0; i < clip.ItemCount; i++)
                {
                    using var item = clip.GetItemAt(i);
                    using var uri = item?.Uri;
                    Add(uri);
                }
            }
            if (uris.Count == 0 || !request.Multiple && uris.Count != 1)
                throw new IOException("The picker returned an invalid document count");
            var access = (DocumentAccess)((int)data.Flags & (int)(DocumentAccess.Read | DocumentAccess.Write));
            Complete(request, new DocumentPickerResult(FileDialogStatus.Success, uris.ToArray(), access,
                (data.Flags & ActivityFlags.GrantPersistableUriPermission) != 0));
        }
        catch (Exception error) when (Known(error))
        {
            Complete(request, new DocumentPickerResult(error is ClipboardLimitException ? FileDialogStatus.TooLarge
                : error is NotSupportedException ? FileDialogStatus.Unsupported : FileDialogStatus.Failed, error: error.Message));
        }
        return true;
    }

    private void Complete(Pending request, DocumentPickerResult result)
    {
        if (pending != request) return;
        pending = null;
        request.Cancellation.Dispose();
        request.Completion.TrySetResult(result);
    }

    private void Cancel(Pending request)
    {
        if (pending != request) return;
        string? error = null;
        try { owner.FinishActivity(request.Code); }
        catch (Java.Lang.Exception failure) { error = failure.Message; }
        Complete(request, new DocumentPickerResult(FileDialogStatus.Cancelled, error: error));
    }

    internal void Dispose()
    {
        disposed = true;
        if (pending is { } request) Cancel(request);
        handler.RemoveCallbacksAndMessages(null);
    }

    /// <summary>Opens a caller-owned content stream off the UI thread. A tree root has no byte stream.</summary>
    /// <param name="uri">The content URI to read. No path conversion occurs.</param>
    /// <param name="cancellation">Cancels before opening or discards a stream opened after cancellation.</param>
    /// <returns>An explicit result and, on success, a caller-owned stream.</returns>
    public Task<DocumentStreamResult> OpenReadAsync(Uri uri, CancellationToken cancellation = default) => OpenAsync(uri, false, cancellation);

    /// <summary>Opens whole-document replacement with truncation off the UI thread.</summary>
    /// <param name="uri">The writable content URI. A tree root has no byte stream.</param>
    /// <param name="cancellation">Cancels before opening or discards a stream opened after cancellation.</param>
    /// <returns>An explicit result and, on success, a caller-owned stream.</returns>
    public Task<DocumentStreamResult> OpenWriteAsync(Uri uri, CancellationToken cancellation = default) => OpenAsync(uri, true, cancellation);

    private Task<DocumentStreamResult> OpenAsync(Uri uri, bool write, CancellationToken cancellation)
    {
        ArgumentNullException.ThrowIfNull(uri);
        if (!uri.IsAbsoluteUri) throw new ArgumentException("An absolute content URI is required", nameof(uri));
        if (uri.Scheme != "content") return Task.FromResult(new DocumentStreamResult(DocumentStatus.Unsupported, error: "Document access requires a content URI"));
        return Task.Run(() => {
            if (disposed || cancellation.IsCancellationRequested) return new DocumentStreamResult(DocumentStatus.Cancelled);
            try
            {
                using var source = AndroidUri.Parse(uri.AbsoluteUri)!;
                if (DocumentsContract.IsTreeUri(source) && !DocumentsContract.IsDocumentUri(context, source))
                    return new DocumentStreamResult(DocumentStatus.Unsupported, error: "A document tree is not a byte stream");
                var stream = write ? resolver.OpenOutputStream(source, "wt") : resolver.OpenInputStream(source);
                if (stream is null) return new DocumentStreamResult(DocumentStatus.Failed, error: "The document provider did not open a stream");
                if (disposed || cancellation.IsCancellationRequested)
                {
                    stream.Dispose();
                    return new DocumentStreamResult(DocumentStatus.Cancelled);
                }
                return new DocumentStreamResult(DocumentStatus.Success, stream);
            }
            catch (Exception error) when (Known(error)) { return new DocumentStreamResult(Status(error), error: error.Message); }
        });
    }

    /// <summary>Explicitly persists URI access that the provider granted as persistable.</summary>
    /// <param name="uri">The granted content URI.</param>
    /// <param name="access">The returned Read and Write bits to retain.</param>
    /// <returns>Success or an explicit grant failure. No persistence is automatic.</returns>
    public DocumentOperationResult PersistAccess(Uri uri, DocumentAccess access) => ChangeAccess(uri, access, false);

    /// <summary>Releases the specified persisted URI access without deleting the document.</summary>
    /// <param name="uri">The persisted content URI.</param>
    /// <param name="access">The persisted Read and Write bits to release.</param>
    /// <returns>Success or an explicit grant failure.</returns>
    public DocumentOperationResult ReleaseAccess(Uri uri, DocumentAccess access) => ChangeAccess(uri, access, true);

    private DocumentOperationResult ChangeAccess(Uri uri, DocumentAccess access, bool release)
    {
        RequireMainThread();
        ValidateAccess(access);
        ArgumentNullException.ThrowIfNull(uri);
        if (!uri.IsAbsoluteUri) throw new ArgumentException("An absolute content URI is required", nameof(uri));
        if (disposed) return new DocumentOperationResult(DocumentStatus.Cancelled);
        if (uri.Scheme != "content") return new DocumentOperationResult(DocumentStatus.Unsupported, "Document grants require a content URI");
        try
        {
            using var source = AndroidUri.Parse(uri.AbsoluteUri)!;
            if (release) resolver.ReleasePersistableUriPermission(source, (ActivityFlags)(int)access);
            else resolver.TakePersistableUriPermission(source, (ActivityFlags)(int)access);
            return new DocumentOperationResult(DocumentStatus.Success);
        }
        catch (Exception error) when (Known(error)) { return new DocumentOperationResult(Status(error), error.Message); }
    }

    private static void ValidateAccess(DocumentAccess access)
    {
        if (access == DocumentAccess.None || (access & ~(DocumentAccess.Read | DocumentAccess.Write)) != 0)
            throw new ArgumentOutOfRangeException(nameof(access));
    }

    private static void RequireMainThread()
    {
        if (Looper.MyLooper() != Looper.MainLooper) throw new InvalidOperationException("Document picker and grant operations require the Android main thread");
    }

    private static bool Known(Exception error) => error is IOException or UnauthorizedAccessException or FormatException
        or NotSupportedException or ClipboardLimitException or Java.Lang.Exception or System.OperationCanceledException;
    private static DocumentStatus Status(Exception error) => error is Java.Lang.SecurityException or UnauthorizedAccessException ? DocumentStatus.Denied
        : error is Java.IO.FileNotFoundException or FileNotFoundException ? DocumentStatus.NotFound
        : error is Java.Lang.UnsupportedOperationException or NotSupportedException ? DocumentStatus.Unsupported
        : error is global::Android.OS.OperationCanceledException or System.OperationCanceledException ? DocumentStatus.Cancelled : DocumentStatus.Failed;
}
