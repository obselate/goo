package GooTextOutputProof

import Android.App
import Android.Content.PM
import Android.Util
import Goo
import Goo.Android
import Goo.Printing
import Goo.RichText
import Goo.SpellCheck
import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks

@Activity(Name = "org.goo.textoutputproof.MainActivity", Label = "Goo text output proof", MainLauncher = true, Exported = true, ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density | ConfigChanges.KeyboardHidden)
class MainActivity : GooActivity {
    private var started bool
    internal var paused bool

    protected override func CreateWindow() Window -> Window{Root: Page(240, 180, "Text output proof")}

    protected override func OnResume() {
        base.OnResume()
        paused = false
        if started { return }
        started = true
        GooView.PostDelayed(RunProof, 500)
    }

    protected override func OnPause() {
        paused = true
        base.OnPause()
    }

    private async func RunProof() void {
        try {
            using let deadline = CancellationTokenSource(TimeSpan.FromSeconds(45))
            let service = AndroidSpellingService(this)
            let document = TextDocument("🙂 helllo")
            let snapshot = document.Snapshot()
            let checkedRange = TextRange(3, 6)
            let checkedText = await service.CheckAsync(snapshot, checkedRange, "en-US", deadline.Token)
            Require(checkedText.Status == SpellingStatus.Success && checkedText.Version == snapshot.Version
                && checkedText.Language == "en-US", "Android checker returned an invalid request result")
            for error in checkedText.Errors {
                Require(error.Range.Start >= checkedRange.Start && error.Range.Length > 0
                    && error.Range.Start + error.Range.Length <= checkedRange.Start + checkedRange.Length,
                    "Android checker lost its UTF-16 source range")
                Require(snapshot.GetText(error.Range) == error.Word, "Android checker changed the source word")
            }
            let suggested = await service.SuggestAsync(snapshot, checkedRange, "en-US", deadline.Token)
            Require(suggested.Status == SpellingStatus.Success && suggested.Version == snapshot.Version
                && suggested.Range == checkedRange && suggested.Word == "helllo" && suggested.Values.Count <= 16,
                "Android suggestion callback changed its request context")
            Log.Info("GooTextOutputProof", "PASS: SpellCheckerSession callbacks, ${checkedText.Errors.Count} native marks and ${suggested.Values.Count} native suggestions")
            await CheckRichClipboard(deadline.Token)
            let printed = await AndroidPrinting(this).ShowDialogAsync(GooView.Window, Document(this), "Goo text output proof")
            Require(printed.Status == PrintStatus.Submitted, "Android print result: " + printed.Status.ToString() + " " + printed.Error)
            Require(PagesCreated >= 2, "PrintManager did not render two pages")
            Printed = printed
            Log.Info("GooTextOutputProof", "PASS: PrintManager accepted two raster PDF pages, source paused during page creation=$PausedPage")
        } catch (error Exception) {
            Failure = error.ToString()
            Log.Error("GooTextOutputProof", Failure)
        }
    }

    private async func CheckRichClipboard(cancellation CancellationToken) Task {
        using let controller = TextEditorController(TextDocument("rich 🙂"))
        using let layer = TextPresentationLayer(controller.Document)
        layer.SetStyle("bold", TextRange(0, 7), Style{FontWeight: 700})
        using let clipboard = RichTextClipboard(GooView.Window, controller, layer)
        controller.Selection = TextSelection(TextPosition(0, TextAffinity.Upstream), TextPosition(7, TextAffinity.Downstream))
        let copied = await clipboard.CopyAsync(cancellation)
        Require(copied.Status == RichTextStatus.Success, "Android rich Copy: " + copied.Status.ToString() + " " + copied.Error)
        let data = await GooView.Window.ReadClipboardDataAsync([]string{"text/html", "text/rtf", "text/plain;charset=utf-8"})
        Require(data.Status == ClipboardReadStatus.Success && data.Data.Representations.Count == 3,
            "Android native clipboard lost rich alternatives")
        Require(controller.Execute(TextCommand(TextCommandKind.Insert, "before", false)), "Android editor did not replace selection")
        for contentType in []string{"text/html", "text/rtf"} {
            let representation = data.Data.Representations.Single(item -> item.ContentType == contentType)
            let written = await GooView.Window.WriteClipboardAsync(TransferData([]TransferRepresentation{representation}, []Uri{}), ClipboardIntent.Copy)
            Require(written.Status == DataTransferStatus.Success, "Android " + contentType + " publication failed: " + written.Error)
            controller.Selection = TextSelection(TextPosition(0, TextAffinity.Upstream),
                TextPosition(controller.Document.Length, TextAffinity.Downstream))
            let pasted = await clipboard.PasteAsync(cancellation)
            Require(pasted.Status == RichTextStatus.Success && controller.Document.GetText() == "rich 🙂",
                "Android " + contentType + " Paste: " + pasted.Status.ToString() + " " + pasted.Error)
            let styles = layer.GetStyles()
            for offset in 0 ... (controller.Document.Length - 1) {
                var weight float64 = 400
                for span in styles {
                    if span.Range.Start <= offset && offset < span.Range.Start + span.Range.Length
                        && span.Style.TryGetTextStyle(out let properties) && properties.FontWeight is float64 explicitWeight {
                        weight = explicitWeight
                    }
                }
                Require(weight == 700, "Android $contentType lost bold at $offset: weight $weight, spans ${styles.Count}")
            }
            Require(controller.Document.Undo() && controller.Document.GetText() == "before",
                "Android " + contentType + " did not undo as one edit")
        }
        Log.Info("GooTextOutputProof", "PASS: native Android rich Copy, HTML-only and RTF-only Paste, Unicode, bold styles and atomic undo")
    }

    private class Document(source MainActivity) : IPrintDocument {
        public func Paginate(settings PrintPageSettings) PrintLayoutResult -> PrintLayoutResult{Status: PrintLayoutStatus.Ready, PageCount: 2, Error: ""}

        public func CreatePage(index int32, settings PrintPageSettings) Cell {
            MainActivity.PausedPage |= source.paused
            Interlocked.Increment(ref MainActivity.PagesCreated)
            return Page(int32(settings.WidthPoints * 96 / 72), int32(settings.HeightPoints * 96 / 72), "Printed page " + (index + 1).ToString())
        }
    }

    shared {
        internal var Printed PrintResult?
        internal var Failure string = ""
        internal var PausedPage bool
        internal var PagesCreated int32

        internal func Require(condition bool, error string) {
            if !condition { throw InvalidOperationException(error) }
        }
    }
}

internal class Page(width int32, height int32, label string) : Cell {
    override func Build() Blob -> Container{
        Width: width,
        Height: height,
        BackgroundColor: Color.Rgb(20, 160, 60),
        Children: List[Blob]{Text{Content: label, FontSize: 20, Color: Color.Black}}
    }
}
