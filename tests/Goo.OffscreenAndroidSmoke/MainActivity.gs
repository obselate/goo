package GooOffscreenProof

import Android.App
import Android.Content
import Android.Content.PM
import Android.OS
import Android.Util
import Android.Widget
import Goo
import Goo.Android
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Threading
import System.Threading.Tasks

@Activity(
    Name = "org.goo.offscreenproof.MainActivity",
    Label = "Goo offscreen proof",
    MainLauncher = true,
    Exported = true,
    ConfigurationChanges = ConfigChanges.Density | ConfigChanges.SmallestScreenSize | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout | ConfigChanges.Orientation | ConfigChanges.KeyboardHidden
)
class MainActivity : GooActivity {
    internal var Paused bool
    internal var Session OffscreenRenderSession?
    private var started bool
    protected override func CreateWindow() Window -> Window{Root: Page()}
    internal prop HasSurface bool -> GooView.Holder?.Surface?.IsValid == true

    protected override func OnResume() {
        base.OnResume()
        Paused = false
        if started {
            return
        }
        GooView.PostDelayed(StartProof, 500)
    }

    private func StartProof() {
        if started || Paused || IsDestroyed || IsFinishing {
            return
        }
        started = true
        let result = GooView.Window.CreateOffscreenSession()
        if result.Status != OffscreenRenderStatus.Success || result.Session == nil {
            throw InvalidOperationException("session creation: " + result.Status.ToString())
        }
        Source = this
        Session = result.Session
        StartActivity(Intent(this, typeof(PageActivity)))
    }

    protected override func OnPause() {
        Paused = true
        GooView.RemoveCallbacks(StartProof)
        base.OnPause()
    }

    protected override func OnDestroy() {
        GooView.RemoveCallbacks(StartProof)
        Session?.Dispose()
        Session = nil
        if object.ReferenceEquals(Source, this) {
            Source = nil
        }
        base.OnDestroy()
    }

    shared {
        internal var Source MainActivity?
    }
}

@Activity(Label = "Offscreen page proof", Exported = false)
class PageActivity : Android.App.Activity {
    private let handler Handler = Handler(Looper.MainLooper!!)
    private var source MainActivity?
    private var session OffscreenRenderSession?

    protected override func OnCreate(savedInstanceState Bundle?) {
        base.OnCreate(savedInstanceState)
        guard let owner = MainActivity.Source, let pending = owner.Session else {
            Finish()
            return
        }
        source = owner
        session = pending
        owner.Session = nil
        SetContentView(TextView(this){Text = "Rendering a page with no Goo surface"})
        handler.PostDelayed(RunProof, 750)
    }

    protected override func OnDestroy() {
        handler.RemoveCallbacksAndMessages(nil)
        session?.Dispose()
        session = nil
        source = nil
        base.OnDestroy()
    }

    private async func RunProof() void {
        guard let source = this.source, let pending = session else {
            return
        }
        this.source = nil
        session = nil
        try {
            using let session = pending
            let deadline = Stopwatch.StartNew()
            while !source.IsDestroyed && !IsDestroyed && (!source.Paused || source.HasSurface)
            && deadline.Elapsed < TimeSpan.FromSeconds(10) {
                await Task.Delay(20)
            }
            if source.IsDestroyed || IsDestroyed {
                Finish()
                return
            }
            Require(source.Paused && !source.HasSurface, "source activity did not lose its surface")
            let task = session.RenderAsync(
                Page(),
                OffscreenRenderOptions(240.0f, 180.0f, 480, 360, Color.White, 134217728),
                CancellationToken.None
            )
            deadline.Restart()
            while !source.IsDestroyed && !IsDestroyed && !task.IsCompleted
            && deadline.Elapsed < TimeSpan.FromSeconds(30) {
                session.Service()
                await Task.Delay(1)
            }
            if source.IsDestroyed || IsDestroyed {
                Finish()
                return
            }
            Require(task.IsCompleted, "detached page render did not complete")
            let rendered = await task
            Require(
                rendered.Status == OffscreenRenderStatus.Success && rendered.Capture != nil,
                "detached render: " + rendered.Status.ToString()
            )
            let image = rendered.Capture!!
            let pixel = 330 * int32(image.RowBytes) + 450 * 4
            Require(
                image.Width == uint32(480) && image.Height == uint32(360) && image.Pixels[pixel + 1] > uint8(140),
                "detached page pixels are missing"
            )
            let report = "PASS: paused Android activity, destroyed presentation surface, retained Vulkan renderer, 480x360 page pixels"
            File.WriteAllText(Path.Combine(FilesDir!!.AbsolutePath, "offscreen-proof.txt"), report)
            Log.Info("GooOffscreenProof", report)
            Finish()
        } catch (error Exception) {
            File.WriteAllText(Path.Combine(FilesDir!!.AbsolutePath, "offscreen-proof.txt"), "FAIL: " + error.ToString())
            Log.Error("GooOffscreenProof", error.ToString())
            rethrow
        }
    }

    shared {
        private func Require(condition bool, error string) {
            if !condition {
                throw InvalidOperationException(error)
            }
        }
    }
}

internal class Page : Cell {
    override func Build() Blob -> Container{
        Width: 240,
        Height: 180,
        BackgroundColor: Color.Rgb(20, 160, 60),
        Children: List[Blob]{Text{Content: "Offscreen Android", FontSize: 20, Color: Color.Black}}
    }
}
