import Goo
import Goo.Printing
import Goo.SpellCheck
import Goo.RichText
import System
import System.Diagnostics
import System.IO
import System.Linq
import System.Text
import System.Threading
import System.Threading.Tasks

func Settle(window Window) {
    let deadline = Stopwatch.StartNew()
    while deadline.Elapsed < TimeSpan.FromSeconds(20) {
        window.Pump(0.0)
        if !window.QueueWorkPending {
            return
        }
        Thread.Yield()
    }
    throw InvalidOperationException("owner queue did not settle")
}

func Require(condition bool, error string) {
    if !condition {
        throw InvalidOperationException(error)
    }
}

func Pump[T](window Window, operation Task[T]) T {
    let deadline = Stopwatch.StartNew()
    while !operation.IsCompleted && deadline.Elapsed < TimeSpan.FromSeconds(30) {
        window.Pump(0.0)
        Thread.Yield()
    }
    Require(operation.IsCompleted, "print operation did not complete")
    return operation.GetAwaiter().GetResult()
}

func Pixel(capture WindowCapture, x int32, y int32, red int32, green int32, blue int32) {
    let index = checked(y * int32(capture.RowBytes) + x * 4)
    Require(
        Math.Abs(int32(capture.Pixels[index]) - red) <= 2 && Math.Abs(int32(capture.Pixels[index + 1]) - green) <= 2 &&
            Math.Abs(int32(capture.Pixels[index + 2]) - blue) <= 2,
        "unexpected pixel at $x,$y"
    )
}

func CheckSystemSpelling() {
    if !OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS() { return }
    let service = SystemSpellingService()
    let snapshot = TextDocument("🙂 helo").Snapshot()
    let source = TextRange(3, 4)
    let result = service.CheckAsync(snapshot, source, "en-US").GetAwaiter().GetResult()
    Require(result.Status == SpellingStatus.Success && result.Errors.Count == 1,
        "system spelling failed: ${result.Status} ${result.Error}")
    Require(result.Errors[0].Range == source && result.Errors[0].Word == "helo", "system spelling UTF-16 range changed")
    let suggestions = service.SuggestAsync(snapshot, source, "en-US").GetAwaiter().GetResult()
    Require(suggestions.Status == SpellingStatus.Success && suggestions.Values.Contains("hello"),
        "system spelling suggestions failed: ${suggestions.Status} ${suggestions.Error}")
    Console.WriteLine("spelling: native dictionary, UTF-16 ranges and suggestions")
}

func CheckRichClipboard() {
    using let controller = TextEditorController(TextDocument("rich 😀"))
    using let layer = TextPresentationLayer(controller.Document)
    layer.SetStyle("bold", TextRange(0, 7), Style{ FontWeight: 700 })
    let handle = ElementHandle()
    let owner = Window{ Width: 240, Height: 180, Root: EditorPage(controller, layer, handle) }.Open()

    try {
        Settle(owner)
        Require(handle.Focus(), "rich editor did not focus")
        var commands = 0
        controller.OnCommand = _ -> { commands++ }
        using let clipboard = RichTextClipboard(owner, controller, layer)
        var completed TaskCompletionSource[RichTextResult]?
        clipboard.Completed += result -> { completed?.TrySetResult(result) }
        controller.Selection = TextSelection(TextPosition(0, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
        let copied = Pump(owner, clipboard.CopyAsync())
        Require(copied.Status == RichTextStatus.Success, "rich copy failed: ${copied.Status} ${copied.Error}")
        controller.Selection = TextSelection(TextPosition(7, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
        let pasted = Pump(owner, clipboard.PasteAsync())
        Require(pasted.Status == RichTextStatus.Success && controller.Document.GetText() == "rich 😀rich 😀",
            "rich paste did not round-trip")
        Require(controller.Document.Undo() && controller.Document.GetText() == "rich 😀", "rich paste undo failed")
        Require(commands == 2, "clipboard command interception count: $commands, expected 2")
        controller.Selection = TextSelection(TextPosition(0, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
        let pendingCut = clipboard.CutAsync()
        controller.Selection = TextSelection(TextPosition(7, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
        Require(Pump(owner, pendingCut).Status == RichTextStatus.Stale && controller.Document.GetText() == "rich 😀",
            "stale cut deleted the current selection")
        clipboard.ReadOnly = true
        Require(Pump(owner, clipboard.PasteAsync()).Status == RichTextStatus.ReadOnly, "read-only paste was accepted")
        clipboard.ReadOnly = false

        for contentType in []string{ "text/html", "text/rtf" } {
            let data = RichTextCodec.Write(RichTextFragment("only",
                []TextStyleSpan{ TextStyleSpan("only", TextRange(0, 4), Style{ FontWeight: 700 }) }))
            let representation = data.Representations.Single(item -> item.ContentType == contentType)
            let written = Pump(owner, owner.WriteClipboardAsync(
                TransferData([]TransferRepresentation{ representation }, []Uri{})))
            Require(written.Status == DataTransferStatus.Success, "single-format publication failed")
            controller.Selection = TextSelection(TextPosition(0, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
            completed = TaskCompletionSource[RichTextResult](TaskCreationOptions.RunContinuationsAsynchronously)
            Require(!owner.PlatformInput.Execute(TextCommand{ Kind: TextCommandKind.Paste }), "rich paste was not intercepted")
            let result = Pump(owner, completed.Task)
            Require(result.Status == RichTextStatus.Success && controller.Document.GetText() == "only",
                "single-format paste failed: $contentType")
            Require(controller.Document.Undo(), "single-format undo failed")
        }

        controller.Selection = TextSelection(TextPosition(7, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
        Require(owner.PlatformInput.Execute(TextCommand(TextCommandKind.Paste, "literal", false))
            && controller.Document.GetText() == "rich 😀literal", "supplied paste text read the clipboard")
        Require(controller.Document.Undo(), "supplied paste undo failed")
        controller.Selection = TextSelection(TextPosition(0, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
        Require(controller.ReplaceSelection(layer, "", []TextStyleSpan{}) && controller.Document.Length == 0,
            "empty styled replacement read the clipboard")
        Require(controller.Document.Undo(), "empty replacement undo failed")
        Console.WriteLine("rich clipboard: HTML/RTF, rich-only native paste, explicit text, stale cut, read-only and atomic undo")
    } finally {
        owner.RequestClose()
        let deadline = Stopwatch.StartNew()
        while owner.IsOpen && deadline.Elapsed < TimeSpan.FromSeconds(20) { owner.Pump(0.0) }
        Require(!owner.IsOpen, "rich editor did not close")
    }
}

internal class EditorPage(controller TextEditorController, layer TextPresentationLayer, handle ElementHandle) : Cell {
    override func Build() Blob -> TextEditor(controller, []TextPresentationLayer{ layer }) { Handle = handle }
}

internal class Page(width int32, height int32) : Cell {
    override func Build() Blob {
        let root = Container{Width: width, Height: height, BackgroundColor: Color.Rgb(20, 160, 60)}
        root.Add(Container{Width: 20, Height: 20, BackgroundColor: Color.Rgb(210, 30, 40)})
        root.Add(Text{Content: "Printed page", FontSize: 20, Color: Color.Rgb(0, 0, 0)})
        return root
    }
}

internal class Document : IPrintDocument {
    internal var Created int32
    func Paginate(settings PrintPageSettings) PrintLayoutResult -> PrintLayoutResult{Status: PrintLayoutStatus.Ready, PageCount: 2, Error: ""}

    func CreatePage(index int32, settings PrintPageSettings) Cell {
        Created++
        return Page(240, 180)
    }
}

@STAThread
func Main(args[]string) {
    let window = Window{Root: Page(32, 32), Width: 96, Height: 96, Title: "Goo print check"}.Open()

    try {
        Settle(window)
        CheckSystemSpelling()
        CheckRichClipboard()
        let ownerWidth = window.Width
        let ownerHeight = window.Height
        let options = OffscreenRenderOptions(240f, 180f, 480, 360, Color.Rgb(255, 255, 255), 134217728)
        let first = Pump(window, window.RenderOffscreenAsync(Page(240, 180), options, CancellationToken.None))
        Require(
            first.Status == OffscreenRenderStatus.Success && first.Capture != nil,
            "offscreen status: " + first.Status.ToString() + " " + first.Error
        )
        let capture = first.Capture!!
        Require(
            capture.Width == uint32(480) && capture.Height == uint32(360) &&
                window.Width == ownerWidth && window.Height == ownerHeight,
            "page size changed the visible window"
        )
        Pixel(capture, 450, 330, 20, 160, 60)
        Pixel(capture, 8, 8, 210, 30, 40)
        var ink = 0
        for y in 40 ... 100 {
            for x in 30 ... 350 {
                let index = checked(y * int32(capture.RowBytes) + x * 4)
                if capture.Pixels[index] < uint8(80) &&
                    capture.Pixels[index + 1] < uint8(80) &&
                    capture.Pixels[index + 2] < uint8(80) {
                    ink++
                }
            }
        }
        Require(ink > 50, "page text was not uploaded and painted")
        let second = Pump(window, window.RenderOffscreenAsync(Page(240, 180), options, CancellationToken.None, capture))
        Require(
            second.Status == OffscreenRenderStatus.Success && second.Capture != nil && object.ReferenceEquals(
                capture.Pixels,
                second.Capture!!.Pixels
            ),
            "page reuse status: " + second.Status.ToString() + " " + second.Error
        )
        let limited = Pump(
            window,
            window.RenderOffscreenAsync(
                Page(240, 180),
                OffscreenRenderOptions(240f, 180f, 480, 360, Color.Rgb(255, 255, 255), 1024),
                CancellationToken.None
            )
        )
        Require(limited.Status == OffscreenRenderStatus.BudgetExceeded, "page memory limit was not reported")
        using let cancelled = CancellationTokenSource()
        cancelled.Cancel()
        let cancelledPage = window.RenderOffscreenAsync(Page(240, 180), options, cancelled.Token).GetAwaiter().GetResult()
        Require(cancelledPage.Status == OffscreenRenderStatus.Cancelled, "cancelled page was accepted")
        using let pdf = MemoryStream()
        let document = Document()
        let printed = Pump(
            window,
            Printing.ExportPdfAsync(window, document,
                PrintPageSettings{WidthPoints: 180, HeightPoints: 135, DpiX: 144, DpiY: 144}, pdf)
        )
        Require(printed.Status == PrintStatus.Exported, "PDF status: " + printed.Status.ToString() + " " + printed.Error)
        let text = Encoding.Latin1.GetString(pdf.ToArray())
        Require(
            document.Created == 2 && text.Contains("/Count 2") && text.Contains("/MediaBox [0 0 180 135]") && text.EndsWith(
                "%%EOF\n",
                StringComparison.Ordinal
            ),
            "PDF page structure is incomplete"
        )
        if args.Length != 0 {
            File.WriteAllBytes(args[0], pdf.ToArray())
        }
        using let a4 = MemoryStream()
        let fullSize = Pump(
            window,
            Printing.ExportPdfAsync(window, Document(),
                PrintPageSettings{WidthPoints: 595.28, HeightPoints: 841.89, LeftPoints: 36, TopPoints: 36,
                    RightPoints: 36, BottomPoints: 36, DpiX: 300, DpiY: 300}, a4)
        )
        Require(
            fullSize.Status == PrintStatus.Exported,
            "A4 PDF status: " + fullSize.Status.ToString() + " " + fullSize.Error
        )
        if args.Length != 0 {
            File.WriteAllBytes(args[0] + ".a4.pdf", a4.ToArray())
        }
        let owner = Pump(window, window.AcquireNativeDialogOwnerAsync(CancellationToken.None))
        if owner.Status == NativeDialogOwnerStatus.Success && owner.Owner != nil {
            Require(window.IsInputBlocked, "native dialog lease did not block owner input")
            owner.Owner!!.Dispose()
            Require(!window.IsInputBlocked, "native dialog lease did not restore owner input")
        } else {
            Require(owner.Status == NativeDialogOwnerStatus.Unsupported, "unexpected native dialog owner status")
        }
        Console.WriteLine(
            "printing: 2 PDF pages at 300 DPI A4, independent 480x360 output, $ink text pixels, reused output, bounded memory"
        )
    } finally {
        window.RequestClose()
        let deadline = Stopwatch.StartNew()
        while window.IsOpen && deadline.Elapsed < TimeSpan.FromSeconds(20) {
            window.Pump(0.0)
        }
        Require(!window.IsOpen, "owner did not close")
    }
}
