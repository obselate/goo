using System.Diagnostics;
using System.Text;
using Goo;
using Goo.Printing;

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
    var owner = Pump(window, window.AcquireNativeDialogOwnerAsync(CancellationToken.None));
    if (owner.Status == NativeDialogOwnerStatus.Success && owner.Owner != null)
    {
        Require(window.IsInputBlocked, "native dialog lease did not block owner input");
        owner.Owner.Dispose();
        Require(!window.IsInputBlocked, "native dialog lease did not restore owner input");
    }
    else
        Require(owner.Status == NativeDialogOwnerStatus.Unsupported, "unexpected native dialog owner status");
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

static void Require(bool condition, string error)
{
    if (!condition)
        throw new InvalidOperationException(error);
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
