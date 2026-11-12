import Goo
import System
import System.Diagnostics
import System.Threading
import System.Threading.Tasks

func Require(condition bool, error string) {
    if !condition {
        throw InvalidOperationException(error)
    }
}

func Pump[T](session OffscreenRenderSession, pending Task[T]) T {
    let timer = Stopwatch.StartNew()
    while !pending.IsCompleted && timer.Elapsed < TimeSpan.FromSeconds(30) {
        session.Service()
        Thread.Sleep(1)
    }
    Require(pending.IsCompleted, "offscreen session did not complete without the presentation pump")
    return pending.GetAwaiter().GetResult()
}

internal class EdgePage : Cell {
    override func Build() Blob -> Container{
        Width: 100, Height: 60, BackgroundColor: Color.White,
        Container{Position: PositionType.Absolute, Left: 7, Top: 7, Width: 40, Height: 20, BorderWidth: 1, BorderColor: Color.Black},
    }
}

internal class Page : Cell {
    override func Build() Blob {
        let root = Container{Width: 240, Height: 180, BackgroundColor: Color.Rgb(20, 160, 60)}
        root.Add(Text{Content: "Offscreen", FontSize: 20, Color: Color.Black})
        return root
    }
}

internal class FailingPage : Cell {
    override func Build() Blob {
        throw InvalidOperationException("Fixture page build failed")
    }
}

internal class SessionOwner : Cell, IDisposable {
    internal var Session OffscreenRenderSession?
    internal var Pending Task[OffscreenRenderResult]?
    internal var Disposed bool
    override func Build() Blob -> Container{}

    public func Dispose() {
        Session?.Dispose()
        Disposed = true
    }
}

func RunAutomaticSessionSmoke() {
    let owner = Window{Root: Page(), Width: 96, Height: 96, InitiallyVisible: false, Title: "Offscreen automatic service"}.Open()
    using let session = owner.CreateOffscreenSession().Session!!
    let options = OffscreenRenderOptions(240f, 180f, 480, 360, Color.White, 134217728)
    let pending = session.RenderAsync(Page(), options, CancellationToken.None)
    var completed = false
    var timedOut = false
    var closing Task[OffscreenRenderResult]?
    let timeout = owner.SetTimeout(() -> {
        timedOut = true
        owner.RequestClose()
    }, 15000.0)
    pending.ContinueWith((result Task[OffscreenRenderResult]) -> {
        owner.Post(() -> {
            let rendered = result.GetAwaiter().GetResult()
            Require(rendered.Status == OffscreenRenderStatus.Success && rendered.Capture != nil, "automatic session render failed")
            let capture = rendered.Capture!!
            let corner = 330 * int32(capture.RowBytes) + 450 * 4
            Require(capture.Width == 480u && capture.Height == 360u
                && capture.Pixels[corner + 1] > uint8(140) && capture.Pixels[corner + 2] < uint8(100),
                "automatic session pixels are incorrect")
            completed = true
            timeout.Dispose()
            Console.WriteLine("offscreen: automatic completion with correct pixels without Service")
            owner.OnClosing = () -> {
                closing = session.RenderAsync(Page(), options, CancellationToken.None)
                Require(!closing.IsCompleted, "automatic close regression requires a pending page")
                return true
            }
            owner.RequestClose()
        })
    })
    Application.Run(owner)
    Require(!timedOut && completed, "window-created session timed out without Service")
    Require(closing != nil && closing.IsCompleted
        && closing.GetAwaiter().GetResult().Status == OffscreenRenderStatus.Cancelled,
        "window close did not drain the caller-owned page")
    Require(session.RenderAsync(Page(), options, CancellationToken.None).GetAwaiter().GetResult().Status
        == OffscreenRenderStatus.Cancelled, "closed source session was disposed instead of cancelled")
    Console.WriteLine("offscreen: close cancelled and drained caller-owned session without disposing it")
}

if Environment.GetEnvironmentVariable("GOO_RENDER_OUT") != nil
    || Environment.GetEnvironmentVariable("GOO_RENDER_LIST") == "1" {
    RunRenderCommandSmoke()
    return
}

RunAutomaticSessionSmoke()
if Environment.GetEnvironmentVariable("GOO_OFFSCREEN_AUTO_ONLY") == "1" { return }

let root = SessionOwner()
let owner = Window{Root: root, Width: 96, Height: 96, Title: "Offscreen proof"}.Open()

try {
    owner.Pump(0.0)
    let options = OffscreenRenderOptions(240f, 180f, 480, 360, Color.White, 134217728)
    let creation = owner.CreateOffscreenSession()
    Require(creation.Status == OffscreenRenderStatus.Success && creation.Session != nil, "session creation failed")
    using let session = creation.Session!!
    var rejected = false
    try {
        let _ = session.RenderAsync(
            Page(),
            OffscreenRenderOptions(float32(int32.MaxValue), 180f, 480, 360, Color.White, 134217728),
            CancellationToken.None
        )
    } catch (ArgumentOutOfRangeException) {
        rejected = true
    }
    Require(rejected, "a logical viewport outside the layout integer range was accepted")
    for render in []Func[Task[OffscreenRenderResult]]{
        () -> session.RenderAsync(owner.Root!!, options, CancellationToken.None),
        () -> owner.RenderOffscreenAsync(owner.Root!!, options, CancellationToken.None)
    } {
        rejected = false
        try {
            let _ = render()
        } catch (error InvalidOperationException) {
            rejected = error.Message ==
                "The Cell is attached to a window. Offscreen rendering requires an unattached Cell."
        }
        Require(rejected, "an attached Cell was not rejected with its cause")
    }
    let failed = Pump(session, session.RenderAsync(FailingPage(), options, CancellationToken.None))
    Require(
        failed.Status == OffscreenRenderStatus.Failed && failed.Error == "Fixture page build failed",
        "offscreen failure lost its cause"
    )
    let first = Pump(session, session.RenderAsync(Page(), options, CancellationToken.None))
    Require(
        first.Status == OffscreenRenderStatus.Success && first.Capture != nil,
        "session render failed: " + first.Status.ToString()
    )
    let capture = first.Capture!!
    Require(
        capture.Width == uint32(480) && capture.Height == uint32(360) && owner.Width == 96,
        "offscreen size changed its owner"
    )
    let corner = 330 * int32(capture.RowBytes) + 450 * 4
    Require(
        capture.Pixels[corner + 1] > uint8(140) && capture.Pixels[corner + 2] < uint8(100),
        "independent page pixels are missing"
    )
    let edges = Pump(
        session,
        session.RenderAsync(EdgePage(), OffscreenRenderOptions(100f, 60f, 150, 90, Color.White, 134217728), CancellationToken.None)
    )
    Require(edges.Status == OffscreenRenderStatus.Success && edges.Capture != nil, "fractional scale render failed")
    let edgeRow = 25 * int32(edges.Capture!!.RowBytes)
    Require(
        edges.Capture!!.Pixels[edgeRow + 10 * 4] == uint8(255) && edges.Capture!!.Pixels[edgeRow + 11 * 4] == uint8(0),
        "a 1 px border at logical x 7 was not snapped to device pixel 11 at scale 1.5: "
        + edges.Capture!!.Pixels[edgeRow + 10 * 4].ToString() + "/" + edges.Capture!!.Pixels[edgeRow + 11 * 4].ToString()
    )
    let second = Pump(session, session.RenderAsync(Page(), options, CancellationToken.None, capture))
    Require(
        second.Status == OffscreenRenderStatus.Success && object.ReferenceEquals(
            capture.Pixels,
            second.Capture?.Pixels
        ),
        "session pixels were not reused"
    )
    let limited = Pump(
        session,
        session.RenderAsync(
            Page(),
            OffscreenRenderOptions(240f, 180f, 480, 360, Color.White, 1024),
            CancellationToken.None
        )
    )
    Require(limited.Status == OffscreenRenderStatus.BudgetExceeded, "page allocation limit was not reported")
    let closing = owner.CreateOffscreenSession().Session!!
    let cancelled = closing.RenderAsync(Page(), options, CancellationToken.None)
    closing.Dispose()
    Require(
        cancelled.GetAwaiter().GetResult().Status == OffscreenRenderStatus.Cancelled,
        "disposing a pending session did not cancel its page"
    )
    Console.WriteLine(
        "offscreen: independent page, owner-thread service, shared runtime lease, reusable pixels, allocation limit, safe cancellation"
    )
    root.Session = owner.CreateOffscreenSession().Session!!
    root.Pending = root.Session!!.RenderAsync(Page(), options, CancellationToken.None)
    Require(!root.Pending!!.IsCompleted, "close regression requires a pending page")
} finally {
    owner.RequestClose()
    let timer = Stopwatch.StartNew()
    while owner.IsOpen && timer.Elapsed < TimeSpan.FromSeconds(20) {
        owner.Pump(0.0)
    }
    Require(!owner.IsOpen, "owner did not close")
}
Require(root.Disposed, "window close did not dispose its Cell")
Require(
    root.Pending!!.GetAwaiter().GetResult().Status == OffscreenRenderStatus.Cancelled,
    "window close did not cancel the Cell-owned pending page"
)
Console.WriteLine("offscreen: pending page disposed from Cell during window close")
