using Android.App;
using Android.Content.PM;
using Android.Util;
using Goo;
using Goo.Android;
using Goo.Printing;
using Goo.RichText;
using Goo.SpellCheck;

namespace GooTextOutputProof;

[Activity(Name = "org.goo.textoutputproof.MainActivity", Label = "Goo text output proof", MainLauncher = true, Exported = true,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout
        | ConfigChanges.SmallestScreenSize | ConfigChanges.Density | ConfigChanges.KeyboardHidden)]
public sealed class MainActivity : GooActivity
{
    internal static volatile PrintResult? Printed;
    internal static volatile string Failure = "";
    internal static volatile bool PausedPage;
    internal static int PagesCreated;
    private bool started;
    private bool paused;

    protected override Goo.Window CreateWindow() => new() { Root = new Page(240, 180, "Text output proof") };

    protected override void OnResume()
    {
        base.OnResume();
        paused = false;
        if (started) return;
        started = true;
        GooView.PostDelayed(RunProof, 500);
    }

    protected override void OnPause()
    {
        paused = true;
        base.OnPause();
    }

    private async void RunProof()
    {
        try
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(45));
            var service = new AndroidSpellingService(this);
            var document = new TextDocument("🙂 helllo");
            var snapshot = document.Snapshot();
            var range = new TextRange(3, 6);
            var checkedText = await service.CheckAsync(snapshot, range, "en-US", deadline.Token);
            Require(checkedText.Status == SpellingStatus.Success && checkedText.Version == snapshot.Version
                && checkedText.Language == "en-US", "Android checker returned an invalid request result");
            foreach (var error in checkedText.Errors)
            {
                Require(error.Range.Start >= range.Start && error.Range.Length > 0
                    && error.Range.Start + error.Range.Length <= range.Start + range.Length,
                    "Android checker lost its UTF-16 source range");
                Require(snapshot.GetText(error.Range) == error.Word, "Android checker changed the source word");
            }
            var suggested = await service.SuggestAsync(snapshot, range, "en-US", deadline.Token);
            Require(suggested.Status == SpellingStatus.Success && suggested.Version == snapshot.Version
                && suggested.Range == range && suggested.Word == "helllo" && suggested.Values.Count <= 16,
                "Android suggestion callback changed its request context");
            Log.Info("GooTextOutputProof", $"PASS: SpellCheckerSession callbacks, {checkedText.Errors.Count} native marks and {suggested.Values.Count} native suggestions");
            await CheckRichClipboard(deadline.Token);
            var printed = await new AndroidPrinting(this).ShowDialogAsync(GooView.Window, new Document(this), "Goo text output proof");
            Require(printed.Status == PrintStatus.Submitted, "Android print result: " + printed.Status + " " + printed.Error);
            Require(PagesCreated >= 2, "PrintManager did not render two pages");
            Printed = printed;
            Log.Info("GooTextOutputProof", $"PASS: PrintManager accepted two raster PDF pages, source paused during page creation={PausedPage}");
        }
        catch (Exception error)
        {
            Failure = error.ToString();
            Log.Error("GooTextOutputProof", Failure);
        }
    }

    private async Task CheckRichClipboard(CancellationToken cancellation)
    {
        using var controller = new TextEditorController(new TextDocument("rich 🙂"));
        using var layer = new TextPresentationLayer(controller.Document);
        layer.SetStyle("bold", new TextRange(0, 7), new Style { FontWeight = 700 });
        using var clipboard = new RichTextClipboard(GooView.Window, controller, layer);
        controller.Selection = new TextSelection(new TextPosition(0, TextAffinity.Upstream),
            new TextPosition(7, TextAffinity.Downstream));
        var copied = await clipboard.CopyAsync(cancellation);
        Require(copied.Status == RichTextStatus.Success, "Android rich Copy: " + copied.Status + " " + copied.Error);
        var data = await GooView.Window.ReadClipboardDataAsync(["text/html", "text/rtf", "text/plain;charset=utf-8"]);
        Require(data.Status == ClipboardReadStatus.Success && data.Data.Representations.Count == 3,
            "Android native clipboard lost rich alternatives");
        Require(controller.Execute(new TextCommand(TextCommandKind.Insert, "before", false)), "Android editor did not replace selection");
        foreach (var type in new[] { "text/html", "text/rtf" })
        {
            var representation = data.Data.Representations.Single(item => item.ContentType == type);
            var written = await GooView.Window.WriteClipboardAsync(new TransferData([representation], []), ClipboardIntent.Copy);
            Require(written.Status == DataTransferStatus.Success, "Android " + type + " publication failed: " + written.Error);
            controller.Selection = new TextSelection(new TextPosition(0, TextAffinity.Upstream),
                new TextPosition(controller.Document.Length, TextAffinity.Downstream));
            var pasted = await clipboard.PasteAsync(cancellation);
            Require(pasted.Status == RichTextStatus.Success && controller.Document.GetText() == "rich 🙂",
                "Android " + type + " Paste: " + pasted.Status + " " + pasted.Error);
            var styles = layer.GetStyles();
            Require(styles.Count == 1 && styles[0].Style.TryGetTextStyle(out var properties) && properties.FontWeight == 700,
                "Android " + type + " lost bold formatting");
            Require(controller.Document.Undo() && controller.Document.GetText() == "before",
                "Android " + type + " did not undo as one edit");
        }
        Log.Info("GooTextOutputProof", "PASS: native Android rich Copy, HTML-only and RTF-only Paste, Unicode, bold styles and atomic undo");
    }

    private sealed class Document(MainActivity source) : IPrintDocument
    {
        public PrintLayoutResult Paginate(PrintPageSettings settings) => new(PrintLayoutStatus.Ready, 2);

        public Cell CreatePage(int index, PrintPageSettings settings)
        {
            PausedPage |= source.paused;
            Interlocked.Increment(ref PagesCreated);
            return new Page((float)(settings.WidthPoints * 96 / 72), (float)(settings.HeightPoints * 96 / 72), "Printed page " + (index + 1));
        }
    }

    internal static void Require(bool condition, string error)
    {
        if (!condition) throw new InvalidOperationException(error);
    }
}

internal sealed class Page(float width, float height, string label) : Cell
{
    public override Blob Build() => new Container
    {
        Width = width,
        Height = height,
        BackgroundColor = Color.Rgb(20, 160, 60),
        Children = new List<Blob> { new Text { Content = label, FontSize = 20, Color = Color.Black } }
    };
}
