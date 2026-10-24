package GooAndroidSmokeApp

import Android.App
import Android.Content
import Android.OS
import Android.Provider
import Android.Runtime
import Android.Views.Accessibility
import Goo
import Goo.Android
import System
import System.IO
import System.Linq
import System.Text
import System.Threading
import System.Threading.Tasks
import NodeAction = Android.Views.Accessibility.Action

@Instrumentation(Name: "org.goo.androidsmoke.DocumentChecks", TargetPackage: "org.goo.androidsmoke",
    FunctionalTest: true)
public sealed class DocumentChecks : Instrumentation {
    private var automation UiAutomation?
    private var activity MainActivity?
    private var phase string = PickPhase

    public init() {}

    public init(handle nint, ownership JniHandleOwnership) : base(handle, ownership) {}

    public override func OnCreate(arguments Bundle?) {
        phase = arguments?.GetString(PhaseKey) ?? PickPhase
        base.OnCreate(arguments)
        Start()
    }

    public override func OnStart() {
        using let result = Bundle()
        var status = Result.Ok
        try {
            automation = UiAutomation ?? throw InvalidOperationException("UiAutomation is unavailable")
            using let intent = Intent(TargetContext!!, typeof(MainActivity))
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask)
            activity = cast[MainActivity](StartActivitySync(intent)!!)
            Wait(() -> Main(() -> activity!!.Window!!.DecorView.HasWindowFocus),
                "The source Activity did not receive focus")
            if phase == PickPhase { PickAndPersist() } else { ReopenAndRelease() }
            result.PutString(ResultStreamKey, "GOO_ANDROID_DOCUMENTS_PASS " + phase + "\n")
        } catch (error Exception) {
            let tree = StringBuilder()
            using let root = automation?.RootInActiveWindow
            if let node = root { Dump(node, tree, 0) }
            result.PutString(ResultStreamKey,
                "GOO_ANDROID_DOCUMENTS_FAIL\n" + error.ToString() + "\n" + tree.ToString())
            status = Result.Canceled
        }
        Finish(status, result)
    }

    private func OpenOptions(multiple bool = false, access DocumentAccess = DocumentAccess.Read) DocumentPickerOptions {
        using let initial = DocumentsContract.BuildDocumentUri(Authority, "root")!!
        return DocumentPickerOptions{InitialUri: Uri(initial.ToString()!!), Multiple: multiple, Access: access}
    }

    private func PickAndPersist() {
        var selected = Main[Task[DocumentPickerResult]](
            () -> activity!!.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions()))
        Click(FirstDocument)
        var selection = Await(selected)
        Require(selection.Status == FileDialogStatus.Success && selection.Uris.Count == 1,
            "Single document selection failed: " + selection.Error)
        let uri = selection.Uris[0]
        Require(uri.Scheme == "content" && (selection.GrantedAccess & DocumentAccess.Read) != DocumentAccess.None
            && selection.CanPersist, "The picker did not report its content URI and actual persistable Read grant")
        Require(ReadText(uri) == DocumentText, "Selected document bytes changed")
        let persisted = Main[DocumentOperationResult](
            () -> activity!!.Documents.PersistAccess(uri, DocumentAccess.Read))
        Require(persisted.Status == DocumentStatus.Success, "Persist failed: " + persisted.Error)
        {
            using let preferences = TargetContext!!.GetSharedPreferences(PreferencesName, FileCreationMode.Private)!!
            using let edit = preferences.Edit()!!
            Require(edit.PutString(UriKey, uri.AbsoluteUri)!!.Commit(), "The persisted URI was not saved")
        }

        selected = Main[Task[DocumentPickerResult]](
            () -> activity!!.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions(true)))
        Click(FirstDocument, true)
        Click("image.png")
        ClickAny("Select", "Open")
        selection = Await(selected)
        Require(selection.Status == FileDialogStatus.Success && selection.Uris.Count == 2,
            "Multiple URI selection failed: " + selection.Error)
        Require(selection.Uris.All(value -> value.Scheme == "content"), "A selected document became a path")

        selected = Main[Task[DocumentPickerResult]](
            () -> activity!!.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions()))
        Click("stream.bin")
        selection = Await(selected)
        Require(selection.Status == FileDialogStatus.Success, "Stream document selection failed: " + selection.Error)
        let opened = Await(activity!!.Documents.OpenReadAsync(selection.Uris.Single()))
        Require(opened.Status == DocumentStatus.Success && opened.Stream?.CanRead == true,
            "The provider pipe did not open: " + opened.Error)
        {
            using let stream = opened.Stream!!
            let bytes = [StreamBytes]uint8
            stream.ReadExactly(bytes)
            Require(stream.ReadByte() == -1, "Stream document length changed")
            for i in 0 ... bytes.Length { Require(bytes[i] == uint8(i), "Stream document bytes changed") }
        }
        let limited = Await(activity!!.Documents.OpenReadAsync(selection.Uris.Single()))
        Require(limited.Status == DocumentStatus.Success, "Bounded document stream did not open: " + limited.Error)
        {
            using let stream = limited.Stream!!
            var rejected bool
            try {
                using let image = ImageSource.Decode(stream, ImageDecodeLimits{MaxEncodedBytes: 32}, CancellationToken.None)
            } catch (error ImageLimitException) {
                rejected = error.Message == "Encoded image exceeds 32 bytes"
            }
            Require(rejected && stream.CanRead, "Document input limit failed or closed the caller stream")
        }

        let defaults = OpenOptions(access: DocumentAccess.Read | DocumentAccess.Write)
        let save = DocumentPickerOptions{InitialUri: defaults.InitialUri, Access: defaults.Access,
            MimeTypes: []string{"text/plain"}, SuggestedName: "result-" + Guid.NewGuid().ToString("N") + ".txt"}
        selected = Main[Task[DocumentPickerResult]](
            () -> activity!!.Documents.ShowPickerAsync(FileDialogKind.SaveFile, save))
        Click("Save")
        selection = Await(selected)
        Require(selection.Status == FileDialogStatus.Success
            && (selection.GrantedAccess & DocumentAccess.Write) != DocumentAccess.None,
            "Created document did not grant Write: " + selection.Error)
        let created = selection.Uris.Single()
        WriteText(created, "long document contents")
        WriteText(created, "short")
        Require(ReadText(created) == "short", "Document replacement did not truncate old contents")

        CheckTreeSelection()

        using let cancellation = CancellationTokenSource()
        selected = Main[Task[DocumentPickerResult]](() -> activity!!.Documents.ShowPickerAsync(
            FileDialogKind.OpenFile, OpenOptions(), cancellation.Token))
        Wait(() -> Exists(FirstDocument), "Cancellable picker did not open")
        cancellation.Cancel()
        Require(Await(selected).Status == FileDialogStatus.Cancelled, "Picker cancellation did not complete")
        Wait(() -> Main(() -> activity!!.Window!!.DecorView.HasWindowFocus),
            "Cancelled picker did not return focus")

        selected = Main[Task[DocumentPickerResult]](
            () -> activity!!.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions()))
        Wait(() -> Exists(FirstDocument), "Recreation picker did not open")
        let monitor = AddMonitor(activity!!.Class.Name, nil, false)
        try {
            RunOnMainSync(activity!!.Recreate)
            Require(Await(selected).Status == FileDialogStatus.Cancelled,
                "Activity recreation did not cancel its owned picker")
            let replacement = WaitForMonitorWithTimeout(monitor, UiTimeoutMilliseconds)
            activity = (replacement as MainActivity)
                ?? throw InvalidOperationException("Replacement Activity did not start")
        } finally { RemoveMonitor(monitor) }
        let unsupported = Await(activity!!.Documents.OpenReadAsync(Uri("file:///document.txt")))
        Require(unsupported.Status == DocumentStatus.Unsupported && unsupported.Stream == nil,
            "A path was accepted as a content stream")
        let missing = Await(activity!!.Documents.OpenReadAsync(Uri("content://" + Authority + "/document/missing")))
        Require(missing.Status == DocumentStatus.Denied && missing.Stream == nil,
            "An ungranted URI did not report Denied: ${missing.Status} ${missing.Error}")
    }

    private func CheckTreeSelection() {
        let selected = Main[Task[DocumentPickerResult]](() -> activity!!.Documents.ShowPickerAsync(
            FileDialogKind.Folder, OpenOptions(access: DocumentAccess.Read | DocumentAccess.Write)))
        Click("Use this folder")
        Click("Allow")
        let selection = Await(selected)
        Require(selection.Status == FileDialogStatus.Success && selection.Uris.Count == 1,
            "Tree selection failed: " + selection.Error)
        let tree = Await(activity!!.Documents.OpenReadAsync(selection.Uris[0]))
        Require(tree.Status == DocumentStatus.Unsupported && tree.Stream == nil, "A tree URI was opened as file bytes")
        using let nativeTree = Android.Net.Uri.Parse(selection.Uris[0].AbsoluteUri)!!
        using let child = DocumentsContract.BuildDocumentUriUsingTree(nativeTree, "text")!!
        Require(ReadText(Uri(child.ToString()!!)) == DocumentText, "A granted tree child did not open")
        using let absent = DocumentsContract.BuildDocumentUriUsingTree(nativeTree, "missing")!!
        let notFound = Await(activity!!.Documents.OpenReadAsync(Uri(absent.ToString()!!)))
        Require(notFound.Status == DocumentStatus.NotFound && notFound.Stream == nil,
            "A missing tree child did not report NotFound: ${notFound.Status} ${notFound.Error}")
    }

    private func ReopenAndRelease() {
        using let preferences = TargetContext!!.GetSharedPreferences(PreferencesName, FileCreationMode.Private)!!
        let uri = Uri(preferences.GetString(UriKey, nil) ?? throw InvalidOperationException("Persisted URI is missing"))
        Require(ReadText(uri) == DocumentText, "Persisted URI did not reopen after process restart")
        let result = Main[DocumentOperationResult](() -> activity!!.Documents.ReleaseAccess(uri, DocumentAccess.Read))
        Require(result.Status == DocumentStatus.Success, "Grant release failed: " + result.Error)
        let denied = Await(activity!!.Documents.OpenReadAsync(uri))
        Require(denied.Status == DocumentStatus.Denied && denied.Stream == nil, "Released URI did not report Denied")
    }

    private func ReadText(uri Uri) string {
        let result = Await(activity!!.Documents.OpenReadAsync(uri))
        Require(result.Status == DocumentStatus.Success && result.Stream != nil, "Read open failed: " + result.Error)
        using let stream = result.Stream!!
        using let reader = StreamReader(stream, Encoding.UTF8)
        return reader.ReadToEnd()
    }

    private func WriteText(uri Uri, text string) {
        let result = Await(activity!!.Documents.OpenWriteAsync(uri))
        Require(result.Status == DocumentStatus.Success && result.Stream != nil, "Write open failed: " + result.Error)
        using let stream = result.Stream!!
        stream.Write(Encoding.UTF8.GetBytes(text))
    }

    private func Main[T](call Func[T]) T {
        var result T = default(T)
        RunOnMainSync(() -> { result = call() })
        return result
    }

    private func Exists(label string) bool {
        using let root = automation!!.RootInActiveWindow
        using let found = if root == nil { nil } else { Search(root, label) }
        return found != nil
    }

    private func Click(label string, longClick bool = false) -> ClickAny(longClick, []string{label})

    private func ClickAny(labels ...string) -> ClickAny(false, labels)

    private func ClickAny(longClick bool, labels []string) {
        Wait(() -> labels.Any(Exists), "Expected document control is missing: " + string.Join(", ", labels))
        using let root = automation!!.RootInActiveWindow!!
        var node AccessibilityNodeInfo?
        for label in labels {
            node = Search(root, label)
            if node != nil { break }
        }
        while let current = node {
            try {
                if current.PerformAction(if longClick { NodeAction.LongClick } else { NodeAction.Click }) { return }
                node = current.Parent
            } finally { cast[IDisposable](current).Dispose() }
        }
        throw InvalidOperationException("Document control did not accept its action: " + string.Join(", ", labels))
    }

    shared {
        private const Authority string = "org.goo.clipboardpeer.documents"
        private const PreferencesName string = "document-check"
        private const UriKey string = "uri"
        private const PhaseKey string = "phase"
        private const PickPhase string = "pick"
        private const ResultStreamKey string = "stream"
        private const FirstDocument string = "first.txt"
        private const DocumentText string = "SAF text document"
        private const StreamBytes int32 = 262144
        private const UiTimeoutMilliseconds int32 = 15000
        private const PollMilliseconds int32 = 50
        private const OperationTimeoutSeconds int32 = 30

        private func Await[T](task Task[T]) T ->
            task.WaitAsync(TimeSpan.FromSeconds(OperationTimeoutSeconds)).GetAwaiter().GetResult()

        private func Search(node AccessibilityNodeInfo, label string) AccessibilityNodeInfo? {
            if !node.Refresh() { return nil }
            if node.VisibleToUser && (string.Equals(node.Text, label, StringComparison.OrdinalIgnoreCase)
                || string.Equals(node.ContentDescription, label, StringComparison.OrdinalIgnoreCase)) {
                return AccessibilityNodeInfo(node)
            }
            for i in 0 ... node.ChildCount {
                using let child = node.GetChild(i)
                if let value = child {
                    if let found = Search(value, label) { return found }
                }
            }
            return nil
        }

        private func Dump(node AccessibilityNodeInfo, text StringBuilder, depth int32) {
            text.Append(' ', depth).Append(node.PackageName).Append(' ').Append(node.ClassName)
                .Append(' ').Append(node.Text).Append(' ').Append(node.ContentDescription).AppendLine()
            for i in 0 ... node.ChildCount {
                using let child = node.GetChild(i)
                if let value = child { Dump(value, text, depth + 1) }
            }
        }

        private func Wait(condition Func[bool], message string) {
            let deadline = SystemClock.UptimeMillis() + UiTimeoutMilliseconds
            do {
                if condition() { return }
                Thread.Sleep(PollMilliseconds)
            } while SystemClock.UptimeMillis() < deadline
            throw InvalidOperationException(message)
        }

        private func Require(condition bool, message string) {
            if !condition { throw InvalidOperationException(message) }
        }
    }
}
