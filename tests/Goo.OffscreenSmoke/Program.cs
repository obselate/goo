using System.Diagnostics;
using Goo;

var owner = new Window { Root = new Page(), Width = 96, Height = 96, Title = "Offscreen proof" }.Open();
try
{
    var options = new OffscreenRenderOptions(240, 180, 480, 360, Color.White, 134217728);
    var creation = owner.CreateOffscreenSession();
    Require(creation.Status == OffscreenRenderStatus.Success && creation.Session != null, "session creation failed");
    using var session = creation.Session!;
    var rejected = false;
    try { _ = session.RenderAsync(new Page(), new OffscreenRenderOptions((float)int.MaxValue, 180, 480, 360, Color.White, 134217728), CancellationToken.None); }
    catch (ArgumentOutOfRangeException) { rejected = true; }
    Require(rejected, "a logical viewport outside the layout integer range was accepted");
    var first = Pump(session, session.RenderAsync(new Page(), options, CancellationToken.None));
    Require(first.Status == OffscreenRenderStatus.Success && first.Capture != null, "session render failed: " + first.Status);
    var capture = first.Capture!;
    Require(capture.Width == 480 && capture.Height == 360 && owner.Width == 96, "offscreen size changed its owner");
    var corner = 330 * (int)capture.RowBytes + 450 * 4;
    Require(capture.Pixels[corner + 1] > 140 && capture.Pixels[corner + 2] < 100, "independent page pixels are missing");
    var second = Pump(session, session.RenderAsync(new Page(), options, CancellationToken.None, capture));
    Require(second.Status == OffscreenRenderStatus.Success && ReferenceEquals(capture.Pixels, second.Capture?.Pixels), "session pixels were not reused");
    var limited = Pump(session, session.RenderAsync(new Page(), new OffscreenRenderOptions(240, 180, 480, 360, Color.White, 1024), CancellationToken.None));
    Require(limited.Status == OffscreenRenderStatus.BudgetExceeded, "page allocation limit was not reported");
    var closing = owner.CreateOffscreenSession().Session!;
    var cancelled = closing.RenderAsync(new Page(), options, CancellationToken.None);
    closing.Dispose();
    Require(cancelled.GetAwaiter().GetResult().Status == OffscreenRenderStatus.Cancelled, "disposing a pending session did not cancel its page");
    Console.WriteLine("offscreen: independent page, owner-thread service, shared runtime lease, reusable pixels, allocation limit, safe cancellation");
}
finally
{
    owner.RequestClose();
    var timer = Stopwatch.StartNew();
    while (owner.IsOpen && timer.Elapsed < TimeSpan.FromSeconds(20)) owner.Pump(0);
    Require(!owner.IsOpen, "owner did not close");
}

static T Pump<T>(OffscreenRenderSession session, Task<T> pending)
{
    var timer = Stopwatch.StartNew();
    while (!pending.IsCompleted && timer.Elapsed < TimeSpan.FromSeconds(30)) { session.Service(); Thread.Sleep(1); }
    Require(pending.IsCompleted, "offscreen session did not complete without the presentation pump");
    return pending.GetAwaiter().GetResult();
}

static void Require(bool condition, string error)
{
    if (!condition) throw new InvalidOperationException(error);
}

sealed class Page : Cell
{
    public override Blob Build()
    {
        var root = new Container { Width = 240, Height = 180, BackgroundColor = Color.Rgb(20, 160, 60) };
        root.Add(new Text { Content = "Offscreen", FontSize = 20, Color = Color.Black });
        return root;
    }
}
