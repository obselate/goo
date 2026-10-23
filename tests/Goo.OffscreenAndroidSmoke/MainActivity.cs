using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Util;
using Goo;
using Goo.Android;

namespace GooOffscreenProof;

[Activity(Label = "Goo offscreen proof", MainLauncher = true, Exported = true,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout
        | ConfigChanges.SmallestScreenSize | ConfigChanges.Density | ConfigChanges.KeyboardHidden)]
public sealed class MainActivity : GooActivity
{
    internal static MainActivity? Source;
    internal static OffscreenRenderSession? Session;
    internal bool Paused;
    private bool started;

    protected override Goo.Window CreateWindow() => new() { Root = new Page() };
    internal bool HasSurface => GooView.Holder?.Surface?.IsValid == true;

    protected override void OnResume()
    {
        base.OnResume();
        Paused = false;
        if (started) return;
        started = true;
        GooView.PostDelayed(StartProof, 500);
    }

    private void StartProof()
    {
        var result = GooView.Window.CreateOffscreenSession();
        if (result.Status != OffscreenRenderStatus.Success || result.Session == null)
            throw new InvalidOperationException("session creation: " + result.Status);
        Source = this;
        Session = result.Session;
        StartActivity(new Intent(this, typeof(PageActivity)));
    }

    protected override void OnPause()
    {
        Paused = true;
        base.OnPause();
    }
}

[Activity(Label = "Offscreen page proof", Exported = false)]
public sealed class PageActivity : Activity
{
    private readonly Handler handler = new(Looper.MainLooper!);

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        SetContentView(new Android.Widget.TextView(this) { Text = "Rendering a page with no Goo surface" });
        handler.PostDelayed(RunProof, 750);
    }

    private async void RunProof()
    {
        try
        {
            var source = MainActivity.Source!;
            using var session = MainActivity.Session!;
            var deadline = System.Diagnostics.Stopwatch.StartNew();
            while ((!source.Paused || source.HasSurface) && deadline.Elapsed < TimeSpan.FromSeconds(10))
                await Task.Delay(20);
            Require(source.Paused && !source.HasSurface, "source activity did not lose its surface");
            var task = session.RenderAsync(new Page(), new OffscreenRenderOptions(240, 180, 480, 360, Color.White, 134217728), CancellationToken.None);
            deadline.Restart();
            while (!task.IsCompleted && deadline.Elapsed < TimeSpan.FromSeconds(30))
            {
                session.Service();
                await Task.Delay(1);
            }
            Require(task.IsCompleted, "detached page render did not complete");
            var rendered = await task;
            Require(rendered.Status == OffscreenRenderStatus.Success && rendered.Capture != null, "detached render: " + rendered.Status);
            var image = rendered.Capture!;
            var pixel = 330 * (int)image.RowBytes + 450 * 4;
            Require(image.Width == 480 && image.Height == 360 && image.Pixels[pixel + 1] > 140, "detached page pixels are missing");
            var report = "PASS: paused Android activity, destroyed presentation surface, retained Vulkan renderer, 480x360 page pixels";
            File.WriteAllText(Path.Combine(FilesDir!.AbsolutePath, "offscreen-proof.txt"), report);
            Log.Info("GooOffscreenProof", report);
            Finish();
        }
        catch (Exception error)
        {
            File.WriteAllText(Path.Combine(FilesDir!.AbsolutePath, "offscreen-proof.txt"), "FAIL: " + error);
            Log.Error("GooOffscreenProof", error.ToString());
            throw;
        }
    }

    private static void Require(bool condition, string error)
    {
        if (!condition) throw new InvalidOperationException(error);
    }
}

internal sealed class Page : Cell
{
    public override Blob Build() => new Container
    {
        Width = 240,
        Height = 180,
        BackgroundColor = Color.Rgb(20, 160, 60),
        Children = new List<Blob> { new Text { Content = "Offscreen Android", FontSize = 20, Color = Color.Black } }
    };
}
