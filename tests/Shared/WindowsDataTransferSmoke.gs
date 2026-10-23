package GooWindowsTransferFixture

import System
import System.Diagnostics
import System.IO
import System.Text
import System.Threading
import System.Runtime.ExceptionServices
import Goo

func WindowsTransferRequire(condition bool, message string) {
    if !condition { throw InvalidOperationException(message) }
}

func WindowsTransferExpected(directory string, files bool) TransferData {
    if files {
        return TransferData(Array.Empty[TransferRepresentation](), []Uri{
            Uri(Path.Combine(directory, "source-0.txt")), Uri(Path.Combine(directory, "source-1.txt"))})
    }
    let bytes = [1048576]uint8
    for i in 0 ... bytes.Length { bytes[i] = uint8(i % 256) }
    return TransferData([]TransferRepresentation{
        TransferRepresentation("text/plain;charset=utf-8", ReadOnlyMemory[uint8](Encoding.UTF8.GetBytes("native MIME transfer"))),
        TransferRepresentation("image/png", ReadOnlyMemory[uint8](File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "local-rgba.png")))),
        TransferRepresentation("application/x-goo-transfer-check", ReadOnlyMemory[uint8](bytes)),
        TransferRepresentation("application/x-goo-empty", ReadOnlyMemory[uint8].Empty)}, Array.Empty[Uri]())
}

class WindowsTransferTicker : Cell {
    internal var Ticks int32
    internal func Advance() {
        Ticks++
        Rebuild()
    }
    override func Build() Blob -> Text{Content: Ticks.ToString(), FontSize: 24}
}

class WindowsTransferScene : Cell {
    internal var Owner Window?
    internal var OnStart Action?
    internal var OnEnd Action?
    internal var EndCount int32
    internal var DropCount int32
    internal var Previews int32
    internal var Captured TransferData?
    private let expected TransferData
    private let outgoing bool
    private let effect DragEffect
    private let reject bool
    private let cancel bool
    private let files bool
    private let directory string

    internal init(expected TransferData, outgoing bool, effect DragEffect, reject bool, cancel bool, files bool, directory string) {
        this.expected = expected
        this.outgoing = outgoing
        this.effect = effect
        this.reject = reject
        this.cancel = cancel
        this.files = files
        this.directory = directory
    }

    override func Build() Blob -> Container{
            Width: Percent(100), Height: Percent(100), BackgroundColor: Color.Rgb(32, 56, 72),
            DragSource: if outgoing { DragSource(_ -> Begin(), e -> End(e)) } else { nil },
            DropTarget: if outgoing { nil } else { DropTarget(e -> Query(e), e -> Changed(e)) },
            Text{Content: if outgoing { "Drag from Goo" } else { "Drop into Goo" }, FontSize: 24, Color: Color.White}}

    private func Begin() DragData {
        OnStart?.Invoke()
        Console.WriteLine("start 0")
        return DragData("native transfer", DragEffect.Copy | DragEffect.Move){NativeData = expected}
    }

    private func End(e DragEndEvent) {
        EndCount++
        if cancel || reject {
            WindowsTransferRequire(e.Status == DataTransferStatus.Cancelled && e.Effect == DragEffect.None && !e.SourceRemovalRequired,
                "Canceled native source result changed")
        } else {
            WindowsTransferRequire(e.Status == DataTransferStatus.Success && e.Effect == effect, "Native source effect changed: " + e.Error)
            WindowsTransferRequire(e.SourceRemovalRequired == (!files && effect == DragEffect.Move), "Native source removal intent changed")
        }
        OnEnd?.Invoke()
        Console.WriteLine("source-end " + int32(e.Status).ToString() + " " + int32(e.Effect).ToString() + " " + if e.SourceRemovalRequired { "1" } else { "0" })
        Owner?.RequestClose()
    }

    private func Query(e DragEvent) DragEffect {
        if let drop = e.Data.Value as NativeDataDrop {
            return if !reject || drop.IsPreview { effect } else { DragEffect.None }
        }
        if e.Data.Value is NativeFileDrop { return DragEffect.Copy }
        return DragEffect.None
    }

    private func Changed(e DragEvent) {
        if let drop = e.Data.Value as NativeDataDrop {
            if drop.IsPreview {
                WindowsTransferRequire(drop.Data.Representations.Count == 0 && drop.Data.Uris.Count == 0, "Preview exposed final bytes")
                Previews++
                return
            }
            if e.Kind != DragEventKind.Drop { return }
            Captured = drop.Data
            Check(drop.Data)
        } else if let drop = e.Data.Value as NativeFileDrop {
            if drop.IsPreview {
                Previews++
                return
            }
            if e.Kind != DragEventKind.Drop { return }
            WindowsTransferRequire(drop.Paths.Count == 2, "Legacy native file count changed")
            for i in 0 ... drop.Paths.Count { ReceiveFile(drop.Paths[i], i) }
        } else { return }
        DropCount++
        Console.WriteLine("drop-complete " + int32(effect).ToString())
        Owner?.RequestClose()
    }

    internal func Check(data TransferData) {
        WindowsTransferRequire(data.Representations.Count == expected.Representations.Count && data.Uris.Count == expected.Uris.Count, "Native transfer item count changed")
        for i in 0 ... expected.Representations.Count {
            let actual = data.Representations[i]
            let wanted = expected.Representations[i]
            WindowsTransferRequire(actual.ContentType == wanted.ContentType && actual.Bytes.Span.SequenceEqual(wanted.Bytes.Span), "Native MIME bytes changed")
        }
        for i in 0 ... data.Uris.Count {
            WindowsTransferRequire(data.Uris[i] == expected.Uris[i], "Native document URI changed")
            if DropCount == 0 { ReceiveFile(data.Uris[i].LocalPath, i) }
        }
    }

    private func ReceiveFile(path string, index int32) {
        WindowsTransferRequire(File.ReadAllText(path) == "native file " + index.ToString(), "Native document contents changed")
        let destination = Path.Combine(directory, "destination-" + index.ToString() + ".txt")
        if effect == DragEffect.Move { File.Move(path, destination, true) }
        else { File.Copy(path, destination, true) }
    }
}

func RunWindowsDataTransferSmoke() {
    if Thread.CurrentThread.GetApartmentState() != ApartmentState.STA {
        var failure Exception?
        let thread = Thread(() -> {
            try { RunWindowsDataTransferSmoke() }
            catch (error Exception) { failure = error }
        })
        thread.IsBackground = true
        thread.SetApartmentState(ApartmentState.STA)
        thread.Start()
        if !thread.Join(TimeSpan.FromMinutes(2)) { throw InvalidOperationException("Native transfer smoke timed out") }
        if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
        return
    }
    let outgoing = Environment.GetEnvironmentVariable("GOO_TRANSFER_ROLE") == "source"
    let kind = Environment.GetEnvironmentVariable("GOO_TRANSFER_KIND") ?? "mime"
    let files = kind != "mime"
    let cancel = Environment.GetEnvironmentVariable("GOO_TRANSFER_CANCEL") == "1"
    let reject = Environment.GetEnvironmentVariable("GOO_TRANSFER_REJECT") == "1"
    let directory = Environment.GetEnvironmentVariable("GOO_TRANSFER_DIRECTORY")!!
    let effect = DragEffect(int32.Parse(Environment.GetEnvironmentVariable("GOO_TRANSFER_EFFECT")!!))
    let expected = WindowsTransferExpected(directory, files)
    let scene = WindowsTransferScene(expected, outgoing, effect, reject, cancel, files, directory)
    let window = Window{Title: Environment.GetEnvironmentVariable("GOO_TRANSFER_TITLE")!!, Width: 480, Height: 160, Root: scene}
    scene.Owner = window
    var sibling Window?
    var ticker WindowsTransferTicker?
    var startTicks = 0
    try {
        window.Open()
        window.Pump(0.0)
        let all = NativeTransferCapabilities.FileDrop | NativeTransferCapabilities.DropPreview | NativeTransferCapabilities.OutboundData | NativeTransferCapabilities.EffectNegotiation | NativeTransferCapabilities.DataDrop
        WindowsTransferRequire((window.NativeTransferCapabilities & all) == all, "Native Windows transfer capabilities are incomplete")
        window.NativeFileDropEnabled = true
        if !outgoing && kind != "legacy" {
            let types = if files { []string{"text/uri-list"} } else { []string{"text/plain;charset=utf-8", "image/png", "application/x-goo-transfer-check", "application/x-goo-empty"} }
            WindowsTransferRequire(window.SetNativeDataDropFormats(types) == WindowOperationResult.Accepted, "Native format allow-list was not accepted")
        }
        if cancel {
            let counter = WindowsTransferTicker{}
            ticker = counter
            let other = Window{Title: "Goo transfer animation", Width: 240, Height: 120, Root: counter}
            sibling = other
            other.Open()
            other.SetInterval(() -> counter.Advance(), 16.0)
            scene.OnStart = () -> {
                startTicks = counter.Ticks
                other.SetTimeout(() -> window.RequestClose(), 600.0)
            }
            scene.OnEnd = () -> {
                WindowsTransferRequire(counter.Ticks - startTicks >= 5, "Stationary native tracking stopped sibling animation")
                other.RequestClose()
            }
        }
        Console.WriteLine("ready")
        let timeout = Stopwatch.StartNew()
        while window.IsOpen || (sibling?.IsOpen ?? false) {
            WindowsTransferRequire(timeout.Elapsed < TimeSpan.FromSeconds(45), "Native transfer did not finish")
            if window.IsOpen {
                window.TryPost(() -> {})
                window.Pump(0.0)
            }
            if let other = sibling {
                if other.IsOpen {
                    other.TryPost(() -> {})
                    other.Pump(0.0)
                }
            }
            Thread.Sleep(1)
        }
        if outgoing { WindowsTransferRequire(scene.EndCount == 1, "Native source did not end exactly once") }
        else {
            WindowsTransferRequire(scene.Previews > 0 && scene.DropCount == if reject { 0 } else { 1 }, "Native target lifecycle changed")
            if let captured = scene.Captured { scene.Check(captured) }
        }
        if let counter = ticker { Console.WriteLine("animation-ticks " + (counter.Ticks - startTicks).ToString()) }
        Console.WriteLine("transfer-pass")
    } finally {
        if window.IsOpen {
            window.RequestClose()
            window.Pump(0.0)
        }
        if let other = sibling {
            if other.IsOpen {
                other.RequestClose()
                other.Pump(0.0)
            }
        }
    }
}
