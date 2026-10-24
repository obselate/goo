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

internal class Page : Cell {
    override func Build() Blob {
        let root = Container{Width: 240, Height: 180, BackgroundColor: Color.Rgb(20, 160, 60)}
        root.Add(Text{Content: "Offscreen", FontSize: 20, Color: Color.Black})
        return root
    }
}

let owner = Window{Root: Page(), Width: 96, Height: 96, Title: "Offscreen proof"}.Open()

try {
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
} finally {
    owner.RequestClose()
    let timer = Stopwatch.StartNew()
    while owner.IsOpen && timer.Elapsed < TimeSpan.FromSeconds(20) {
        owner.Pump(0.0)
    }
    Require(!owner.IsOpen, "owner did not close")
}
