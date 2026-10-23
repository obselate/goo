using Android.App;
using Android.Content.PM;
using Android.Util;
using Goo;
using Goo.Android;
using Goo.Printing;
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
