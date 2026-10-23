using Android.App;
using Android.Content;
using Android.OS;
using Android.Provider;
using Android.Views.Accessibility;
using Goo;
using Goo.Android;
using System.Text;
using NodeAction = Android.Views.Accessibility.Action;

namespace GooAndroidSmokeApp;

[Instrumentation(Name = "org.goo.androidsmoke.DocumentChecks", TargetPackage = "org.goo.androidsmoke", FunctionalTest = true)]
public sealed class DocumentChecks : Instrumentation
{
    private const string Authority = "org.goo.clipboardpeer.documents";
    private UiAutomation automation = null!;
    private MainActivity activity = null!;
    private string phase = "pick";

    public DocumentChecks() { }
    public DocumentChecks(IntPtr handle, global::Android.Runtime.JniHandleOwnership ownership) : base(handle, ownership) { }

    public override void OnCreate(Bundle? arguments)
    {
        phase = arguments?.GetString("phase") ?? "pick";
        base.OnCreate(arguments);
        Start();
    }

    public override void OnStart()
    {
        using var result = new Bundle();
        var status = Result.Ok;
        try
        {
            automation = UiAutomation ?? throw new InvalidOperationException("UiAutomation is unavailable");
            using var intent = new Intent(TargetContext!, typeof(MainActivity));
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            activity = (MainActivity)StartActivitySync(intent)!;
            Wait(() => Main(() => activity.Window!.DecorView!.HasWindowFocus), "The source Activity did not receive focus");
            if (phase == "pick") PickAndPersist();
            else ReopenAndRelease();
            result.PutString("stream", "GOO_ANDROID_DOCUMENTS_PASS " + phase + "\n");
        }
        catch (Exception error)
        {
            var tree = new StringBuilder();
            using var root = automation?.RootInActiveWindow;
            if (root is not null) Dump(root, tree, 0);
            result.PutString("stream", "GOO_ANDROID_DOCUMENTS_FAIL\n" + error + "\n" + tree);
            status = Result.Canceled;
        }
        Finish(status, result);
    }

    private DocumentPickerOptions OpenOptions(bool multiple = false, DocumentAccess access = DocumentAccess.Read)
    {
        using var initial = DocumentsContract.BuildDocumentUri(Authority, "root")!;
        return new DocumentPickerOptions { InitialUri = new Uri(initial.ToString()!), Multiple = multiple, Access = access };
    }

    private void PickAndPersist()
    {
        var selected = Main(() => activity.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions()));
        Click("first.txt");
        var selection = Await(selected);
        Require(selection.Status == FileDialogStatus.Success && selection.Uris.Count == 1, "Single document selection failed: " + selection.Error);
        var uri = selection.Uris[0];
        Require(uri.Scheme == "content" && (selection.GrantedAccess & DocumentAccess.Read) != 0 && selection.CanPersist,
            "The picker did not report its content URI and actual persistable Read grant");
        Require(ReadText(uri) == "SAF text document", "Selected document bytes changed");
        var persisted = Main(() => activity.Documents.PersistAccess(uri, DocumentAccess.Read));
        Require(persisted.Status == DocumentStatus.Success, "Persist failed: " + persisted.Error);
        using (var preferences = TargetContext!.GetSharedPreferences("document-check", FileCreationMode.Private)!)
        using (var edit = preferences.Edit()!)
            Require(edit.PutString("uri", uri.AbsoluteUri)!.Commit(), "The persisted URI was not saved");

        selected = Main(() => activity.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions(true)));
        Click("first.txt", true);
        Click("image.png");
        ClickAny("Select", "Open");
        selection = Await(selected);
        Require(selection.Status == FileDialogStatus.Success && selection.Uris.Count == 2, "Multiple URI selection failed: " + selection.Error);
        Require(selection.Uris.All(value => value.Scheme == "content"), "A selected document became a path");

        selected = Main(() => activity.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions()));
        Click("stream.bin");
        selection = Await(selected);
        Require(selection.Status == FileDialogStatus.Success, "Stream document selection failed: " + selection.Error);
        var opened = Await(activity.Documents.OpenReadAsync(selection.Uris.Single()));
        Require(opened.Status == DocumentStatus.Success && opened.Stream is { CanRead: true },
            "The provider pipe did not open: " + opened.Error);
        using (var stream = opened.Stream!)
        {
            var bytes = new byte[262144];
            stream.ReadExactly(bytes);
            Require(stream.ReadByte() == -1, "Stream document length changed");
            for (int i = 0; i < bytes.Length; i++) Require(bytes[i] == (byte)i, "Stream document bytes changed");
        }

        var save = OpenOptions(access: DocumentAccess.Read | DocumentAccess.Write);
        save = new DocumentPickerOptions { InitialUri = save.InitialUri, Access = save.Access,
            MimeTypes = ["text/plain"], SuggestedName = "result-" + Guid.NewGuid().ToString("N") + ".txt" };
        selected = Main(() => activity.Documents.ShowPickerAsync(FileDialogKind.SaveFile, save));
        Click("Save");
        selection = Await(selected);
        Require(selection.Status == FileDialogStatus.Success && (selection.GrantedAccess & DocumentAccess.Write) != 0,
            "Created document did not grant Write: " + selection.Error);
        var created = selection.Uris.Single();
        WriteText(created, "long document contents");
        WriteText(created, "short");
        Require(ReadText(created) == "short", "Document replacement did not truncate old contents");

        selected = Main(() => activity.Documents.ShowPickerAsync(FileDialogKind.Folder,
            OpenOptions(access: DocumentAccess.Read | DocumentAccess.Write)));
        Click("Use this folder");
        Click("Allow");
        selection = Await(selected);
        Require(selection.Status == FileDialogStatus.Success && selection.Uris.Count == 1, "Tree selection failed: " + selection.Error);
        var tree = Await(activity.Documents.OpenReadAsync(selection.Uris[0]));
        Require(tree.Status == DocumentStatus.Unsupported && tree.Stream is null, "A tree URI was opened as file bytes");
        using var nativeTree = Android.Net.Uri.Parse(selection.Uris[0].AbsoluteUri)!;
        using var child = Android.Provider.DocumentsContract.BuildDocumentUriUsingTree(nativeTree, "text")!;
        Require(ReadText(new Uri(child.ToString()!)) == "SAF text document", "A granted tree child did not open");
        using var absent = Android.Provider.DocumentsContract.BuildDocumentUriUsingTree(nativeTree, "missing")!;
        var notFound = Await(activity.Documents.OpenReadAsync(new Uri(absent.ToString()!)));
        Require(notFound.Status == DocumentStatus.NotFound && notFound.Stream is null,
            "A missing tree child did not report NotFound: " + notFound.Status + " " + notFound.Error);

        using var cancellation = new CancellationTokenSource();
        selected = Main(() => activity.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions(), cancellation.Token));
        Wait(() => Exists("first.txt"), "Cancellable picker did not open");
        cancellation.Cancel();
        Require(Await(selected).Status == FileDialogStatus.Cancelled, "Picker cancellation did not complete");
        Wait(() => Main(() => activity.Window!.DecorView!.HasWindowFocus), "Cancelled picker did not return focus");

        selected = Main(() => activity.Documents.ShowPickerAsync(FileDialogKind.OpenFile, OpenOptions()));
        Wait(() => Exists("first.txt"), "Recreation picker did not open");
        var monitor = AddMonitor(activity.ComponentName!.ClassName!, null, false);
        try
        {
            RunOnMainSync(activity.Recreate);
            Require(Await(selected).Status == FileDialogStatus.Cancelled, "Activity recreation did not cancel its owned picker");
            activity = WaitForMonitorWithTimeout(monitor, 15000) as MainActivity
                ?? throw new InvalidOperationException("Replacement Activity did not start");
        }
        finally { RemoveMonitor(monitor); }
        var unsupported = Await(activity.Documents.OpenReadAsync(new Uri("file:///document.txt")));
        Require(unsupported.Status == DocumentStatus.Unsupported && unsupported.Stream is null, "A path was accepted as a content stream");
        var missing = Await(activity.Documents.OpenReadAsync(new Uri("content://" + Authority + "/document/missing")));
        Require(missing.Status == DocumentStatus.Denied && missing.Stream is null,
            "An ungranted URI did not report Denied: " + missing.Status + " " + missing.Error);
    }

    private void ReopenAndRelease()
    {
        using var preferences = TargetContext!.GetSharedPreferences("document-check", FileCreationMode.Private)!;
        var uri = new Uri(preferences.GetString("uri", null) ?? throw new InvalidOperationException("Persisted URI is missing"));
        Require(ReadText(uri) == "SAF text document", "Persisted URI did not reopen after process restart");
        var result = Main(() => activity.Documents.ReleaseAccess(uri, DocumentAccess.Read));
        Require(result.Status == DocumentStatus.Success, "Grant release failed: " + result.Error);
        var denied = Await(activity.Documents.OpenReadAsync(uri));
        Require(denied.Status == DocumentStatus.Denied && denied.Stream is null, "Released URI did not report Denied");
    }

    private string ReadText(Uri uri)
    {
        var result = Await(activity.Documents.OpenReadAsync(uri));
        Require(result.Status == DocumentStatus.Success && result.Stream is not null, "Read open failed: " + result.Error);
        using var stream = result.Stream!;
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private void WriteText(Uri uri, string text)
    {
        var result = Await(activity.Documents.OpenWriteAsync(uri));
        Require(result.Status == DocumentStatus.Success && result.Stream is not null, "Write open failed: " + result.Error);
        using var stream = result.Stream!;
        stream.Write(Encoding.UTF8.GetBytes(text));
    }

    private T Main<T>(Func<T> call)
    {
        T result = default!;
        RunOnMainSync(() => result = call());
        return result;
    }

    private static T Await<T>(Task<T> task) => task.WaitAsync(TimeSpan.FromSeconds(30)).GetAwaiter().GetResult();

    private bool Exists(string label)
    {
        using var root = automation.RootInActiveWindow;
        using var found = root is null ? null : Search(root, label);
        return found is not null;
    }

    private void Click(string label, bool longClick = false) => ClickAny(longClick, [label]);
    private void ClickAny(params string[] labels) => ClickAny(false, labels);

    private void ClickAny(bool longClick, string[] labels)
    {
        Wait(() => labels.Any(Exists), "Expected document control is missing: " + string.Join(", ", labels));
        using var root = automation.RootInActiveWindow!;
        AccessibilityNodeInfo? node = null;
        foreach (var label in labels)
            if ((node = Search(root, label)) is not null) break;
        while (node is not null)
        {
            var current = node;
            try
            {
                if (current.PerformAction(longClick ? NodeAction.LongClick : NodeAction.Click)) return;
                node = current.Parent;
            }
            finally { current.Dispose(); }
        }
        throw new InvalidOperationException("Document control did not accept its action: " + string.Join(", ", labels));
    }

    private static AccessibilityNodeInfo? Search(AccessibilityNodeInfo node, string label)
    {
        if (!node.Refresh()) return null;
        if (node.VisibleToUser && (string.Equals(node.Text, label, StringComparison.OrdinalIgnoreCase)
            || string.Equals(node.ContentDescription, label, StringComparison.OrdinalIgnoreCase))) return new AccessibilityNodeInfo(node);
        for (int i = 0; i < node.ChildCount; i++)
            using (var child = node.GetChild(i))
                if (child is not null && Search(child, label) is { } found) return found;
        return null;
    }

    private static void Dump(AccessibilityNodeInfo node, StringBuilder text, int depth)
    {
        text.Append(' ', depth).Append(node.PackageName).Append(' ').Append(node.ClassName)
            .Append(' ').Append(node.Text).Append(' ').Append(node.ContentDescription).AppendLine();
        for (int i = 0; i < node.ChildCount; i++)
            using (var child = node.GetChild(i))
                if (child is not null) Dump(child, text, depth + 1);
    }

    private static void Wait(Func<bool> condition, string message)
    {
        long deadline = SystemClock.UptimeMillis() + 15000;
        do
        {
            if (condition()) return;
            Thread.Sleep(50);
        } while (SystemClock.UptimeMillis() < deadline);
        throw new InvalidOperationException(message);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
