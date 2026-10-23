using System.Diagnostics;
using System.Text;
using Goo;
using Goo.Printing;
using Goo.RichText;

var window = new Window { Root = new Page(32, 32), Width = 96, Height = 96, Title = "Goo print check" }.Open();
try
{
    Settle(window);
    var options = new OffscreenRenderOptions(240, 180, 480, 360, Color.Rgb(255, 255, 255), 134217728);
    var first = Pump(window, window.RenderOffscreenAsync(new Page(240, 180), options, CancellationToken.None));
    Require(first.Status == OffscreenRenderStatus.Success && first.Capture != null,
        "offscreen status: " + first.Status + " " + first.Error);
    var capture = first.Capture!;
    Require(capture.Width == 480 && capture.Height == 360 && window.Width == 96 && window.Height == 96,
        "page size changed the visible window");
    Pixel(capture, 450, 330, 20, 160, 60);
    Pixel(capture, 8, 8, 210, 30, 40);
    var ink = 0;
    for (var y = 40; y < 100; y++)
        for (var x = 30; x < 350; x++)
        {
            var index = checked(y * (int)capture.RowBytes + x * 4);
            if (capture.Pixels[index] < 80 && capture.Pixels[index + 1] < 80 && capture.Pixels[index + 2] < 80)
                ink++;
        }
    Require(ink > 50, "page text was not uploaded and painted");
    var second = Pump(window, window.RenderOffscreenAsync(new Page(240, 180), options,
        CancellationToken.None, capture));
    Require(second.Status == OffscreenRenderStatus.Success && second.Capture != null &&
        ReferenceEquals(capture.Pixels, second.Capture.Pixels), "page reuse status: " + second.Status + " " + second.Error);
    var limited = Pump(window, window.RenderOffscreenAsync(new Page(240, 180),
        new OffscreenRenderOptions(240, 180, 480, 360, Color.Rgb(255, 255, 255), 1024), CancellationToken.None));
    Require(limited.Status == OffscreenRenderStatus.BudgetExceeded, "page memory limit was not reported");
    using var cancelled = new CancellationTokenSource();
    cancelled.Cancel();
    var cancelledPage = window.RenderOffscreenAsync(new Page(240, 180), options, cancelled.Token).GetAwaiter().GetResult();
    Require(cancelledPage.Status == OffscreenRenderStatus.Cancelled, "cancelled page was accepted");
    using var pdf = new MemoryStream();
    var document = new Document();
    var printed = Pump(window, Printing.ExportPdfAsync(window, document,
        new PrintPageSettings(180, 135, 0, 0, 0, 0, 144, 144), pdf));
    Require(printed.Status == PrintStatus.Exported, "PDF status: " + printed.Status + " " + printed.Error);
    var text = Encoding.Latin1.GetString(pdf.ToArray());
    Require(document.Created == 2 && text.Contains("/Count 2") && text.Contains("/MediaBox [0 0 180 135]") &&
        text.EndsWith("%%EOF\n", StringComparison.Ordinal), "PDF page structure is incomplete");
    if (args.Length != 0)
        File.WriteAllBytes(args[0], pdf.ToArray());
    using var a4 = new MemoryStream();
    var fullSize = Pump(window, Printing.ExportPdfAsync(window, new Document(),
        new PrintPageSettings(595.28, 841.89, 36, 36, 36, 36), a4));
    Require(fullSize.Status == PrintStatus.Exported, "A4 PDF status: " + fullSize.Status + " " + fullSize.Error);
    if (args.Length != 0)
        File.WriteAllBytes(args[0] + ".a4.pdf", a4.ToArray());
    using var oversized = new MemoryStream();
    var oversizedDocument = new Document();
    var bounded = Pump(window, Printing.ExportPdfAsync(window, oversizedDocument,
        new PrintPageSettings(10000000000, 0.00000001, 0, 0, 0, 0, 1, 1), oversized));
    Require(bounded.Status == PrintStatus.BudgetExceeded && oversizedDocument.Created == 0,
        "rounded raster dimensions did not enforce the page budget before creating content");
    var owner = Pump(window, window.AcquireNativeDialogOwnerAsync(CancellationToken.None));
    if (owner.Status == NativeDialogOwnerStatus.Success && owner.Owner != null)
    {
        Require(window.IsInputBlocked, "native dialog lease did not block owner input");
        owner.Owner.Dispose();
        Require(!window.IsInputBlocked, "native dialog lease did not restore owner input");
    }
    else
        Require(owner.Status == NativeDialogOwnerStatus.Unsupported, "unexpected native dialog owner status");
    CheckRichClipboard();
    Console.WriteLine($"printing: 2 PDF pages at 300 DPI A4, independent 480x360 output, {ink} text pixels, reused output, bounded memory");
}
finally
{
    window.RequestClose();
    var deadline = Stopwatch.StartNew();
    while (window.IsOpen && deadline.Elapsed < TimeSpan.FromSeconds(20))
        window.Pump(0);
    Require(!window.IsOpen, "owner did not close");
}

static void Settle(Window window)
{
    var deadline = Stopwatch.StartNew();
    while (deadline.Elapsed < TimeSpan.FromSeconds(20))
    {
        window.Pump(0);
        if (!window.QueueWorkPending)
            return;
        Thread.Yield();
    }
    throw new InvalidOperationException("owner queue did not settle");
}

static T Pump<T>(Window window, Task<T> operation)
{
    var deadline = Stopwatch.StartNew();
    while (!operation.IsCompleted && deadline.Elapsed < TimeSpan.FromSeconds(30))
    {
        window.Pump(0);
        Thread.Yield();
    }
    Require(operation.IsCompleted, "print operation did not complete");
    return operation.GetAwaiter().GetResult();
}

static void Pixel(WindowCapture capture, int x, int y, int red, int green, int blue)
{
    var index = checked(y * (int)capture.RowBytes + x * 4);
    Require(Math.Abs(capture.Pixels[index] - red) <= 2 && Math.Abs(capture.Pixels[index + 1] - green) <= 2 &&
        Math.Abs(capture.Pixels[index + 2] - blue) <= 2, $"unexpected pixel at {x},{y}");
}

static void CheckRichClipboard()
{
    using var controller = new TextEditorController(new TextDocument("rich 😀"));
    using var layer = new TextPresentationLayer(controller.Document);
    layer.SetStyle("bold", new TextRange(0, 7), new Style { FontWeight = 700 });
    var handle = new ElementHandle();
    var window = new Window { Width = 240, Height = 180, Root = new EditorPage(controller, layer, handle) }.Open();
    try
    {
        Settle(window);
        Require(handle.Focus(), "rich editor did not focus");
        var commands = 0;
        controller.OnCommand = _ => commands++;
        using var clipboard = new RichTextClipboard(window, controller, layer);
        TaskCompletionSource<RichTextResult>? completed = null;
        clipboard.Completed += result => completed?.TrySetResult(result);
        controller.Selection = new TextSelection(new TextPosition(0, TextAffinity.Upstream), new TextPosition(7, TextAffinity.Downstream));
        var copied = Pump(window, clipboard.CopyAsync());
        Require(copied.Status == RichTextStatus.Success, "rich copy: " + copied.Status + " " + copied.Error);
        controller.Selection = new TextSelection(new TextPosition(7, TextAffinity.Upstream), new TextPosition(7, TextAffinity.Downstream));
        var pasted = Pump(window, clipboard.PasteAsync());
        Require(pasted.Status == RichTextStatus.Success && controller.Document.GetText() == "rich 😀rich 😀", "rich paste did not round-trip");
        Require(controller.Document.Undo() && controller.Document.GetText() == "rich 😀", "rich paste undo failed");
        Require(commands == 2, "clipboard command interception ran more than once");
        controller.Selection = new TextSelection(new TextPosition(0, TextAffinity.Upstream), new TextPosition(7, TextAffinity.Downstream));
        var pendingCut = clipboard.CutAsync();
        controller.Selection = new TextSelection(new TextPosition(7, TextAffinity.Upstream), new TextPosition(7, TextAffinity.Downstream));
        Require(Pump(window, pendingCut).Status == RichTextStatus.Stale && controller.Document.GetText() == "rich 😀",
            "stale cut deleted the current selection");
        clipboard.ReadOnly = true;
        Require(Pump(window, clipboard.PasteAsync()).Status == RichTextStatus.ReadOnly, "read-only paste was accepted");
        clipboard.ReadOnly = false;
        foreach (var type in new[] { "text/html", "text/rtf" })
        {
            var data = RichTextCodec.Write(new RichTextFragment("only", [new TextStyleSpan("only", new TextRange(0, 4), new Style { FontWeight = 700 })]));
            var representation = data.Representations.Single(item => item.ContentType == type);
            var written = Pump(window, window.WriteClipboardAsync(new TransferData([representation], Array.Empty<Uri>())));
            Require(written.Status == DataTransferStatus.Success, "single-format publication failed");
            controller.Selection = new TextSelection(new TextPosition(0, TextAffinity.Upstream), new TextPosition(7, TextAffinity.Downstream));
            completed = new(TaskCreationOptions.RunContinuationsAsynchronously);
            Require(!window.PlatformInput.Execute(new TextCommand { Kind = TextCommandKind.Paste }), "rich paste was not intercepted");
            var result = Pump(window, completed.Task);
            Require(result.Status == RichTextStatus.Success && controller.Document.GetText() == "only", "single-format paste failed: " + type);
            Require(controller.Document.Undo(), "single-format undo failed");
        }
        controller.Selection = new TextSelection(new TextPosition(7, TextAffinity.Upstream), new TextPosition(7, TextAffinity.Downstream));
        Require(window.PlatformInput.Execute(new TextCommand(TextCommandKind.Paste, "literal", false))
            && controller.Document.GetText() == "rich 😀literal", "supplied paste text read the clipboard");
        Require(controller.Document.Undo(), "supplied paste undo failed");
        controller.Selection = new TextSelection(new TextPosition(0, TextAffinity.Upstream), new TextPosition(7, TextAffinity.Downstream));
        Require(controller.ReplaceSelection(layer, "", Array.Empty<TextStyleSpan>()) && controller.Document.Length == 0,
            "empty styled replacement read the clipboard");
        Require(controller.Document.Undo(), "empty replacement undo failed");
        Console.WriteLine("rich clipboard: HTML/RTF, rich-only native paste, explicit text, stale cut, read-only and atomic undo");
    }
    finally
    {
        window.RequestClose();
        var deadline = Stopwatch.StartNew();
        while (window.IsOpen && deadline.Elapsed < TimeSpan.FromSeconds(20)) window.Pump(0);
        Require(!window.IsOpen, "rich editor did not close");
    }
}

static void Require(bool condition, string error)
{
    if (!condition)
        throw new InvalidOperationException(error);
}

sealed class EditorPage(TextEditorController controller, TextPresentationLayer layer, ElementHandle handle) : Cell
{
    public override Blob Build() => new TextEditor(controller, [layer]) { Handle = handle };
}

sealed class Page(int width, int height) : Cell
{
    public override Blob Build()
    {
        var root = new Container { Width = width, Height = height, BackgroundColor = Color.Rgb(20, 160, 60) };
        root.Add(new Container { Width = 20, Height = 20, BackgroundColor = Color.Rgb(210, 30, 40) });
        root.Add(new Text { Content = "Printed page", FontSize = 20, Color = Color.Rgb(0, 0, 0) });
        return root;
    }
}

sealed class Document : IPrintDocument
{
    internal int Created;
    public PrintLayoutResult Paginate(PrintPageSettings settings) => new(PrintLayoutStatus.Ready, 2);
    public Cell CreatePage(int index, PrintPageSettings settings)
    {
        Created++;
        return new Page(240, 180);
    }
}
